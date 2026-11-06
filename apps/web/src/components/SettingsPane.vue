<script setup lang="ts">
// Settings, as a game's options menu: a white card in the middle of the screen, one row per setting (its name on the
// left, its control on the right: a grey rail with the choice in white, or a switch), then the ways to start over
// (the welcome, the tutorial, and, when this server allows it, the whole demo) as rows with an arrow, then you, with
// Log out last. The arrow keys move a choice inside a row, as in a game.
import { computed, type FunctionalComponent, h, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setVisiting } from "../landing";
import { config, loadConfig, loadMe, logout, me, postJSON, sendJSON } from "../session";
import type { Badge, ConnectedRepos } from "../types";
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
      void loadApp();
      await nextTick();
      panel.value?.focus();
      window.addEventListener("keydown", onKey);
    } else {
      window.removeEventListener("keydown", onKey);
      confirming.value = false;
      asking.value = "";
      typed.value = "";
      leaveError.value = "";
      app.removed = false;
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

// ---- Leaving: the GitHub App, and the whole account ----

// Whether the GitHub App is on their own account, asked each time the pane opens (GET /api/github/repos says why a
// list is empty). "off": this server has no App, or they didn't log in with GitHub: no row at all.
const app = reactive<{ state: "unknown" | "installed" | "absent" | "off"; installUrl: string | null; orgs: string[]; removed: boolean }>({
  state: "unknown",
  installUrl: null,
  orgs: [],
  removed: false,
});
async function loadApp() {
  if (!me.value) return;
  try {
    const res = await fetch("/api/github/repos");
    // GitHub not answering: offer the removal anyway, which will say so if it's still down.
    if (!res.ok) return void (app.state = "installed");
    const data = (await res.json()) as ConnectedRepos;
    app.installUrl = data.installUrl;
    app.state = data.reason === "off" || data.reason === "no-github" ? "off" : data.reason === "not-installed" ? "absent" : "installed";
  } catch {
    app.state = "unknown";
  }
}

// Which question is open in place of the two rows, the login typed to confirm, and the key that asked (for the focus).
const asking = ref<"" | "remove" | "delete">("");
const typed = ref("");
const leaveBusy = ref(false);
const leaveError = ref("");
const removeKey = ref<HTMLButtonElement | null>(null);
const deleteKey = ref<HTMLButtonElement | null>(null);
const keepLeaving = ref<HTMLButtonElement | null>(null);
const loginField = ref<HTMLInputElement | null>(null);
const typedOk = computed(() => !!me.value && typed.value.trim().toLowerCase() === me.value.login.toLowerCase());

async function askLeave(what: "" | "remove" | "delete") {
  const was = asking.value;
  asking.value = what;
  typed.value = "";
  leaveError.value = "";
  await nextTick();
  if (what === "delete") loginField.value?.focus();
  else if (what === "remove") keepLeaving.value?.focus();
  else (was === "remove" ? removeKey : deleteKey).value?.focus();
}

async function removeApp() {
  leaveBusy.value = true;
  leaveError.value = "";
  const res = await postJSON<{ unlinked: number; orgs: string[] }>("/api/me/github/remove", {});
  leaveBusy.value = false;
  if (!res.ok) return void (leaveError.value = res.message);
  Object.assign(app, { state: "absent", orgs: res.data.orgs ?? [], removed: true });
  await askLeave("");
}

// Deleted: logged out on this page too. Then one trip through GitHub so it forgets La Coloc, when it can be told;
// otherwise straight to the landing, which says what's left to remove on GitHub.
async function deleteAccount() {
  if (!typedOk.value || leaveBusy.value) return;
  leaveBusy.value = true;
  leaveError.value = "";
  const res = await postJSON<{ forgetUrl: string | null; manual: boolean }>("/api/me/delete", { login: typed.value.trim() });
  if (!res.ok) {
    leaveBusy.value = false;
    leaveError.value = res.message;
    return;
  }
  me.value = null;
  setVisiting(false);
  close();
  if (res.data.forgetUrl) return void location.assign(res.data.forgetUrl);
  leaveBusy.value = false;
  await router.push({ path: "/", query: { deleted: res.data.manual ? "github" : "1" } });
}

// ---- Reset the demo ----

// After the inline question: the server resets the demo city, this browser forgets its settings and tours,
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
    for (const key of ["coloc.settings", "coloc.tours"]) localStorage.removeItem(key);
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
    <aside v-if="settingsPane.open" ref="panel" class="pane sign" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
      <div class="sign-frame">
      <header class="sign-band">
        <span class="chip"><Icon name="gear" :size="22" /></span>
        <h2 id="settings-title">{{ w.title }}</h2>
        <!-- Said in the language it names, so whoever can't read the other one still sees which is on. -->
        <p class="sign-sub">{{ w.languageNow }}</p>
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

      </ul>

      <!-- Starting over: rows like the others, a word and an arrow. The demo's reset asks once more, in place. -->
      <div v-if="!confirming" class="acts">
        <button class="act" @click="replayWelcome"><span>{{ w.welcomeAgain }}</span><Icon name="next" :size="18" /></button>
        <button v-if="me" class="act" :disabled="tutorialBusy" @click="takeTutorialAgain"><span>{{ w.tutorialAgain }}</span><Icon name="next" :size="18" /></button>
        <!-- Only when the server says the demo may be reset: the whole city goes back to its seed. -->
        <button v-if="config?.demoReset" ref="resetButton" class="act danger" @click="ask(true)"><span>{{ w.resetDemo }}</span><Icon name="next" :size="18" /></button>
      </div>
      <div v-else class="confirm" role="group" aria-labelledby="reset-question">
        <p id="reset-question" class="question"><Icon name="warn" :size="20" />{{ w.resetQuestion }}</p>
        <div class="choice">
          <button ref="keepButton" :disabled="resetBusy" @click="ask(false)">{{ w.keep }}</button>
          <button class="primary" :disabled="resetBusy" @click="resetDemo">{{ w.reset }}</button>
        </div>
      </div>
      <!-- Your account, last of all, on its own tile: your face, who you're logged in as, and the key to log out. -->
      <ul v-if="me" class="options account">
        <ListRow :title="me.name ?? me.login" :sub="w.signedIn(me.login)">
          <template #lead><Avatar :person="me" :size="40" decorative /></template>
          <template #end>
            <button class="leave second" :disabled="leaving" @click="leave">{{ w.logOut }}</button>
          </template>
        </ListRow>
      </ul>
      <!-- Leaving, at the very end: the GitHub App on your repos, then your whole account. Each asks once more, in
           place of the rows; deleting wants your login typed out. -->
      <template v-if="me">
        <div v-if="!asking" class="acts">
          <a v-if="app.state === 'absent' && app.installUrl" class="act" :href="app.installUrl" target="_blank" rel="noopener">
            <span>{{ w.installApp }}</span><Icon name="external" :size="18" />
          </a>
          <button v-else-if="app.state === 'installed'" ref="removeKey" class="act" @click="askLeave('remove')"><span>{{ w.removeApp }}</span><Icon name="next" :size="18" /></button>
          <p v-if="app.removed" class="done" role="status">
            <Icon name="tick" :size="18" />{{ w.removed }}
            <template v-if="app.orgs.length">
              {{ w.stillOn }}
              <template v-for="(org, i) in app.orgs" :key="org">{{ i ? ", " : "" }}<a :href="`https://github.com/organizations/${org}/settings/installations`" target="_blank" rel="noopener">{{ org }}</a></template>.
            </template>
          </p>
          <button ref="deleteKey" class="act danger" @click="askLeave('delete')"><span>{{ w.deleteAccount }}</span><Icon name="next" :size="18" /></button>
        </div>
        <div v-else-if="asking === 'remove'" class="confirm" role="group" aria-labelledby="remove-question">
          <p id="remove-question" class="question"><Icon name="warn" :size="20" />{{ w.removeQuestion }}</p>
          <p class="what">{{ w.removeWhat }}</p>
          <div class="choice">
            <button ref="keepLeaving" :disabled="leaveBusy" @click="askLeave('')">{{ w.keep }}</button>
            <button class="primary" :disabled="leaveBusy" @click="removeApp">{{ w.remove }}</button>
          </div>
        </div>
        <form v-else class="confirm" aria-labelledby="delete-question" novalidate @submit.prevent="deleteAccount">
          <p id="delete-question" class="question"><Icon name="warn" :size="20" />{{ w.deleteQuestion }}</p>
          <p class="what">{{ w.deleteWhat }}</p>
          <input
            ref="loginField"
            v-model="typed"
            class="login"
            :placeholder="w.typeLogin(me.login)"
            :aria-label="w.typeLogin(me.login)"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <div class="choice">
            <button type="button" :disabled="leaveBusy" @click="askLeave('')">{{ w.keep }}</button>
            <button type="submit" class="primary" :disabled="leaveBusy || !typedOk">{{ w.delete }}</button>
          </div>
        </form>
        <p v-if="leaveError" class="error" role="alert">{{ leaveError }}</p>
      </template>
      <p v-if="wearError" class="error" role="alert">{{ wearError }}</p>
      <p v-if="tutorialError" class="error" role="alert">{{ tutorialError }}</p>
      <p v-if="resetError" class="error" role="alert">{{ resetError }}</p>

      </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: var(--scrim); }
