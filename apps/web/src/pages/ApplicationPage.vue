<script setup lang="ts">
// A knock's thread: the applicant and the house talk, the flatmates vote. A utility window, so it says little: the
// house (or who knocked) on the band with "Knock · waiting" under it, the vote as a number with what you can do beside
// it, the repos as chips (when the API sends them), and the thread filling the rest, so it fits the lobby's sheet
// unscrolled.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import GithubLink from "../components/GithubLink.vue";
import ChatPanel from "../components/ChatPanel.vue";
import { joinWords as said } from "../components/joinWords";
import Icon from "../components/lobby/house/Icon.vue";
import { shortRepo } from "../components/lobby/cards";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import type { State } from "../components/lobby/panel/words";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { loadMe, postJSON } from "../session";
import { openStream, type Stream } from "../stream";
import type { Application } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its link back
// to the house, and tells the sheet what to call it (`label`).
const props = defineProps<{ id: string; embedded?: boolean }>();
const emit = defineEmits<{ label: [text: string] }>();

// What the applicant has built and done, for the flatmates to judge: their top public repos with each one's main
// language, and the reviews they've given and got on La Coloc. Not sent by the API yet; until it is, the panel just
// doesn't say it.
interface Work {
  repos: { fullName: string; url: string; language: string | null }[];
  given: number;
  received: number;
}
const app = ref<(Application & { work?: Work | null }) | null>(null);
const error = ref("");
// The core isn't answering (`waiting`: it reloads by itself when the core is back), or the API answered with
// something unexpected (`failed`: a button to try again).
const waiting = ref(false);
const failed = ref(false);
const actionError = ref("");
let stream: Stream | null = null;
let loads = 0;

// `quiet`: a reload behind a knock that's showing (the core came back): it keeps what's on screen.
async function open(id: string, quiet = false) {
  const mine = ++loads;
  if (!quiet) {
    stream?.close();
    stream = null;
    app.value = null;
    error.value = "";
    waiting.value = failed.value = false;
  }
  const res = await fetch(`/api/applications/${encodeURIComponent(id)}`).catch(() => null);
  if (mine !== loads) return;
  if (!res?.ok) {
    if (quiet && app.value) return;
    if (res?.status === 401) error.value = said.logInToSee;
    else if (res?.status === 404 || res?.status === 403) error.value = said.noSuchKnock;
    else if (await wentDown(res)) waiting.value = true;
    else failed.value = true;
    return;
  }
  error.value = "";
  waiting.value = failed.value = false;
  app.value = await res.json();
  // If the stream dies it finds its own way back (stream.ts); it's opened once per knock.
  stream ??= openStream(`/api/applications/${encodeURIComponent(id)}/stream`, {
    application: (e) => {
      const next: Application = JSON.parse(e.data);
      // Decided: the top bar should now show the house, and your list of open knocks has one fewer.
      if (next.status !== "open" && app.value?.status === "open") loadMe();
      app.value = next;
    },
  });
}

watch(() => props.id, (id) => open(id), { immediate: true });
// The core came back: the knock again, quietly if it's showing.
useWhenBack(() => open(props.id, !!app.value));
onBeforeUnmount(() => stream?.close());

const mine = computed(() => app.value?.viewer.as === "applicant");
const who = computed(() => (app.value ? (app.value.applicant.name ?? app.value.applicant.login) : ""));

const title = computed(() => {
  const a = app.value;
  if (!a) return "";
  return mine.value ? a.house.name : who.value;
});
watch(title, (t) => t && emit("label", t), { immediate: true });

const state = computed<State | null>(() => {
  const a = app.value;
  if (!a) return null;
  return {
    // The dot's colour, and its hidden name; the line says the state in words.
    open: { tone: "warn", word: said.state.open },
    admitted: { tone: "live", word: said.state.admitted },
    declined: { tone: "neutral", word: said.state.declined },
    withdrawn: { tone: "neutral", word: said.state.withdrawn },
  }[a.status] as State;
});

// The band's line, after the state's dot, in the fewest words: "Knock · waiting".
const line = computed(() => (app.value ? said.knockLine(said.stateShort[app.value.status]) : ""));

