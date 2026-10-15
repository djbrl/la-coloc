<script setup lang="ts">
// Starting a coloc on an empty plot, one question at a time: the house's name, what it's about, then a last look.
// A native <dialog>, like KnockSteps: it traps focus, closes on Escape, and hands focus back afterwards. It reads
// like a game's menu: one short bold question per screen, chunky buttons, the main one in the accent.
import { onMounted, ref } from "vue";
import { play } from "../../lobby/sound";
import { postJSON } from "../../session";
import UiSteps from "../UiSteps.vue";
import { joinWords, rentWords as w } from "../joinWords";
import Icon from "./house/Icon.vue";

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
    error.value = w.nameLength;
    return;
  }
  if (step.value === 2 && tagline.value.trim().length > 120) {
    error.value = w.taglineLength;
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
  <dialog ref="dialog" class="sheet" :aria-label="w.startLabel" @close="emit('close')" @click="onClick">
    <div class="inner">
      <button type="button" class="x" :aria-label="joinWords.cancel" @click="dialog?.close()">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      </button>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="next">
          <h2>{{ w.nameTitle }}</h2>
          <p class="muted">{{ w.nameWhy(city) }}</p>
          <input
            v-model="name"
            autofocus
            data-autofocus
            type="text"
            maxlength="40"
            autocomplete="off"
            :placeholder="w.namePlaceholder"
            :aria-label="w.nameLabel"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'rent-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="rent-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button class="primary">{{ joinWords.next }}<Icon name="next" :size="20" /></button>
          </div>
        </form>

        <form v-else-if="step === 2" class="form" novalidate @submit.prevent="next">
          <h2>{{ w.aboutTitle }}</h2>
          <p class="muted">{{ w.aboutWhy }}</p>
          <input
            v-model="tagline"
            data-autofocus
            type="text"
            maxlength="120"
            autocomplete="off"
            :placeholder="w.aboutPlaceholder"
            :aria-label="w.aboutLabel"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'rent-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="rent-error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ joinWords.back }}</button>
            <button class="primary">{{ tagline.trim() ? joinWords.next : joinWords.skip }}<Icon name="next" :size="20" /></button>
          </div>
        </form>

        <form v-else class="form" @submit.prevent="start">
          <h2>{{ w.readyTitle }}</h2>
          <!-- The house as the street will see it: its name, where it is, its line. -->
          <div class="preview">
            <span class="house-ic" aria-hidden="true"><Icon name="house" :size="24" /></span>
            <span class="what">
              <strong class="name">{{ name.trim() }}</strong>
              <span class="where">{{ city }} · {{ w.youreChef }}</span>
              <span v-if="tagline.trim()" class="tag">{{ tagline.trim() }}</span>
            </span>
          </div>
          <p class="muted small">{{ w.readyWhy }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button type="button" class="second" @click="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ joinWords.back }}</button>
            <button class="primary" :disabled="sending"><Icon name="house" :size="20" />{{ sending ? w.starting : w.start }}</button>
          </div>
        </form>
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
  border-radius: 28px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet[open] { animation: menu-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.sheet::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.inner { position: relative; padding: 26px 28px 24px; }
.inner :deep(.steps) { gap: 20px; }
/* The round close button in the corner, like the lobby's cards. */
.x { position: absolute; top: 16px; right: 16px; z-index: 1; width: 36px; height: 36px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 50%; background: var(--fill); color: var(--muted); }
.x:hover:not(:disabled) { color: var(--text); }
.form { display: grid; gap: 14px; }
.form h2 { padding-right: 44px; font-size: 28px; font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
.form > p { font-size: 15px; line-height: 1.4; }
.form > p.small { font-size: 13px; }
.error { font-size: 14px; }
/* The field: a big soft well, no hard border until it has the focus. */
.form input { min-height: 54px; border-color: transparent; border-radius: 14px; background: var(--tile); font-size: 19px; }
.form input:focus { border-color: var(--accent-fill); background: var(--surface); }
.form input[aria-invalid="true"] { border-color: var(--danger); }

/* The last look: the house as a tile, the way the street will see it. */
.preview { display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-radius: 18px; background: var(--tile); }
.house-ic { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--accent-fill); color: var(--on-accent); }
.what { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.name { font-size: 20px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
.where { font-size: 14px; color: var(--muted); }
.tag { margin-top: 6px; font-size: 15px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* Chunky buttons, as in a game's menu: the main one in the accent and as wide as it can be, the way back in grey. */
.nav { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.nav button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 20px; border-radius: 14px; font-size: 17px; font-weight: 600; white-space: nowrap; }
.nav .primary { flex: 1 1 auto; font-weight: 700; }
.nav .second { padding-left: 14px; }
.nav button:active:not(:disabled) { transform: scale(0.97); }
@media (max-width: 520px) {
  /* A phone: the card becomes a sheet along the bottom edge. */
  .sheet { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 24px 24px 0 0; }
  .inner { padding: 22px 18px max(18px, env(safe-area-inset-bottom)); }
}
/* A short window (a landscape phone, a small laptop): tighter, so every step fits without scrolling. */
@media (max-height: 640px) {
  .inner { padding-top: 20px; padding-bottom: 20px; }
  .x { top: 12px; }
  .inner :deep(.steps) { gap: 14px; }
  .form { gap: 10px; }
  .form h2 { font-size: 24px; }
  .nav { margin-top: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] { animation: none; }
  .nav button:active:not(:disabled) { transform: none; }
}
</style>
