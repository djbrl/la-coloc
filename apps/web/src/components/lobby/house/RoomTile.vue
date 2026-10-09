<script setup lang="ts">
// One room as a small tile: a state icon, who lives there (or "Free"), their project, and one action at most.
// No sentences here; the state is read out to screen readers only.
import { computed } from "vue";
import type { HouseStatus, Room } from "../../../types";
import Avatar from "../../Avatar.vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons";

const props = defineProps<{
  room: Room;
  houseStatus: HouseStatus;
  // The viewer's own room.
  mine: boolean;
  // The chef lives here.
  chef: boolean;
  // The one button on the tile: open it (yours), knock (free, and you may), or none.
  action: "open" | "knock" | null;
}>();
const emit = defineEmits<{ open: []; knock: [] }>();

// The state as an icon, a colour, and the words a reader hears.
const state = computed((): { icon: IconName; tone: string; text: string } => {
  if (!props.room.occupant) return { icon: "door", tone: "free", text: "Free" };
  if (props.houseStatus === "making") return { icon: "cone", tone: "making", text: "Waiting for the server" };
  switch (props.room.status) {
    case "live":
      return { icon: "window", tone: "live", text: "Live" };
    case "deploying":
      return { icon: "spin", tone: "making", text: "Deploying" };
    case "down":
    case "failed":
      return { icon: "warn", tone: "down", text: props.room.status === "down" ? "Down" : "Last deploy failed" };
    default:
      return { icon: "window", tone: "", text: "Nothing deployed yet" };
  }
});

const name = computed(() => (props.room.occupant ? (props.room.occupant.name ?? props.room.occupant.login) : "Free"));

// Memory in use, as a share of the room's limit.
const usage = computed(() => {
  const u = props.room.usage;
  if (!u || !u.memoryLimitBytes) return null;
  return Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100));
});
</script>

<template>
  <article class="tile" :class="{ free: !room.occupant, mine }" :aria-label="`${name}, room ${room.name}, ${state.text}`">
    <div class="top">
      <span class="state" :class="state.tone" role="img" :aria-label="state.text"><Icon :name="state.icon" :size="20" /></span>
      <span v-if="chef" class="chef" aria-label="The chef">chef</span>
    </div>

    <div class="who">
      <Avatar v-if="room.occupant" :person="room.occupant" :size="36" decorative />
      <span v-else class="hole" aria-hidden="true" />
      <span class="name">{{ name }}</span>
    </div>
    <p class="project">{{ room.occupant ? (room.project ?? "") : (room.ad ?? "") }}</p>

    <div v-if="usage !== null" class="meter" role="img" :aria-label="`Using ${usage}% of its memory`">
      <div class="fill" :class="{ high: usage >= 80 }" :style="{ width: usage + '%' }" />
    </div>

    <button v-if="action === 'open'" type="button" class="go primary" :aria-label="`Open room ${room.name}`" @click="emit('open')">Open</button>
    <button v-else-if="action === 'knock'" type="button" class="go" :aria-label="`Knock on room ${room.name}`" @click="emit('knock')">Knock</button>
  </article>
</template>

<style scoped>
.tile {
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
  padding: 12px;
  border-radius: 16px;
  background: var(--tile);
}
/* A free room is an open door: no fill, a faint outline. Yours gets the accent ring. */
.tile.free { background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
.tile.mine { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.top { display: flex; justify-content: space-between; align-items: center; min-height: 22px; }
.state { display: inline-grid; place-items: center; color: var(--muted); }
.state.live { color: var(--live); }
.state.making { color: var(--warn); }
.state.down { color: var(--danger); }
.state.free { color: var(--accent); }
.chef { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); }
.who { display: flex; align-items: center; gap: 8px; min-width: 0; }
.hole { width: 36px; height: 36px; flex: none; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--border); }
.name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project { min-height: 1.4em; font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter { height: 4px; border-radius: 2px; background: var(--fill); overflow: hidden; }
.fill { height: 100%; border-radius: 2px; background: var(--accent-fill); }
.fill.high { background: var(--danger); }
.go { min-height: 36px; padding: 0 16px; font-size: 14px; justify-self: start; }
</style>