// What they've built: their top public repos as chips, and the reviews they've traded as a stat.
const work = computed(() => app.value?.work ?? null);
const repos = computed(() => work.value?.repos.slice(0, 3) ?? []);
const reviewsStat = computed(() => (work.value && (work.value.given || work.value.received) ? said.reviewsStat(work.value.given, work.value.received) : ""));

// The vote as a stat while it's open: "0/2". Screen readers hear the long version on it. Then how it ended.
const count = computed(() => {
  const a = app.value;
  if (!a) return "";
  if (a.status === "open") return `${a.tally.yes}/${a.tally.needed}`;
  if (a.status === "admitted") return mine.value ? said.youreIn : said.movedIn(who.value);
  if (a.status === "declined") return said.saidNo;
  return mine.value ? said.youWithdrew : said.theyWithdrew;
});
const seatsLabel = computed(() => {
  const a = app.value;
  if (!a) return "";
  return said.seats(a.tally.yes, a.tally.no, a.tally.flatmates, a.tally.needed, mine.value);
});
// What you said, for a flatmate who voted: the pressed button shows it too, this says you can still change it.
const yourVote = computed(() => {
  const v = app.value?.viewer.vote;
  return v === null || v === undefined ? "" : said.yourVote(v);
});

async function vote(yes: boolean) {
  actionError.value = "";
  const res = await postJSON(`/api/applications/${props.id}/vote`, { yes });
  if (!res.ok) actionError.value = res.message;
}

async function withdraw() {
  actionError.value = "";
  const res = await postJSON(`/api/applications/${props.id}/withdraw`, {});
  if (!res.ok) actionError.value = res.message;
  else void loadMe();
}
</script>

<template>
  <div class="application-page" :class="embedded ? 'embedded' : 'alone'">
    <div v-if="error" class="state">
      <h2>{{ error }}</h2>
      <RouterLink v-if="!embedded" to="/" class="more">{{ said.backToCity }} <span aria-hidden="true">›</span></RouterLink>
    </div>

    <Waiting v-else-if="waiting" @retry="open(id)" />
    <Waiting v-else-if="failed" :title="said.failed" :line="said.failedWhy" @retry="open(id)" />

    <template v-else-if="app">
      <RouterLink v-if="!embedded" :to="`/houses/${app.house.id}`" class="back"><span aria-hidden="true">‹</span> {{ app.house.name }}</RouterLink>
      <Panel class="thread" :body-label="said.theThread">
        <template #head>
          <PanelHead :title="title" :state="state" :line="line">
            <template #lead><Avatar :person="app.applicant" :size="44" decorative /></template>
            <template v-if="!mine" #aside><GithubLink :person="app.applicant" /></template>
          </PanelHead>
        </template>

        <!-- The vote: the number, who voted, then what you can do. -->
        <section class="vote" :aria-label="said.theVote">
          <div class="tally">
            <p class="count" :class="{ stat: app.status === 'open' }" role="img" :aria-label="seatsLabel" aria-live="polite">{{ count }}</p>
            <p v-if="yourVote" class="sr-only">{{ yourVote }}</p>
            <ul v-if="app.votes?.length" class="voters plain" :aria-label="said.whoVoted">
              <li v-for="v in app.votes" :key="v.voter.login" :class="v.yes ? 'yes' : 'no'" :title="said.voterSaid(v.voter.name ?? v.voter.login, v.yes)">
                <Avatar :person="v.voter" :size="26" decorative />
                <span class="sr-only">{{ said.voterSaid(v.voter.name ?? v.voter.login, v.yes) }}</span>
              </li>
            </ul>
          </div>

          <div v-if="app.status === 'open' && !mine" class="act">
            <button class="primary" :aria-pressed="app.viewer.vote === true" @click="vote(true)">{{ said.letThemIn }}</button>
            <button :aria-pressed="app.viewer.vote === false" @click="vote(false)">{{ said.notThisTime }}</button>
          </div>
          <div v-else-if="app.status === 'open' && mine" class="act">
            <button class="withdraw" @click="withdraw">{{ said.withdraw }}</button>
          </div>
          <div v-else-if="app.status === 'admitted' && mine" class="act">
            <RouterLink :to="`/houses/${app.house.id}/rooms/${encodeURIComponent(app.room)}`" class="button primary">{{ said.goToRoom }}</RouterLink>
          </div>
        </section>

        <!-- The repo they knocked with, their top public repos, and the reviews they've traded. -->
        <ul v-if="app.repo || repos.length || reviewsStat" class="chips plain">
          <li v-if="app.repo">
            <a :href="app.repo" class="chip" target="_blank" rel="noopener" :aria-label="said.repoName(mine, shortRepo(app.repo))"><Icon name="code" :size="14" />{{ shortRepo(app.repo) }}</a>
          </li>
          <li v-for="r in repos" :key="r.url">
            <a :href="r.url" class="chip" target="_blank" rel="noopener">{{ shortRepo(r.url) }}<span class="sr-only">{{ said.newTab }}</span></a>
          </li>
          <li v-if="reviewsStat" class="stat-chip">{{ reviewsStat }}</li>
        </ul>
        <p v-if="actionError" class="error small" role="alert">{{ actionError }}</p>

        <ChatPanel
          :messages="app.messages"
          :post-url="app.status === 'open' ? `/api/applications/${app.id}/messages` : null"
          :me="app.viewer.login"
          :placeholder="mine ? said.tellHouse : said.askThem"
        />
      </Panel>
    </template>

    <p v-else class="state muted" aria-live="polite">{{ said.opening }}</p>
  </div>
