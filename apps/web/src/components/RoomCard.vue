<script setup lang="ts">
// One room on the floor plan: who lives there and what runs in it, or a free door to knock on.
import { computed, ref } from "vue";
import type { HouseStatus, Room, Viewer } from "../types";
import Avatar from "./Avatar.vue";
import KnockSteps from "./KnockSteps.vue";

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

const knocking = ref(false);

const mine = computed(() => props.viewer?.room === props.room.name);
// The chef can deploy into any room; everyone else only into their own.
const canDeploy = computed(() => !!props.room.occupant && (mine.value || props.viewer?.role === "chef"));
const isChef = computed(() => !!props.room.occupant && props.room.occupant.login === props.chefLogin);

// The room's state as a dot and a few words.
const status = computed(() => {
  if (props.houseStatus === "making") return { dot: "making", text: "Signed up, waiting for the server" };
  return (
    {
      live: { dot: "live", text: "Live" },
      deploying: { dot: "deploying", text: "Deploying" },
      down: { dot: "down", text: "Down right now" },
      failed: { dot: "failed", text: "The last deploy failed" },
      empty: { dot: "", text: "Nothing deployed yet" },
    } as const
  )[props.room.status];
});

const memory = computed(() => {
  const u = props.room.usage;
  if (!u || !u.memoryLimitBytes) return null;
  return { mb: Math.round(u.memoryBytes / 1048576), pct: Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100)) };
});
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <article class="room" :class="{ free: !room.occupant, mine }">
    <template v-if="room.occupant">
      <div class="who">
        <Avatar :person="room.occupant" :size="44" decorative />
        <div>
          <h3>{{ room.occupant.name ?? room.occupant.login }}</h3>
          <p class="muted small">
            @{{ room.occupant.login }}<template v-if="isChef">, the chef</template><template v-if="mine">. This is your room.</template>
          </p>
        </div>
      </div>

      <p v-if="room.project" class="project">
        <strong>{{ room.project }}</strong><template v-if="room.projectDescription">. {{ room.projectDescription }}</template>
      </p>

      <p class="small">
        <span class="dot" :class="status.dot" aria-hidden="true" />{{ status.text }}<template v-if="houseStatus === 'live' && room.url && room.status !== 'empty'"> at
          <a :href="room.url" target="_blank" rel="noopener">{{ room.url.replace(/^https?:\/\//, "") }}</a></template>.
      </p>

      <div class="usage">
        <div v-if="memory" class="meter" role="img" :aria-label="`Using ${memory.mb} of ${room.limits.memoryMb} MB of memory`">
          <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
        </div>
        <p class="muted small">
          {{ room.limits.memoryMb }} MB and {{ room.limits.cpus }} CPU<template v-if="room.usage">, using {{ room.usage.cpuPercent.toFixed(1) }}% CPU and {{ memory?.mb }} MB</template>.
          <template v-if="ledger && (ledger.given || ledger.received)">
            Gave {{ plural(ledger.given, "review", "reviews") }}, got {{ ledger.received }}.
          </template>
        </p>
      </div>

      <RouterLink v-if="canDeploy && houseStatus === 'live'" class="more" :to="`/houses/${houseId}/rooms/${room.name}`">
        {{ mine ? "Manage your room" : "Manage as chef" }} <span aria-hidden="true">›</span>
      </RouterLink>
    </template>

    <template v-else>
      <div class="who">
        <span class="door" aria-hidden="true" />
        <div>
          <h3>A free room</h3>
          <p class="muted small">{{ room.limits.memoryMb }} MB and {{ room.limits.cpus }} CPU.</p>
        </div>
      </div>
      <p class="project">{{ room.ad ?? "Open to anyone who ships." }}</p>
      <template v-if="!viewer?.member">
        <p v-if="houseDemo" class="muted small">This is a sample house. Nobody lives here to answer the door.</p>
        <RouterLink v-else-if="!viewer" class="more" to="/login">Log in to knock <span aria-hidden="true">›</span></RouterLink>
        <RouterLink v-else-if="viewer.application" class="more" :to="`/applications/${viewer.application}`">
          You knocked. Open the thread <span aria-hidden="true">›</span>
        </RouterLink>
        <button v-else class="link knock" :aria-label="`Knock on room ${room.name}`" @click="knocking = true">
          Knock <span aria-hidden="true">›</span>
        </button>
      </template>
      <KnockSteps v-if="knocking" :house-id="houseId" :room="room" @close="knocking = false" />
    </template>
  </article>
</template>

<style scoped>
.room { display: grid; gap: 14px; align-content: start; padding: 28px; border-radius: 22px; background: var(--tile); min-width: 0; }
/* A free room is an open door: no fill, only a faint outline. */
.room.free { background: transparent; box-shadow: inset 0 0 0 1px var(--border); }
.room.mine { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.who { display: flex; align-items: center; gap: 14px; min-width: 0; }
.who > div { min-width: 0; }
.who h3 { overflow-wrap: anywhere; }
.project { overflow-wrap: anywhere; }
.small a { overflow-wrap: anywhere; }
.usage { display: grid; gap: 8px; }
.door { width: 44px; height: 44px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1.5px var(--accent-fill); position: relative; }
.door::after { content: ""; position: absolute; left: 15px; top: 11px; width: 14px; height: 22px; border-radius: 3px 3px 0 0; border: 1.5px solid var(--accent-fill); border-bottom: none; }
.more, .knock { justify-self: start; margin-top: auto; font-size: 17px; }
</style>
