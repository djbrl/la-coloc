<script setup lang="ts">
// Someone you met in the street: who they are, which house they live in, and what you can do about it.
import { computed, ref } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import { type CityRoom, freeRooms, type Home, sentence } from "./cards";
import LobbyCard from "./LobbyCard.vue";

const props = defineProps<{
  login: string;
  name: string;
  // Where they live, or null when they're just visiting.
  home: Home | null;
  // Their house, as the city lists it (for the free rooms).
  house: CityHouse | null;
  isMe: boolean;
}>();
const emit = defineEmits<{ knock: [houseId: string, room: CityRoom]; see: [houseId: string]; wave: []; close: [] }>();

const free = computed(() => (props.house ? freeRooms(props.house) : []));
const liveThere = computed(() => !!props.house && (me.value?.houses.some((h) => h.id === props.house!.id) ?? false));
// You can ask to join their house when it has a free room, it's real, you're logged in, and it isn't yours already.
const canAsk = computed(() => !props.isMe && !!props.house && !props.house.demo && free.value.length > 0 && !!me.value && !liveThere.value);
// Several free rooms: pick one first.
const choosing = ref(false);

function ask() {
  if (!props.house) return;
  if (free.value.length === 1) emit("knock", props.house.id, free.value[0]);
  else choosing.value = true;
}
</script>

<template>
  <LobbyCard :label="`${name}, someone in the city`">
    <h2>{{ name }}</h2>
    <p v-if="isMe" class="soft">That's you.</p>
    <p v-if="home" class="home">
      Lives in <strong>{{ home.houseName }}</strong>, {{ home.city }}.
      <span class="soft line">Room {{ home.room }}.<template v-if="home.project"> Building {{ home.project }}.</template></span>
    </p>
    <p v-else class="home soft">Just visiting. No house yet.</p>

    <template v-if="choosing && house">
      <p class="soft">Which room would you knock on?</p>
      <ul class="rooms">
        <li v-for="room in free" :key="room.name">
          <button class="link" @click="emit('knock', house.id, room)">
            Room {{ room.name }}<span class="soft">: {{ room.ad ? sentence(room.ad) : "Open to anyone who ships." }}</span>
          </button>
        </li>
      </ul>
    </template>

    <div class="actions">
      <button v-if="canAsk && !choosing" class="pill" @click="ask">Ask to join {{ home!.houseName }}</button>
      <RouterLink v-else-if="!isMe && house && free.length && !house.demo && !me" to="/login">Log in to ask to join ›</RouterLink>
      <button v-if="home && !isMe" class="link" @click="emit('see', home.houseId)">See {{ home.houseName }}</button>
      <button v-if="!isMe && me" class="link" @click="emit('wave')">Wave</button>
      <button class="link quiet" @click="emit('close')">Close</button>
    </div>
  </LobbyCard>
</template>

<style scoped>
.home { padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.12); }
.rooms { list-style: none; margin: 0; padding: 0; display: grid; }
.rooms button { text-align: left; min-height: 40px; }
</style>
