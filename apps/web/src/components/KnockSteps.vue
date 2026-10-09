<script setup lang="ts">
// Knocking on a free room, one question at a time: your note, your repo (optional), then a last look before sending.
// A native <dialog>: it traps focus, closes on Escape, and hands focus back to the Knock button afterwards.
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { postJSON } from "../session";
import type { CityHouse } from "../types";
import UiSteps from "./UiSteps.vue";

// The room only matters by name, so the city's slimmer room shape is enough (the house page's Room fits too).
// With `stay`, a successful knock is reported (`knocked`) instead of navigating: the lobby opens the thread itself.
const props = defineProps<{ houseId: string; room: CityHouse["rooms"][number]; stay?: boolean }>();
const emit = defineEmits<{ close: []; knocked: [id: string] }>();
const router = useRouter();

const dialog = ref<HTMLDialogElement | null>(null);
const step = ref(1);
const note = ref("");
const repo = ref("");
const error = ref("");
const sending = ref(false);

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
  error.value = "";
  sending.value = true;
  const res = await postJSON<{ id: string }>(`/api/houses/${props.houseId}/knock`, {
    room: props.room.name,
    message: note.value.trim(),
    repo: repo.value.trim() || null,
  });
  sending.value = false;
  if (!res.ok) {
    error.value = res.message;
    return;
  }
  dialog.value?.close();
  if (props.stay) emit("knocked", res.data.id);
  else router.push(`/applications/${res.data.id}`);
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="`Knock on room ${room.name}`" @close="emit('close')" @click="onClick">
    <div class="inner">
      <div class="top">
        <button type="button" class="link" @click="dialog?.close()">Cancel</button>
      </div>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="next">
          <h2>What would you build here?</h2>
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
          <h2>Got something to show?</h2>
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
            <button type="button" class="link" @click="back"><span aria-hidden="true">‹</span> Back</button>
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
            <button type="button" class="link" @click="back"><span aria-hidden="true">‹</span> Back</button>
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
  max-height: calc(100vh - 32px);
  padding: 0;
  border: none;
  border-radius: 22px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.sheet[open] { animation: sheet-in 0.25s var(--ease); }
.sheet::backdrop { background: var(--scrim); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
@keyframes sheet-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}
.inner { padding: 8px 32px 32px; }
.top { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.form { display: grid; gap: 16px; }
.form h2 { font-size: 28px; }
.quote { margin: 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; }
.form a { overflow-wrap: anywhere; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.nav .primary { min-width: 120px; }
@media (max-width: 480px) {
  .inner { padding: 8px 20px 24px; }
}
</style>
