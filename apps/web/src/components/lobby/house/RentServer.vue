<script setup lang="ts">
// Renting the house's server, one step at a time: pick a size, run one command on the server, then wait for it
// to call home. A native <dialog>, like the knock and rent-a-plot steps: it traps focus and closes on Escape.
// It reads like a game's menu: a short bold title per step, big tiles to pick from, chunky buttons with one main one.
import { onMounted, ref, watch } from "vue";
import { downWords, wentDown } from "../../../core";
import { joinWords, rentWords as w } from "../../joinWords";
import UiSteps from "../../UiSteps.vue";
import { explain } from "../panel/words";
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
  if (sending.value) return;
  error.value = "";
  keyExists.value = false;
  sending.value = true;
  const res = await fetch(`/api/houses/${encodeURIComponent(props.houseId)}/server`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(renew ? { plan: plan.value, renew: true } : { plan: plan.value }),
  }).catch(() => null);
  sending.value = false;
  // The core isn't answering: nothing was made, and the size you picked is still picked.
  const down = await wentDown(res);
  if (down) {
    error.value = downWords.write;
    return;
  }
  const data = await res?.json().catch(() => ({}));
  if (!res?.ok) {
    keyExists.value = res?.status === 409;
    error.value =
      typeof data?.message === "string" ? data.message : res?.status === 404 ? w.notOpen : joinWords.didntWork;
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
    error.value = w.copyByHand;
  }
}

