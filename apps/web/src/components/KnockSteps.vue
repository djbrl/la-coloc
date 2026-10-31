<script setup lang="ts">
// Knocking on a free room, one question at a time: your note, your repo (optional), then a last look before sending.
// A native <dialog>: it traps focus, closes on Escape, and hands focus back to the Knock button afterwards.
// You can only have one open knock per house. If you already have one, the dialog says so on its first screen
// and takes you to it, instead of letting you write a note only to hear it on the last step.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { coreDown, downWords, wentDown } from "../core";
import { loadMe, me } from "../session";
import { refusalText } from "../refusals";
import type { Room } from "../types";
import { knockOn } from "./lobby/cards";
import { joinWords as w } from "./joinWords";
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
const where = computed(() => props.houseName || w.thisHouse);

onMounted(() => dialog.value?.showModal());

function next() {
  error.value = "";
  if (step.value === 1 && !note.value.trim()) {
    error.value = w.sayWhat;
    return;
  }
  const link = repo.value.trim();
  if (step.value === 2 && link && !link.startsWith("https://")) {
    error.value = w.httpsLink;
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
    error.value = downWords.write;
    return;
  }
  if (res?.status === 409 && (data.code === "alreadyKnocked" || /already knocked/i.test(String(data.message ?? "")))) {
    refused.value = { id: typeof data.application === "string" ? data.application : "" };
    void loadMe();
    return;
  }
  if (!res?.ok) {
    error.value = typeof data.message === "string" ? refusalText(data) : res?.status === 401 ? w.logInFirst : w.didntWork;
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
  else if (coreDown()) error.value = w.tryAgain(downWords.read);
  else error.value = w.notFound;
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog ref="dialog" class="sheet step-sign" :aria-label="w.knockOn(room.name)" @close="emit('close')" @click="onClick">
    <div class="inner">
      <button type="button" class="x" :aria-label="w.cancel" @click="dialog?.close()"><span aria-hidden="true">X</span></button>

      <!-- Already knocked here: one screen, one way on. -->
      <UiSteps v-if="already" :step="1" :total="1" focus-on-mount>
        <div class="form">
          <h2>{{ w.alreadyTitle }}</h2>
          <p class="lead">{{ w.alreadyLead(where) }}</p>
          <p class="muted">{{ w.alreadyWhy }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="dialog?.close()">{{ w.notNow }}</button>
            <button type="button" class="primary" autofocus data-autofocus :disabled="finding" @click="seeKnock">{{ finding ? w.finding : w.seeKnock }}</button>
          </div>
        </div>
      </UiSteps>

      <UiSteps v-else :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="next">
          <h2>{{ w.buildTitle }}</h2>
          <p class="muted">{{ w.buildWhy }}</p>
          <textarea
            v-model="note"
            autofocus
            data-autofocus
            rows="5"
            maxlength="2000"
            :placeholder="w.notePlaceholder"
            :aria-label="w.noteLabel"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'knock-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="knock-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <span />
            <button class="primary">{{ w.next }}</button>
          </div>
        </form>

        <form v-else-if="step === 2" class="form" novalidate @submit.prevent="next">
          <h2>{{ w.repoTitle }}</h2>
          <p class="muted">{{ w.repoWhy }}</p>
          <input
            v-model="repo"
            data-autofocus
            type="url"
            inputmode="url"
            autocomplete="url"
            placeholder="https://github.com/you/your-app"
            :aria-label="w.repoLabel"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'knock-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="knock-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg> {{ w.back }}</button>
            <button class="primary">{{ repo.trim() ? w.next : w.skip }}</button>
          </div>
        </form>

        <form v-else class="form" @submit.prevent="send">
          <h2>{{ w.readyTitle }}</h2>
          <p class="muted">{{ w.readyWhy }}</p>
          <blockquote class="quote">{{ note.trim() }}</blockquote>
          <p v-if="repo.trim()">{{ w.moveInBefore }} <a :href="repo.trim()" target="_blank" rel="noopener">{{ repo.trim().replace(/^https:\/\//, "") }}</a>{{ w.moveInAfter }}</p>
          <p class="muted small">{{ w.readyHow }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg> {{ w.back }}</button>
            <button class="primary" :disabled="sending">{{ sending ? w.knocking : w.knock }}</button>
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
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet[open] { animation: sheet-in var(--dur-slow) var(--ease-pop); }
.sheet::backdrop { background: var(--scrim); }
@keyframes sheet-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}
.form { display: grid; gap: 16px; }
.lead { font-size: 19px; font-weight: 600; }
.quote { margin: 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--accent-fill); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 30vh; overflow-y: auto; }
.form a { overflow-wrap: anywhere; }
.nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
/* Chunky buttons, as in a game's menu: the main one in the accent, the way back in grey. */
.nav button { min-height: 50px; border-radius: var(--r-md); padding: 0 20px; font-weight: 600; white-space: nowrap; }
.nav .primary { flex: 1 1 auto; min-height: 60px; font-size: 22px; }
.nav .second { display: inline-flex; align-items: center; gap: 6px; padding-left: 14px; }
@media (max-width: 480px) {
}
/* A short window (a landscape phone, a small laptop with the bars open): tighter, so the buttons stay in view. */
@media (max-height: 640px) {
  .form { gap: 10px; }
  .form textarea { height: 104px; }
  .nav { margin-top: 0; }
  }
@media (prefers-reduced-motion: reduce) {
  .sheet[open] { animation: none; }
}
</style>
