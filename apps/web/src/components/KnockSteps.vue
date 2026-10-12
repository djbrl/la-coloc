<script setup lang="ts">
// Knocking on a free room, one question at a time: your note, your repo (optional), then a last look before sending.
// A native <dialog>: it traps focus, closes on Escape, and hands focus back to the Knock button afterwards.
// You can only have one open knock per house. If you already have one, the dialog says so on its first screen
// and takes you to it, instead of letting you write a note only to hear it on the last step.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { coreDown, DOWN_READ, DOWN_WRITE, wentDown } from "../core";
import { loadMe, me } from "../session";
import type { Room } from "../types";
import { knockOn } from "./lobby/cards";
import UiSteps from "./UiSteps.vue";

// The room only matters by name, so any room shape fits: the city's slimmer one, or the house page's Room.
// With `stay`, a successful knock is reported (`knocked`) instead of navigating: the lobby opens the thread itself.
// `houseName` is for the "already knocked" screen; without it the screen says "this house".
const props = defineProps<{ houseId: string; room: Pick<Room, "name">; stay?: boolean; houseName?: string | null }>();
const emit = defineEmits<{ close: []; knocked: [id: string] }>();
const router = useRouter();

const dialog = ref<HTMLDialogElement | null>(null);
const step = ref(1);
const note = ref("");
const repo = ref("");
const error = ref("");
const sending = ref(false);
const finding = ref(false);

// Your open knock on this house, known up front from /api/me, or learnt from the API's 409 when you send.
// `id` stays empty when the API said "already knocked" without saying which knock, until /api/me tells us.
const known = computed(() => knockOn(me.value?.knocks, props.houseId));
const refused = ref<{ id: string } | null>(null);
const already = computed(() => (known.value ? { id: known.value.id } : refused.value));
const where = computed(() => props.houseName || "this house");

onMounted(() => dialog.value?.showModal());

function next() {
  error.value = "";
  if (step.value === 1 && !note.value.trim()) {
    error.value = "Say what you'd build in this room.";
    return;
  }
  const link = repo.value.trim();
  if (step.value === 2 && link && !link.startsWith("https://")) {
    error.value = "The link should start with https://";
    return;
  }
  step.value++;
}

function back() {
  error.value = "";
  step.value--;
}

