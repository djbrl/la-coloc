<script setup lang="ts">
// The people of a house as a line-up of faces under its name, like a party in a game: a face and a first name
// each, a crown on the chef, a ring around you, then anyone knocking at the door, then an empty seat for each free
// room. Picking a face asks the parent to show that person's room (or open their knock). With more faces than
// fit, the line scrolls sideways inside itself.
import Avatar from "../../Avatar.vue";
import BadgeChip from "../../arena/BadgeChip.vue";
import type { Seat } from "./crew";
import Icon from "./Icon.vue";
import { houseWords as w } from "./words";

defineProps<{ seats: Seat[] }>();
const emit = defineEmits<{ pick: [seat: Seat] }>();

const first = (p: { name: string | null; login: string }) => (p.name ?? p.login).split(" ")[0];

// What a reader hears for each seat: who, what they are here, and what picking them does.
function said(s: Seat): string {
  if (s.kind === "free") return w.seatFree(s.room);
  const name = s.person.name ?? s.person.login;
  if (s.kind === "knock") return w.seatKnock(name, s.room);
  const who = [name, s.chef ? w.seatChef : null, s.you ? w.seatYou : null].filter(Boolean).join(", ");
  return w.seatShow(who);
}
</script>

<template>
  <ul class="crew" :aria-label="w.crew">
    <li v-for="s in seats" :key="s.key">
      <!-- Someone without a room has nothing to show below: their face is just a face. -->
      <span v-if="s.kind === 'person' && !s.room" class="seat" :class="{ you: s.you }">
        <span class="face">
          <Avatar :person="s.person" :size="44" decorative />
          <span v-if="s.chef" class="badge crown" aria-hidden="true"><Icon name="crown" :size="12" /></span>
          <BadgeChip v-if="s.person.badge" class="trophy" compact :badge="s.person.badge" />
        </span>
        <span class="name">{{ first(s.person) }}</span>
        <span class="sr-only">{{ s.chef ? `, ${w.seatChef}` : "" }}{{ s.you ? `, ${w.seatYou}` : "" }}</span>
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
          <BadgeChip v-if="s.kind === 'person' && s.person.badge" class="trophy" compact :badge="s.person.badge" />
          <span v-if="s.kind === 'knock'" class="badge bell"><Icon name="knock" :size="12" /></span>
        </span>
        <!-- No label under an empty seat or a knock: the dashed square and the bell say it, the hidden name in words. -->
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
  margin: 0;
  padding: 4px 0 2px;
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
  border-radius: var(--r-md);
  background: none;
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
  line-height: 16px;
}
button.seat:hover:not(:disabled) { background: none; }
button.seat:hover .face, button.seat:focus-visible .face { transform: translateY(-2px); }
.face { position: relative; display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-md); transition: transform 0.15s var(--ease); }
.you .face { box-shadow: 0 0 0 3px var(--panel-red); }
/* An empty seat: a dashed square where a face would be. */
.hole { width: 44px; height: 44px; border-radius: var(--r-md); border: 3px dashed var(--text); }
button.free:hover .hole { border-color: var(--panel-red); }
.badge {
  position: absolute;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface);
}
.crown { top: -6px; right: -6px; background: var(--sticker); color: var(--ink); }
/* A title won in an arena: its trophy on the face's other corner. */
.trophy { position: absolute; left: -5px; bottom: -4px; box-shadow: 0 0 0 2px var(--surface); }
.bell { right: -4px; bottom: -4px; background: var(--accent-fill); color: var(--on-accent); }
.name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.knock .name { color: var(--panel-red); }
@media (prefers-reduced-motion: reduce) {
  .face { transition: none; }
  button.seat:hover .face, button.seat:focus-visible .face { transform: none; }
}
</style>
