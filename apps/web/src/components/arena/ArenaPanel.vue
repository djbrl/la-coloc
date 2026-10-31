<script setup lang="ts">
// The arena, opened at the stadium's entrance (or from the HUD's way in): a floating card docked on the right of the
// city, like a house's window, built on the lobby's Panel. Its head is the week's challenge (its kind's icon and
// colour, its title, one line of summary); three tabs: the challenge itself (time left, the prize and the title you'd
// win, who's in, the repo and its folder, the rules folded, then joining and sending your pull requests), the
// leaderboard, and the arena's own chat room. The view comes from the arena store (store.ts), which the lobby keeps
// fresh over the city's stream; a join or a pull request sent gives a newer view back at once.
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
import { arenaStage, checkPrUrl, cloneCommand, countdown, ended, folderUrl, forkUrl, KINDS, prProblemText, repoName, say, submissionState } from "./arena";
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

// ---- The countdown, live while the panel is open ----

const now = ref(Date.now());
const clock = window.setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(clock));
const left = computed(() => (challenge.value ? countdown(challenge.value.endsAt, now.value) : ""));
const over = computed(() => !!challenge.value && ended(challenge.value.endsAt, now.value));

// The title the winner gets, drawn as the badge itself (first place, this city, this week).
const prize = computed((): Badge | null => {
  const c = challenge.value;
  return c ? { key: c.award.key, title: c.award.title, place: 1, city: props.city, week: c.startsAt.slice(0, 10) } : null;
});

// ---- The repo ----

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
    // No clipboard (an old browser, or no permission): the command is on screen to select by hand.
  }
}
onBeforeUnmount(() => clearTimeout(copiedTimer));

const rules = computed(() => (challenge.value ? say(challenge.value.rules) : []));

// ---- Taking part ----

// The week's end, in the reader's language and their own time zone ("dimanche 18 octobre, 23:59").
const deadline = computed(() =>
  challenge.value
    ? new Date(new Date(challenge.value.endsAt).getTime() - 60_000).toLocaleString(language.lang, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "",
);
const stage = computed(() => (view.value ? arenaStage(view.value, me.value, now.value) : null));
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
            <PanelHead :title="say(challenge.title)" :line="say(challenge.summary)">
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

          <!-- The challenge: the stats as icons and numbers, the repo, the rules folded, your pull requests. -->
          <template v-if="tab === 'challenge'">
            <ul class="stats">
              <li class="stat" :class="{ over }" role="img" :aria-label="over ? w.endedName : w.timeLeftName(left)">
                <Icon name="clock" :size="22" /><span class="n">{{ left }}</span>
              </li>
              <li class="stat prize" role="group" :aria-label="w.prizeName(fcfa(challenge.prizeFcfa), say(challenge.award.title))">
                <Icon name="bill" :size="22" /><span class="n" aria-hidden="true">{{ fcfa(challenge.prizeFcfa) }}</span>
                <BadgeChip v-if="prize" :badge="prize" aria-hidden="true" />
              </li>
              <li class="stat" role="img" :aria-label="w.entrantsName(view.entrants)">
                <Icon name="people" :size="22" /><span class="n">{{ view.entrants }}</span>
              </li>
              <li v-if="crowd !== null" class="stat" role="img" :aria-label="w.crowdName(crowd)">
                <Icon name="eye" :size="22" /><span class="n">{{ crowd }}</span>
              </li>
            </ul>

            <div v-if="stage === 'soon'" class="soon" role="status">
              <Icon name="code" :size="20" />
              <p><strong>{{ w.notOpenTitle }}</strong>{{ w.notOpen }}</p>
            </div>
            <ul v-else class="lines">
              <ListRow :title="`${repoName(challenge.repo)}/${challenge.path}`" class="repo">
                <template #lead><Icon name="code" :size="20" /></template>
                <code class="sub cmd">{{ clone }}</code>
                <template #end>
                  <a class="button key" :href="forkUrl(challenge.repo)" target="_blank" rel="noopener noreferrer" :aria-label="w.forkName" :title="w.forkName">
                    <Icon name="code" :size="16" />{{ w.fork }}
                  </a>
                  <button type="button" class="key" :aria-label="copied ? w.copied : w.copyName" @click="copyClone">
                    <Icon :name="copied ? 'tick' : 'copy'" :size="16" />{{ copied ? w.copied : w.copy }}
                  </button>
                  <a class="button key icon" :href="folderUrl(challenge.repo, challenge.path)" target="_blank" rel="noopener noreferrer" :aria-label="w.githubName" :title="w.githubName">
                    <Icon name="external" :size="16" />
                  </a>
                </template>
              </ListRow>
            </ul>

            <details v-if="rules.length || challenge.points.length" class="rules">
              <summary><Icon name="rules" :size="18" />{{ w.rules }}</summary>
              <ol v-if="rules.length">
                <li v-for="(r, i) in rules" :key="i">{{ r }}</li>
              </ol>
              <ul v-if="challenge.points.length" class="points">
                <li v-for="p in challenge.points" :key="p.label"><code>{{ p.label }}</code><span>{{ w.points(p.points) }}</span></li>
              </ul>
              <p class="scoring">{{ w.scoring(deadline) }}</p>
            </details>

            <ul v-if="view.mine.length" class="lines" :aria-label="w.mineName">
              <ListRow v-for="s in view.mine" :key="s.id" :title="s.title ?? `#${s.number}`" :sub="`${repoName(challenge.repo)} #${s.number}`">
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
            <p v-else-if="said" class="said-ok" role="status">{{ said }}</p>
          </template>

          <ArenaBoard v-else-if="tab === 'board'" :view="view" :me="me?.login ?? null" />
          <ArenaRoom v-else :city="city" />

          <template v-if="tab === 'challenge' && stage && stage !== 'over' && stage !== 'soon'" #foot>
            <div class="foot">
              <RouterLink v-if="stage === 'login'" to="/login" class="button primary go"><Icon name="login" :size="20" />{{ w.logIn }}</RouterLink>
              <button v-else-if="stage === 'join'" type="button" class="primary go" :disabled="busy" @click="join"><Icon name="trophy" :size="20" />{{ w.join }}</button>
              <form v-else class="send" novalidate @submit.prevent="submit">
                <input v-model="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="w.prPlaceholder" :aria-label="w.prName" :aria-invalid="!!error" @input="error = ''" />
                <button class="primary" :disabled="busy"><Icon name="rocket" :size="18" />{{ w.submit }}</button>
              </form>
            </div>
          </template>
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
.sign-x { z-index: 2; top: calc(3px + 44px); }
.page-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; border-radius: var(--r-md); background: var(--surface); }
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