// The sizes are one radio group: the arrow keys move the choice, as in any radio group, and the focus follows it.
const planButtons: HTMLButtonElement[] = [];
function onPlanKey(e: KeyboardEvent, i: number) {
  const last = plans.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  plan.value = plans[to].id;
  planButtons[to]?.focus();
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

// The server called home while we were waiting: move focus to "Server up" so readers hear it too. `post`: the
// heading only exists once Vue has drawn the new state.
watch(
  () => props.live,
  (live) => live && step.value === 3 && dialog.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus(),
  { flush: "post" },
);
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="w.rentLabel" @close="emit('close')" @click="onClick">
    <div class="inner">
      <button type="button" class="x" :aria-label="step === 3 ? w.laterEsc : joinWords.cancel" @click="dialog?.close()">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      </button>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="rent(keyExists)">
          <h2>{{ w.pickTitle }}</h2>
          <p class="muted">{{ explain.bill }}</p>
          <div class="plans" role="radiogroup" :aria-label="w.sizeLabel">
            <button
              v-for="(p, i) in plans"
              :key="p.id"
              :ref="(el) => (planButtons[i] = el as HTMLButtonElement)"
              type="button"
              class="plan"
              role="radio"
              :aria-checked="plan === p.id"
              :tabindex="plan === p.id ? 0 : -1"
              :autofocus="p.id === plan"
              :data-autofocus="p.id === plan ? '' : undefined"
              @click="plan = p.id"
              @keydown="onPlanKey($event, i)"
            >
              <span class="plan-ic"><Icon name="server" :size="20" /></span>
              <span class="size">{{ w.plans[p.id] }}</span>
              <span class="spec">{{ w.spec(p.vcpu, p.gb) }}</span>
              <span class="price">{{ fcfa(p.fcfa) }}<span class="per">{{ w.aMonth }}</span></span>
              <span v-if="plan === p.id" class="picked" aria-hidden="true"><Icon name="tick" :size="14" /></span>
            </button>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button class="primary" :disabled="sending">
              <Icon :name="keyExists ? 'key' : 'server'" :size="20" />{{ sending ? w.renting : keyExists ? w.newKeyLong : w.rentIt }}
            </button>
          </div>
        </form>

        <div v-else-if="step === 2" class="form">
          <h2>{{ w.runTitle }}</h2>
          <p class="muted">{{ w.runWhy }}</p>
          <pre class="code" tabindex="0" data-autofocus :aria-label="w.commandLabel"><code>{{ command }}</code></pre>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="copy">
              <Icon :name="copied ? 'tick' : 'copy'" :size="20" />{{ copied ? w.copied : w.copy }}
            </button>
            <button type="button" class="primary" @click="step = 3"><Icon name="next" :size="20" />{{ w.running }}</button>
          </div>
        </div>

        <div v-else class="form wait" aria-live="polite">
          <template v-if="live">
            <span class="ring on" aria-hidden="true"><Icon name="tick" :size="28" /></span>
            <h2 autofocus data-autofocus tabindex="-1">{{ w.upTitle }}</h2>
            <p class="muted">{{ w.upWhy }}</p>
            <div class="nav">
              <button type="button" class="primary" @click="dialog?.close()"><Icon name="tick" :size="20" />{{ w.done }}</button>
            </div>
          </template>
          <template v-else>
            <span class="ring spin" aria-hidden="true" />
            <h2 autofocus data-autofocus tabindex="-1">{{ w.waitTitle }}</h2>
            <p class="muted">{{ w.waitWhy }}</p>
            <div class="nav">
              <button type="button" class="second" @click="startOver"><Icon name="key" :size="20" />{{ w.newKey }}</button>
              <button type="button" class="primary" @click="dialog?.close()">{{ w.later }}</button>
            </div>
          </template>
        </div>
      </UiSteps>
    </div>
  </dialog>
</template>

<style scoped>
/* A floating card over the dimmed city, like a game's menu: flat surface, big corners, a quick pop. */
.sheet {
  width: min(540px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: none;
  border-radius: var(--r-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet[open] { animation: menu-pop var(--dur-slow) var(--ease-pop); }
.sheet::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.inner { position: relative; padding: 26px 28px 24px; }
.inner :deep(.steps) { gap: 20px; }
/* The round close button in the corner, like the lobby's cards. */
.x { position: absolute; top: 16px; right: 16px; z-index: 1; width: 34px; height: 34px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.x:hover:not(:disabled) { color: var(--text); }
.form { display: grid; gap: 14px; }
.form h2 { padding-right: 44px; font-size: 28px; line-height: 1.05; overflow-wrap: anywhere; }
.form > p { font-size: 15px; line-height: 1.4; }
.error { font-size: 14px; }

/* A size is a big tile you pick, like a game's difficulty: the accent ring and a tick on the chosen one. */
.plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.plan {
  position: relative;
  display: grid;
  gap: 4px;
  justify-items: start;
  min-height: 0;
  padding: 14px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--quiet-edge);
  color: var(--text);
  text-align: left;
  transition: background-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.plan:hover:not(:disabled) { background: var(--tile); }
.plan:active:not(:disabled) { transform: translateY(1px); }
.plan[aria-checked="true"] { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill), 0 var(--lip) 0 var(--accent-fill); }
.plan-ic { display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: 6px; border-radius: var(--r-sm); background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
.plan[aria-checked="true"] .plan-ic { background: var(--accent-fill); color: var(--on-accent); }
.size { font: 800 20px/1.1 var(--display); letter-spacing: -0.02em; }
/* The machine's numbers and its price: the monospace, like a cloud provider's plan table. */
.spec { font: 500 12px/1.35 var(--mono); letter-spacing: 0; color: var(--muted); }
.price { display: grid; font: 500 14px/1.3 var(--mono); letter-spacing: 0; font-variant-numeric: tabular-nums; }
.per { font-family: var(--font); font-size: 13px; }
.per { display: block; font-weight: 400; color: var(--muted); }
.picked { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-fill); color: var(--on-accent); }

.code {
  margin: 0;
  max-height: 30vh;
  overflow-y: auto;
  padding: 16px 18px;
  border-radius: var(--r-lg);
  background: var(--code-bg);
  color: var(--code-text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: all;
}

/* Chunky buttons, as in a game's menu: the main one in the accent and as wide as it can be, the other in grey. */
.nav { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.nav button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 20px; border-radius: var(--r-md); font-size: 17px; font-weight: 600; white-space: nowrap; }
.nav .primary { flex: 1 1 auto; font-weight: 700; }

.wait { justify-items: center; text-align: center; }
.wait h2 { padding: 0; }
.wait .nav { justify-self: stretch; }
.ring { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; }
.ring.on { background: var(--live-soft); color: var(--live); }
/* A calm spinner: a ring with one accent quarter, turning slowly. */
.ring.spin { border: 4px solid var(--fill); border-top-color: var(--accent-fill); animation: turn 1.4s linear infinite; }
@keyframes turn {
  to { transform: rotate(360deg); }
}

@media (max-width: 520px) {
  /* A phone: the card becomes a sheet along the bottom edge. */
  .sheet { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: var(--r-xl) var(--r-xl) 0 0; }
  .inner { padding: 22px 18px max(18px, env(safe-area-inset-bottom)); }
  .plans { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .plan { grid-template-columns: auto 1fr auto; grid-template-areas: "ic size price" "ic spec price"; align-items: center; column-gap: 12px; padding: 10px 14px; }
  .plan-ic { grid-area: ic; margin: 0; }
  .size { grid-area: size; font-size: 17px; }
  .spec { grid-area: spec; }
  .price { grid-area: price; padding-right: 26px; text-align: right; }
  .picked { top: 50%; margin-top: -11px; }
  .nav button { padding: 0 14px; }
}
/* A short window (a landscape phone, a small laptop): tighter, so every step fits without scrolling. */
@media (max-height: 640px) {
  .inner { padding-top: 20px; padding-bottom: 20px; }
  .x { top: 12px; }
  .inner :deep(.steps) { gap: 14px; }
  .form { gap: 10px; }
  .form h2 { font-size: 24px; }
  .code { max-height: 22vh; }
  .nav { margin-top: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] { animation: none; }
  .plan, .nav button { transition: none; }
  .plan:active:not(:disabled) { transform: none; }
  .ring.spin { animation-duration: 4s; }
}
</style>
