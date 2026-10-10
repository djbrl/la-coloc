<script setup lang="ts">
// The people of a house as a line-up of faces under its name, like a party in a game: a face and a first name
// each, a crown on the chef, a ring around you, then anyone knocking at the door, then an empty seat for each free
// room. Picking a face asks the parent to show that person's room (or open their knock). With more faces than
// fit, the line scrolls sideways inside itself.
import Avatar from "../../Avatar.vue";
import type { Seat } from "./crew";
import Icon from "./Icon.vue";

defineProps<{ seats: Seat[] }>();
const emit = defineEmits<{ pick: [seat: Seat] }>();

const first = (p: { name: string | null; login: string }) => (p.name ?? p.login).split(" ")[0];

// What a reader hears for each seat: who, what they are here, and what picking them does.
function said(s: Seat): string {
  if (s.kind === "free") return `A free room, ${s.room}. Show it`;
  const name = s.person.name ?? s.person.login;
  if (s.kind === "knock") return `${name} is knocking on room ${s.room}. Open their knock`;
  const who = [name, s.chef ? "the chef" : null, s.you ? "you" : null].filter(Boolean).join(", ");
  return `${who}. Show their room`;
}
</script>

<template>
  <ul class="crew" aria-label="Who lives here">
    <li v-for="s in seats" :key="s.key">
      <!-- Someone without a room has nothing to show below: their face is just a face. -->
      <span v-if="s.kind === 'person' && !s.room" class="seat" :class="{ you: s.you }">
        <span class="face">
          <Avatar :person="s.person" :size="44" decorative />
          <span v-if="s.chef" class="badge crown" aria-hidden="true"><Icon name="crown" :size="12" /></span>
        </span>
        <span class="name">{{ first(s.person) }}</span>
        <span class="sr-only">{{ s.chef ? ", the chef" : "" }}{{ s.you ? ", you" : "" }}</span>
      </span>
      <button
        v-else
        type="button"
        class="seat"
        :class="{ you: s.kind === 'person' && s.you, free: s.kind === 'free', knock: s.kind === 'knock' }"
        :aria-label="said(s)"
        :title="s.kind === 'knock' ? s.person.name ?? s.person.login : undefined"
        @click="emit('pick', s)"
      >
        <span class="face">
          <span v-if="s.kind === 'free'" class="hole" />
          <Avatar v-else :person="s.person" :size="44" decorative />
          <span v-if="s.kind === 'person' && s.chef" class="badge crown"><Icon name="crown" :size="12" /></span>
          <span v-if="s.kind === 'knock'" class="badge bell"><Icon name="knock" :size="12" /></span>
        </span>
        <!-- No label under an empty seat or a knock: the dashed circle and the bell say it, the hidden name in words. -->
        <span v-if="s.kind !== 'free'" class="name">{{ first(s.person) }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
/* One line; past seven or so faces it scrolls sideways, inside itself. The padding leaves room for your ring. */
.crew {
  display: flex;
  gap: 4px;
  margin: 0 -4px;
  padding: 4px 4px 2px;
  list-style: none;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}
.crew > li { flex: none; }
.seat {
  display: grid;
  justify-items: center;
  gap: 3px;
  width: 60px;
  min-height: 0;
  padding: 0;
  border-radius: 14px;
  background: none;
  color: var(--text);
  font-size: 12px;
  line-height: 14px;
}
button.seat:hover:not(:disabled) { background: none; }
button.seat:hover .face, button.seat:focus-visible .face { transform: translateY(-2px); }
.face { position: relative; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; transition: transform 0.15s var(--ease); }
.you .face { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent-fill); }
/* An empty seat: a dashed circle where a face would be. */
.hole { width: 44px; height: 44px; border-radius: 50%; border: 2px dashed var(--border); }
button.free:hover .hole { border-color: var(--accent-fill); }
.badge {
  position: absolute;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface);
}
.crown { top: -6px; right: -6px; background: var(--warn-soft); color: var(--warn); }
.bell { right: -4px; bottom: -4px; background: var(--accent-fill); color: var(--on-accent); }
.name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.you .name { font-weight: 700; }
.knock .name { color: var(--accent); font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .face { transition: none; }
  button.seat:hover .face, button.seat:focus-visible .face { transform: none; }
}
</style>
