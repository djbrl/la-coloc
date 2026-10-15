<script setup lang="ts">
// Settings, as a game's options menu: a floating card in the middle of the screen, one row per setting (a sentence
// that says what it does now on the left, its control on the right), then the ways to start over (the welcome, the tutorial, and, when
// this server allows it, the whole demo) as big buttons. The arrow keys move a choice inside a row, as in a game.
import { computed, type FunctionalComponent, h, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { config, loadConfig, loadMe, me, postJSON } from "../session";
import { type Lang, language, setLang } from "../i18n";
import { settings, settingsPane } from "../settings";
import Icon from "./lobby/house/Icon.vue";
import ListRow from "./lobby/panel/ListRow.vue";
import { settingsWords as w } from "./words";

const route = useRoute();
const router = useRouter();
const panel = ref<HTMLElement | null>(null);
let opener: Element | null = null;
// "Reset the demo city" asks once more inline; this is whether it's asking.
const confirming = ref(false);

// A few pictures the shared icon set (house/icons.ts) doesn't have, drawn the same way: a 24px stroke in the text colour.
const glyphs = {
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  // Half light, half dark: whatever the system says.
  auto: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18 M12 7h4 M12 11h6 M12 15h5",
  motion: "M3 7h11 M3 12h15 M3 17h8 M17 5l4 7-4 7",
  sound: "M4 9v6h4l5 4V5L8 9z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12",
  walk: "M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M9 21l2.5-6 2.5 2v4 M7 12l3-4h4l2 3 3 1 M11 8l-1 5",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  // A keyboard: the one-key shortcuts.
  keys: "M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M8 14h8",
  // A globe: the language.
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9 M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9",
};
const Glyph: FunctionalComponent<{ d: string; size?: number }> = (p) =>
  h(
    "svg",
    { viewBox: "0 0 24 24", width: p.size ?? 20, height: p.size ?? 20, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" },
    [h("path", { d: p.d })],
  );

// The choices of each row. Their words are functions, so each is read in the language chosen now (words.ts).
// The three looks: the site's day or night, or the system's choice.
const themes: { value: typeof settings.theme; word: () => string; glyph: string }[] = [
  { value: "system", word: () => w.auto, glyph: glyphs.auto },
  { value: "light", word: () => w.day, glyph: glyphs.sun },
  { value: "dark", word: () => w.night, glyph: glyphs.moon },
];
const views: { value: typeof settings.view; word: () => string; glyph: string }[] = [
  { value: "lobby", word: () => w.walk, glyph: glyphs.walk },
  { value: "list", word: () => w.list, glyph: glyphs.list },
];
const qualities: { value: typeof settings.quality; word: () => string }[] = [
  { value: "low", word: () => w.low },
  { value: "high", word: () => w.high },
];

// The two languages, each shown as its short code and named in its own language (for a screen reader, and for
// someone who can't read the language on screen now). i18n.ts remembers the choice and sets <html lang>.
const languages: { value: Lang; short: string; name: string }[] = [
  { value: "en", short: "EN", name: "English" },
  { value: "fr", short: "FR", name: "Français" },
];

// Each row's sentence, for what's chosen now: no "City" or "Look" label, just what the setting does.
const viewSaid = computed(() => (settings.view === "list" ? w.viewList : w.viewWalk));
const themeSaid = computed(() => ({ system: w.themeAuto, light: w.themeDay, dark: w.themeNight })[settings.theme]);
const qualitySaid = computed(() => (settings.quality === "low" ? w.qualityLow : w.qualityHigh));

// Left and right (or up and down) move a row's choice, and the focus with it, as in any radio group.
function arrows<T>(e: KeyboardEvent, values: T[], current: T, set: (v: T) => void) {
  const i = values.indexOf(current);
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step === undefined || i < 0) return;
  e.preventDefault();
  const to = (i + step + values.length) % values.length;
  set(values[to]);
  const group = e.currentTarget as HTMLElement;
  nextTick(() => group.querySelectorAll<HTMLButtonElement>("[role=radio]")[to]?.focus());
}

watch(
  () => settingsPane.open,
  async (open) => {
    if (open) {
      opener = document.activeElement;
      // What this server allows you is asked each time the pane opens: the demo reset depends on who's logged in.
      void loadConfig();
      await nextTick();
      panel.value?.focus();
      window.addEventListener("keydown", onKey);
    } else {
      window.removeEventListener("keydown", onKey);
      confirming.value = false;
      (opener as HTMLElement | null)?.focus?.();
    }
  },
);
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

function close() {
  settingsPane.open = false;
}

// The reset's question replaces its button: the keyboard lands on "Keep", and goes back to the button after.
const keepButton = ref<HTMLButtonElement | null>(null);
const resetButton = ref<HTMLButtonElement | null>(null);
async function ask(on: boolean) {
  confirming.value = on;
  await nextTick();
  (on ? keepButton : resetButton).value?.focus();
}

function goHome() {
  if (route.path !== "/") router.push("/");
}

function replayWelcome() {
  settings.welcomed = false;
  close();
  goHome();
}

// ---- The tutorial again ----

// The server forgets your tutorial room and your "done" mark, your profile is read again, and the lobby is told
// to start the tutorial (it watches `tutorialRequested`).
const tutorialBusy = ref(false);
const tutorialError = ref("");
async function takeTutorialAgain() {
  tutorialBusy.value = true;
  tutorialError.value = "";
  const res = await postJSON("/api/tutorial/reset", {});
  tutorialBusy.value = false;
  if (!res.ok) {
    tutorialError.value = res.message;
    return;
  }
  await loadMe();
  settingsPane.tutorialRequested = Date.now();
  close();
  goHome();
}

// ---- Reset the demo ----

// After the inline question: the server resets the demo city, this browser forgets its settings, tips and tours,
// and the page reloads from the start.
const resetBusy = ref(false);
const resetError = ref("");
async function resetDemo() {
  resetBusy.value = true;
  resetError.value = "";
  const res = await postJSON("/api/demo/reset", {});
  if (!res.ok) {
    resetBusy.value = false;
    resetError.value = res.message;
    return;
  }
  try {
    for (const key of ["coloc.settings", "coloc.tips", "coloc.tours"]) localStorage.removeItem(key);
  } catch {
    // No storage to clear: the reload is a fresh start all the same.
  }
  location.reload();
}
</script>

<template>
  <Transition name="fade">
    <div v-if="settingsPane.open" class="scrim" @click="close" />
  </Transition>
  <Transition name="pop">
    <aside v-if="settingsPane.open" ref="panel" class="pane" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
      <h2 id="settings-title">{{ w.title }}</h2>
      <button class="x" :aria-label="w.close" @click="close">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      </button>

      <ul class="options">
        <!-- The language first: someone who can't read the rest finds it at the top, with a globe and two codes. -->
        <ListRow :title="w.languageNow">
          <template #lead><span class="ic"><Glyph :d="glyphs.globe" /></span></template>
          <template #end>
            <div class="segmented" role="radiogroup" :aria-label="w.languageGroup" @keydown="arrows($event, languages.map((l) => l.value), language.lang, setLang)">
              <button
                v-for="l in languages"
                :key="l.value"
                role="radio"
                :lang="l.value"
                :aria-label="l.name"
                :aria-checked="language.lang === l.value"
                :tabindex="language.lang === l.value ? 0 : -1"
                :class="{ on: language.lang === l.value }"
                @click="setLang(l.value)"
              >
                <span class="word">{{ l.short }}</span>
              </button>
            </div>
          </template>
        </ListRow>

        <ListRow :title="viewSaid">
          <template #lead><span class="ic"><Icon name="house" :size="20" /></span></template>
          <template #end>
            <div class="segmented" role="radiogroup" :aria-label="w.viewGroup" @keydown="arrows($event, views.map((v) => v.value), settings.view, (v) => (settings.view = v))">
              <button
                v-for="v in views"
                :key="v.value"
                role="radio"
                :aria-checked="settings.view === v.value"
                :tabindex="settings.view === v.value ? 0 : -1"
                :class="{ on: settings.view === v.value }"
                @click="settings.view = v.value"
              >
                <Glyph :d="v.glyph" :size="16" /><span class="word">{{ v.word() }}</span>
              </button>
            </div>
          </template>
        </ListRow>

        <ListRow :title="themeSaid">
          <template #lead><span class="ic"><Glyph :d="glyphs.sun" /></span></template>
          <template #end>
            <div class="segmented icons" role="radiogroup" :aria-label="w.themeGroup" @keydown="arrows($event, themes.map((t) => t.value), settings.theme, (v) => (settings.theme = v))">
              <button
                v-for="t in themes"
                :key="t.value"
                role="radio"
                :aria-checked="settings.theme === t.value"
                :tabindex="settings.theme === t.value ? 0 : -1"
                :class="{ on: settings.theme === t.value }"
                @click="settings.theme = t.value"
              >
                <Glyph :d="t.glyph" :size="16" /><span class="word">{{ t.word() }}</span>
              </button>
            </div>
          </template>
        </ListRow>

        <ListRow :title="qualitySaid">
          <template #lead><span class="ic"><Icon name="gauge" :size="20" /></span></template>
          <template #end>
            <div class="segmented" role="radiogroup" :aria-label="w.qualityGroup" @keydown="arrows($event, qualities.map((q) => q.value), settings.quality, (v) => (settings.quality = v))">
              <button
                v-for="q in qualities"
                :key="q.value"
                role="radio"
                :aria-checked="settings.quality === q.value"
                :tabindex="settings.quality === q.value ? 0 : -1"
                :class="{ on: settings.quality === q.value }"
                @click="settings.quality = q.value"
              >
                <span class="word">{{ q.word() }}</span>
              </button>
            </div>
          </template>
        </ListRow>

        <!-- A switch row toggles from anywhere on it; the switch itself is what the keyboard reaches. -->
        <ListRow class="flip" :title="w.motion" @click="settings.reduceMotion = !settings.reduceMotion">
          <template #lead><span class="ic"><Glyph :d="glyphs.motion" /></span></template>
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.motionName" :aria-checked="settings.reduceMotion"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>

        <ListRow class="flip" :title="w.sound" @click="settings.sound = !settings.sound">
          <template #lead><span class="ic"><Glyph :d="glyphs.sound" /></span></template>
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.soundName" :aria-checked="settings.sound"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>

        <ListRow class="flip" :title="w.shortcuts" @click="settings.shortcuts = !settings.shortcuts">
          <template #lead><span class="ic"><Glyph :d="glyphs.keys" /></span></template>
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.shortcutsName" :aria-checked="settings.shortcuts"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>
      </ul>

      <!-- Starting over: big buttons, an icon over their words. The demo's reset asks once more, in place. -->
      <div v-if="!confirming" class="acts">
        <button class="act" @click="replayWelcome"><Icon name="people" :size="22" /><span>{{ w.welcomeAgain }}</span></button>
        <button v-if="me" class="act" :disabled="tutorialBusy" @click="takeTutorialAgain"><Icon name="rocket" :size="22" /><span>{{ w.tutorialAgain }}</span></button>
        <!-- Only when the server says the demo may be reset: the whole city goes back to its seed. -->
        <button v-if="config?.demoReset" ref="resetButton" class="act danger" @click="ask(true)"><Icon name="spin" :size="22" /><span>{{ w.resetDemo }}</span></button>
      </div>
      <div v-else class="confirm" role="group" aria-labelledby="reset-question">
        <p id="reset-question" class="question"><Icon name="warn" :size="20" />{{ w.resetQuestion }}</p>
        <div class="choice">
          <button ref="keepButton" :disabled="resetBusy" @click="ask(false)">{{ w.keep }}</button>
          <button class="danger-fill" :disabled="resetBusy" @click="resetDemo"><Icon name="spin" :size="18" />{{ w.reset }}</button>
        </div>
      </div>
      <p v-if="tutorialError" class="error" role="alert">{{ tutorialError }}</p>
      <p v-if="resetError" class="error" role="alert">{{ resetError }}</p>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: var(--scrim); }