/* The stats: icons and numbers, not sentences. */
.stats { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin: 0 0 8px; padding: 0; list-style: none; }
.stat { display: inline-flex; align-items: center; gap: 6px; color: var(--text); }
.stat .n { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.stat.over .n { color: var(--muted); }
.stat.prize :deep(.badge-chip) { margin-left: 2px; }

.lines { flex: none; display: grid; margin: 0; padding: 0; list-style: none; }
.cmd { font: 600 14px/1.4 var(--code); }
/* The row's keys: one size, one look, a link or a button. */
.key { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; background: transparent; box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; }
.key.icon { width: 46px; padding: 0; justify-content: center; }
.key:hover:not(:disabled) { background: var(--tile); text-decoration: none; }

/* The rules: folded behind one row, a line above it, like a menu entry that opens. */
.rules { flex: none; border-top: 2px solid var(--row-line); }
.rules + .lines { border-top: 2px solid var(--row-line); }
.rules summary { display: flex; align-items: center; gap: 10px; min-height: 50px; font-size: 18px; font-weight: 800; cursor: pointer; list-style: none; }
.rules summary::-webkit-details-marker { display: none; }
.rules summary::after { content: "›"; margin-left: auto; padding: 0 6px; font-size: 22px; transition: transform var(--dur-fast) var(--ease); }
.rules[open] summary::after { transform: rotate(90deg); }
.rules ol { margin: 0; padding: 0 16px 8px 22px; display: grid; gap: 4px; font-size: 15px; line-height: 1.3; }
.points { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0 0 10px; list-style: none; }
.points li { display: inline-flex; gap: 8px; align-items: center; padding: 3px 8px; border-radius: var(--r-xs); background: var(--fill); font-size: 14px; font-weight: 800; }
.points code { font: 600 14px/1.3 var(--code); }
.points span { color: var(--muted); }

.error { color: var(--danger); font-size: 15px; }
.said-ok { color: var(--live); font-size: 15px; font-weight: 800; }

.foot { flex: 1 1 auto; display: flex; align-items: center; min-width: 0; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 60px; font-size: 24px; }
a.go:hover { text-decoration: none; }
.send { flex: 1 1 auto; display: flex; gap: 8px; min-width: 0; }
.send input { flex: 1 1 auto; min-width: 0; min-height: 50px; font-size: 15px; }
.send button { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 50px; font-size: 18px; white-space: nowrap; }
/* A challenge's name is a sentence, not a house's one word: two lines at the smaller band size rather than an
   ellipsis. The band stays 88px high. */
.arena :deep(.panel-head .title) { font-size: 24px; line-height: 1.15; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.arena :deep(.panel-head .line) { font-size: 15px; }
.soon { display: flex; gap: 12px; align-items: flex-start; }
.soon p { margin: 0; font-size: 15px; line-height: 1.3; color: var(--muted); }
.soon strong { display: block; margin-bottom: 2px; color: var(--text); font-size: 18px; font-weight: 800; }
.scoring { margin: 0 0 10px; font-size: 14px; line-height: 1.3; color: var(--muted); }

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
  .sheet { position: relative; inset: auto; width: 100%; height: 70dvh; min-height: min(460px, 88dvh); animation-name: rise-in; }
  /* The repo's three keys take their own line: the address keeps the width above them. */
  .repo { flex-wrap: wrap; }
  .repo :deep(.text) { flex-basis: calc(100% - 52px); }
  .repo :deep(.end) { width: 100%; justify-content: flex-end; }
}
@media (max-width: 480px) {
  .send button { padding: 0 14px; font-size: 15px; }
  .go { font-size: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
  .rules summary::after { transition: none; }
}
</style>
