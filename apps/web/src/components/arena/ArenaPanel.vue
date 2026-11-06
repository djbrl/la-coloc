<script setup lang="ts">
// The arena, opened at the stadium's entrance (or from the HUD's way in): a floating card docked on the right of the
// city, like a house's window, built on the lobby's Panel. Its head is the week's challenge (its kind's icon and its
// title). The first tab answers three questions in this order, without scrolling: what's this week's challenge (one
// line, the time left, who's in, the rules folded), how do I take part (three numbered steps with the real actions:
// join, open a pull request on the arena repo, then it's picked up or you paste it, and how it's graded), and what's
// the payout (1st, 2nd, 3rd). The leaderboard (with your own pull requests on top) and the arena's chat room wait
// behind the other two tabs. The view comes from the arena store (store.ts), which the lobby keeps fresh over the
// city's stream; a join or a pull request sent gives a newer view back at once.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { language } from "../../i18n";
import { me, postJSON, sendJSON } from "../../session";
import type { ArenaView, Badge } from "../../types";
import Waiting from "../Waiting.vue";
import { commonWords as cw } from "../words";
import Icon from "../lobby/house/Icon.vue";
import { fcfa } from "../lobby/house/server";
import ListRow from "../lobby/panel/ListRow.vue";
import Panel from "../lobby/panel/Panel.vue";
import PanelHead from "../lobby/panel/PanelHead.vue";
import PanelTabs, { type Tab } from "../lobby/panel/PanelTabs.vue";
import StatusPill from "../lobby/panel/StatusPill.vue";
import {
  arenaStage,
  checkPrUrl,
  cloneCommand,
  ended,
  folderUrl,
  forkUrl,
  KINDS,
  labelWord,
  medal,
  prizesFor,
  prProblemText,
  repoName,
  say,
  submissionState,
  timeLeft,
} from "./arena";
import ArenaBoard from "./ArenaBoard.vue";
import ArenaRoom from "./ArenaRoom.vue";
import BadgeChip from "./BadgeChip.vue";
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

