<script setup lang="ts">
// A knock's thread: the applicant and the house talk, the flatmates vote. One panel: who knocked and where at the
// top, the vote in one strip under it, and the thread filling the rest, so it fits the lobby's sheet unscrolled.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import ChatPanel from "../components/ChatPanel.vue";
import Icon from "../components/lobby/house/Icon.vue";
import { shortRepo } from "../components/lobby/cards";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import { explain, type State } from "../components/lobby/panel/words";
import { loadMe, postJSON } from "../session";
import type { Application } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its link back
// to the house, and tells the sheet what to call it (`label`).
const props = defineProps<{ id: string; embedded?: boolean }>();
const emit = defineEmits<{ label: [text: string] }>();
const app = ref<Application | null>(null);
const error = ref("");
const actionError = ref("");
let source: EventSource | null = null;

async function open(id: string) {
  source?.close();
  app.value = null;
  error.value = "";
  const res = await fetch(`/api/applications/${encodeURIComponent(id)}`).catch(() => null);
  if (!res?.ok) {
    error.value = res?.status === 401 ? "Log in to see this knock." : "This knock doesn't exist, or it isn't yours to see.";
    return;
  }
  app.value = await res.json();
  source = new EventSource(`/api/applications/${encodeURIComponent(id)}/stream`);
  source.addEventListener("application", (e) => {
    const next: Application = JSON.parse((e as MessageEvent).data);
    // Decided: the top bar should now show the house, and your list of open knocks has one fewer.
    if (next.status !== "open" && app.value?.status === "open") loadMe();
    app.value = next;
  });
}

watch(() => props.id, open, { immediate: true });
onBeforeUnmount(() => source?.close());

const mine = computed(() => app.value?.viewer.as === "applicant");
const who = computed(() => (app.value ? (app.value.applicant.name ?? app.value.applicant.login) : ""));

const title = computed(() => {
  const a = app.value;
  if (!a) return "";
  return mine.value ? `Your knock on ${a.house.name}` : `${who.value} knocked`;
});
watch(title, (t) => t && emit("label", t), { immediate: true });

const state = computed<State | null>(() => {
  const a = app.value;
  if (!a) return null;
  return {
    open: { tone: "warn", word: "Waiting for votes" },
    admitted: { tone: "live", word: "Moved in" },
    declined: { tone: "neutral", word: "Declined" },
    withdrawn: { tone: "neutral", word: "Withdrawn" },
  }[a.status] as State;
});

const line = computed(() => {
  const a = app.value;
  return a ? `Room ${a.room} · ${a.house.name}, ${a.house.city} · @${a.applicant.login}` : "";
});

// The vote in a few words, beside the seats. Screen readers hear the long version on the seats.
const count = computed(() => {
  const a = app.value;
  if (!a) return "";
  if (a.status === "open") return `${a.tally.yes} of ${a.tally.needed} yes votes`;
  if (a.status === "admitted") return mine.value ? "You're in. Welcome home." : `${who.value} moved in.`;
  if (a.status === "declined") return "The house said no, or the room went to someone else.";
  return mine.value ? "You withdrew this knock." : "They withdrew this knock.";
});
const seatsLabel = computed(() => {
  const a = app.value;
  if (!a) return "";
  return `${a.tally.yes} yes and ${a.tally.no} no from ${a.tally.flatmates} flatmates. ${a.tally.needed} yes votes let ${mine.value ? "you" : "them"} in.`;
});
// What you said, for a flatmate who voted: the pressed button shows it too, this says you can still change it.
const yourVote = computed(() => {
  const v = app.value?.viewer.vote;
  return v === null || v === undefined ? "" : `You said ${v ? "yes" : "no"}. You can change it until it's decided.`;
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
      <RouterLink v-if="!embedded" to="/" class="more">Back to the city <span aria-hidden="true">›</span></RouterLink>
    </div>

    <template v-else-if="app">
      <RouterLink v-if="!embedded" :to="`/houses/${app.house.id}`" class="back"><span aria-hidden="true">‹</span> {{ app.house.name }}</RouterLink>
      <Panel :explain="explain.knock" body-label="The thread">
        <template #head>
          <PanelHead :title="title" :state="state" :line="line">
            <template #lead><Avatar :person="app.applicant" :size="52" decorative /></template>
            <template v-if="app.repo" #aside>
              <a :href="app.repo" class="repo" target="_blank" rel="noopener" :aria-label="`${mine ? 'Your' : 'Their'} repo: ${shortRepo(app.repo)} (opens in a new tab)`">
                <Icon name="code" :size="16" />
                <span class="repo-word">{{ shortRepo(app.repo) }}</span>
              </a>
            </template>
          </PanelHead>

          <!-- The vote, in one strip: the seats fill as flatmates answer, then who voted, then what you can do. -->
          <section class="vote" aria-label="The vote">
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
              <ul v-if="app.votes?.length" class="voters plain" aria-label="Who voted">
                <li v-for="v in app.votes" :key="v.voter.login" :class="v.yes ? 'yes' : 'no'" :title="`${v.voter.name ?? v.voter.login} said ${v.yes ? 'yes' : 'no'}`">
                  <Avatar :person="v.voter" :size="22" decorative />
                  <span class="sr-only">{{ v.voter.name ?? v.voter.login }} said {{ v.yes ? "yes" : "no" }}</span>
                </li>
              </ul>
            </div>

            <div v-if="app.status === 'open' && !mine" class="act">
              <button class="primary" :aria-pressed="app.viewer.vote === true" @click="vote(true)">Let them in</button>
              <button :aria-pressed="app.viewer.vote === false" @click="vote(false)">Not this time</button>
            </div>
            <div v-else-if="app.status === 'open' && mine" class="act">
              <button class="quiet" @click="withdraw">Withdraw</button>
            </div>
            <div v-else-if="app.status === 'admitted' && mine" class="act">
              <RouterLink :to="`/houses/${app.house.id}/rooms/${encodeURIComponent(app.room)}`" class="button primary">Go to your room</RouterLink>
            </div>
          </section>
          <p v-if="actionError" class="error small" role="alert">{{ actionError }}</p>
        </template>

        <ChatPanel
          :messages="app.messages"
          :post-url="app.status === 'open' ? `/api/applications/${app.id}/messages` : null"
          :me="app.viewer.login"
          :placeholder="mine ? 'Tell the house about you' : 'Ask them something'"
        />
      </Panel>
    </template>

    <p v-else class="state muted" aria-live="polite">Opening the door…</p>
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
.repo { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 980px; background: var(--fill); color: var(--text); font-size: 13px; font-weight: 500; max-width: 160px; }
.repo:hover { background: var(--fill-hover); text-decoration: none; }
.repo-word { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The vote: one tile, the tally on the left, the action on the right; it wraps on a phone. */
.vote { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: var(--tile); }
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
.act button, .act .button { min-height: 40px; padding: 0 16px; border-radius: 12px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.act button.quiet { color: var(--muted); font-weight: 500; }
.act button.quiet:hover:not(:disabled) { color: var(--danger); }
.error { margin-top: 8px; }
/* The vote you cast stays marked. */
button[aria-pressed="true"]:not(.primary) { box-shadow: inset 0 0 0 2px var(--text); }
button.primary[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--tile), 0 0 0 4px var(--accent-fill); }
@media (max-width: 480px) {
  .application-page :deep(.panel-head .lead .avatar) { width: 40px !important; height: 40px !important; }
  .repo-word { display: none; }
  .repo { padding: 0 10px; }
}
</style>
