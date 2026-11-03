<script setup lang="ts">
// A room's own page, inside the house window: pressing a tile on the floor plan, or a housemate's arrow, opens it over
// the tabs, with a back arrow on the band. One calm column, the same for a free room and a taken one: a door or a face
// with its name, a line about it, the room's stats (rent, memory, CPU), its address and repo, then the keys. Manage it
// when it's yours, Chat first on anyone else, and on a free room: take it if you live here, knock if you don't. crew.ts
// decides which; the house window does what they ask, except taking the room, which happens here so a refusal can be
// said on the page. Example rooms stay read-only and say so.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { inviteToHouse, notices } from "../../../notices";
import { loadMe, me as session, postJSON } from "../../../session";
import type { HouseView, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import BadgeChip from "../../arena/BadgeChip.vue";
import { bellWords as bw } from "../../bell/words";
import { seeded } from "../../seeded";
import { shortRepo } from "../cards";
import PanelHead from "../panel/PanelHead.vue";
import Panel from "../panel/Panel.vue";
import { roomState } from "../panel/words";
import { firstName, teamNames, teamUp } from "../team";
import TeamUp from "../TeamUp.vue";
import { sheetStep } from "../sheetStep";
import { canKnock, liveAddress, personActions, type RoomKey, roomKeys, type Situation } from "./crew";
import Icon from "./Icon.vue";
import { fcfa, rentOf } from "./server";
import ShareHouse from "./ShareHouse.vue";
import { houseWords as w } from "./words";

const props = defineProps<{ house: HouseView; room: Room; situation: Situation }>();
const emit = defineEmits<{ back: []; press: [key: RoomKey] }>();

const person = computed(() => props.room.occupant);
// By who lives there, not `viewer.room`: that's only your first room.
const mine = computed(() => !!person.value && person.value.login === props.situation.viewer?.login);
const name = computed(() => (person.value ? (person.value.name ?? person.value.login) : ""));
const first = computed(() => (person.value ? firstName(person.value) : ""));
const project = computed(() => props.room.project ?? seeded(props.room.projectDescription));
const about = computed(() => (props.room.project ? seeded(props.room.projectDescription) : null));
const state = computed(() => roomState(props.room, props.house.status, props.house.demo));
const rent = computed(() => rentOf(props.house, props.room));
const address = computed(() => liveAddress(props.room));
const ad = computed(() => seeded(props.room.ad));

// The band: the project when there is one, else whose room it is.
const title = computed(() => {
  if (!person.value) return canKnock(props.situation) ? w.roomForYou : w.plan.freeRoom;
  return project.value ?? (mine.value ? w.plan.yours : teamNames(person.value, props.room.team));
});

const keys = computed(() => roomKeys(props.room, props.situation));
const home = computed(() => session.value?.houses[0] ?? null);
const actions = computed(() =>
  person.value
    ? personActions(person.value, !!props.room.demo, props.situation, {
        home: home.value,
        invited: notices.sent.some((n) => n.kind === "house_invite" && n.to === person.value?.login),
      })
    : null,
);
// A flatmate of yours: teaming up on one of your two projects (team.ts).
const team = computed(() => {
  const v = props.situation.viewer;
  if (!person.value || !v?.member) return null;
  return teamUp({ login: person.value.login, example: !!actions.value?.example }, v, props.house, v.room, notices.sent);
});
// A free room, to someone who lives here: they can take it, or bring someone in. The page names both, so the plus on
// the floor plan isn't a riddle.
const invitable = computed(() => !person.value && !!props.situation.viewer?.member && !props.house.tutorial && props.house.status !== "making");
// Example houses and rooms say so once, in the foot, when there's nothing to press.
const readOnly = computed(() => (props.house.demo || !!actions.value?.example) && !keys.value.main);

const key = (k: RoomKey) => {
  switch (k.kind) {
    case "manage":
      return { icon: "key" as const, word: w.details.manage, name: undefined };
    case "chat":
    case "chatLogin":
      return { icon: "chat" as const, word: w.person.chat, name: w.person.chatName(first.value) };
    case "thread":
      return { icon: "thread" as const, word: w.seeKnock, name: undefined };
    case "knock":
    case "pick":
      return { icon: "knock" as const, word: w.knock, name: undefined };
    case "login":
      return { icon: "login" as const, word: w.logInToKnock, name: undefined };
    case "take":
      return { icon: "key" as const, word: w.details.take, name: undefined };
  }
};
const press = (k: RoomKey) => (k.kind === "take" ? take() : emit("press", k));

// In the workshop: inviting a newcomer to your house. Its first free room; the API says so when there's none.
const busy = ref(false);
const error = ref("");
async function invite() {
  const i = actions.value?.invite;
  if (busy.value || i?.kind !== "invite" || !person.value) return;
  busy.value = true;
  error.value = "";
  const sent = await inviteToHouse(person.value.login, i.houseId);
  busy.value = false;
  if (!sent.ok) error.value = sent.message;
}

// Someone who lives here takes this free room. The house's stream then brings them in as its occupant, and the page
// becomes their room's; a refusal stays on the page, with Back beside it.
async function take() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const sent = await postJSON(`/api/houses/${encodeURIComponent(props.house.id)}/rooms/${encodeURIComponent(props.room.name)}/take`, {});
  busy.value = false;
  if (!sent.ok) error.value = sent.message;
  else void loadMe();
}

