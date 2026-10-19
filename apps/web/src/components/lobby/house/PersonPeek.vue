<script setup lang="ts">
// A person picked in the house's crew row: who they are, in one flat card under the faces, and what you can do about
// them. One main action, reaching out (personActions in crew.ts decides which: write in the channel, knock, see your
// knock, or log in; for a flatmate, teaming up on a project, with the channel as an icon), then quiet icon buttons: their GitHub profile (only for a real account), a direct message (in
// the chat sheet; an example person has neither: their tag says why) and a wave.
import { computed, onMounted, ref } from "vue";
import { openChat } from "../../../conversations";
import { inviteToHouse } from "../../../notices";
import { me } from "../../../session";
import { messageAction } from "../../chat/chat";
import { cardWords as cw } from "../words";
import { bellWords as bw } from "../../bell/words";
import type { Person } from "../../../types";
import Avatar from "../../Avatar.vue";
import BadgeChip from "../../arena/BadgeChip.vue";
import type { TeamUp as TeamUpState } from "../team";
import TeamUp from "../TeamUp.vue";
import type { PersonActions } from "./crew";
import Icon from "./Icon.vue";
import { houseWords as w } from "./words";

const props = defineProps<{
  person: Person;
  // What they build, or their room's name when nothing is online.
  line: string | null;
  actions: PersonActions;
  // A flatmate of yours: teaming up on a project (team.ts), and the house it happens in.
  team?: TeamUpState;
  houseId?: string;
}>();
const emit = defineEmits<{ reach: []; wave: []; close: [] }>();

const name = computed(() => props.person.name ?? props.person.login);
const first = computed(() => name.value.split(" ")[0]);
const message = computed(() => messageAction({ isMe: me.value?.login === props.person.login, example: props.actions.example }, me.value));

// The main action's icon and words.
const main = computed(() => {
  const r = props.actions.reach;
  switch (r?.kind) {
    case "chat":
      return { icon: "chat" as const, word: w.person.chat };
    case "knock":
    case "pick":
      return { icon: "knock" as const, word: w.knock };
    case "thread":
      return { icon: "thread" as const, word: w.seeKnock };
    default:
      return null;
  }
});

// In the workshop: inviting a newcomer to your house. Its first free room; the API says so when there's none.
const busy = ref(false);
const error = ref("");
async function invite() {
  const i = props.actions.invite;
  if (busy.value || i?.kind !== "invite") return;
  busy.value = true;
  error.value = "";
  const sent = await inviteToHouse(props.person.login, i.houseId);
  busy.value = false;
  if (!sent.ok) error.value = sent.message;
}

// A wave answers once, in words, then the button rests a moment.
const waved = ref(false);
function wave() {
  emit("wave");
  waved.value = true;
  window.setTimeout(() => (waved.value = false), 2500);
}

// The card takes the focus when it opens, so Esc closes it and Tab reaches its buttons first.
const card = ref<HTMLElement | null>(null);
onMounted(() => card.value?.focus({ preventScroll: true }));
</script>

<template>
  <section ref="card" class="peek" tabindex="-1" :aria-label="w.person.label(name)" @keydown.esc.stop="emit('close')">
    <Avatar :person="person" :size="40" decorative />
    <div class="who">
      <p class="name">
        <strong>{{ name }}</strong>
        <BadgeChip v-if="person.badge" :badge="person.badge" />
        <span v-if="actions.example" class="tag" :title="w.person.exampleWhy">{{ w.person.example }}<span class="sr-only">. {{ w.person.exampleWhy }}</span></span>
      </p>
      <p class="line">
        <span v-if="actions.github" class="handle">@{{ person.login }}</span>
        <span v-if="line" class="what">{{ line }}</span>
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="sr-only" aria-live="polite">{{ waved ? w.person.waved(first) : "" }}</p>
    </div>
    <div class="acts">
      <RouterLink v-if="actions.reach?.kind === 'login'" to="/login" class="button go"><Icon name="login" :size="16" />{{ w.logInToKnock }}</RouterLink>
      <!-- A flatmate: teaming up is the main key, and writing to them in the channel steps back to an icon. -->
      <template v-else-if="team && houseId">
        <TeamUp :state="team" :house-id="houseId" :login="person.login" :first="first" size="small" />
        <button v-if="main" type="button" class="icon" :aria-label="main.word" :title="main.word" @click="emit('reach')"><Icon :name="main.icon" :size="18" /></button>
      </template>
      <button v-else-if="main" type="button" class="go" @click="emit('reach')"><Icon :name="main.icon" :size="16" />{{ main.word }}</button>
      <button v-else-if="actions.invite?.kind === 'invite'" type="button" class="go" :disabled="busy" :aria-label="bw.inviteHomeName(actions.invite.houseName)" @click="invite">
        <Icon name="key" :size="16" />{{ bw.inviteHome }}
      </button>
      <span v-else-if="actions.invite?.kind === 'invited'" class="done"><Icon name="tick" :size="16" />{{ bw.invited }}</span>
      <button v-if="message?.kind === 'open'" type="button" class="icon" :aria-label="cw.messageName(name)" :title="cw.messageName(name)" @click="openChat('dm', { with: person.login })">
        <Icon name="chat" :size="18" />
      </button>
      <a v-if="actions.github" class="button icon" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.person.githubName(person.login)" :title="w.person.githubName(person.login)">
        <Icon name="profile" :size="18" />
      </a>
      <button v-if="actions.wave" type="button" class="icon" :class="{ waved }" :aria-label="w.person.waveName(first)" :title="w.person.waveName(first)" @click="wave">
        <Icon name="hand" :size="18" />
      </button>
    </div>
    <button type="button" class="x" :aria-label="w.person.close" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
    </button>
  </section>
</template>

<style scoped>
/* A flat card under the faces, on the tile colour: the person, then their actions on the right. */
.peek {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 40px 10px 12px;
  border-radius: var(--r-md);
  background: var(--tile);
  box-shadow: inset 0 0 0 1px var(--line);
  outline: none;
  animation: peek-in var(--dur-slow) var(--ease-pop);
}
@keyframes peek-in {
  from { opacity: 0; transform: translateY(-4px); }
}
.who { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; }
.name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The honest marker: a quiet word, its full sentence on hover and for a screen reader. */
.tag { flex: none; padding: 0 6px; border-radius: var(--r-xs); background: var(--fill); color: var(--muted); font-size: 11.5px; font-weight: 600; line-height: 17px; }
.line { display: flex; gap: 8px; min-width: 0; font-size: 13px; color: var(--muted); }
.handle { flex: none; font: 500 12.5px/1.45 var(--mono); }
.what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acts { flex: none; display: flex; align-items: center; gap: 6px; }
/* Reaching out is this card's main action, but the panel's foot keeps the one orange key: this one is the soft orange. */
.acts .go { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent); box-shadow: none; font-size: 14px; font-weight: 600; white-space: nowrap; text-decoration: none; }
.acts .go:hover:not(:disabled) { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent-fill); }
.acts .icon { width: 34px; height: 34px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); }
.acts .icon:disabled { opacity: 0.45; cursor: not-allowed; }
.acts .icon.waved { color: var(--accent); }
.done { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: var(--r-sm); background: var(--live-soft); color: var(--live); font-size: 14px; font-weight: 600; }
.error { font-size: 13px; }
.x { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-xs); background: none; color: var(--muted); box-shadow: none; }
.x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
@media (max-width: 520px) {
  .peek { flex-wrap: wrap; }
  .acts { width: 100%; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) {
  .peek { animation: none; }
}
</style>
