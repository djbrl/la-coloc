<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { postJSON } from "../session";
import type { HouseStatus, Room, Viewer } from "../types";
import Avatar from "./Avatar.vue";

const props = defineProps<{
  houseId: string;
  houseStatus: HouseStatus;
  houseDemo: boolean;
  room: Room;
  agentOnline: boolean;
  viewer: Viewer | null;
  chefLogin: string | null;
  // Reviews this flatmate has given and received.
  ledger?: { given: number; received: number };
}>();

const router = useRouter();
const knocking = ref(false);
const knockMessage = ref("");
const knockRepo = ref("");
const knockError = ref("");

const mine = computed(() => props.viewer?.room === props.room.name);
// The chef can deploy into any room; everyone else only into their own.
const canDeploy = computed(() => !!props.room.occupant && (mine.value || props.viewer?.role === "chef"));
const statusLabel = computed(() => (props.houseStatus === "making" ? "signed up" : props.room.status));

const memory = computed(() => {
  const u = props.room.usage;
  if (!u || !u.memoryLimitBytes) return null;
  return { mb: Math.round(u.memoryBytes / 1048576), pct: Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100)) };
});

async function knock() {
  knockError.value = "";
  if (!knockMessage.value.trim()) {
    knockError.value = "Say what you'd build in this room.";
    return;
  }
  const repo = knockRepo.value.trim();
  if (repo && !repo.startsWith("https://")) {
    knockError.value = "The repo link should start with https://";
    return;
  }
  const res = await postJSON<{ id: string }>(`/api/houses/${props.houseId}/knock`, {
    room: props.room.name,
    message: knockMessage.value.trim(),
    repo: repo || null,
  });
  if (res.ok) router.push(`/applications/${res.data.id}`);
  else knockError.value = res.message;
}
</script>

<template>
  <article class="room" :class="[room.occupant ? room.status : 'free', { mine }]">
    <template v-if="room.occupant">
      <header>
        <Avatar :person="room.occupant" :size="32" />
        <div class="who">
          <strong>{{ room.occupant.name ?? room.occupant.login }}</strong>
          <span class="muted">@{{ room.occupant.login }}<template v-if="room.occupant.login === chefLogin"> · chef</template></span>
        </div>
        <span class="pill" :class="houseStatus === 'making' ? 'making' : room.status">{{ statusLabel }}</span>
      </header>
      <p v-if="ledger && (ledger.given || ledger.received)" class="ledger muted">{{ ledger.given }} {{ ledger.given === 1 ? "review" : "reviews" }} given · {{ ledger.received }} received</p>
      <div v-if="room.project" class="project">
        <strong>{{ room.project }}</strong>
        <p v-if="room.projectDescription" class="muted">{{ room.projectDescription }}</p>
      </div>
      <a v-if="room.url && room.status !== 'empty'" :href="room.url" target="_blank" rel="noopener">{{ room.url.replace(/^https?:\/\//, "") }}</a>

      <div v-if="memory" class="meter" :title="`${memory.mb} MB of ${room.limits.memoryMb} MB`">
        <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
      </div>
      <p class="limits muted">
        {{ room.limits.memoryMb }} MB · {{ room.limits.cpus }} CPU<template v-if="room.usage"> · using {{ room.usage.cpuPercent.toFixed(1) }}% CPU, {{ memory?.mb }} MB</template>
      </p>

      <RouterLink v-if="canDeploy && houseStatus === 'live'" class="manage" :to="`/houses/${houseId}/rooms/${room.name}`">
        {{ mine ? "Manage your room" : "Manage as chef" }} →
      </RouterLink>
    </template>

    <template v-else>
      <header>
        <span class="door" aria-hidden="true">🚪</span>
        <div class="who">
          <strong>Free room</strong>
          <span class="muted">{{ room.limits.memoryMb }} MB · {{ room.limits.cpus }} CPU</span>
        </div>
      </header>
      <p class="ad">{{ room.ad ?? "Open to anyone who ships." }}</p>
      <template v-if="!viewer?.member">
        <p v-if="houseDemo" class="muted small">Demo house: nobody lives here to answer the door.</p>
        <RouterLink v-else-if="!viewer" class="knock" to="/login">Log in to knock</RouterLink>
        <RouterLink v-else-if="viewer.application" class="knock" :to="`/applications/${viewer.application}`">You knocked: open the thread</RouterLink>
        <button v-else-if="!knocking" class="knock primary" @click="knocking = true">Knock</button>
        <form v-else class="knock-form" @submit.prevent="knock">
          <textarea v-model="knockMessage" rows="3" maxlength="2000" placeholder="Who you are, and what you'd build in this room" aria-label="Your note to the house" @input="knockError = ''" />
          <input v-model="knockRepo" placeholder="https://github.com/you/your-app (optional)" aria-label="Your repo" />
          <div class="row">
            <button type="button" @click="knocking = false">Cancel</button>
            <button class="primary">Send knock</button>
          </div>
          <p v-if="knockError" class="message" role="alert">{{ knockError }}</p>
        </form>
      </template>
    </template>
  </article>
</template>

<style scoped>
.room { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: grid; gap: 8px; align-content: start; }
.room.live { border-color: var(--live); }
.room.down, .room.failed { border-color: var(--danger); }
.room.free { border: 1.5px dashed var(--accent); background: transparent; }
.room.mine { box-shadow: 0 0 0 2px var(--accent-soft); }
header { display: flex; align-items: center; gap: 10px; }
.who { display: grid; line-height: 1.3; flex: 1; min-width: 0; }
.who .muted { font-size: 12px; }
.door { font-size: 24px; }
.ledger { margin: 0; font-size: 12px; }
.project p { margin: 0; font-size: 13px; }
a { font-size: 13px; word-break: break-all; }
.meter { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.fill { height: 100%; background: var(--live); transition: width 0.4s; }
.fill.high { background: var(--warn); }
.limits { margin: 0; font-size: 12px; }
.manage { padding-top: 8px; border-top: 1px solid var(--border); font-size: 14px; font-weight: 600; text-decoration: none; }
.message { margin: 0; font-size: 13px; color: var(--danger); }
.ad { margin: 0; }
.knock { justify-self: start; }
a.knock { font-size: 14px; }
.small { margin: 0; font-size: 12px; }
.knock-form { display: grid; gap: 6px; }
.knock-form textarea { font: inherit; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); resize: vertical; }
.row { display: flex; gap: 6px; justify-content: flex-end; }
</style>
