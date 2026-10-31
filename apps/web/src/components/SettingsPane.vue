<script setup lang="ts">
// Settings, as a game's options menu: a floating card in the middle of the screen, one row per setting (a sentence
// that says what it does now on the left, its control on the right), then the ways to start over (the welcome, the tutorial, and, when
// this server allows it, the whole demo) as big buttons. The arrow keys move a choice inside a row, as in a game.
import { computed, type FunctionalComponent, h, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setVisiting } from "../landing";
import { config, loadConfig, loadMe, logout, me, postJSON, sendJSON } from "../session";
import type { Badge } from "../types";
import { say } from "./arena/arena";
import BadgeChip from "./arena/BadgeChip.vue";
import { arenaWords as aw } from "./arena/words";
import { type Lang, language, setLang } from "../i18n";
import { settings, settingsPane } from "../settings";
import Avatar from "./Avatar.vue";
import Icon from "./lobby/house/Icon.vue";
import ListRow from "./lobby/panel/ListRow.vue";
import { settingsWords as w } from "./words";

const route = useRoute();
const router = useRouter();
const panel = ref<HTMLElement | null>(null);
let opener: Element | null = null;
// "Reset the demo city" asks once more inline; this is whether it's asking.
const confirming = ref(false);

// The choices of each row. Their words are functions, so each is read in the language chosen now (words.ts).
// The three looks: the site's day or night, or the system's choice.
const views: { value: typeof settings.view; word: () => string }[] = [
  { value: "lobby", word: () => w.walk },
  { value: "list", word: () => w.list },
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

// ---- The title you wear ----

// The titles you won in arenas, and the one shown next to your name (the most recent unless you picked another).
// Picking "None" wears none.
const badges = computed(() => me.value?.badges ?? []);
const sameBadge = (a: Badge, b: Badge) => a.key === b.key && a.city === b.city && a.week === b.week && a.place === b.place;
const wornId = computed(() => {
  const worn = me.value?.badge;
  return worn ? (badges.value.find((b) => sameBadge(b, worn))?.id ?? "") : "";
});
const wearing = ref(false);
const wearError = ref("");
async function wear(id: string | null) {
  if (wearing.value) return;
  wearing.value = true;
  wearError.value = "";
  const res = await sendJSON<{ badge: Badge | null }>("PUT", "/api/me/badge", { id });
  wearing.value = false;
  if (!res.ok) {
    wearError.value = res.message;
    return;
  }
  if (me.value) me.value = { ...me.value, badge: res.data.badge ?? null };
}

// ---- Logging out ----

// It needs the server: while the core is down you stay as you are (the card on top says why).
const leaving = ref(false);
async function leave() {
  leaving.value = true;
  const out = await logout();
  leaving.value = false;
  if (!out) return;
  // The visitor's door is shut again, so "/" opens on the landing.
  setVisiting(false);
  close();
  router.push("/");
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
    <aside v-if="settingsPane.open" ref="panel" class="pane sign green" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
      <div class="sign-frame">
      <header class="sign-band">
        <h2 id="settings-title">{{ w.title }}</h2>
        <button class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
      </header>
      <div class="sign-body inner">
      <ul class="options">
        <!-- The language first: someone who can't read the rest finds it at the top, with a globe and two codes. -->
        <ListRow :title="w.languageGroup">
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

        <ListRow :title="w.viewGroup">
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
                <span class="word">{{ v.word() }}</span>
              </button>
            </div>
          </template>
        </ListRow>

        <ListRow :title="w.qualityGroup">
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
        <ListRow class="flip" :title="w.motionName" @click="settings.reduceMotion = !settings.reduceMotion">
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.motionName" :aria-checked="settings.reduceMotion"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>

        <ListRow class="flip" :title="w.soundName" @click="settings.sound = !settings.sound">
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.soundName" :aria-checked="settings.sound"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>

        <ListRow class="flip" :title="w.shortcutsName" @click="settings.shortcuts = !settings.shortcuts">
          <template #end>
            <button class="toggle" role="switch" :aria-label="w.shortcutsName" :aria-checked="settings.shortcuts"><span class="knob" aria-hidden="true" /></button>
          </template>
        </ListRow>

        <!-- The title you wear, once you've won one: the chip itself, and the pick among yours (or none). -->
        <ListRow v-if="me && badges.length" :title="aw.titleWorn">
          <template #lead><span class="ic"><Icon name="trophy" :size="20" /></span></template>
          <span v-if="me.badge" class="sub"><BadgeChip :badge="me.badge" /></span>
          <template #end>
            <select class="pick" :value="wornId" :aria-label="aw.titleGroup" :disabled="wearing" @change="wear(($event.target as HTMLSelectElement).value || null)">
              <option value="">{{ aw.noTitle }}</option>
              <option v-for="b in badges" :key="b.id" :value="b.id">{{ say(b.title) }} · {{ b.city }}</option>
            </select>
          </template>
        </ListRow>

        <!-- Your account, last: your face, who you're logged in as, and the key to log out. -->
        <!-- Who you are: the name and the handle fit beside the key; the full sentence is for screen readers. -->
        <ListRow v-if="me" :title="me.name ?? me.login">
          <template #lead><Avatar :person="me" :size="46" decorative /></template>
          <span class="handle">@{{ me.login }}</span>
          <span class="sr-only">{{ w.signedIn(me.login) }}</span>
          <template #end>
            <button class="leave" :disabled="leaving" @click="leave"><Icon name="logout" :size="18" />{{ w.logOut }}</button>
          </template>
        </ListRow>
      </ul>

      <!-- Starting over: rows like the others, a word and an arrow. The demo's reset asks once more, in place. -->
      <div v-if="!confirming" class="acts">
        <button class="act" @click="replayWelcome"><span>{{ w.welcomeAgain }}</span><Icon name="next" :size="20" /></button>
        <button v-if="me" class="act" :disabled="tutorialBusy" @click="takeTutorialAgain"><span>{{ w.tutorialAgain }}</span><Icon name="next" :size="20" /></button>
        <!-- Only when the server says the demo may be reset: the whole city goes back to its seed. -->
        <button v-if="config?.demoReset" ref="resetButton" class="act danger" @click="ask(true)"><span>{{ w.resetDemo }}</span><Icon name="next" :size="20" /></button>
      </div>
      <div v-else class="confirm" role="group" aria-labelledby="reset-question">
        <p id="reset-question" class="question"><Icon name="warn" :size="20" />{{ w.resetQuestion }}</p>
        <div class="choice">
          <button ref="keepButton" :disabled="resetBusy" @click="ask(false)">{{ w.keep }}</button>
          <button class="danger-fill" :disabled="resetBusy" @click="resetDemo">{{ w.reset }}</button>
        </div>
      </div>
      <p v-if="wearError" class="error" role="alert">{{ wearError }}</p>
      <p v-if="tutorialError" class="error" role="alert">{{ tutorialError }}</p>
      <p v-if="resetError" class="error" role="alert">{{ resetError }}</p>

      <!-- Who you are, and the way out. While the core is down you stay as you are (the card on top says why). -->
      </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: var(--scrim); }
/* The options menu: a green sign in the middle of the screen, a quick pop. It fits; only a very short window scrolls. */
.pane {
  position: fixed;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  z-index: 100;
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  outline: none;
}
.inner { display: grid; align-content: start; gap: 8px; overflow-y: auto; overscroll-behavior: contain; }

.options { list-style: none; margin: 0; padding: 0; display: grid; line-height: 1.3; }
.options :deep(.list-row) { min-height: 50px; padding: 0; }
/* Rows here are a word and a control: plain text, not a name. */
.options :deep(.title) { font-size: 17px; font-weight: 600; }
.flip { cursor: pointer; }
/* Logging out: a quiet key at the end of your account's row. */
.handle { font-size: 14px; font-weight: 600; color: var(--handle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.leave { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; background: transparent; box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; }
.leave:hover:not(:disabled) { background: var(--tile); }
/* The title to wear: a plain menu, the size of the row's other keys. */
.pick { min-height: 46px; max-width: 13em; padding: 0 10px; border: 3px solid var(--text); border-radius: var(--r-md); background: var(--surface); color: var(--text); font: 800 15px/1.2 var(--font); }

/* The segmented controls (.segmented) and the tick boxes (.toggle) are the shared ones in style.css. */

/* Starting over: rows with an arrow, a line between them and the options above. */
.acts { display: grid; }
.act { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 50px; padding: 0; border-radius: 0; border-top: 2px solid var(--row-line); background: none; color: var(--text); font: 600 17px/1.2 var(--font); text-align: left; }
.act:hover:not(:disabled) { background: var(--tile); }
.act.danger { color: var(--danger); }
.act.danger:hover:not(:disabled) { background: var(--danger-soft); }

/* The reset's question, in place of the rows: a soft red block, then Keep beside Reset. */
.confirm { display: grid; gap: 12px; padding: 12px; border-radius: var(--r-md); background: var(--danger-soft); }
.question { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: var(--danger); }
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.choice button { display: inline-flex; align-items: center; justify-content: center; }
.danger-fill { background: var(--danger); color: var(--on-danger); }
.danger-fill:hover:not(:disabled) { background: var(--danger); opacity: 0.9; }
.error { margin: 0; font-size: 14px; color: var(--danger); }

.handle { font-size: 14px; color: var(--handle); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(10px) scale(0.95); }
/* A phone: the menu is a sheet along the bottom edge. */
@media (max-width: 520px) {
  .pane { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 92dvh; }
  .options .segmented > button { padding: 0 9px; }
}
@media (max-height: 760px) {
  .options :deep(.list-row), .act, }
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active, .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
