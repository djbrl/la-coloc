<script setup lang="ts">
// A house's floor plan: the first thing you see when you walk in. One square per room, four across, all the same size
// and laid out the same: whose room it is at the top, then low down the project, with how it's doing as a dot beside
// it, and what the room costs. A free room is a plus on the blue of a free window, with its price. The last square is
// the house itself in numbers: what its server costs a month, for how many rooms. Pressing a square opens the room's
// page (RoomDetails.vue), which says what the plus can mean: knock, take it, or invite someone.
import { computed } from "vue";
import type { HouseView, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import StatusDot from "../panel/StatusDot.vue";
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
  // The workshop: a room is waiting for you, with its own tile at the start. The quest's spotlight points at it
  // (`data-spot`); while its coach has a main action of its own, the tile keeps quiet.
  take: boolean;
  coached?: boolean;
  taking: boolean;
  takeError: string;
  // The foot already talks money (your rent, with one more): the house's own square steps aside.
  noNumbers?: boolean;
}>();
const emit = defineEmits<{ pick: [room: Room]; take: []; more: [] }>();

const rent = (room: Room) => rentOf(props.house, room);
const state = (room: Room) => roomState(room, props.house.status, props.house.demo);
// A seeded room may only have its line: that line is then its title, and it doesn't say it twice.
const project = (room: Room) => room.project ?? seeded(room.projectDescription);
const about = (room: Room) => (room.project ? seeded(room.projectDescription) : null);
const cost = computed(() => houseCost(props.house));
const freeWord = () => (props.knockable ? w.roomForYou : w.plan.freeRoom);
// What a reader hears on a tile: who and what, and what it costs.
function said(room: Room): string {
  const r = rent(room);
  const pays = r ? w.plan.pays(fcfa(r)) : "";
  if (!room.occupant) return `${freeWord()}. ${pays}`;
  const who = props.mine.includes(room.name) ? w.plan.yours : (room.occupant.name ?? room.occupant.login);
  return `${who}, @${room.occupant.login}. ${project(room) ?? w.noProject} ${state(room).word}. ${about(room) ?? ""} ${pays}`;
}
</script>

<template>
  <ul class="room-tiles" :aria-label="w.rooms">
    <li v-if="take">
      <button v-if="!coached" type="button" class="cell open" data-spot="take" :disabled="taking" @click="emit('take')">
        <Icon name="plus" :size="26" class="plus" />
        <span class="foot">
          <span class="what">{{ w.roomForYou }}</span>
          <span class="rent">{{ w.takeIt }}</span>
        </span>
        <span v-if="takeError" class="error" role="alert">{{ takeError }}</span>
      </button>
      <div v-else class="cell open">
        <Icon name="plus" :size="26" class="plus" />
        <span class="foot"><span class="what">{{ w.roomForYou }}</span></span>
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
            <Avatar :person="room.occupant" :size="30" decorative />
            <span class="names">
              <span class="name">{{ mine.includes(room.name) ? w.plan.yours : (room.occupant.name ?? room.occupant.login) }}</span>
              <span class="handle">@{{ room.occupant.login }}</span>
            </span>
          </span>
          <span class="foot">
            <span class="what-line">
              <span class="what" :class="{ none: !project(room) }">{{ project(room) ?? w.noProject }}</span>
              <StatusDot class="dot" :state="state(room)" />
            </span>
            <span class="rent">{{ rent(room) ? fcfa(rent(room)!) : "" }}</span>
          </span>
        </template>
        <template v-else>
          <Icon name="plus" :size="26" class="plus" />
          <span class="foot">
            <span class="what">{{ freeWord() }}</span>
            <span v-if="rent(room)" class="rent">{{ w.plan.pays(fcfa(rent(room)!)).replace(/\.$/, "") }}</span>
          </span>
        </template>
      </button>
    </li>

    <li v-if="hidden">
      <button type="button" class="cell more" :aria-label="w.moreRooms(hidden)" @click="emit('more')">+{{ hidden }}</button>
    </li>

    <!-- The house in numbers, as the last square: what the server costs a month, for how many rooms. -->
    <li v-if="!noNumbers && cost">
      <div class="cell sum">
        <p class="label">{{ w.plan.theHouse }}</p>
        <span class="foot">
          <span class="total">{{ fcfa(cost) }}</span>
          <span class="rent">{{ w.plan.forRooms(house.rooms.length) }}</span>
        </span>
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* Four squares across, all one size (two on a phone). In the lobby's sheet the body scrolls if a big house needs it. */
.room-tiles { flex: none; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 132px; gap: 8px; }
.room-tiles > li { min-width: 0; display: flex; }

/* A square: the soft paper, the inner corner, whose room at the top and the rest on its bottom edge. */
.cell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: 6px;
  padding: 12px;
  border: 0;
  border-radius: var(--tile-r);
  background: var(--tile);
  box-shadow: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  overflow: hidden;
  transition: background-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
button.cell { cursor: pointer; }
button.cell:hover:not(:disabled) { background: var(--fill); }
button.cell:active:not(:disabled) { transform: none; }
button.cell:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
/* Lit for a moment (the foot asked you to pick one): an ink ring, so it shows on the paper and on the blue alike. */
.cell.lit { box-shadow: inset 0 0 0 2px var(--text); }
.who { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; }
.names { min-width: 0; display: grid; }
.name, .handle, .what, .rent, .total { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name { font-size: 14px; font-weight: 800; line-height: 18px; }
.handle { font-size: 12px; font-weight: 600; line-height: 16px; color: var(--muted); }
.foot { flex: none; display: grid; gap: 2px; min-width: 0; }
/* The project, the biggest words on the square, with how it's doing as a dot right after it. */
.what-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.what { flex: 0 1 auto; font-size: 16px; font-weight: 800; line-height: 20px; }
.what.none { color: var(--muted); }
.dot { width: 9px; height: 9px; animation: none; }
.rent { font-size: 13px; font-weight: 600; line-height: 17px; color: var(--muted); font-variant-numeric: tabular-nums; }
/* A free room: the blue of a free window in the city, a plus at the top, what it costs at the bottom. */
.cell.open { background: var(--free-soft); color: var(--free); box-shadow: inset 0 0 0 2px var(--free); }
button.cell.open:hover:not(:disabled) { background: color-mix(in srgb, var(--free) 16%, var(--surface)); }
.cell.open.lit { box-shadow: inset 0 0 0 2px var(--free), inset 0 0 0 4px var(--surface), inset 0 0 0 6px var(--free); }
.cell.open .rent { color: inherit; }
.plus { color: var(--free); }
.more { align-items: center; justify-content: center; font: 800 22px/1 var(--num); color: var(--muted); }
/* The house itself: white, a faint edge, its cost big on the bottom edge. */
.cell.sum { background: var(--surface); box-shadow: inset 0 0 0 2px var(--line); }
.cell.sum .rent { white-space: normal; }
.total { font-size: 20px; font-weight: 800; line-height: 24px; font-variant-numeric: tabular-nums; }
.error { font-size: 13px; line-height: 1.2; color: var(--danger); }
@media (max-width: 560px) {
  .room-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 120px; }
}
@media (prefers-reduced-motion: reduce) {
  .cell { transition: none; }
}
</style>
