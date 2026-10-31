<script setup lang="ts">
// A knock's thread: the applicant and the house talk, the flatmates vote. One panel: who knocked and where at the
// top, the vote in one strip under it, what the applicant has built (when the API sends it), and the thread
// filling the rest, so it fits the lobby's sheet unscrolled. The words change with who reads it: the applicant
// reads about their own knock, a flatmate about someone asking to move in.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import GithubLink from "../components/GithubLink.vue";
import ChatPanel from "../components/ChatPanel.vue";
import { joinWords as said } from "../components/joinWords";
import Icon from "../components/lobby/house/Icon.vue";
import { shortRepo } from "../components/lobby/cards";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import { explain, type State } from "../components/lobby/panel/words";
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
  return mine.value ? said.yourKnockOn(a.house.name) : said.knocked(who.value);
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

// The head's line, after the state's dot: the state in words, then who asked for what, where. A room's slug says
// nothing to people, so it's "a free room" while the knock is open and "a room" after.
const line = computed(() => {
  const a = app.value;
  if (!a) return "";
  const who = mine.value ? said.you : `@${a.applicant.login}`;
  return said.askedFor(said.stateSaid[a.status], who, mine.value, a.status === "open", a.house.name, a.house.city);
});
const explainLine = computed(() => (mine.value ? explain.knockYours : explain.knockTheirs));

// What they've built, in a sentence or two: "Awa reviewed 7 PRs and got 5 reviews." and their repos as links.
const work = computed(() => app.value?.work ?? null);
const reviewsSaid = computed(() => {
  const w = work.value;
  if (!w) return "";
  const subject = mine.value ? said.you : (app.value!.applicant.name ?? app.value!.applicant.login).split(" ")[0];
  if (!w.given && !w.received) return said.noReviews(subject, mine.value);
  return said.reviewsTraded(subject, mine.value, w.given, w.received);
});