/* The options menu: a white card in the middle of the screen, a quick pop. It fits; only a very short window scrolls. */
.pane {
  position: fixed;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  z-index: 100;
  display: flex;
  flex-direction: column;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  outline: none;
}
.inner { display: grid; align-content: start; gap: 14px; overflow-y: auto; overscroll-behavior: contain; }

.options { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; line-height: 1.3; }
.options :deep(.list-row) { min-height: 48px; padding: 0; }
.options :deep(.list-row:hover), .options :deep(.list-row:focus-within) { background: none; box-shadow: none; }
/* Rows here are a word and a control. */
.options :deep(.title) { font-size: 15px; font-weight: 800; }
/* The choices: the shared grey rail (style.css), one width, so the rails line up down the card. */
.options .segmented { width: 200px; }
/* Doubled class: the row's own button rule (ListRow.vue) would make them its 46px keys. */
.options .segmented.segmented > button { flex: 1 1 0; min-width: 0; min-height: 40px; padding: 0 10px; border-radius: 10px; font-size: 15px; }
.flip { cursor: pointer; }
/* A switch: a pill, the knob on the left when off and on the ink's side when on. */
.options button.toggle[role="switch"][aria-checked] { width: 48px; min-height: 28px; height: 28px; border-radius: 14px; background: var(--fill); box-shadow: none; }
.options button.toggle[role="switch"][aria-checked]:hover:not(:disabled) { background: var(--fill-hover); }
.options button.toggle[role="switch"][aria-checked="true"], .options button.toggle[role="switch"][aria-checked="true"]:hover:not(:disabled) { background: var(--text); }
.options button.toggle[role="switch"][aria-checked]::before { content: none; }
.options button.toggle[role="switch"][aria-checked] .knob { position: absolute; top: 3px; left: 3px; display: block; width: 22px; height: 22px; border-radius: 50%; background: var(--surface); transition: translate var(--dur-fast) var(--ease); }
.options button.toggle[role="switch"][aria-checked="true"] .knob { translate: 20px 0; }
/* Your account, at the very end, on its own tile. Logging out is the grey button in it. */
.account { padding: 10px 10px 10px 12px; border-radius: var(--tile-r); background: var(--tile); }
.account :deep(.list-row .sub) { font-size: 13px; font-weight: 600; }
.options.account button.leave.second { flex: none; min-height: 48px; padding: 0 16px var(--lip); border-radius: 12px; background: var(--fill); font-size: 16px; white-space: nowrap; }
.options.account button.leave.second:hover:not(:disabled) { background: var(--fill-hover); }
/* The title to wear: a plain menu on the soft grey. */
.pick { min-height: 40px; max-width: 13em; padding: 0 10px; border: 0; border-radius: 10px; background: var(--sunken); color: var(--text); font: 800 15px/1.2 var(--font); }

