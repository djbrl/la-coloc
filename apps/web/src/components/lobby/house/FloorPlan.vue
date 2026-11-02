<script setup lang="ts">
// A house's floor plan: the first thing you see when you walk in. The house in numbers along the top (its rooms, how
// many are free, what the server costs a month), then one tile per room, laid out the same in every tile: whose room
// it is, the project as the biggest thing, a line about it, and at the bottom what the room costs and how it's doing.
// Pressing a tile opens the room's page (RoomDetails.vue). A free room is a large plus and its price.
import type { HouseView, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import { teamNames } from "../team";
import StatusDot from "../panel/StatusDot.vue";
import StatusPill from "../panel/StatusPill.vue";
import { roomState } from "../panel/words";
import { seeded } from "../../seeded";
import Icon from "./Icon.vue";
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
  <div class="plan">
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
          :class="{ open: !room.occupant, mine: mine.includes(room.name), lit: lit.includes(room.name) }"
          :aria-label="said(room)"
          @click="emit('pick', room)"
        >
          <template v-if="room.occupant">
            <span class="who">
              <Avatar :person="room.occupant" :size="36" decorative />
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
          </template>
          <template v-else>
            <span class="plus"><Icon name="plus" :size="40" /></span>
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
/* It takes the whole body, and the tiles share what's left under the numbers. */
.plan { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.numbers { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 16px; font-size: 15px; color: var(--muted); }
.numbers strong { font: 800 18px/1.2 var(--num); color: var(--text); }
.numbers .total { margin-left: auto; }

.room-tiles { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 176px; gap: 8px; align-content: start; }
.room-tiles.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
/* In the lobby's sheet the tiles share its height exactly. On a page of its own the plan grows, at the size above. */
:global(.page-host .room-tiles) { grid-auto-rows: minmax(112px, 1fr); }
/* A house of one or two rooms doesn't stretch them into hallways. */
:global(.page-host .room-tiles.tall) { grid-auto-rows: minmax(112px, 190px); }
/* Each tile knows its own height, so a short row drops the description rather than spill (below). */
.room-tiles > li { min-width: 0; display: flex; container: tile / size; }

/* The same four lines in every tile, from the top, with the footer always on the bottom edge. */
.cell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--tile);
  box-shadow: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  overflow: hidden;
  transition: background-color var(--dur-fast) var(--ease);
}
button.cell { cursor: pointer; }
button.cell:hover:not(:disabled) { background: var(--fill); }
button.cell:active:not(:disabled) { transform: none; }
button.cell:focus-visible { outline: 3px solid var(--ring); outline-offset: -3px; }
/* Yours: the same tile, ringed in ink. One colour less to read. */
.cell.mine { box-shadow: inset 0 0 0 3px var(--text); }
.cell.lit { background: var(--accent-soft); }
.who { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 4px; }
.names { min-width: 0; display: grid; }
.name, .handle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 15px; font-weight: 700; line-height: 1.15; }
.mine .name { font-weight: 800; }
.handle { font-size: 13px; font-weight: 600; line-height: 1.2; color: var(--muted); }
/* The project is the biggest thing on the tile. */
.what, .about { flex: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-box-orient: vertical; }
.what { font-size: 20px; font-weight: 800; line-height: 1.12; -webkit-line-clamp: 2; line-clamp: 2; }
.what.none { color: var(--muted); }
.about { font-size: 14px; line-height: 1.2; color: var(--muted); -webkit-line-clamp: 2; line-clamp: 2; }
.low { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 20px; margin-top: auto; }
.rent { font: 700 14px/1 var(--num); white-space: nowrap; color: var(--muted); }
.rent.key { font: 800 15px/1 var(--font); color: var(--panel-red); }
.dot { width: 12px; height: 12px; animation: none; }
/* A free room: no floor yet, only its outline, and a large plus in the middle. */
.cell.open { align-items: center; justify-content: center; text-align: center; background: none; box-shadow: inset 0 0 0 2px var(--fill); }
button.cell.open:hover:not(:disabled) { background: var(--tile); }
.cell.open.lit { background: var(--accent-soft); }
.plus { flex: none; display: grid; color: var(--muted); }
.for { font-size: 16px; font-weight: 800; line-height: 1.15; }
.more { font: 800 22px/1 var(--num); }
.error { font-size: 14px; color: var(--danger); }
/* Shorter rows give up the description first, then the project's second line: the plan never scrolls for it. */
@container tile (max-height: 172px) {
  .about { -webkit-line-clamp: 1; line-clamp: 1; }
}
@container tile (max-height: 154px) {
  .what { -webkit-line-clamp: 1; line-clamp: 1; }
}
@container tile (max-height: 134px) {
  .about { display: none; }
  .plus :deep(svg) { width: 28px; height: 28px; }
}
@media (max-width: 560px) {
  .room-tiles, .room-tiles.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .what { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) {
  .cell { transition: none; }
}
</style>