// Each place as the window draws it: the credit (1st only) and the badge, the podium's one under its short name.
const prizes = computed(() => {
  const c = challenge.value;
  if (!c) return [];
  const week = c.startsAt.slice(0, 10);
  return prizesFor(c).map((p) => {
    const podium = p.badge.key === "podium";
    const badge: Badge = { key: p.badge.key, title: podium ? { en: w.podium, fr: w.podium } : p.badge.title, place: p.place, city: props.city, week };
    const amount = p.fcfa > 0 ? fcfa(p.fcfa) : null;
    return { place: p.place, amount, badge, name: w.prizeName(w.place(p.place), amount, podium ? null : say(p.badge.title)) };
  });
});

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
      <!-- Close sits on the title band, whichever is showing. -->
      <button type="button" class="sign-x close" :aria-label="w.close" @click="emit('close')"><span aria-hidden="true">X</span></button>

      <div class="page-host">
        <template v-if="!view || !challenge || !kind">
          <header class="sign-band large"><h2>{{ w.arena }}</h2></header>
          <Waiting v-if="arena.waiting" @retry="loadArena()" />
          <div v-else-if="arena.failed" class="state" role="alert">
            <p class="said">{{ w.failed }}</p>
            <button type="button" class="primary" @click="loadArena()">{{ cw.tryAgain }}</button>
          </div>
          <div v-else-if="arena.loaded" class="state" role="status">
            <span class="big-ic" aria-hidden="true"><Icon name="trophy" :size="32" /></span>
            <p class="said">{{ w.closed }}</p>
            <p class="soft">{{ w.closedLine }}</p>
          </div>
          <p v-else class="state soft" role="status">{{ w.opening }}</p>
        </template>

        <Panel v-else :body-id="`tabpanel-${tab}`" :body-labelledby="`tab-${tab}`">
          <template #head>
            <PanelHead :title="say(challenge.title)">
              <template #lead>
                <span class="kind" :class="kind.tone" role="img" :aria-label="w.kinds[challenge.kind]" :title="w.kinds[challenge.kind]">
                  <Icon :name="kind.icon" :size="28" />
                </span>
              </template>
            </PanelHead>
          </template>
          <template #tabs>
            <PanelTabs v-model="tab" :tabs="tabs" :label="w.tabsLabel" />
          </template>

          <template v-if="tab === 'challenge'">
            <!-- 1. This week's challenge: one line, then its stats as icons and numbers, the rules folded. -->
            <div class="what">
              <p class="summary">{{ say(challenge.summary) }}</p>
              <div class="stats-row">
                <ul class="stats">
                  <li class="stat" :class="{ over }" role="img" :aria-label="over ? w.endedName : `${w.timeLeftName(left)}. ${deadline}`" :title="deadline">
                    <Icon name="clock" :size="20" /><span class="n">{{ left }}</span>
                  </li>
                  <li class="stat" role="img" :aria-label="w.entrantsName(view.entrants)" :title="w.entrantsName(view.entrants)">
                    <Icon name="people" :size="20" /><span class="n">{{ view.entrants }}</span>
                  </li>
                  <li v-if="crowd !== null" class="stat" role="img" :aria-label="w.crowdName(crowd)" :title="w.crowdName(crowd)">
                    <Icon name="eye" :size="20" /><span class="n">{{ crowd }}</span>
                  </li>
                </ul>
                <button v-if="rules.length" type="button" class="key small" :aria-expanded="rulesOpen" aria-controls="arena-rules" :aria-label="w.rules" :title="w.rules" @click="rulesOpen = !rulesOpen">
                  <Icon name="rules" :size="16" /><span class="word">{{ w.rules }}</span>
                </button>
              </div>
              <ol v-if="rulesOpen" id="arena-rules" class="rules">
                <li v-for="(r, i) in rules" :key="i">{{ r }}</li>
              </ol>
            </div>

            <!-- 2. How to take part: three steps, each with its real action, then how it's graded. -->
            <div v-if="stage === 'soon'" class="soon" role="status">
              <Icon name="code" :size="20" />
              <p><strong>{{ w.notOpenTitle }}</strong>{{ w.notOpen }}</p>
            </div>
            <div v-else class="take-part">
              <h3 class="sr-only">{{ w.stepsName }}</h3>
              <ol class="steps">
                <li class="step" :class="{ done: view.joined }">
                  <span class="num" aria-hidden="true"><Icon v-if="view.joined" name="tick" :size="16" /><template v-else>1</template></span>
                  <span class="say">{{ view.joined ? w.joined : w.joinStep }}</span>
                  <span class="act">
                    <RouterLink v-if="stage === 'login'" to="/login" class="button primary go"><Icon name="login" :size="18" />{{ w.logIn }}</RouterLink>
                    <button v-else-if="stage === 'join'" type="button" class="primary go" :disabled="busy" @click="join"><Icon name="trophy" :size="18" />{{ w.join }}</button>
                  </span>
                </li>
                <li class="step">
                  <span class="num" aria-hidden="true">2</span>
                  <span class="say">
                    {{ w.prStep }}
                    <a class="where" :href="folderUrl(challenge.repo, challenge.path)" target="_blank" rel="noopener noreferrer" :title="w.githubName">{{ repoName(challenge.repo) }}/{{ challenge.path }}</a>
                  </span>
                  <span class="act">
                    <a class="button key" :href="forkUrl(challenge.repo)" target="_blank" rel="noopener noreferrer" :aria-label="w.forkName" :title="w.forkName">
                      <Icon name="code" :size="16" /><span class="word">{{ w.fork }}</span>
                    </a>
                    <button type="button" class="key icon" :aria-label="copied ? w.copied : w.copyName" :title="copied ? w.copied : w.copyName" @click="copyClone">
                      <Icon :name="copied ? 'tick' : 'copy'" :size="16" />
                    </button>
                    <a class="button key icon" :href="folderUrl(challenge.repo, challenge.path)" target="_blank" rel="noopener noreferrer" :aria-label="w.githubName" :title="w.githubName">
                      <Icon name="external" :size="16" />
                    </a>
                  </span>
                </li>
                <li class="step" :class="{ off: !view.joined }">
                  <span class="num" aria-hidden="true">3</span>
                  <span class="say">{{ auto ? w.autoStep : w.pasteStep }}</span>
                  <span class="act">
                    <button v-if="mine.count" type="button" class="key mine" :aria-label="w.mineChipName(mine.count, mine.points)" :title="w.mineChipName(mine.count, mine.points)" @click="tab = 'board'">
                      <Icon name="thread" :size="16" />{{ w.mineChip(mine.count, mine.points) }}
                    </button>
                    <button v-if="auto && stage === 'joined' && !pasteOpen" type="button" class="key icon" :aria-label="w.pasteInstead" :title="w.pasteInstead" @click="pasteOpen = true">
                      <Icon name="link" :size="16" />
                    </button>
                  </span>
                  <form v-if="stage === 'joined' && (!auto || pasteOpen)" class="send" novalidate @submit.prevent="submit">
                    <input v-model="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="w.prPlaceholder" :aria-label="w.prName" :aria-invalid="!!error" @input="error = ''" />
                    <button class="primary" :disabled="busy"><Icon name="rocket" :size="18" />{{ w.submit }}</button>
                  </form>
                </li>
              </ol>
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <p v-else-if="said" class="said-ok" role="status">{{ said }}</p>
              <p v-if="challenge.points.length" class="graded" role="img" :aria-label="w.gradedName(table)">
                <Icon name="check" :size="18" />
                <span class="g-word" aria-hidden="true">{{ w.graded }}</span>
                <span v-for="p in challenge.points" :key="p.label" class="pts-chip" aria-hidden="true" :title="p.label"><b>{{ labelWord(p.label) }}</b>{{ p.points }}</span>
              </p>
            </div>

            <!-- 3. The payout: what 1st, 2nd and 3rd win. -->
            <div class="payout">
              <h3 class="sr-only">{{ w.prizesName }}</h3>
              <ul class="prizes">
                <li v-for="p in prizes" :key="p.place" class="prize" :class="{ first: p.place === 1 }" role="img" :aria-label="p.name" :title="p.name">
                  <span class="medal" :class="medal(p.place)" aria-hidden="true">{{ p.place }}</span>
                  <span v-if="p.amount" class="amt" aria-hidden="true">{{ p.amount }}</span>
                  <BadgeChip :badge="p.badge" aria-hidden="true" />
                </li>
              </ul>
            </div>
          </template>

          <!-- The leaderboard, your own pull requests first. -->
          <template v-else-if="tab === 'board'">
            <ul v-if="view.mine.length" class="lines" :aria-label="w.mineName">
              <ListRow v-for="s in view.mine" :key="s.id" :title="s.title ?? `#${s.number}`" :sub="`${repoName(challenge.repo)} #${s.number}`" mine>
                <template #lead><Icon name="thread" :size="20" /></template>
                <template #meta>
                  <StatusPill :state="submissionState(s.state)" />
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
/* Above the HUD, like a house's window (Inside.vue): the same sign on the right, the city lit beside it. */
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
/* The band's X, 44px and centred in its 88px: placed from inside the frame's border, the band starts 3px further in. */
.sign-x { z-index: 2; top: 44px; }
.page-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; border-radius: 12px; background: var(--surface); }
.page-host > :not(.sign-band) { flex: 1 1 auto; min-height: 0; }

