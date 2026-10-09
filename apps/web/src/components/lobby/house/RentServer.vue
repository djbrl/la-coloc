<script setup lang="ts">
// Renting the house's server, one step at a time: pick a size, run one command on the server, then wait for it
// to call home. A native <dialog>, like the knock and rent-a-plot steps: it traps focus and closes on Escape.
import { onMounted, ref, watch } from "vue";
import UiSteps from "../../UiSteps.vue";
import Icon from "./Icon.vue";
import { fcfa, type PlanId, plans } from "./server";

const props = defineProps<{
  houseId: string;
  // The house stream says the server is up: the parent passes it down so step 3 can finish itself.
  live: boolean;
  // The key was already made (the command was shown before): start at the waiting step.
  resume?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const step = ref(props.resume ? 3 : 1);
const plan = ref<PlanId>("medium");
const command = ref("");
const error = ref("");
// A key exists already (409): offer to make a new one, which replaces the old.
const keyExists = ref(false);
const sending = ref(false);
const copied = ref(false);

onMounted(() => dialog.value?.showModal());

// Mirrors session.ts's postJSON, but keeps the status code: a 409 means "a key exists" and gets its own button.
async function rent(renew: boolean) {
  error.value = "";
  keyExists.value = false;
  sending.value = true;
  const res = await fetch(`/api/houses/${encodeURIComponent(props.houseId)}/server`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(renew ? { plan: plan.value, renew: true } : { plan: plan.value }),
  }).catch(() => null);
  sending.value = false;
  const data = await res?.json().catch(() => ({}));
  if (!res?.ok) {
    keyExists.value = res?.status === 409;
    error.value =
      typeof data?.message === "string" ? data.message : res?.status === 404 ? "Renting isn't open yet." : "That didn't work.";
    return;
  }
  command.value = data.command;
  step.value = 2;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(command.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value = "Copy it by hand.";
  }
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}

// Lost the command? Back to the start, where "Make a new key" replaces the old one.
function startOver() {
  step.value = 1;
  keyExists.value = true;
  error.value = "";
}

// The server called home while we were waiting: move focus to "It's live." so readers hear it too. `post`: the
// heading only exists once Vue has drawn the new state.
watch(
  () => props.live,
  (live) => live && step.value === 3 && dialog.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus(),
  { flush: "post" },
);
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-label="Rent the server" @close="emit('close')" @click="onClick">
    <div class="inner">
      <div class="top">
        <button type="button" class="link" @click="dialog?.close()">{{ step === 3 ? "Later" : "Cancel" }}</button>
      </div>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="rent(keyExists)">
          <h2>How big a server?</h2>
          <div class="plans" role="radiogroup" aria-label="Server size">
            <button
              v-for="p in plans"
              :key="p.id"
              type="button"
              class="plan"
              role="radio"
              :aria-checked="plan === p.id"
              :data-autofocus="p.id === plan ? '' : undefined"
              @click="plan = p.id"
            >
              <span class="size">{{ p.word }}</span>
              <span class="spec">{{ p.vcpu }} vCPU · {{ p.gb }} GB</span>
              <span class="price">{{ fcfa(p.fcfa) }} a month</span>
            </button>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <span />
            <button class="primary" :disabled="sending">{{ sending ? "Renting…" : keyExists ? "Make a new key" : "Rent it" }}</button>
          </div>
        </form>

        <div v-else-if="step === 2" class="form">
          <h2>Run this on your server.</h2>
          <p class="muted">Once, as root. It installs Docker, the proxy and the caretaker, which then calls the house.</p>
          <pre class="code" tabindex="0" data-autofocus aria-label="The install command"><code>{{ command }}</code></pre>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="link copy" @click="copy">
              <Icon :name="copied ? 'tick' : 'copy'" :size="18" />{{ copied ? "Copied" : "Copy" }}
            </button>
            <button type="button" class="primary" @click="step = 3">Done, it's running</button>
          </div>
        </div>

        <div v-else class="form wait" aria-live="polite">
          <template v-if="live">
            <span class="ring on" aria-hidden="true"><Icon name="tick" :size="26" /></span>
            <h2 data-autofocus tabindex="-1">It's live.</h2>
            <p class="muted">Every room deploys the moment its flatmate pushes.</p>
            <div class="nav center">
              <button type="button" class="primary" @click="dialog?.close()">Close</button>
            </div>
          </template>
          <template v-else>
            <span class="ring spin" aria-hidden="true" />
            <h2 data-autofocus tabindex="-1">Listening for your server…</h2>
            <p class="muted">This finishes on its own once the caretaker calls. You can close this and come back.</p>
            <button type="button" class="link small" @click="startOver">Lost the command? Make a new key</button>
          </template>
        </div>
      </UiSteps>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  border: none;
  border-radius: 22px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.sheet[open] { animation: sheet-in 0.25s var(--ease); }
.sheet::backdrop { background: var(--scrim); }
@keyframes sheet-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}
.inner { padding: 8px 32px 32px; }
.top { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.form { display: grid; gap: 16px; }
.form h2 { font-size: 28px; }
.plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
/* A plan is a tile you pick, not a pill: square corners, the accent ring when chosen. */
.plan {
  display: grid;
  gap: 6px;
  justify-items: start;
  min-height: 0;
  padding: 14px 12px;
  border-radius: 16px;
  background: var(--tile);
  text-align: left;
}
.plan[aria-checked="true"] { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.size { font-size: 19px; font-weight: 600; }
.spec { font-size: 13px; color: var(--muted); }
.price { font-size: 13px; }
.code {
  margin: 0;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--code-bg);
  color: var(--code-text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: all;
}
.copy { gap: 8px; }
.nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
.nav.center { justify-content: center; }
.nav .primary { min-width: 120px; }
.wait { justify-items: center; text-align: center; }
.ring { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; }
.ring.on { background: var(--live-soft); color: var(--live); }
/* A calm spinner: a hairline ring with one accent quarter, turning slowly. */
.ring.spin { border: 3px solid var(--fill); border-top-color: var(--accent-fill); animation: turn 1.4s linear infinite; }
@keyframes turn {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ring.spin { animation-duration: 4s; }
}
@media (max-width: 480px) {
  .inner { padding: 8px 20px 24px; }
  .plans { grid-template-columns: minmax(0, 1fr); }
  .plan { grid-template-columns: 1fr auto; grid-template-areas: "size price" "spec price"; align-items: center; }
  .size { grid-area: size; }
  .spec { grid-area: spec; }
  .price { grid-area: price; }
}
</style>