/* The options menu: a flat card in the middle of the screen, big corners, a quick pop. */
.pane {
  position: fixed;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  z-index: 100;
  width: min(500px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px 22px 20px;
  display: grid;
  align-content: start;
  gap: 14px;
  border-radius: var(--r-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  outline: none;
}
h2 { margin: 0; padding-right: 48px; font-size: 28px; line-height: 1.05; }
/* The round close button in the corner, like the lobby's cards. */
.x { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }

.options { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; line-height: 1.3; }
/* A row's sentence may take two lines beside its control rather than lose its end. */
.options :deep(.title) { white-space: normal; font-weight: 500; }
.ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r-sm); background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
.flip { cursor: pointer; }

/* The segmented controls (.segmented) and the ON/OFF switches (.toggle) are the shared ones in style.css. */

/* Starting over: equal tiles in a row, an icon over a few words, like the lobby cards' menus. */
.acts { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; }
.act {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 84px;
  padding: 10px 8px;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--quiet-edge);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.act:hover:not(:disabled) { background: var(--tile); }
.act:active:not(:disabled) { transform: translateY(1px); box-shadow: inset 0 0 0 1px var(--border), 0 1px 0 var(--line-strong); }
.act.danger { color: var(--danger); }
.act.danger:hover:not(:disabled) { background: var(--danger-soft); }

/* The reset's question, in place of the buttons: a red-tinted card, then Keep beside Reset. */
.confirm { display: grid; gap: 12px; padding: 14px; border-radius: var(--r-md); background: var(--danger-soft); }
.question { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: var(--danger); }
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.choice button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: var(--r-md); font-size: 16px; font-weight: 600; }
.choice button:not(.danger-fill) { background: var(--surface); box-shadow: var(--quiet-edge); }
.danger-fill { background: var(--danger); color: var(--on-danger); box-shadow: 0 var(--lip) 0 color-mix(in srgb, var(--danger) 60%, #000); }
.danger-fill:hover:not(:disabled) { background: var(--danger); opacity: 0.9; }
.error { margin: 0; font-size: 14px; color: var(--danger); }

button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(10px) scale(0.95); }
/* A phone: the menu is a sheet along the bottom edge, and the rows keep only what they need. */
@media (max-width: 520px) {
  .pane { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 88dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
  .options :deep(.sub) { display: none; }
  .ic { width: 32px; height: 32px; }
  .options :deep(.lead) { width: 32px; }
  .segmented .word { font-size: 13px; }
  /* The looks keep their pictures only, so the row's sentence has room; the words stay for a screen reader. */
  .segmented.icons .word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .options .segmented > button { padding: 0 9px; }
}
@media (max-height: 640px) {
  .pane { gap: 10px; padding-top: 18px; }
  .act { min-height: 72px; }
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active, .pop-enter-active, .pop-leave-active, .act { transition: none; }
  .act:active:not(:disabled) { transform: none; }
}
</style>
