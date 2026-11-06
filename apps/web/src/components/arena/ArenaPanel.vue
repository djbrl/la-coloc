<script setup lang="ts">
// The arena, opened at the stadium's entrance (or from the HUD's way in): a floating card docked on the right of the
// city, like a house's window, built on the lobby's Panel. Its head is the week's challenge (a trophy in the icon's tile,
// its title, "This week's challenge." under it). The first tab tells it in order, quietly (Jib, 6 Nov: the old one was
// "too loud"): what it pays and how long is left, one line on the challenge, one button to take part. How to take part
// (three numbered steps with the real actions: fork, open a pull request, send it) and the rules, points and prizes are
// folded away until asked for. The leaderboard (with your own pull requests on top) and the arena's chat room wait
// behind the other two tabs. The view comes from the arena store (store.ts), which the lobby keeps fresh over the
// city's stream; a join or a pull request sent gives a newer view back at once.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { language } from "../../i18n";
import { me, postJSON, sendJSON } from "../../session";
import type { ArenaView } from "../../types";
import Waiting from "../Waiting.vue";
import { commonWords as cw } from "../words";
import Icon from "../lobby/house/Icon.vue";
import { fcfa } from "../lobby/house/server";
import ListRow from "../lobby/panel/ListRow.vue";
import Panel from "../lobby/panel/Panel.vue";
import PanelHead from "../lobby/panel/PanelHead.vue";
import PanelTabs, { type Tab } from "../lobby/panel/PanelTabs.vue";
import {
  arenaStage,
  checkPrUrl,
  cloneCommand,
  ended,
  folderUrl,
  forkUrl,
  KINDS,
  labelWord,
  prizesFor,
  prProblemText,
  repoName,
  say,
  submissionState,
  timeLeft,
} from "./arena";
import ArenaBoard from "./ArenaBoard.vue";
import ArenaRoom from "./ArenaRoom.vue";
import { arena, arenaUrl, loadArena, showArena } from "./store";
import { arenaWords as w } from "./words";

const props = defineProps<{
  city: string;
  // How many people are inside the stadium right now (the 3D lobby counts them), or null before it has said.
  crowd: number | null;
}>();
const emit = defineEmits<{ close: [] }>();

const view = computed(() => (arena.city === props.city ? arena.view : null));
const challenge = computed(() => view.value?.challenge ?? null);
const kind = computed(() => (challenge.value ? KINDS[challenge.value.kind] : null));

// Opening the panel asks again: what's on the big screen may be a few minutes old.
onMounted(() => void loadArena(!!arena.view));
useWhenBack(() => void loadArena(!!arena.view));

// ---- The tabs ----

type TabKey = "challenge" | "board" | "room";
const tab = ref<TabKey>("challenge");
const tabs = computed((): Tab[] => [
  { key: "challenge", icon: "trophy", word: w.tabs.challenge },
  { key: "board", icon: "people", word: w.tabs.board },
  { key: "room", icon: "chat", word: w.tabs.room },
]);

// ---- 1. The challenge: its time left, live while the panel is open, and its rules ----

