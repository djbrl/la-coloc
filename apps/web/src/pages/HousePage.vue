<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import FridgeDoor from "../components/FridgeDoor.vue";
import RoomCard from "../components/RoomCard.vue";
import type { HouseView } from "../types";

const props = defineProps<{ id: string }>();
const house = ref<HouseView | null>(null);
const error = ref("");
let source: EventSource | null = null;

onMounted(async () => {
  const res = await fetch(`/api/houses/${props.id}`);
  if (!res.ok) {
    error.value = res.status === 404 ? "This house doesn't exist." : "Couldn't reach the API.";
    return;
  }
  house.value = await res.json();
  // The API pushes the whole house view whenever something changes.
  source = new EventSource(`/api/houses/${props.id}/stream`);
  source.addEventListener("house", (e) => (house.value = JSON.parse((e as MessageEvent).data)));
});

onBeforeUnmount(() => source?.close());
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>
  <template v-else-if="house">
    <section class="head">
      <div>
        <h1>{{ house.name }}</h1>
        <p class="muted">{{ house.rooms.length }} rooms · *.{{ house.domain }}</p>
      </div>
      <span class="agent" :class="{ online: house.agentOnline }">
        {{ house.agentOnline ? "Server online" : "Server offline" }}
      </span>
    </section>

    <!-- Floor plan placeholder: Jib's illustrated SVG goes here. -->
    <section class="floor">
      <RoomCard v-for="room in house.rooms" :key="room.name" :house-id="house.id" :room="room" :agent-online="house.agentOnline" />
    </section>

    <section class="lower">
      <FridgeDoor :notes="house.notes" />
      <div class="deploys">
        <h2>Recent deploys</h2>
        <p v-if="!house.deployments.length" class="muted">Nothing deployed yet.</p>
        <ul>
          <li v-for="d in house.deployments" :key="d.id">
            <strong>{{ d.room }}</strong> · {{ d.kind }} · {{ d.ref }} — {{ d.status }}
          </li>
        </ul>
      </div>
    </section>
  </template>
  <p v-else class="muted">Opening the door…</p>
</template>

<style scoped>
h1 { margin: 0; font-size: 24px; }
h2 { font-size: 16px; margin: 0 0 8px; }
.muted { color: var(--muted); margin: 0; }
.error { color: var(--danger); }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.agent { font-size: 13px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--danger); }
.agent.online { color: var(--live); }
.floor { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
.lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.deploys ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.deploys li { padding: 6px 0; border-bottom: 1px solid var(--border); }
</style>
