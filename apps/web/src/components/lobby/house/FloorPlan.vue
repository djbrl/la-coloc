<script setup lang="ts">
// A house's floor plan: the first thing you see when you walk in. The house in numbers along the top (its rooms, how
// many are free, what the server costs a month), then one pane per room, as the street sees it: the flatmate at home in a
// lit room, and on a paper tag under it whose room it is, the project as the biggest thing, a line about it, what the room
// costs and how it's doing. Pressing a pane opens the room's page (RoomDetails.vue). A free room is dark, with its sign
// and its price. A room being built flickers.
import type { HouseView, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import { teamNames } from "../team";
import { cardWords } from "../words";
import StatusDot from "../panel/StatusDot.vue";
import StatusPill from "../panel/StatusPill.vue";
import { roomState } from "../panel/words";
import { seeded } from "../../seeded";
import Icon from "./Icon.vue";
import { roomPicture } from "./roomPicture";
import { fcfa, houseCost, rentOf } from "./server";
import { houseWords as w } from "./words";

const props = defineProps<{
  house: HouseView;
  // The tiles shown, and how many wait behind the "+N" tile.
  rooms: Room[];
  hidden: number;
  // The names of your own rooms.
  mine: string[];
  // A free room can be knocked on, here and now: it's then "a room for you".
  knockable: boolean;
  // Rooms lit for a moment (the foot asked you to pick one).
  lit: string[];
  // The workshop: a room is waiting for you, with its own tile at the start. The quest's coach may be the one to
  // press instead, and the tile then keeps quiet.
  take: boolean;
  coached?: boolean;
  taking: boolean;
  takeError: string;
}>();
const emit = defineEmits<{ pick: [room: Room]; take: []; more: [] }>();

const free = () => props.house.rooms.filter((r) => !r.occupant).length;
const rent = (room: Room) => rentOf(props.house, room);
const state = (room: Room) => roomState(room, props.house.status, props.house.demo);
// Only what's wrong with this room says so in words: a whole house waiting for its server says so once, in its head.
const building = (room: Room) => props.house.status === "making" || room.status === "deploying";
const trouble = (room: Room) => props.house.status !== "making" && ["warn", "danger"].includes(state(room).tone);
// A seeded room may only have its line: that line is then its title, and it doesn't say it twice.
const project = (room: Room) => room.project ?? seeded(room.projectDescription);
const about = (room: Room) => (room.project ? seeded(room.projectDescription) : null);
const count = () => props.rooms.length + (props.take ? 1 : 0) + (props.hidden ? 1 : 0);
const freeWord = () => (props.knockable ? w.roomForYou : w.plan.freeRoom);
// What a reader hears on a tile: who and what, and what it costs.
function said(room: Room): string {
  const r = rent(room);
  const pays = r ? w.plan.pays(fcfa(r)) : "";
  if (!room.occupant) return `${freeWord()}. ${pays}`;
  const who = props.mine.includes(room.name) ? w.plan.yours : teamNames(room.occupant, room.team);
  return `${who}, @${room.occupant.login}. ${project(room) ?? w.noProject} ${about(room) ?? ""} ${pays}`;
}
</script>

<template>
  <div class="plan" data-tour="rooms">
    <p class="numbers">
      <span><strong>{{ house.rooms.length }}</strong> {{ w.plan.rooms(house.rooms.length) }}</span>
      <span v-if="free()"><strong>{{ free() }}</strong> {{ w.plan.free(free()) }}</span>
      <span v-if="houseCost(house)" class="total"><strong>{{ fcfa(houseCost(house)!) }}</strong> {{ w.plan.aMonth }}</span>
    </p>

    <ul class="room-tiles" :class="{ three: count() > 4, tall: count() <= 2 }" :aria-label="w.rooms">
      <li v-if="take">
        <button v-if="!coached" type="button" class="cell open" :disabled="taking" @click="emit('take')">
          <span class="plus"><Icon name="plus" :size="40" /></span>
          <span class="for">{{ w.roomForYou }}</span>
          <span class="rent key">{{ w.takeIt }}</span>
          <span v-if="takeError" class="error" role="alert">{{ takeError }}</span>
        </button>
        <div v-else class="cell open">
          <span class="plus"><Icon name="plus" :size="40" /></span>
          <span class="for">{{ w.roomForYou }}</span>
        </div>
      </li>

      <li v-for="room in rooms" :key="room.name" :data-room="room.name">
        <button
          type="button"
          class="cell"
          :class="{ open: !room.occupant, mine: mine.includes(room.name), lit: lit.includes(room.name), building: room.occupant && building(room) }"
          :aria-label="said(room)"
          @click="emit('pick', room)"
        >
          <template v-if="room.occupant">
            <img class="pic" :src="roomPicture(room.occupant.login)" alt="" loading="lazy" />
            <span class="tag">
            <span class="who">
              <Avatar :person="room.occupant" :size="28" decorative />
              <span class="names">
                <span class="name">{{ mine.includes(room.name) ? w.plan.yours : teamNames(room.occupant, room.team) }}</span>
                <span class="handle">@{{ room.occupant.login }}</span>
              </span>
            </span>
            <span class="what" :class="{ none: !project(room) }">{{ project(room) ?? w.noProject }}</span>
            <span class="about">{{ about(room) ?? w.plan.noDescription }}</span>
            <span class="low">
              <span class="rent">{{ rent(room) ? fcfa(rent(room)!) : "" }}</span>
              <StatusPill v-if="trouble(room)" :state="state(room)" />
              <StatusDot v-else class="dot" :state="state(room)" />
            </span>
            </span>
          </template>
          <template v-else>
            <span class="loue"><b>{{ cardWords.forRent }}</b></span>
            <span class="for">{{ freeWord() }}</span>
            <span v-if="rent(room)" class="rent">{{ fcfa(rent(room)!) }}</span>
          </template>
        </button>
      </li>

      <li v-if="hidden">
        <button type="button" class="cell open more" :aria-label="w.moreRooms(hidden)" @click="emit('more')">+{{ hidden }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* It takes the whole body, and the panes share what's left under the numbers. */
.plan { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.numbers { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 16px; font-size: 15px; color: var(--muted); }
.numbers strong { font: 700 18px/1.2 var(--num); color: var(--text); }
/* The money can't be missed. */
.numbers .total { margin-left: auto; }
.numbers .total strong { font: 400 30px/1 var(--display); letter-spacing: 0.02em; }

.room-tiles { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0; padding: 6px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 200px; gap: 6px; align-content: start; border-radius: 3px; background: var(--frame); }
.room-tiles.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
/* In the lobby's sheet the panes share its height exactly. On a page of its own the plan grows, at the size above. */
:global(.page-host .room-tiles) { grid-auto-rows: minmax(112px, 1fr); }
/* A house of one or two rooms doesn't stretch them into hallways. */
:global(.page-host .room-tiles.tall) { flex: 0 1 auto; grid-auto-rows: minmax(112px, 230px); }
/* Each pane knows its own height, so a short row drops the picture rather than spill (below). */
.room-tiles > li { min-width: 0; display: flex; container: tile / size; }

.cell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: #ffd9a6;
  box-shadow: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  overflow: hidden;
}
button.cell { cursor: pointer; }
button.cell:hover:not(:disabled) { background: #ffd9a6; filter: brightness(1.06); }
button.cell:active:not(:disabled) { transform: none; }
button.cell:focus-visible { outline: 3px solid #ffd21f; outline-offset: -3px; }
/* Yours: the same pane, ringed in the sticker's yellow. */
.cell.mine { outline: 3px solid #ffd21f; outline-offset: -3px; }
.pic { flex: 1 1 0; min-height: 0; width: 100%; object-fit: cover; object-position: 50% 52%; }
/* The paper tag: the same four lines in every pane. */
.tag { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 7px 9px 7px; background: var(--surface); }
.cell.lit .tag { background: var(--accent-soft); }
.who { flex: none; display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 2px; }
.who :deep(.avatar) { border-radius: 4px; }
.names { min-width: 0; display: grid; }
.name, .handle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 14px; font-weight: 600; line-height: 1.15; }
.mine .name { font-weight: 700; }
.handle { font-size: 12px; line-height: 1.2; color: var(--muted); }
/* The project is the biggest thing on the tag. */
.what, .about { flex: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.what { font-size: 17px; font-weight: 600; line-height: 1.2; }
.what.none { color: var(--muted); }
.about { font-size: 13px; line-height: 1.25; color: var(--muted); }
.low { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 18px; margin-top: 2px; }
.rent { font: 500 13px/1 var(--num); white-space: nowrap; color: var(--muted); }
.rent.key { font: 600 15px/1 var(--font); color: #ffd21f; }
.dot { width: 12px; height: 12px; animation: none; }
/* A free room: dark, with its sign in the middle. */
.cell.open { align-items: center; justify-content: center; gap: 10px; padding: 10px; text-align: center; background: var(--dark-room); color: #fff1dc; }
button.cell.open:hover:not(:disabled) { background: var(--dark-room); filter: brightness(1.25); }
.cell.open .rent { color: #c8d3f2; }
.cell.open.lit { outline: 3px solid #ffd21f; outline-offset: -3px; }
.plus { flex: none; display: grid; color: #c8d3f2; }
.for { font-size: 15px; font-weight: 500; line-height: 1.15; }
.more { font: 600 22px/1 var(--num); }
.error { font-size: 14px; color: #ff9a9a; }
/* The bulb in a room being built isn't sure of itself. Never more than three flashes in a second. */
.building .pic { animation: unsure 5s linear infinite; }
@keyframes unsure {
  0%, 62% { filter: none; }
  63% { filter: brightness(0.62); }
  65% { filter: none; }
  67% { filter: brightness(0.7); }
  69%, 100% { filter: none; }
}
/* Shorter rows give up the picture first, then the description: the plan never scrolls for it. */
@container tile (max-height: 168px) {
  .pic { display: none; }
  .tag { flex: 1 1 auto; justify-content: center; }
}
@container tile (max-height: 112px) {
  .about { display: none; }
}
@media (max-width: 560px) {
  .room-tiles, .room-tiles.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .what { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .building .pic { animation: none; }
}
</style>