const now = ref(Date.now());
const clock = window.setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(clock));
const left = computed(() => (challenge.value ? timeLeft(challenge.value.endsAt, now.value) : ""));
const over = computed(() => !!challenge.value && ended(challenge.value.endsAt, now.value));
// The week's end, in the reader's language and their own time zone ("dimanche 18 octobre, 23:59"), on hover.
const deadline = computed(() =>
  challenge.value
    ? w.endsAt(
        new Date(new Date(challenge.value.endsAt).getTime() - 60_000).toLocaleString(language.lang, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
      )
    : "",
);
const rules = computed(() => (challenge.value ? say(challenge.value.rules) : []));
// The two folds under the main button: how to take part, and the rules with the points and the prizes.
const howOpen = ref(false);
const rulesOpen = ref(false);

// ---- 2. Taking part ----

const stage = computed(() => (view.value ? arenaStage(view.value, me.value, now.value) : null));
const auto = computed(() => !!view.value?.autoSubmit);
// With pull requests picked up on their own, the address box waits behind a key (for one GitHub didn't tell us of).
const pasteOpen = ref(false);
const mine = computed(() => {
  const list = view.value?.mine ?? [];
  return { count: list.length, points: list.reduce((n, s) => n + s.points, 0) };
});
// What a merged pull request can be worth, lowest to highest: the rules fold's meta ("10 to 100 pts").
const pointsRange = computed(() => {
  const all = (challenge.value?.points ?? []).map((p) => p.points);
  return all.length ? w.pointsRange(Math.min(...all), Math.max(...all)) : null;
});
// The points table as a reader hears it: "low 10 points, medium 25 points…".
const table = computed(() => (challenge.value?.points ?? []).map((p) => `${labelWord(p.label)} ${w.points(p.points)}`).join(", "));

const clone = computed(() => (challenge.value ? cloneCommand(challenge.value.repo, challenge.value.path, me.value?.login ?? null) : ""));
const copied = ref(false);
let copiedTimer = 0;
async function copyClone() {
  try {
    await navigator.clipboard.writeText(clone.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied.value = false), 2000);
  } catch {
    // No clipboard (an old browser, or no permission): Fork and the folder's page still lead there.
  }
}
onBeforeUnmount(() => clearTimeout(copiedTimer));

const busy = ref(false);
const error = ref("");
const said = ref("");
const url = ref("");

async function act<T extends ArenaView>(run: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  error.value = "";
  said.value = "";
  const res = await run();
  busy.value = false;
  if (!res.ok) {
    error.value = res.message;
    return false;
  }
  showArena(res.data);
  return true;
}

const join = () => act(() => postJSON<ArenaView>(`${arenaUrl(props.city)}/join`, {}));

async function submit() {
  const c = challenge.value;
  if (!c) return;
  const problem = checkPrUrl(url.value, c.repo);
  if (problem) {
    error.value = prProblemText(problem, c.repo);
    said.value = "";
    return;
  }
  const sent = await act(() => postJSON<ArenaView>(`${arenaUrl(props.city)}/submissions`, { url: url.value.trim() }));
  if (sent) {
    url.value = "";
    said.value = w.sent;
  }
}

const takeBack = (id: string) => act(() => sendJSON<ArenaView>("DELETE", `${arenaUrl(props.city)}/submissions/${encodeURIComponent(id)}`));

// A word said about the last thing done is stale on another tab.
watch(tab, () => {
  error.value = "";
  said.value = "";
});

// ---- 3. The payout ----

// Each place in words, for the rules fold: "1st place: 20 000 FCFA and the title Eagle eye", "2nd place: a podium badge".
const prizes = computed(() => {
  const c = challenge.value;
  if (!c) return [];
  return prizesFor(c).map((p) => {
    const podium = p.badge.key === "podium";
    const amount = p.fcfa > 0 ? fcfa(p.fcfa) : null;
    return { place: p.place, amount, title: say(p.badge.title), name: w.prizeName(w.place(p.place), amount, podium ? null : say(p.badge.title)) };
  });
});
// The head of the tab: first place's credit, big, and the title it wins in a line under it. A week that pays no credit
// shows the title itself big.
const top = computed(() => {
  const first = prizes.value.find((p) => p.place === 1);
  if (!first) return null;
  return first.amount ? { big: first.amount, line: w.andTitle(first.title) } : { big: first.title, line: w.forFirst };
});
// A submission's quiet symbol: merged is done, closed failed, open waits on the judges (a plain dot, nothing for you).
const mark = (state: "open" | "merged" | "closed") => (state === "merged" ? "ok" : state === "closed" ? "fail" : "none");

// ---- The keys ----

