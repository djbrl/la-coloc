<script setup lang="ts">
// Starting a coloc on an empty plot, one question at a time: the house's name, what it's about, then a last look.
// A native <dialog>, like KnockSteps: it traps focus, closes on Escape, and hands focus back afterwards.
import { onMounted, ref } from "vue";
import { play } from "../../lobby/sound";
import { postJSON } from "../../session";
import UiSteps from "../UiSteps.vue";

const props = defineProps<{ city: string; plot: string }>();
const emit = defineEmits<{ close: []; built: [id: string] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const step = ref(1);
const name = ref("");
const tagline = ref("");
const error = ref("");
const sending = ref(false);

onMounted(() => dialog.value?.showModal());

function next() {
  error.value = "";
  const n = name.value.trim();
  if (step.value === 1 && (n.length < 2 || n.length > 40)) {
    error.value = "Give it a name, two to forty letters.";
    return;
  }
  if (step.value === 2 && tagline.value.trim().length > 120) {
    error.value = "Keep it under 120 letters.";
    return;
  }
  step.value++;
}

function back() {
  error.value = "";
  step.value--;
}

async function start() {
  error.value = "";
  sending.value = true;
  const res = await postJSON<{ id: string }>("/api/city/houses", {
    city: props.city,
    plot: props.plot,
    name: name.value.trim(),
    tagline: tagline.value.trim() || null,
  });
  sending.value = false;
  if (!res.ok) {
    // 409: the name or the plot is taken; the message says which.
    error.value = res.message;
    return;
  }
  play("build");
  emit("built", res.data.id);
  dialog.value?.close();
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-label="Start a coloc on this plot" @close="emit('close')" @click="onClick">
    <div class="inner">
      <div class="top">
        <button type="button" class="link" @click="dialog?.close()">Cancel</button>
      </div>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="next">
          <h2>What's the house called?</h2>
          <p class="muted">The name on the door, and on the map of {{ city }}.</p>
          <input
            v-model="name"
            autofocus
            data-autofocus
            type="text"
            maxlength="40"
            autocomplete="off"
            placeholder="Sacré-Cœur"
            aria-label="The house's name"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'rent-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="rent-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <span />
            <button class="primary">Next</button>
          </div>
        </form>

        <form v-else-if="step === 2" class="form" novalidate @submit.prevent="next">
          <h2>What's it about?</h2>
          <p class="muted">One line for the street: who you are, what you build. You can skip this.</p>
          <input
            v-model="tagline"
            data-autofocus
            type="text"
            maxlength="120"
            autocomplete="off"
            placeholder="Three devs, one server, a lot of coffee"
            aria-label="What the house is about"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'rent-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="rent-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="link" @click="back"><span aria-hidden="true">‹</span> Back</button>
            <button class="primary">{{ tagline.trim() ? "Next" : "Skip" }}</button>
          </div>
        </form>

        <form v-else class="form" @submit.prevent="start">
          <h2>Ready to start?</h2>
          <p>{{ name.trim() }}, in {{ city }}, on this plot. You'll be its chef. The server comes later.</p>
          <blockquote v-if="tagline.trim()" class="quote">{{ tagline.trim() }}</blockquote>
          <p class="muted small">The house appears in the city right away, still finding its flatmates. Renting its server is a later step.</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="link" @click="back"><span aria-hidden="true">‹</span> Back</button>
            <button class="primary" :disabled="sending">{{ sending ? "Starting…" : "Start" }}</button>
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
.sheet::backdrop { background: var(--scrim); }
@keyframes sheet-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}
.inner { padding: 8px 32px 32px; }
.top { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.form { display: grid; gap: 16px; }
.form h2 { font-size: 28px; }
.quote { margin: 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.nav .primary { min-width: 120px; }
@media (max-width: 480px) {
  .inner { padding: 8px 20px 24px; }
}
</style>
