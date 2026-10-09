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
    open: `${a.tally.yes} of ${a.tally.needed} yes votes needed · ${a.tally.no} no`,
    admitted: a.viewer.as === "applicant" ? "You're in. Welcome home!" : `${a.applicant.name ?? a.applicant.login} moved in.`,
    declined: "Closed: the house said no, or the room went to someone else.",
    withdrawn: "Withdrawn.",
  }[a.status];
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
}
</script>

<template>
  <p v-if="error" class="error">{{ error }} <RouterLink to="/">Back to the city</RouterLink></p>
  <template v-else-if="app">
    <RouterLink :to="`/houses/${app.house.id}`" class="back">← {{ app.house.name }}</RouterLink>
    <section class="head">
      <Avatar :person="app.applicant" :size="44" />
      <div>
        <h1>{{ app.applicant.name ?? app.applicant.login }} knocked on {{ app.room }}</h1>
        <p class="muted">{{ app.house.name }}, {{ app.house.city }} · @{{ app.applicant.login }}</p>
      </div>
    </section>

    <section class="status" :class="app.status">
      <div class="bar" role="img" :aria-label="statusText">
        <span v-for="i in app.tally.flatmates" :key="i" class="seat" :class="{ yes: i <= app.tally.yes, no: i > app.tally.flatmates - app.tally.no }" />
      </div>
      <p>{{ statusText }}</p>
      <ul v-if="app.votes?.length" class="voters">
        <li v-for="v in app.votes" :key="v.voter.login"><Avatar :person="v.voter" :size="18" /> {{ v.voter.name ?? v.voter.login }}: {{ v.yes ? "yes" : "no" }}</li>
      </ul>

      <div v-if="app.status === 'open' && app.viewer.as === 'flatmate'" class="actions">
        <button :class="{ chosen: app.viewer.vote === true }" @click="vote(true)">Let them in</button>
        <button :class="{ chosen: app.viewer.vote === false }" @click="vote(false)">Not this time</button>
        <span v-if="app.viewer.vote !== null" class="muted small">You voted {{ app.viewer.vote ? "yes" : "no" }}. You can change your mind until it's decided.</span>
      </div>
      <div v-if="app.status === 'open' && app.viewer.as === 'applicant'" class="actions">
        <span class="muted small">The flatmates vote. A majority decides.</span>
        <button @click="withdraw">Withdraw</button>
      </div>
      <RouterLink v-if="app.status === 'admitted' && app.viewer.as === 'applicant'" :to="`/houses/${app.house.id}`">Go to your room →</RouterLink>
      <p v-if="actionError" class="error small" role="alert">{{ actionError }}</p>
    </section>

    <p v-if="app.repo" class="repo">Would move in with <a :href="app.repo" target="_blank" rel="noopener">{{ app.repo.replace(/^https:\/\//, "") }}</a></p>

    <h2>Thread</h2>
    <ChatPanel
      :messages="app.messages"
      :post-url="app.status === 'open' ? `/api/applications/${app.id}/messages` : null"
      :me="app.viewer.login"
      :placeholder="app.viewer.as === 'applicant' ? 'Tell the house about you' : 'Ask them something'"
    />
  </template>
  <p v-else class="muted">Opening the door…</p>
</template>

<style scoped>
.error { color: var(--danger); }
.back { display: inline-block; margin-bottom: 12px; font-size: 14px; text-decoration: none; }
.head { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.head p { margin: 2px 0 0; }
.status { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); margin-bottom: 16px; }
.status.admitted { border-color: var(--live); }
.status.declined, .status.withdrawn { opacity: 0.8; }
.status p { margin: 0; }
.bar { display: flex; gap: 4px; }
.seat { width: 28px; height: 8px; border-radius: 4px; background: var(--border); }
.seat.yes { background: var(--live); }
.seat.no { background: var(--danger); }
.voters { list-style: none; padding: 0; margin: 0; display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; }
.voters li { display: inline-flex; align-items: center; gap: 4px; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.actions .chosen { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.small { font-size: 13px; }
.repo { font-size: 14px; }
</style>