/* Opening, closed, failed: one calm message in the middle. */
.state { margin: auto; display: grid; justify-items: center; align-content: center; gap: 10px; padding: 28px 16px; text-align: center; max-width: 360px; }
.state .said { font-size: 19px; font-weight: 800; }
.soft { color: var(--muted); font-size: 15px; }
.big-ic { display: grid; place-items: center; width: 56px; height: 56px; color: var(--panel); }

/* The challenge's kind: its icon on a white key, on the band. */
.kind { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--r-md); background: var(--surface); }
.kind.danger { color: var(--panel-red); }
.kind.accent { color: var(--ink); }
.kind.live { color: var(--live); }

/* The three parts keep their height: the body scrolls (rules open, an error) rather than squeezing them. */
.what, .take-part, .payout, .soon { flex: none; }
/* Air between the three answers, so each reads as one block. */
.take-part, .payout, .soon { margin-top: 8px; }

/* 1. The challenge: one line, then the stats as icons and numbers, not sentences. */
.summary { margin: 0; font-size: 17px; line-height: 1.3; font-weight: 600; }
.stats-row { display: flex; align-items: center; gap: 8px 12px; margin-top: 6px; }
.stats { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin: 0; padding: 0; list-style: none; }
.stat { display: inline-flex; align-items: center; gap: 6px; color: var(--text); }
.stat .n { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.stat.over .n { color: var(--muted); }
.rules { margin: 6px 0 0; padding: 0 0 0 22px; display: grid; gap: 4px; font-size: 15px; line-height: 1.3; color: var(--muted); }

/* The keys: one look, a link or a button. */
.key { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 12px; background: transparent; box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; white-space: nowrap; }
.key.icon { width: 44px; padding: 0; }
.key.small { flex: none; min-height: 38px; }
.key:hover:not(:disabled) { background: var(--tile); text-decoration: none; }

/* 2. Taking part: numbered rows, the action at the end of each. */
.steps { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.step { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; row-gap: 6px; min-height: 52px; }
.num { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--text); color: var(--surface); font: 800 16px/1 var(--font); }
.step.done .num { background: var(--live); color: var(--surface); }
.step.off .say, .step.off .num { opacity: 0.45; }
.say { min-width: 0; display: grid; gap: 1px; font-size: 18px; font-weight: 800; line-height: 1.15; }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 14px/1.3 var(--code); color: var(--muted); }
.act { display: flex; align-items: center; gap: 6px; }
.act:empty { display: none; }
.go { display: inline-flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 18px; font-size: 18px; white-space: nowrap; }
a.go:hover { text-decoration: none; }
.mine { font-weight: 800; font-variant-numeric: tabular-nums; }
.send { grid-column: 2 / -1; display: flex; gap: 8px; min-width: 0; }
.send input { flex: 1 1 auto; min-width: 0; min-height: 46px; font-size: 15px; }
.send button { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 46px; font-size: 17px; white-space: nowrap; }
.error { margin: 4px 0 0 42px; color: var(--danger); font-size: 15px; }
.said-ok { margin: 4px 0 0 42px; color: var(--live); font-size: 15px; font-weight: 800; }
/* How it's graded: one line, the labels and their points as chips. */
.graded { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0 42px; font-size: 14px; color: var(--muted); }
.graded > :first-child { color: var(--text); }
.g-word { margin-right: 4px; font-weight: 700; }
.pts-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 8px; border-radius: var(--r-xs); background: var(--fill); color: var(--text); font-weight: 800; font-variant-numeric: tabular-nums; }
.pts-chip b { font-weight: 600; color: var(--muted); }