</template>

<style scoped>
/* In the lobby's sheet the panel is the sheet's height; on a page of its own it grows, in a narrow column. */
.application-page.embedded { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.application-page.embedded > :deep(.panel-shape) { flex: 1 1 auto; }
.application-page.alone { max-width: calc(680px + 2 * var(--gutter)); margin: 0 auto; padding: 24px 0 64px; }
.state { display: grid; gap: 12px; padding: 24px var(--gutter); }
/* Panel.vue (not ours) still keeps 14px from the card's edges; carte blanche's are 20px, like the head. */
.thread { gap: 16px; }
.thread :deep(.p-body) { gap: 16px; padding: 2px 20px 20px; }
.alone .back { margin-left: var(--gutter); }

/* The vote: one flat tile, the number on the left and the action on the right; it wraps on a phone. */
.vote { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 2px; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.tally { flex: 1 1 120px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.count { font-size: 15px; font-weight: 800; min-width: 0; }
.count.stat { font-size: 28px; line-height: 1; font-variant-numeric: tabular-nums; }
.plain { list-style: none; margin: 0; padding: 0; }
.voters { display: flex; flex: none; }
.voters li { display: inline-grid; border-radius: 50%; box-shadow: 0 0 0 2px var(--tile); }
.voters li + li { margin-left: -6px; }
/* A small ring says how each flatmate voted. */
.voters li.yes { box-shadow: 0 0 0 2px var(--tile), 0 0 0 3.5px var(--live); }
.voters li.no { box-shadow: 0 0 0 2px var(--tile), 0 0 0 3.5px var(--danger); }
.act { flex: none; display: flex; align-items: center; gap: 8px; margin-left: auto; }
/* The one button family: 48 high with its lip, the vote to let them in red, the others grey. */
.act button, .act .button { padding: 0 16px var(--lip); white-space: nowrap; }
.act button.withdraw { box-shadow: var(--quiet-edge); }
.act button.withdraw:hover:not(:disabled) { color: var(--danger); }
.error { margin: 0; }
/* What they've built, in one row of chips that wraps. */
.chips { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.chips li { min-width: 0; max-width: 100%; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 30px; padding: 0 10px; border-radius: var(--r-pill); background: var(--fill); color: var(--text); font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip:hover { background: var(--fill-hover); text-decoration: none; }
.stat-chip { padding: 0 4px; font-size: 14px; color: var(--muted); }
/* The vote you cast stays marked. */
button[aria-pressed="true"]:not(.primary) { box-shadow: var(--quiet-edge), inset 0 0 0 2px var(--text); }
button.primary[aria-pressed="true"] { box-shadow: inset 0 calc(-1 * var(--lip)) 0 var(--accent-lip), 0 0 0 2px var(--tile), 0 0 0 4px var(--text); }
</style>
