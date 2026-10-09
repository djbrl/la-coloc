<script setup lang="ts">
import { computed, ref } from "vue";
import { postJSON } from "../session";
import type { HouseStatus, Room, Viewer } from "../types";
import Avatar from "./Avatar.vue";

const props = defineProps<{
  houseId: string;
  houseStatus: HouseStatus;
  room: Room;
  agentOnline: boolean;
  viewer: Viewer | null;
  chefLogin: string | null;
}>();

const repo = ref("");
const path = ref(".");
const sending = ref(false);
const message = ref("");
const knockNote = ref("");

const mine = computed(() => props.viewer?.room === props.room.name);
// The chef can deploy into any room; everyone else only into their own.
const canDeploy = computed(() => !!props.room.occupant && (mine.value || props.viewer?.role === "chef"));
const statusLabel = computed(() => (props.houseStatus === "making" ? "signed up" : props.room.status));

const memory = computed(() => {
  const u = props.room.usage;
  if (!u || !u.memoryLimitBytes) return null;
  return { mb: Math.round(u.memoryBytes / 1048576), pct: Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100)) };
});

async function deploy() {
  message.value = "";
  if (!repo.value.trim()) {
    message.value = "Enter a repo URL first.";
    return;
  }
  sending.value = true;
  const res = await postJSON(`/api/houses/${props.houseId}/rooms/${props.room.name}/deploy`, {
    repo: repo.value.trim(),
    path: path.value.trim() || ".",
  });
  sending.value = false;
  if (!res.ok) message.value = res.message;
}

function knock() {
  // The doorbell (knock → chat with the house → vote) is next on the roadmap.
  knockNote.value = "Knocking opens with the doorbell, coming next.";
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

      <form v-if="canDeploy && houseStatus === 'live'" class="deploy" @submit.prevent="deploy">
        <p class="label">{{ mine ? "Deploy your room" : `Deploy ${room.occupant.name ?? room.name}'s room (chef)` }}</p>
        <input v-model="repo" placeholder="https://github.com/you/your-app.git" aria-label="Repo URL" @input="message = ''" />
        <input v-model="path" placeholder="sub-folder (.)" aria-label="Sub-folder" />
        <button class="primary" :disabled="sending || !agentOnline">{{ sending ? "Sending…" : agentOnline ? "Deploy main" : "Server offline" }}</button>
        <p v-if="message" class="message" role="alert">{{ message }}</p>
      </form>
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
        <RouterLink v-if="!viewer" class="knock" to="/login">Log in to knock</RouterLink>
        <button v-else class="knock" @click="knock">Knock</button>
        <p v-if="knockNote" class="muted small">{{ knockNote }}</p>
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
.project p { margin: 0; font-size: 13px; }
a { font-size: 13px; word-break: break-all; }
.meter { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.fill { height: 100%; background: var(--live); transition: width 0.4s; }
.fill.high { background: var(--warn); }
.limits { margin: 0; font-size: 12px; }
.deploy { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border); }
.label { margin: 0; font-size: 12px; color: var(--muted); }
.message { margin: 0; font-size: 13px; color: var(--danger); }
.ad { margin: 0; }
.knock { justify-self: start; }
a.knock { font-size: 14px; }
.small { margin: 0; font-size: 12px; }
</style>
