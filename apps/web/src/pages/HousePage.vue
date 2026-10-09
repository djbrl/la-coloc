<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import ChatPanel from "../components/ChatPanel.vue";
import FridgeDoor from "../components/FridgeDoor.vue";
import RoomCard from "../components/RoomCard.vue";
import type { HouseView } from "../types";

const props = defineProps<{ id: string }>();
const house = ref<HouseView | null>(null);
const error = ref("");
let source: EventSource | null = null;

async function open(id: string) {
  source?.close();
  house.value = null;
  error.value = "";
  const res = await fetch(`/api/houses/${encodeURIComponent(id)}`).catch(() => null);
  if (!res?.ok) {
    error.value = res?.status === 404 ? "This house doesn't exist." : "Couldn't reach the API.";
    return;
  }
  house.value = await res.json();
  // The API pushes the whole house view whenever something changes.
  source = new EventSource(`/api/houses/${encodeURIComponent(id)}/stream`);
  source.addEventListener("house", (e) => (house.value = JSON.parse((e as MessageEvent).data)));
}

watch(() => props.id, open, { immediate: true });
onBeforeUnmount(() => source?.close());

const occupied = computed(() => house.value?.rooms.filter((r) => r.occupant).length ?? 0);
const perPerson = computed(() => {
  const h = house.value;
  if (!h?.monthlyCostFcfa) return null;
  // An estimate: the real bill splits by usage at month end.
  return Math.round(h.monthlyCostFcfa / Math.max(1, h.rooms.length) / 100) * 100;
});
const fcfa = (n: number) => n.toLocaleString("fr-FR") + " FCFA";
</script>

<template>
  <p v-if="error" class="error">{{ error }} <RouterLink to="/">Back to the city</RouterLink></p>
  <template v-else-if="house">
    <RouterLink to="/" class="back">← The city</RouterLink>
    <section class="head">
      <div class="title">
        <h1>{{ house.name }}</h1>
        <p class="muted">{{ house.city }} · {{ occupied }}/{{ house.rooms.length }} rooms</p>
        <p v-if="house.tagline" class="tagline">{{ house.tagline }}</p>
        <div class="tags">
          <span v-if="house.status === 'making'" class="pill making">In the making: server not rented yet</span>
          <span v-else class="pill" :class="{ live: house.agentOnline }"><span class="dot" :class="{ on: house.agentOnline }" /> {{ house.agentOnline ? "Server online" : "Server offline" }}</span>
          <span v-if="house.rules.strictReviews" class="pill">Strict reviews</span>
          <span v-if="house.demo" class="pill" title="A sample house, so the city isn't empty">demo house</span>
          <span v-if="house.viewer?.member" class="pill free">You live here</span>
        </div>
      </div>
      <dl class="facts">
        <div v-if="house.chef">
          <dt>Chef</dt>
          <dd><Avatar :person="house.chef" :size="20" /> {{ house.chef.name ?? house.chef.login }}</dd>
        </div>
        <div v-if="perPerson">
          <dt>Rent</dt>
          <dd>~{{ fcfa(perPerson) }} / month each</dd>
        </div>
        <div>
          <dt>Rooms at</dt>
          <dd class="mono">*.{{ house.domain }}</dd>
        </div>
      </dl>
    </section>

    <!-- Floor plan placeholder: Jib's illustrated floor plan goes here, rooms driven by the same data. -->
    <section class="floor" aria-label="Rooms">
      <RoomCard
        v-for="room in house.rooms"
        :key="room.name"
        :house-id="house.id"
        :house-status="house.status"
        :house-demo="house.demo"
        :room="room"
        :agent-online="house.agentOnline"
        :viewer="house.viewer"
        :chef-login="house.chef?.login ?? null"
      />
    </section>

    <section v-if="house.viewer?.member && house.doorbell?.length" class="doorbell">
      <h2>At the door</h2>
      <RouterLink v-for="d in house.doorbell" :key="d.id" :to="`/applications/${d.id}`" class="knocker">
        <Avatar :person="d.applicant" :size="28" />
        <span><strong>{{ d.applicant.name ?? d.applicant.login }}</strong> knocked on {{ d.room }}</span>
        <span class="pill">{{ d.tally.yes }}/{{ d.tally.needed }} yes</span>
        <span class="go">Answer →</span>
      </RouterLink>
    </section>

    <section v-if="house.viewer?.member" class="living">
      <h2>Living room</h2>
      <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="house.viewer.login" />
    </section>

    <section v-if="house.viewer?.member" class="lower">
      <FridgeDoor :notes="house.notes ?? []" />
      <div class="deploys">
        <h2>Recent deploys</h2>
        <p v-if="!house.deployments?.length" class="muted">Nothing deployed yet.</p>
        <ul>
          <li v-for="d in house.deployments" :key="d.id" :title="d.detail ?? ''">
            <strong>{{ d.room }}</strong> · {{ d.kind }} · {{ d.ref }} —
            <span class="pill" :class="d.status === 'live' ? 'live' : d.status === 'failed' ? 'failed' : 'deploying'">{{ d.status }}</span>
            <p v-if="d.status === 'failed' && d.detail" class="why">{{ d.detail.split("\n")[0] }}</p>
          </li>
        </ul>
      </div>
    </section>
    <p v-else class="private muted">The fridge door and deploy history are for flatmates.</p>
  </template>
  <p v-else class="muted">Opening the door…</p>
</template>

<style scoped>
.error { color: var(--danger); }
.back { display: inline-block; margin-bottom: 12px; font-size: 14px; text-decoration: none; }
.head { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
.title { flex: 1 1 360px; }
.title p { margin: 4px 0 0; }
.tagline { font-size: 16px; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.tags .dot { vertical-align: 0; margin-right: 2px; }
.facts { margin: 0; display: grid; gap: 8px; align-content: start; min-width: 220px; }
.facts div { display: grid; }
.facts dt { font-size: 12px; color: var(--muted); }
.facts dd { margin: 0; display: flex; align-items: center; gap: 6px; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.floor { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
.lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.deploys ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.deploys li { padding: 6px 0; border-bottom: 1px solid var(--border); }
.why { margin: 2px 0 0; color: var(--danger); }
.private { font-size: 13px; }
.doorbell { display: grid; gap: 8px; margin-bottom: 24px; }
.knocker { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1.5px solid var(--accent); border-radius: 12px; background: var(--accent-soft); color: var(--text); text-decoration: none; flex-wrap: wrap; }
.knocker .go { margin-left: auto; color: var(--accent); font-weight: 600; }
.living { margin-bottom: 24px; }
</style>