// The sheet keeps its keys to itself: the city listens on the window (W A S D, E, Tab…) and must not walk while you
// type a pull request's address or a message. Escape closes.
const sheet = ref<HTMLElement | null>(null);
onMounted(() => sheet.value?.focus({ preventScroll: true }));
function onKey(e: KeyboardEvent) {
  e.stopPropagation();
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <div class="arena" @keyup.stop>
    <div class="scrim" @click="emit('close')" />
    <section ref="sheet" class="sheet sign" role="dialog" aria-modal="true" :aria-label="w.label(city)" tabindex="-1" @keydown="onKey">
      <div class="sign-frame">
      <!-- Close sits on the head, whichever is showing. -->
      <button type="button" class="sign-x close" :aria-label="w.close" @click="emit('close')"><span aria-hidden="true">X</span></button>

      <div class="page-host">
        <template v-if="!view || !challenge || !kind">
          <header class="sign-band large">
            <span class="chip"><Icon name="trophy" :size="22" /></span>
            <h2>{{ w.arena }}</h2>
          </header>
          <Waiting v-if="arena.waiting" @retry="loadArena()" />
          <div v-else-if="arena.failed" class="state" role="alert">
            <p class="said">{{ w.failed }}</p>
            <button type="button" class="primary" @click="loadArena()">{{ cw.tryAgain }}</button>
          </div>
          <div v-else-if="arena.loaded" class="state" role="status">
            <span class="big-ic" aria-hidden="true"><Icon name="trophy" :size="26" /></span>
            <p class="said">{{ w.closed }}</p>
            <p class="soft">{{ w.closedLine }}</p>
          </div>
          <p v-else class="state soft" role="status">{{ w.opening }}</p>
        </template>

        <Panel v-else :body-id="`tabpanel-${tab}`" :body-labelledby="`tab-${tab}`">
          <template #head>
            <PanelHead :title="say(challenge.title)" :line="w.weekly">
              <!-- The trophy in the icon's tile; the challenge's kind (bug bounty, hackathon…) is its name. -->
              <template #lead>
                <span class="kind" role="img" :aria-label="w.kinds[challenge.kind]" :title="w.kinds[challenge.kind]">
                  <Icon name="trophy" :size="22" />
                </span>
              </template>
            </PanelHead>
          </template>
          <template #tabs>
            <PanelTabs v-model="tab" :tabs="tabs" :label="w.tabsLabel" />
          </template>

          <template v-if="tab === 'challenge'">
            <!-- What it pays and how long is left: the numbers first, the words small under them. -->
            <div class="prize">
              <p v-if="top" class="pays">
                <span class="big">{{ top.big }}</span>
                <span class="small-line">{{ top.line }}</span>
              </p>
              <p class="when">
                <span class="left" :class="{ over }" role="img" :aria-label="over ? w.endedName : `${w.timeLeftName(left)}. ${deadline}`" :title="deadline">
                  <Icon name="clock" :size="16" /><span aria-hidden="true">{{ left }}</span>
                </span>
                <span class="small-line">
                  <span :title="w.entrantsName(view.entrants)">{{ w.entrants(view.entrants) }}</span>
                  <span v-if="crowd !== null" :title="w.crowdName(crowd)"> · {{ w.here(crowd) }}</span>
                </span>
              </p>
            </div>

            <p class="summary">{{ say(challenge.summary) }}</p>

            <!-- The one thing to do: log in, take part, or (once in) send a pull request. -->
            <div v-if="stage === 'soon'" class="soon" role="status">
              <span class="status-mark none" aria-hidden="true" />
              <p><strong>{{ w.notOpenTitle }}</strong> {{ w.notOpen }}</p>
            </div>
            <RouterLink v-else-if="stage === 'login'" to="/login" class="button primary go"><Icon name="login" :size="18" />{{ w.logIn }}</RouterLink>
            <button v-else-if="stage === 'join'" type="button" class="primary go" :disabled="busy" @click="join"><Icon name="trophy" :size="18" />{{ w.join }}</button>
            <template v-else-if="stage === 'joined'">
              <div class="in">
                <span class="status-mark ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
                <span class="in-word">{{ w.joined }}<span v-if="auto" class="small-line"> · {{ w.autoStep }}</span></span>
                <button v-if="mine.count" type="button" class="key" :aria-label="w.mineChipName(mine.count, mine.points)" :title="w.mineChipName(mine.count, mine.points)" @click="tab = 'board'">
                  {{ w.mineChip(mine.count, mine.points) }}
                </button>
                <button v-if="auto && !pasteOpen" type="button" class="key icon" :aria-label="w.pasteInstead" :title="w.pasteInstead" @click="pasteOpen = true">
                  <Icon name="link" :size="16" />
                </button>
              </div>
              <form v-if="!auto || pasteOpen" class="send" novalidate @submit.prevent="submit">
                <input v-model="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="w.prPlaceholder" :aria-label="w.prName" :aria-invalid="!!error" @input="error = ''" />
                <button class="primary" :disabled="busy">{{ w.submit }}</button>
              </form>
            </template>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <p v-else-if="said" class="said-ok" role="status">{{ said }}</p>

            <!-- Folded until asked for: how to take part, then the rules, the points and the prizes. -->
            <div class="folds">
              <div v-if="stage !== 'soon'" class="fold">
                <button type="button" class="fold-key" :aria-expanded="howOpen" aria-controls="arena-how" @click="howOpen = !howOpen">
                  <span class="fold-title">{{ w.stepsName }}</span>
                  <span class="fold-meta">{{ w.stepsMeta(3) }}</span>
                  <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <ol v-show="howOpen" id="arena-how" class="steps">
                  <li class="step">
                    <span class="num" aria-hidden="true">1</span>
                    <span class="say">
                      <span class="step-title">{{ w.forkStep }}</span>
                      <span class="repo">
                        <a class="field" :href="folderUrl(challenge.repo, challenge.path)" target="_blank" rel="noopener noreferrer" :title="w.githubName">{{ repoName(challenge.repo) }}/{{ challenge.path }}</a>
                        <a class="button key" :href="forkUrl(challenge.repo)" target="_blank" rel="noopener noreferrer" :aria-label="w.forkName" :title="w.forkName">
                          <Icon name="code" :size="16" /><span class="word">{{ w.fork }}</span>
                        </a>
                        <button type="button" class="key icon" :aria-label="copied ? w.copied : w.copyName" :title="copied ? w.copied : w.copyName" @click="copyClone">
                          <Icon :name="copied ? 'tick' : 'copy'" :size="16" />
                        </button>
                      </span>
                    </span>
                  </li>
                  <li class="step">
                    <span class="num" aria-hidden="true">2</span>
                    <span class="say"><span class="step-title">{{ w.prStep }}</span></span>
                  </li>
                  <li class="step" :class="{ off: !view.joined }">
                    <span class="num" aria-hidden="true">3</span>
                    <span class="say">
                      <span class="step-title">{{ auto ? w.autoStep : w.pasteStep }}</span>
                      <span class="step-sub">{{ w.scoreLine }}</span>
                    </span>
                  </li>
                </ol>
              </div>

              <div v-if="rules.length || challenge.points.length || prizes.length" class="fold">
                <button type="button" class="fold-key" :aria-expanded="rulesOpen" aria-controls="arena-rules" @click="rulesOpen = !rulesOpen">
                  <span class="fold-title">{{ w.rulesPoints }}</span>
                  <span v-if="pointsRange" class="fold-meta">{{ pointsRange }}</span>
                  <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <div v-show="rulesOpen" id="arena-rules" class="fold-body">
                  <template v-if="challenge.points.length">
                    <ul class="points" role="img" :aria-label="w.gradedName(table)">
                      <li v-for="p in challenge.points" :key="p.label" class="pt" aria-hidden="true">
                        <span class="pt-n">{{ w.points(p.points) }}</span>
                        <span class="pt-label">{{ p.label }}</span>
                      </li>
                    </ul>
                    <p class="small-line" aria-hidden="true">{{ w.graded }}</p>
                  </template>
                  <ol v-if="rules.length" class="rules">
                    <li v-for="(r, i) in rules" :key="i">{{ r }}</li>
                  </ol>
                  <div v-if="prizes.length" class="prizes">
                    <p class="label">{{ w.prizesName }}</p>
                    <ul>
                      <li v-for="p in prizes" :key="p.place">{{ p.name }}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- The leaderboard, your own pull requests first. -->
          <template v-else-if="tab === 'board'">
            <ul v-if="view.mine.length" class="lines" :aria-label="w.mineName">
              <ListRow v-for="s in view.mine" :key="s.id" :title="s.title ?? `#${s.number}`" :sub="`${repoName(challenge.repo)} #${s.number} · ${submissionState(s.state).word}`">
                <template #lead>
                  <span class="status-mark" :class="mark(s.state)" aria-hidden="true">
                    <svg v-if="s.state === 'merged'" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    <svg v-else-if="s.state === 'closed'" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
                  </span>
                </template>
                <template #meta>
                  <span>{{ w.points(s.points) }}</span>
                </template>
                <template #end>
                  <a class="button key icon" :href="s.url" target="_blank" rel="noopener noreferrer" :aria-label="w.openPrName(s.number)" :title="w.openPrName(s.number)">
                    <Icon name="external" :size="16" />
                  </a>
                  <button v-if="s.state !== 'merged' && !over" type="button" class="key icon" :disabled="busy" :aria-label="w.takeBackName(s.number)" :title="w.takeBack" @click="takeBack(s.id)">
                    <Icon name="trash" :size="16" />
                  </button>
                </template>
              </ListRow>
            </ul>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <ArenaBoard :view="view" :me="me?.login ?? null" />
          </template>
          <ArenaRoom v-else :city="city" />
        </Panel>
      </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Above the HUD, like a house's window (Inside.vue): the same card on the right, the city lit beside it. */
.arena { position: absolute; inset: 0; z-index: 60; }
.scrim { position: absolute; inset: 0; }
.sheet {
  position: absolute;
  top: 98px;
  bottom: 24px;
  right: 32px;
  width: min(720px, 52vw);
  outline: none;
  overflow-wrap: anywhere;
  transform-origin: 70% 50%;
  animation: pop-in var(--dur-slow) var(--ease-pop);
}
.sign-frame { position: relative; }
.page-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; border-radius: var(--card-r); background: var(--surface); }
.page-host > :not(.sign-band) { flex: 1 1 auto; min-height: 0; }

