<script setup lang="ts">
// A house's floor plan: the first thing you see when you walk in. The house in numbers along the top (its rooms, how
// many are free, what the server costs a month), then one tile per room, laid out the same in every tile: whose room
// it is, then low down the project as the biggest thing with how it's doing beside it, a line about it, and what the
// room costs. Lived-in rooms get the space and free ones wait in a low row under them (planGrid, crew.ts). Pressing a
// tile opens the room's page (RoomDetails.vue), which says what the plus can mean: knock, take it, or invite someone.
// A free room is a plus, in the blue of a free window, and its price.
import { computed } from "vue";
import type { HouseView, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import StatusDot from "../panel/StatusDot.vue";
import StatusPill from "../panel/StatusPill.vue";
import { roomState } from "../panel/words";
import { seeded } from "../../seeded";
import { planGrid } from "./crew";
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
  // The workshop: a room is waiting for you, with its own tile at the start. The quest's spotlight points at it
  // (`data-spot`); while its coach has a main action of its own, the tile keeps quiet.
  take: boolean;
  coached?: boolean;
  taking: boolean;
  takeError: string;
  // The foot already talks money (your rent, with one more): the numbers along the top step aside.
  noNumbers?: boolean;
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
// The workshop's "A room for you" keeps every square the same size: it's the square the quest is about.
const lived = computed(() => props.rooms.filter((r) => r.occupant));
const open = computed(() => props.rooms.filter((r) => !r.occupant));
const grid = computed(() => (props.take ? null : planGrid(lived.value.length, open.value.length + (props.hidden ? 1 : 0))));
// Lived-in rooms first, when they get the space.
const shown = computed(() => (grid.value ? [...lived.value, ...open.value] : props.rooms));
const rows = computed(() => (grid.value ? { gridTemplateRows: `repeat(${grid.value.livedRows}, minmax(140px, 1fr)) repeat(${grid.value.openRows}, 108px)` } : undefined));
function span(room: Room) {
  const g = grid.value;
  return g ? (room.occupant ? g.livedSpan(lived.value.indexOf(room)) : g.openSpan) : 0;
}
const wide = (room: Room) => !!room.occupant && span(room) === 12;
const freeWord = () => (props.knockable ? w.roomForYou : w.plan.freeRoom);
// What a reader hears on a tile: who and what, and what it costs.
function said(room: Room): string {
  const r = rent(room);
  const pays = r ? w.plan.pays(fcfa(r)) : "";
  if (!room.occupant) return `${freeWord()}. ${pays}`;
  const who = props.mine.includes(room.name) ? w.plan.yours : (room.occupant.name ?? room.occupant.login);
  return `${who}, @${room.occupant.login}. ${project(room) ?? w.noProject} ${about(room) ?? ""} ${pays}`;
}
</script>

<template>
  <div class="plan">
    <p v-if="!noNumbers" class="numbers">
      <span><strong>{{ house.rooms.length }}</strong> {{ w.plan.rooms(house.rooms.length) }}</span>
      <span v-if="free()"><strong>{{ free() }}</strong> {{ w.plan.free(free()) }}</span>
      <span v-if="houseCost(house)" class="total"><strong>{{ fcfa(houseCost(house)!) }}</strong> {{ w.plan.aMonth }}</span>
    </p>

    <ul class="room-tiles" :class="{ three: !grid && count() > 4, tall: !grid && count() <= 2, spaced: grid }" :style="rows" :aria-label="w.rooms">
      <li v-if="take">
        <button v-if="!coached" type="button" class="cell open" data-spot="take" :disabled="taking" @click="emit('take')">
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

      <li v-for="room in shown" :key="room.name" :data-room="room.name" :style="grid ? { gridColumn: `span ${span(room)}` } : undefined">
        <button
          type="button"
          class="cell"
          :class="{ open: !room.occupant, mine: mine.includes(room.name), lit: lit.includes(room.name), wide: wide(room) }"
          :aria-label="said(room)"
          @click="emit('pick', room)"
        >
          <template v-if="room.occupant">
            <span class="who">
              <Avatar :person="room.occupant" :size="wide(room) ? 52 : 36" decorative />
              <span class="names">
                <span class="name">{{ mine.includes(room.name) ? w.plan.yours : (room.occupant.name ?? room.occupant.login) }}</span>
                <span class="handle">@{{ room.occupant.login }}</span>
              </span>
              <span v-if="wide(room) && rent(room)" class="big-rent">
                <strong>{{ fcfa(rent(room)!) }}</strong>
                <span>{{ w.plan.aMonth }}</span>
              </span>
            </span>
            <span class="what-line">
              <span class="what" :class="{ none: !project(room) }">{{ project(room) ?? w.noProject }}</span>
              <StatusPill v-if="trouble(room)" :state="state(room)" />
              <StatusDot v-else class="dot" :state="state(room)" />
            </span>
            <span class="about">{{ about(room) ?? w.plan.noDescription }}</span>
            <span v-if="!wide(room)" class="rent">{{ rent(room) ? fcfa(rent(room)!) : "" }}</span>
            <Icon v-else name="next" :size="22" class="way-in" />
          </template>
          <template v-else>
            <span class="plus"><Icon name="plus" :size="40" /></span>
            <span class="for">{{ freeWord() }}</span>
            <span v-if="rent(room)" class="rent">{{ fcfa(rent(room)!) }}</span>
          </template>
        </button>
      </li>

      <li v-if="hidden" :style="grid ? { gridColumn: `span ${grid.openSpan}` } : undefined">
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
/* Lived-in rooms take the height, free ones a low row: its rows come from planGrid. */
.room-tiles.spaced { grid-template-columns: repeat(12, minmax(0, 1fr)); }
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
.cell.lit { background: var(--accent-soft); }
.who { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 4px; }
/* A room alone across the plan: more to say, so everything's larger, and its rent up beside its tenant. */
.cell.wide { position: relative; padding: 16px; }
.wide .who { gap: 12px; }
.wide .name { font-size: 17px; }
.wide .handle { font-size: 15px; }
.wide .what { font-size: 34px; }
.wide .about { padding-right: 32px; font-size: 15px; }
.big-rent { flex: none; margin-left: auto; display: grid; justify-items: end; gap: 1px; font-size: 13px; line-height: 1.2; color: var(--muted); }
.big-rent strong { font: 800 22px/1.1 var(--num); color: var(--text); white-space: nowrap; }
.way-in { position: absolute; right: 14px; bottom: 14px; }
.names { min-width: 0; display: grid; }
.name, .handle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 15px; font-weight: 700; line-height: 1.15; }
.mine .name { font-weight: 800; }
.handle { font-size: 13px; font-weight: 600; line-height: 1.2; color: var(--muted); }
/* The project is the biggest thing on the tile, low down, with how it's doing right beside it. */
.what-line { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: auto; }
.what-line > :not(.what) { flex: none; }
.what, .about { min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-box-orient: vertical; }
.about { flex: none; }
.what { flex: 0 1 auto; font-size: 20px; font-weight: 800; line-height: 1.12; -webkit-line-clamp: 2; line-clamp: 2; }
.what.none { color: var(--muted); }
.about { font-size: 14px; line-height: 1.2; color: var(--muted); -webkit-line-clamp: 2; line-clamp: 2; }
.rent { flex: none; font: 700 14px/1 var(--num); white-space: nowrap; color: var(--muted); }
.rent.key { font: 800 15px/1 var(--font); color: var(--panel-red); }
.dot { width: 12px; height: 12px; animation: none; }
/* A free room: no floor yet, only its outline, and a large plus in the middle. */
.cell.open { align-items: center; justify-content: center; text-align: center; background: none; box-shadow: inset 0 0 0 2px var(--fill); }
button.cell.open:hover:not(:disabled) { background: var(--tile); }
.cell.open.lit { background: var(--accent-soft); }
.plus { flex: none; display: grid; color: var(--free); }
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
  /* One line that runs to its ellipsis, not cut at the first hyphen of a repo's name. */
  .what { display: block; font-size: 15px; white-space: nowrap; }
}
@media (prefers-reduced-motion: reduce) {
  .cell { transition: none; }
}
</style>