// The vote in a few words, beside the seats. Screen readers hear the long version on the seats.
const count = computed(() => {
  const a = app.value;
  if (!a) return "";
  if (a.status === "open") return said.yesOf(a.tally.yes, a.tally.needed);
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
      <Panel :explain="explainLine" :body-label="said.theThread">
        <template #head>
          <PanelHead :title="title" :state="state" :line="line">
            <template #lead><Avatar :person="app.applicant" :size="52" decorative /></template>
            <template v-if="app.repo || app.applicant.github" #aside>
              <span class="asides">
                <a v-if="app.repo" :href="app.repo" class="repo" target="_blank" rel="noopener" :aria-label="said.repoName(mine, shortRepo(app.repo))">
                  <Icon name="code" :size="16" />
                  <span class="repo-word">{{ shortRepo(app.repo) }}</span>
                </a>
                <GithubLink v-if="!mine" :person="app.applicant" />
              </span>
            </template>
          </PanelHead>

          <!-- The vote, in one strip: the seats fill as flatmates answer, then who voted, then what you can do. -->
          <section class="vote" :aria-label="said.theVote">
            <div class="tally">
              <div class="seats" role="img" :aria-label="seatsLabel">
                <span
                  v-for="i in app.tally.flatmates"
                  :key="i"
                  class="seat"
                  :class="{ yes: i <= app.tally.yes, no: i > app.tally.flatmates - app.tally.no }"
                />
              </div>
              <p class="count" aria-live="polite">
                <span>{{ count }}</span>
                <span v-if="yourVote" class="sr-only">{{ yourVote }}</span>
              </p>
              <ul v-if="app.votes?.length" class="voters plain" :aria-label="said.whoVoted">
                <li v-for="v in app.votes" :key="v.voter.login" :class="v.yes ? 'yes' : 'no'" :title="said.voterSaid(v.voter.name ?? v.voter.login, v.yes)">
                  <Avatar :person="v.voter" :size="22" decorative />
                  <span class="sr-only">{{ said.voterSaid(v.voter.name ?? v.voter.login, v.yes) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="app.status === 'open' && !mine" class="act">
              <button class="primary" :aria-pressed="app.viewer.vote === true" @click="vote(true)">{{ said.letThemIn }}</button>
              <button :aria-pressed="app.viewer.vote === false" @click="vote(false)">{{ said.notThisTime }}</button>
            </div>
            <div v-else-if="app.status === 'open' && mine" class="act">
              <button class="quiet" @click="withdraw">{{ said.withdraw }}</button>
            </div>
            <div v-else-if="app.status === 'admitted' && mine" class="act">
              <RouterLink :to="`/houses/${app.house.id}/rooms/${encodeURIComponent(app.room)}`" class="button primary">{{ said.goToRoom }}</RouterLink>
            </div>
          </section>
          <!-- What they've built: their top public repos, and the reviews they've traded. -->
          <p v-if="work" class="work">
            <template v-if="work.repos.length">
              {{ mine ? said.yourWork : said.theirWork }}
              <template v-for="(r, i) in work.repos.slice(0, 3)" :key="r.url">
                <a :href="r.url" target="_blank" rel="noopener">{{ shortRepo(r.url) }}<span class="sr-only">{{ said.newTab }}</span></a
                ><template v-if="r.language">{{ said.inLanguage(r.language) }}</template>{{ i < Math.min(3, work.repos.length) - 1 ? ", " : ". " }}
              </template>
            </template>
            {{ reviewsSaid }}
          </p>
          <p v-if="actionError" class="error small" role="alert">{{ actionError }}</p>
        </template>

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
.alone .back { margin-left: var(--gutter); }

/* The title here is a short sentence ("Your knock on Sacré-Cœur"): it may take two lines rather than lose its end. */
.application-page :deep(.panel-head .title) { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.repo { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; border-radius: var(--r-pill); background: var(--fill); color: var(--text); font-size: 14px; font-weight: 600; max-width: 160px; }
.repo:hover { background: var(--fill-hover); text-decoration: none; }
.asides { display: inline-flex; align-items: center; gap: 6px; }
.repo-word { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The vote: one tile, the tally on the left, the action on the right; it wraps on a phone. */
.vote { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 14px; padding: 12px 14px; border-radius: var(--r-md); background: var(--tile); }
.tally { flex: 1 1 200px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.seats { display: flex; gap: 4px; flex: none; }
.seat { width: 20px; height: 6px; border-radius: 3px; background: var(--border); }
.seat.yes { background: var(--live); }
.seat.no { background: var(--danger); }
.count { font-size: 14px; font-weight: 600; min-width: 0; }
.plain { list-style: none; margin: 0; padding: 0; }
.voters { display: flex; flex: none; }
.voters li { display: inline-grid; border-radius: 50%; box-shadow: 0 0 0 2px var(--tile); }
.voters li + li { margin-left: -6px; }
/* A small ring says how each flatmate voted. */
.voters li.yes { box-shadow: 0 0 0 2px var(--tile), 0 0 0 3.5px var(--live); }
.voters li.no { box-shadow: 0 0 0 2px var(--tile), 0 0 0 3.5px var(--danger); }
.act { flex: none; display: flex; align-items: center; gap: 8px; margin-left: auto; }
/* Chunky, game-menu buttons: the main one in the accent, the rest grey. */
.act button, .act .button { min-height: 46px; padding: 0 16px; border-radius: var(--r-md); font-size: 14px; font-weight: 600; white-space: nowrap; }
.act button.quiet { color: var(--muted); font-weight: 600; }
.act button.quiet:hover:not(:disabled) { color: var(--danger); }
.error { margin-top: 8px; }
.work { margin-top: 10px; font-size: 14px; line-height: 1.45; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* The vote you cast stays marked. */
button[aria-pressed="true"]:not(.primary) { box-shadow: inset 0 0 0 2px var(--text); }
button.primary[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--tile), 0 0 0 4px var(--accent-fill); }
@media (max-width: 480px) {
  .application-page :deep(.panel-head .lead .avatar) { width: 40px !important; height: 40px !important; }
  .repo-word { display: none; }
  .repo { padding: 0 10px; }
}
</style>