/* 3. The payout: three places in a row, 1st with its credit. */
.prizes { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.prize { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 12px 6px 8px; border-radius: var(--r-sm); background: var(--fill); }
.prize.first { flex: 1 1 auto; }
.medal { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--r-xs); font: 800 16px/1 var(--font); }
.medal.gold { background: #f2c14e; color: #3d2a00; }
.medal.silver { background: #c9d1db; color: #1f2933; }
.medal.bronze { background: #e3a275; color: #3b1f0b; }
.amt { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* The leaderboard tab: your pull requests above the top ten. */
.lines { flex: none; display: grid; margin: 0; padding: 0; list-style: none; }

.soon { display: flex; gap: 12px; align-items: flex-start; }
.soon p { margin: 0; font-size: 15px; line-height: 1.3; color: var(--muted); }
.soon strong { display: block; margin-bottom: 2px; color: var(--text); font-size: 18px; font-weight: 800; }

/* A challenge's name is a sentence, not a house's one word: two lines at the smaller band size rather than an
   ellipsis. The band stays 88px high. */
.arena :deep(.panel-head .title) { font-size: 24px; line-height: 1.15; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.arena :deep(.panel-head .line) { font-size: 15px; }

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
  /* A little taller than a house's 70: the challenge, the three steps and the payout all show without scrolling. */
  .sheet { position: relative; inset: auto; width: 100%; height: 76dvh; min-height: min(460px, 88dvh); animation-name: rise-in; }
}
/* A phone: everything a size down so the payout still shows without scrolling. The keys lose their words (their
   names stay), and the three places sit side by side, the badge under the medal. */
@media (max-width: 480px) {
  .summary { font-size: 15px; }
  .stats-row { margin-top: 4px; }
  .stat .n { font-size: 16px; }
  .say { font-size: 16px; }
  .steps { gap: 0; }
  .step { column-gap: 10px; min-height: 46px; }
  .num { width: 26px; height: 26px; font-size: 14px; }
  .step { grid-template-columns: 26px minmax(0, 1fr) auto; }
  .key .word { display: none; }
  .key { min-height: 40px; padding: 0 10px; }
  .key.icon { width: 40px; }
  .key.small { min-height: 36px; }
  .go { min-height: 40px; padding: 0 14px; font-size: 16px; }
  .send input, .send button { min-height: 42px; }
  .send button { padding: 0 14px; font-size: 15px; }
  .error, .said-ok, .graded { margin-left: 0; }
  .graded { gap: 4px; font-size: 13px; }
  .pts-chip { padding: 2px 6px; }
  .take-part, .payout, .soon { margin-top: 4px; }
  .prizes { flex-wrap: nowrap; gap: 6px; }
  .prize { gap: 6px; min-height: 40px; padding: 4px 8px 4px 6px; }
  .prize:not(.first) { flex: 1 1 0; justify-content: center; }
  .medal { width: 26px; height: 26px; font-size: 14px; }
  .amt { font-size: 16px; }
  /* The badge as its trophy alone, like BadgeChip's compact look: its title stays in the hover and the place's name. */
  .prize :deep(.badge-chip) { width: 22px; padding: 0; justify-content: center; }
  .prize :deep(.badge-chip .t) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
}
</style>
