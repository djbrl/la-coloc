<script setup lang="ts">
// Teaming up with a flatmate, on their card (in the street, PersonCard; or in the house window, PersonPeek): a short
// flow in two steps. "Team up", then which way round: join their project, or bring them into yours. Sent, it waits
// for their answer under their bell (and can be taken back); once you're a team, it says so. What's offered comes
// from teamUp() in team.ts; the API holds the same rules and answers in its own words when one is broken.
import { computed, nextTick, ref } from "vue";
import { askToJoinTeam, bringIntoTeam, withdrawInvite } from "../../notices";
import { bellWords as w } from "../bell/words";
import Icon from "./house/Icon.vue";
import type { TeamUp } from "./team";

const props = defineProps<{
  state: Exclude<TeamUp, null>;
  houseId: string;
  login: string;
  // Their first name, for the sentences.
  first: string;
  // "big": the street card's chunky keys. "small": the house window's compact row.
  size?: "big" | "small";
}>();

// 0: the one key. 1: which way round. Back to 0 with the little chevron (the card's own X stays the card's).
const step = ref<0 | 1>(0);
const busy = ref(false);
const error = ref("");
const said = ref("");
const root = ref<HTMLElement | null>(null);
const big = computed(() => props.size !== "small");

async function choose() {
  step.value = 1;
  error.value = "";
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>(".way:not(:disabled)")?.focus();
}

async function send(way: "join" | "bring") {
  const s = props.state;
  if (busy.value || s.kind !== "offer") return;
  const room = way === "join" ? s.join : s.bring;
  if (!room) return;
  busy.value = true;
  error.value = "";
  const sent = way === "join" ? await askToJoinTeam(props.houseId, room) : await bringIntoTeam(props.houseId, room, props.login);
  busy.value = false;
  if (!sent.ok) {
    error.value = sent.message;
    return;
  }
  step.value = 0;
  said.value = w.teamSent(props.first);
}

async function takeBack() {
  const s = props.state;
  if (busy.value || s.kind !== "waiting") return;
  busy.value = true;
  error.value = "";
  said.value = "";
  const sent = await withdrawInvite(s.requestId);
  busy.value = false;
  if (!sent.ok) error.value = sent.message;
}
</script>

<template>
  <div ref="root" class="team" :class="big ? 'is-big' : 'is-small'">
    <template v-if="state.kind === 'together'">
      <span class="done"><Icon name="people" :size="big ? 18 : 16" /> {{ w.teammates }}</span>
    </template>

    <template v-else-if="state.kind === 'waiting'">
      <span class="done wait"><Icon name="clock" :size="big ? 18 : 16" /> {{ w.teamWaiting }}</span>
      <button type="button" :class="big ? 'big quiet' : 'quiet'" :disabled="busy" :aria-label="w.withdrawName" @click="takeBack">{{ w.withdraw }}</button>
    </template>

    <button v-else-if="step === 0" type="button" :class="big ? 'big primary' : 'go'" :disabled="busy" :aria-label="w.teamUpName(first)" @click="choose">
      <Icon name="people" :size="big ? 20 : 16" /> {{ w.teamUp }}
    </button>

    <!-- Step 2: which way round. A way that can't be taken (no room, a full team) is greyed out. -->
    <div v-else class="ways" role="group" :aria-label="w.teamWhichWay(first)" @keydown.esc.stop="step = 0">
      <button type="button" class="way" :class="{ big }" :disabled="busy || !state.join" @click="send('join')">
        <Icon name="box" :size="big ? 20 : 16" /> {{ w.joinTheirs }}
      </button>
      <button type="button" class="way" :class="{ big }" :disabled="busy || !state.bring" @click="send('bring')">
        <Icon name="plus" :size="big ? 20 : 16" /> {{ w.bringIntoMine }}
      </button>
      <button type="button" class="back" :aria-label="w.teamNotNow" :title="w.teamNotNow" @click="step = 0">
        <span aria-hidden="true">‹</span>
      </button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="said && state.kind === 'waiting'" class="said" role="status">{{ said }}</p>
  </div>
</template>

<style scoped>
.team { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.is-big { width: 100%; }
.is-big > .big.primary { flex: 1 1 auto; }
/* Done, or waiting: the green word for a team, the quiet one while it waits. */
.done { display: inline-flex; align-items: center; gap: 8px; color: var(--live); font-weight: 800; white-space: nowrap; }
.done.wait { color: var(--muted); }
.is-big .done { flex: 1; min-height: 50px; font-size: 18px; }
.is-small .done { min-height: 46px; font-size: 15px; }
.ways { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.is-big .ways .way { flex: 1 1 140px; font-size: 15px; }
.way:not(.big), .go, .quiet:not(.big) { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; background: var(--surface); box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; white-space: nowrap; }
.way:not(.big):hover:not(:disabled), .quiet:not(.big):hover:not(:disabled) { background: var(--tile); }
/* The house window's main key is on ink (its foot keeps the one red key), like PersonPeek's. */
.go, .go:hover:not(:disabled) { background: var(--text); color: var(--surface); box-shadow: none; }
.way:disabled { opacity: 0.45; cursor: not-allowed; }
.back { flex: none; width: 44px; height: 44px; min-height: 0; padding: 0; display: grid; place-items: center; background: none; box-shadow: none; color: var(--text); font: 400 24px/1 var(--display); }
.back:hover:not(:disabled) { background: var(--fill); }
.error, .said { flex-basis: 100%; margin: 0; font-size: 14px; }
.said { color: var(--muted); }
</style>