.arena :deep(.p-body) { gap: 14px; padding-bottom: 20px; }

/* Opening, closed, failed: one calm message in the middle. */
.state { margin: auto; display: grid; justify-items: center; align-content: center; gap: 6px; padding: 28px 16px; text-align: center; max-width: 360px; }
.state .said { font-size: 15px; font-weight: 800; }
.soft { color: var(--muted); font-size: 13px; font-weight: 600; }
.big-ic { display: grid; place-items: center; color: var(--muted); }

/* The trophy fills PanelHead's 44px tile in the soft red. */
.kind { display: grid; place-items: center; width: 44px; height: 44px; background: var(--accent-soft); color: var(--accent); }

/* Everything on the tab keeps its height: the body scrolls (a fold open, an error) rather than squeezing it. */
.prize, .summary, .go, .in, .send, .soon, .folds, .error, .said-ok { flex: none; }
.small-line { font-size: 14px; font-weight: 600; line-height: 20px; color: var(--muted); }

/* What it pays, big, and the time left at the right. */
.prize { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 4px 0 2px; }
.pays, .when { margin: 0; display: grid; gap: 2px; min-width: 0; }
.big { font-size: 32px; font-weight: 800; line-height: 38px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pays .small-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { flex: none; justify-items: end; text-align: right; }
.left { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap; }
.left.over { color: var(--muted); }

/* One line on the challenge. */
.summary { margin: 0; font-size: 15px; font-weight: 600; line-height: 22px; color: var(--muted); }

/* The one main button, across the width. */
.go { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; white-space: nowrap; }
a.go:hover { text-decoration: none; }

/* Taken part: a tick, and what's next on the same line. */
.in { display: flex; align-items: center; gap: 10px; min-height: 40px; }
.in-word { flex: 1 1 auto; min-width: 0; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.send { display: flex; gap: 10px; min-width: 0; }
.send input { flex: 1 1 auto; min-width: 0; font-size: 15px; }
.send button { flex: none; white-space: nowrap; }
.soon { display: flex; align-items: flex-start; gap: 10px; }
.soon p { margin: 0; font-size: 14px; line-height: 20px; color: var(--muted); }
.soon strong { color: var(--text); }
.error { margin: 0; color: var(--danger); font-size: 14px; }
.said-ok { margin: 0; font-size: 14px; font-weight: 800; }

/* The small keys, one family with the big ones: grey, a lip, 40 high. Inside a fold they're a step darker, so they
   still show on its grey. */
.key { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 12px 3px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 -3px 0 var(--quiet-lip); color: var(--text); font-size: 14px; white-space: nowrap; }
.key.icon { width: 40px; padding: 0 0 3px; }
.key:hover:not(:disabled) { background: var(--fill); text-decoration: none; }
.fold .key { background: var(--fill); }
.fold .key:hover:not(:disabled) { background: var(--fill-hover); }

/* The folds: a grey tile each, a row that opens it, its chevron turning. */
.folds { display: grid; gap: 8px; }
.fold { border-radius: var(--tile-r); background: var(--tile); }
.fold-key { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 14px; border-radius: var(--tile-r); background: transparent; box-shadow: none; color: var(--text); text-align: left; }
.fold-key:hover:not(:disabled) { background: transparent; }
.fold-key:active:not(:disabled) { transform: none; }
.fold-title { flex: 1 1 auto; min-width: 0; font: 800 15px/1.2 var(--font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fold-meta { flex: none; font: 600 13px/1 var(--font); color: var(--muted); }
.chev { flex: none; color: var(--muted); transition: transform var(--dur) var(--ease); }
.fold-key[aria-expanded="true"] .chev { transform: rotate(180deg); }
.fold-body { display: grid; gap: 12px; padding: 0 14px 14px; }

/* How to take part: numbered on ink, the action under step 1. */
.steps { display: grid; gap: 12px; margin: 0; padding: 0 14px 14px; list-style: none; }
.step { display: flex; gap: 12px; }
.num { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--text); color: var(--surface); font: 800 13px/1 var(--font); }
.step.off .num, .step.off .say { opacity: 0.45; }
.say { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.step-title { padding-top: 3px; font-size: 15px; font-weight: 800; line-height: 20px; }
.step-sub { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.repo { display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: 8px; }
.field { flex: 1 1 auto; min-width: 0; height: 40px; padding: 0 12px; border-radius: 10px; background: var(--surface); color: var(--text); font: 500 13px/40px var(--code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field:hover { text-decoration: underline; text-underline-offset: 3px; }

/* The rules fold: the points as four small white tiles, then the rules and the prizes in plain lines. */
.points { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.pt { display: grid; padding: 8px 10px; border-radius: 10px; background: var(--surface); min-width: 0; }
.pt-n { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pt-label { font: 500 12px/1.4 var(--code); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rules { margin: 0; padding: 0 0 0 20px; display: grid; gap: 4px; font-size: 14px; font-weight: 600; line-height: 20px; color: var(--muted); }
.prizes { display: grid; gap: 6px; }
.prizes ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: 14px; font-weight: 600; line-height: 20px; }

/* The leaderboard tab: your pull requests above the top ten. */
.lines { flex: none; display: grid; margin: 0; padding: 0; list-style: none; }

@keyframes pop-in {
  from { opacity: 0; transform: translateX(12px) scale(0.96); }
}
@keyframes rise-in {
  from { opacity: 0; transform: translateY(12px); }
}
@media (min-width: 720px) and (max-height: 720px) {
  .sheet { top: 16px; bottom: 16px; }
}
@media (max-width: 719px) {
  .arena { display: grid; place-items: end stretch; }
  .scrim { background: color-mix(in srgb, var(--scrim) 45%, transparent); }
  .sheet { position: relative; inset: auto; width: 100%; height: 76dvh; min-height: min(460px, 88dvh); animation-name: rise-in; }
}
/* A phone: the prize a size down; the keys lose their words (their names stay). */
@media (max-width: 480px) {
  .big { font-size: 26px; line-height: 32px; }
  .key .word { display: none; }
  .key:not(.icon) { padding: 0 10px 3px; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
  .chev { transition: none; }
}
</style>
