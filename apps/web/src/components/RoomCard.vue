<script setup lang="ts">
import { computed, ref } from "vue";
import type { Room } from "../types";

const props = defineProps<{ houseId: string; room: Room; agentOnline: boolean }>();

const repo = ref("");
const path = ref(".");
const sending = ref(false);
const message = ref("");

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
  try {
    const res = await fetch(`/api/houses/${props.houseId}/rooms/${props.room.name}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repo.value.trim(), path: path.value.trim() || "." }),
    });
    if (!res.ok) message.value = (await res.json()).message ?? "Deploy refused.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <article class="room" :class="room.status">
    <header>
      <strong>{{ room.flatmate }}</strong>
      <span class="status">{{ room.status }}</span>
    </header>
    <p class="limits">{{ room.limits.memoryMb }} MB · {{ room.limits.cpus }} CPU</p>
    <a v-if="room.url" :href="room.url" target="_blank" rel="noopener">{{ room.url }}</a>

    <div v-if="memory" class="meter" :title="`${memory.mb} MB used`">
      <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
    </div>
    <p v-if="room.usage" class="usage">CPU {{ room.usage.cpuPercent.toFixed(1) }}% · RAM {{ memory?.mb }} MB</p>

    <form @submit.prevent="deploy">
      <input v-model="repo" placeholder="https://github.com/you/your-app.git" @input="message = ''" />
      <input v-model="path" placeholder="sub-folder (.)" />
      <button :disabled="sending || !agentOnline">{{ sending ? "Sending…" : "Deploy main" }}</button>
      <p v-if="message" class="message">{{ message }}</p>
    </form>
  </article>
</template>

<style scoped>
.room { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: grid; gap: 8px; }
.room.live { border-color: var(--live); }
.room.down, .room.failed { border-color: var(--danger); }
header { display: flex; justify-content: space-between; }
.status { font-size: 12px; color: var(--muted); }
.limits, .usage { margin: 0; font-size: 13px; color: var(--muted); }
a { font-size: 13px; color: var(--accent); word-break: break-all; }
.meter { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.fill { height: 100%; background: var(--live); transition: width 0.4s; }
.fill.high { background: var(--warn); }
form { display: grid; gap: 6px; }
.message { margin: 0; font-size: 13px; color: var(--danger); }
</style>