/* Starting over, and leaving: rows of a word and an arrow. */
.acts { display: grid; gap: 0; margin: 0 -8px; }
.act { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 0 8px; border-radius: 10px; background: none; box-shadow: none; color: var(--text); font: 800 15px/1.2 var(--font); text-align: left; }
.act svg { color: var(--muted); }
.act:hover:not(:disabled) { background: var(--tile); }
.act.danger { color: var(--danger); }
.act.danger svg { color: inherit; }

/* A question in place of the rows: on a soft tile, the warning's symbol, then Keep beside the red button that does it. */
.confirm { display: grid; gap: 12px; padding: 14px; border-radius: var(--tile-r); background: var(--tile); }
.question { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; color: var(--text); }
.question svg { flex: none; color: var(--accent); }
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice button { display: inline-flex; align-items: center; justify-content: center; }
.choice button:not(.primary) { background: var(--fill); box-shadow: inset 0 calc(-1 * var(--lip)) 0 var(--quiet-lip); padding-bottom: var(--lip); }
.error { margin: 0; font-size: 14px; color: var(--danger); }
/* Leaving: what it does in one line, and the login to type. */
a.act { text-decoration: none; }
.what { margin: -4px 0 0; font-size: 14px; font-weight: 600; color: var(--muted); }
.login { background: var(--surface); }
.done { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0 8px; font-size: 14px; font-weight: 600; }
.done a { color: var(--accent); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(10px) scale(0.95); }
/* A phone: the menu is a sheet along the bottom edge, the rails a little narrower. */
@media (max-width: 520px) {
  .pane { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 92dvh; }
  .options .segmented { width: 168px; }
  .options .segmented.segmented > button { padding: 0 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active, .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