// The back arrow takes the focus as the page opens, so Esc goes back and Tab starts from the top. In the lobby's sheet
// it's the sheet's own back key (sheetStep.ts), lent this step back while the page shows: one arrow on the band.
const backKey = ref<HTMLButtonElement | null>(null);
const sheetBack = inject(sheetStep, null);
const goBack = () => emit("back");
const panel = ref<{ $el: HTMLElement } | null>(null);
onMounted(async () => {
  if (sheetBack) sheetBack.value = goBack;
  await nextTick();
  (backKey.value ?? panel.value?.$el.closest("[role=dialog]")?.querySelector<HTMLElement>(".back-btn"))?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  if (sheetBack?.value === goBack) sheetBack.value = null;
});
</script>

<template>
  <Panel ref="panel" class="room-details" @keydown.esc.stop="emit('back')">
    <template #head>
      <PanelHead :title="title" :state="state" :line="state.word">
        <template v-if="!sheetBack" #lead>
          <button ref="backKey" type="button" class="sign-x arrow" :aria-label="w.details.back" @click="emit('back')">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </template>
      </PanelHead>
    </template>

    <div class="page">
      <!-- Who lives here, or what's free. -->
      <div class="who">
        <Avatar v-if="person" :person="person" :size="72" decorative />
        <span v-else class="door"><Icon name="door" :size="36" /></span>
        <p class="name">
          <strong>{{ person ? name : room.name }}</strong>
          <BadgeChip v-if="person?.badge" :badge="person.badge" />
        </p>
        <template v-if="person">
          <a v-if="actions?.github" class="handle" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.person.githubName(person.login)">
            @{{ person.login }}<Icon name="external" :size="14" />
          </a>
          <span v-else class="handle">@{{ person.login }}</span>
          <ul v-if="room.team?.length" class="team" :aria-label="teamNames(person, room.team)">
            <li v-for="p in room.team" :key="p.login"><Avatar :person="p" :size="32" decorative /></li>
          </ul>
        </template>
      </div>
      <p v-if="person" class="about" :class="{ none: !about }">{{ about ?? w.plan.noDescription }}</p>
      <p v-else-if="ad" class="about">{{ ad }}</p>

      <!-- The room in numbers: its share of the rent, and its size. -->
      <ul class="stats">
        <li v-if="rent"><strong>{{ fcfa(rent) }}</strong><span>{{ w.plan.aMonth }}</span></li>
        <li><strong>{{ w.details.memory(room.limits.memoryMb) }}</strong><span>{{ w.details.memoryWord }}</span></li>
        <li><strong>{{ room.limits.cpus }}</strong><span>{{ w.details.cpuWord }}</span></li>
      </ul>

      <ul v-if="address || room.repo" class="facts">
        <li v-if="address">
          <Icon name="external" :size="18" />
          <a :href="address" target="_blank" rel="noopener" :aria-label="w.person.projectName(first)">{{ address.replace(/^https?:\/\//, "") }}</a>
        </li>
        <li v-if="room.repo">
          <Icon name="code" :size="18" />
          <a :href="room.repo" target="_blank" rel="noopener">{{ shortRepo(room.repo) }}</a>
        </li>
      </ul>

      <div v-if="keys.main || keys.second || actions?.invite || team || invitable || readOnly || error" class="keys">
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <RouterLink v-if="keys.main?.kind === 'login'" to="/login" class="button primary key"><Icon name="login" :size="20" />{{ w.logInToKnock }}</RouterLink>
        <button v-else-if="keys.main" type="button" class="primary key" :disabled="busy" :aria-label="key(keys.main).name" @click="press(keys.main)">
          <Icon :name="key(keys.main).icon" :size="20" />{{ key(keys.main).word }}
        </button>
        <button v-if="keys.second" type="button" class="second key" :aria-label="key(keys.second).name" @click="press(keys.second)">
          <Icon :name="key(keys.second).icon" :size="18" />{{ key(keys.second).word }}
        </button>
        <button v-if="actions?.invite?.kind === 'invite'" type="button" class="second key" :disabled="busy" :aria-label="bw.inviteHomeName(actions.invite.houseName)" @click="invite">
          <Icon name="key" :size="18" />{{ bw.inviteHome(actions.invite.houseName) }}
        </button>
        <span v-else-if="actions?.invite?.kind === 'invited'" class="done"><Icon name="tick" :size="18" />{{ bw.invited }}</span>
        <ShareHouse v-if="invitable" :house-id="house.id" :name="house.name" :city="house.city" :word="w.plan.invite" quiet />
        <TeamUp v-if="team && person" :state="team" :house-id="house.id" :login="person.login" :first="first" size="small" />
        <!-- A refusal's way out. -->
        <button v-if="error" type="button" class="second key" @click="emit('back')">{{ w.back }}</button>
        <p v-if="readOnly" class="say">{{ w.details.exampleOnly }}</p>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
/* The same key as the sheet's own back arrow, in the band's flow rather than pinned to the sheet. */
.arrow.sign-x { position: static; margin: 0; }
/* One calm column in the middle of the body, for a free room and a taken one. The auto margin centres it while there's
   space, and gives way to the body's scroll when there isn't. */
.page { flex: none; width: min(100%, 460px); margin: auto; display: grid; justify-items: center; gap: 14px; padding: 8px 0; text-align: center; }
.page > * { min-width: 0; }
.who { display: grid; justify-items: center; gap: 4px; max-width: 100%; }
/* The free room's door, in the place and the size of a face. */
.door { width: 72px; height: 72px; display: grid; place-items: center; border-radius: 50%; background: var(--tile); color: var(--muted); }
.name { display: flex; align-items: center; justify-content: center; gap: 8px; max-width: 100%; margin-top: 6px; font-size: 24px; line-height: 1.15; }
.name strong { min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name :deep(.badge-chip) { flex: 0 1 auto; min-width: 22px; }
.handle { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; font-size: 16px; font-weight: 600; color: var(--handle); }
.team { display: flex; list-style: none; margin: 4px 0 0; padding: 0; }
.team li + li { margin-left: -8px; }
.about { font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
.about.none { color: var(--muted); }
/* The numbers: a flat tile each, the number big and its word small under it. */
.stats { width: 100%; list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.stats li { flex: 1 1 110px; display: grid; gap: 2px; padding: 10px 8px; border-radius: var(--r-md); background: var(--tile); }
.stats strong { font: 800 18px/1.1 var(--num); white-space: nowrap; }
.stats span { font-size: 13px; line-height: 1.1; color: var(--muted); }
/* Where it lives online: a flat tile each, an icon instead of a label. */
.facts { width: 100%; list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.facts li { min-width: 0; display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; padding: 8px 12px; border-radius: var(--r-md); background: var(--tile); font-size: 15px; }
.facts :deep(svg) { flex: none; color: var(--muted); }
.facts a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; color: var(--text); text-decoration: underline; text-underline-offset: 2px; }
.keys { width: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
/* Inviting someone: a second key, on its own row under taking the room. */
.keys > :deep(.share) { flex: 1 1 100%; }
.keys > :deep(.share) .key { width: 100%; min-height: 50px; font-size: 18px; background: var(--tile); color: var(--text); box-shadow: none; }
.key { flex: 1 1 160px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 60px; font-size: 24px; }
a.key:hover { text-decoration: none; }
.keys .key.second { min-height: 50px; font-size: 18px; background: var(--tile); color: var(--text); box-shadow: none; }
/* The Chat key off, for an example person: readable, but plainly off. */
.keys .key.primary:disabled { opacity: 1; background: var(--fill); color: var(--muted); cursor: not-allowed; }
.done { display: inline-flex; align-items: center; gap: 6px; min-height: 50px; padding: 0 12px; color: var(--live); font-size: 15px; font-weight: 800; }
.say { flex-basis: 100%; font-size: 15px; color: var(--muted); }
.error { flex-basis: 100%; font-size: 14px; color: var(--danger); }
@media (max-width: 480px) {
  .key { min-height: 54px; font-size: 19px; }
  .stats strong { font-size: 16px; }
}
</style>
