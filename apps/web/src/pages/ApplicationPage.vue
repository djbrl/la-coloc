<script setup lang="ts">
// A knock's thread: the applicant and the house talk, the flatmates vote.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import ChatPanel from "../components/ChatPanel.vue";
import { loadMe, postJSON } from "../session";
import type { Application } from "../types";

const props = defineProps<{ id: string }>();
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
    // Just moved in: the top bar should now show the house.
    if (next.status === "admitted" && app.value?.status !== "admitted") loadMe();
    app.value = next;
  });
}

watch(() => props.id, open, { immediate: true });
onBeforeUnmount(() => source?.close());

const statusText = computed(() => {
  const a = app.value;
  if (!a) return "";
  return {
    open: `${a.tally.yes} yes and ${a.tally.no} no so far. ${a.tally.needed} yes votes let ${a.viewer.as === "applicant" ? "you" : "them"} in.`,
    admitted: a.viewer.as === "applicant" ? "You're in. Welcome home." : `${a.applicant.name ?? a.applicant.login} moved in.`,
    declined: "This knock is closed. The house said no, or the room went to someone else.",
    withdrawn: a.viewer.as === "applicant" ? "You withdrew this knock." : "They withdrew this knock.",
  }[a.status];
});
const statusDot = computed(() => ({ open: "warn", admitted: "live", declined: "", withdrawn: "" })[app.value?.status ?? "open"]);

async function vote(yes: boolean) {
  actionError.value = "";
  const res = await postJSON(`/api/applications/${props.id}/vote`, { yes });
  if (!res.ok) actionError.value = res.message;
}

async function withdraw() {
  actionError.value = "";
  const res = await postJSON(`/api/applications/${props.id}/withdraw`, {});
  if (!res.ok) actionError.value = res.message;
}
</script>

<template>
  <div class="application-page">
    <div v-if="error" class="wrap band">
      <h1>{{ error }}</h1>
      <RouterLink to="/" class="more">Back to the city <span aria-hidden="true">›</span></RouterLink>
    </div>

    <template v-else-if="app">
      <section class="band hero">
        <div class="wrap">
          <RouterLink :to="`/houses/${app.house.id}`" class="back"><span aria-hidden="true">‹</span> {{ app.house.name }}</RouterLink>
          <Avatar :person="app.applicant" :size="72" decorative />
          <h1>{{ app.applicant.name ?? app.applicant.login }} knocked on {{ app.room }}.</h1>
          <p class="lede muted">{{ app.house.name }}, {{ app.house.city }}. @{{ app.applicant.login }}</p>
          <p v-if="app.repo">
            They'd move in with <a :href="app.repo" target="_blank" rel="noopener">{{ app.repo.replace(/^https:\/\//, "") }}</a>.
          </p>
        </div>
      </section>

      <!-- The vote: seats fill as flatmates answer. -->
      <section class="band alt" aria-labelledby="vote-title">
        <div class="wrap narrow vote">
          <h2 id="vote-title" class="sr-only">The vote</h2>
          <div class="seats" role="img" :aria-label="statusText">
            <span v-for="i in app.tally.flatmates" :key="i" class="seat" :class="{ yes: i <= app.tally.yes, no: i > app.tally.flatmates - app.tally.no }" />
          </div>
          <p class="status" aria-live="polite"><span class="dot" :class="statusDot" aria-hidden="true" />{{ statusText }}</p>
          <p v-if="app.votes?.length" class="voters muted">
            <span v-for="v in app.votes" :key="v.voter.login" class="voter">
              <Avatar :person="v.voter" :size="22" decorative /> {{ v.voter.name ?? v.voter.login }} said {{ v.yes ? "yes" : "no" }}.
            </span>
          </p>

          <template v-if="app.status === 'open' && app.viewer.as === 'flatmate'">
            <div class="actions center">
              <button class="primary" :aria-pressed="app.viewer.vote === true" @click="vote(true)">Let them in</button>
              <button :aria-pressed="app.viewer.vote === false" @click="vote(false)">Not this time</button>
            </div>
            <p class="muted small" aria-live="polite">
              <template v-if="app.viewer.vote !== null">You voted {{ app.viewer.vote ? "yes" : "no" }}. You can change your mind until it's decided.</template>
              <template v-else>A majority of flatmates decides.</template>
            </p>
          </template>
          <template v-if="app.status === 'open' && app.viewer.as === 'applicant'">
            <p class="muted small">The flatmates vote, and a majority decides.</p>
            <button class="link" @click="withdraw">Withdraw my knock</button>
          </template>
          <RouterLink v-if="app.status === 'admitted' && app.viewer.as === 'applicant'" :to="`/houses/${app.house.id}`" class="button primary">
            Go to your room
          </RouterLink>
          <p v-if="actionError" class="error small" role="alert">{{ actionError }}</p>
        </div>
      </section>

      <section class="band" aria-labelledby="thread-title">
        <div class="wrap narrow">
          <div class="band-head">
            <h2 id="thread-title">The thread.</h2>
            <p class="muted">{{ app.status === "open" ? "Talk it through before the vote closes." : "The conversation, kept for the record." }}</p>
          </div>
          <ChatPanel
            :messages="app.messages"
            :post-url="app.status === 'open' ? `/api/applications/${app.id}/messages` : null"
            :me="app.viewer.login"
            :placeholder="app.viewer.as === 'applicant' ? 'Tell the house about you' : 'Ask them something'"
          />
        </div>
      </section>
    </template>

    <p v-else class="wrap band muted" aria-live="polite">Opening the door…</p>
  </div>
</template>

<style scoped>
.hero { text-align: center; padding-top: 48px; }
.hero .wrap { display: grid; gap: 16px; justify-items: center; }
.hero .wrap > :not(.back) { max-width: 680px; }
.back { justify-self: start; }
.hero h1 { overflow-wrap: anywhere; }
.hero a { overflow-wrap: anywhere; }
.vote { display: grid; gap: 16px; justify-items: center; text-align: center; }
.seats { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.seat { width: 36px; height: 6px; border-radius: 3px; background: var(--border); }
.seat.yes { background: var(--live); }
.seat.no { background: var(--danger); }
.status { font-size: 19px; }
.voters { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; font-size: 15px; }
.voter { display: inline-flex; align-items: center; gap: 6px; }
.center { justify-content: center; }
/* The vote you cast stays marked. */
button[aria-pressed="true"]:not(.primary) { box-shadow: inset 0 0 0 2px var(--text); }
button.primary[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--accent-fill); }
</style>
