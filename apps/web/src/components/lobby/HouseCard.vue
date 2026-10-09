<script setup lang="ts">
// A house, seen from the street: who lives in it, which rooms are free, and who's around right now.
import { computed } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import Avatar from "../Avatar.vue";
import { type CityRoom, freeRooms, listNames, nameOf, sentence, statusLine } from "./cards";
import LobbyCard from "./LobbyCard.vue";

const props = defineProps<{
  house: CityHouse;
  // Everyone online in this neighbourhood, by login.
  others: Set<string>;
  // Standing at its door already? Then there's nowhere to walk.
  near: boolean;
}>();
const emit = defineEmits<{ knock: [room: CityRoom]; walk: []; close: [] }>();

const mine = computed(() => me.value?.houses.some((h) => h.id === props.house.id) ?? false);
const free = computed(() => freeRooms(props.house));
// Knocking needs someone to answer the door: a real house, and you logged in and not already living there.
const canKnock = computed(() => !!me.value && !props.house.demo && !mine.value);

const lede = computed(() => {
  const h = props.house;
  const parts = [`${h.city}.`, statusLine(h)];
  if (h.demo) parts.push("A sample house.");
  if (h.tagline) parts.push(sentence(h.tagline));
  return parts.join(" ");
});

// Flatmates who are walking around this neighbourhood right now.
const hereLine = computed(() => {
  const names = props.house.rooms.filter((r) => r.occupant && props.others.has(r.occupant.login)).map((r) => nameOf(r.occupant!));
  if (!names.length) return "";
  return `${listNames(names)} ${names.length === 1 ? "is" : "are"} here right now.`;
});
</script>

<template>
  <LobbyCard :label="`${house.name}, a house in ${house.city}`">
    <h2>{{ house.name }}</h2>
    <p>{{ lede }}</p>
    <p v-if="mine" class="soft">This is your house.</p>
    <p v-else-if="hereLine" class="soft">{{ hereLine }}</p>

    <ul class="rooms">
      <li v-for="room in house.rooms" :key="room.name">
        <template v-if="room.occupant">
          <Avatar :person="room.occupant" :size="32" decorative />
          <span class="grow">
            <strong>{{ nameOf(room.occupant) }}</strong> <span class="soft">@{{ room.occupant.login }}</span>
            <span class="soft line small">{{ room.project ? `Building ${room.project}.` : `Room ${room.name}.` }}</span>
          </span>
        </template>
        <template v-else>
          <span class="door" aria-hidden="true" />
          <span class="grow">
            <strong>Free</strong><span class="soft">, {{ room.name }}</span>
            <span class="soft line small">{{ room.ad ? sentence(room.ad) : "Open to anyone who ships." }}</span>
          </span>
          <button v-if="canKnock" class="link" :aria-label="`Knock on room ${room.name}`" @click="emit('knock', room)">Knock</button>
        </template>
      </li>
    </ul>

    <p v-if="free.length && house.demo && !mine" class="soft small">A sample house: nobody's in to answer the door.</p>
    <RouterLink v-else-if="free.length && !me" to="/login">Log in to knock ›</RouterLink>

    <div class="actions">
      <RouterLink :to="`/houses/${house.id}`">Open the house page ›</RouterLink>
      <button v-if="!near" class="link" @click="emit('walk')">Walk there</button>
      <button class="link quiet" @click="emit('close')">Close</button>
    </div>
  </LobbyCard>
</template>

<style scoped>
.rooms { list-style: none; margin: 4px 0 0; padding: 0; display: grid; }
.rooms li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.12); font-size: 15px; }
.grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.door { width: 32px; height: 32px; flex: none; border-radius: 8px; border: 2px solid #6f9cff; box-shadow: 0 0 10px rgba(111, 156, 255, 0.6); }
</style>