async function send() {
  // Never twice: a second press (or Enter) while the first is on its way does nothing.
  if (sending.value) return;
  error.value = "";
  sending.value = true;
  // fetch rather than postJSON: a 409 here means "already knocked", and we need its status and its body.
  const res = await fetch(`/api/houses/${props.houseId}/knock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room: props.room.name, message: note.value.trim(), repo: repo.value.trim() || null }),
  }).catch(() => null);
  // The core isn't answering: nothing was sent, and what you wrote stays in the form for another go.
  const down = await wentDown(res);
  const data = res && !down ? await res.json().catch(() => ({})) : {};
  sending.value = false;
  if (down) {
    error.value = DOWN_WRITE;
    return;
  }
  if (res?.status === 409 && /already knocked/i.test(String(data.message ?? ""))) {
    refused.value = { id: typeof data.application === "string" ? data.application : "" };
    void loadMe();
    return;
  }
  if (!res?.ok) {
    error.value = typeof data.message === "string" ? data.message : res?.status === 401 ? "Log in first." : "That didn't work.";
    return;
  }
  // Your list of open knocks now has this one: the cards offer "Your knock" from here on.
  void loadMe();
  open(data.id);
}

// Opens the thread: the lobby does it itself (`stay`), anywhere else it's a page.
function open(id: string) {
  dialog.value?.close();
  if (props.stay) emit("knocked", id);
  else router.push(`/applications/${id}`);
}

// "See your knock". Without its id (a 409 that didn't say), ask /api/me for your knocks and find this house's.
async function seeKnock() {
  error.value = "";
  let id = already.value?.id || "";
  if (!id) {
    finding.value = true;
    await loadMe();
    finding.value = false;
    id = knockOn(me.value?.knocks, props.houseId)?.id ?? "";
  }
  if (id) open(id);
  else if (coreDown()) error.value = `${DOWN_READ} Try again in a moment.`;
  else error.value = "We couldn't find your knock. It may have just been decided: have a look at the house.";
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="`Knock on room ${room.name}`" @close="emit('close')" @click="onClick">
    <div class="inner">
      <button type="button" class="x" aria-label="Cancel (Esc)" @click="dialog?.close()">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      </button>

      <!-- Already knocked here: one screen, one way on. -->
      <UiSteps v-if="already" :step="1" :total="1" focus-on-mount>
        <div class="form">
          <h2>Already knocked</h2>
          <p class="lead">You've already knocked on {{ where }}.</p>
          <p class="muted">One knock per house. Yours waits for the flatmates' votes; its thread is where you talk to them.</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="dialog?.close()">Not now</button>
            <button type="button" class="primary" autofocus data-autofocus :disabled="finding" @click="seeKnock">{{ finding ? "Finding it…" : "See your knock" }}</button>
          </div>
        </div>
      </UiSteps>

      <UiSteps v-else :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="next">
          <h2>What would you build?</h2>
          <p class="muted">Say who you are and what you'd run in this room. The flatmates read it before they vote.</p>
          <textarea
            v-model="note"
            autofocus
            data-autofocus
            rows="5"
            maxlength="2000"
            placeholder="Who you are, and what you'd build"
            aria-label="Your note to the house"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'knock-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="knock-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <span />
            <button class="primary">Next</button>
          </div>
        </form>

        <form v-else-if="step === 2" class="form" novalidate @submit.prevent="next">
          <h2>Got a repo?</h2>
          <p class="muted">A link to your repo helps the house see what you've shipped. You can skip this.</p>
          <input
            v-model="repo"
            data-autofocus
            type="url"
            inputmode="url"
            autocomplete="url"
            placeholder="https://github.com/you/your-app"
            aria-label="Link to your repo"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'knock-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="knock-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg> Back</button>
            <button class="primary">{{ repo.trim() ? "Next" : "Skip" }}</button>
          </div>
        </form>

        <form v-else class="form" @submit.prevent="send">
          <h2>Ready to knock?</h2>
          <p class="muted">This is what the house will read.</p>
          <blockquote class="quote">{{ note.trim() }}</blockquote>
          <p v-if="repo.trim()">You'd move in with <a :href="repo.trim()" target="_blank" rel="noopener">{{ repo.trim().replace(/^https:\/\//, "") }}</a>.</p>
          <p class="muted small">Knocking opens a thread with the flatmates. They vote, and a majority decides.</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg> Back</button>
            <button class="primary" :disabled="sending">{{ sending ? "Knocking…" : "Knock" }}</button>
          </div>
        </form>
      </UiSteps>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: none;
  border-radius: 22px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet[open] { animation: sheet-in 0.25s var(--ease); }
.sheet::backdrop { background: var(--scrim); }
@keyframes sheet-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}
.inner { position: relative; padding: 28px 32px 28px; }
/* The round close button in the corner, like the lobby's cards. */
.x { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 50%; background: var(--fill); color: var(--muted); z-index: 1; }
.x:hover:not(:disabled) { color: var(--text); }
.form { display: grid; gap: 16px; }
.form h2 { padding-right: 44px; font-size: 28px; font-weight: 700; overflow-wrap: anywhere; }
.lead { font-size: 19px; font-weight: 500; }
.quote { margin: 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 30vh; overflow-y: auto; }
.form a { overflow-wrap: anywhere; }
.nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
/* Chunky buttons, as in a game's menu: the main one in the accent, the way back in grey. */
.nav button { min-height: 50px; border-radius: 14px; padding: 0 20px; font-weight: 600; white-space: nowrap; }
.nav .primary { min-width: 140px; }
.nav .second { display: inline-flex; align-items: center; gap: 6px; padding-left: 14px; }
@media (max-width: 480px) {
  .inner { padding: 24px 20px 24px; }
}
/* A short window (a landscape phone, a small laptop with the bars open): tighter, so the buttons stay in view. */
@media (max-height: 640px) {
  .inner { padding-top: 20px; padding-bottom: 20px; }
  .x { top: 12px; }
  .form { gap: 10px; }
  .form h2 { font-size: 22px; }
  .form textarea { height: 104px; }
  .nav { margin-top: 0; }
  .inner :deep(.steps) { gap: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] { animation: none; }
}
</style>
