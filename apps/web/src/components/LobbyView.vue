<script setup lang="ts">
// Mounts the 3D lobby and draws what sits on top of it: the door prompt, the controls, the legend.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Lobby } from "../lobby/Lobby";
import { me } from "../session";
import type { CityHouse } from "../types";

const props = defineProps<{ houses: CityHouse[] }>();
const router = useRouter();
const host = ref<HTMLElement | null>(null);
const near = ref<CityHouse | null>(null);
const failed = ref(false);
let lobby: Lobby | null = null;

onMounted(() => {
  try {
    lobby = new Lobby(
      host.value!,
      {
        onNear: (h) => (near.value = h),
        onEnter: (h) => router.push(`/houses/${h.id}`),
      },
      me.value?.login ?? null,
    );
    lobby.setCity(props.houses);
  } catch {
    // No WebGL (old phone, disabled GPU): the list view still works.
    failed.value = true;
  }
});

// Rebuild when the city changes (a room fills up, a house goes online).
watch(
  () => props.houses,
  (houses) => lobby?.setCity(houses),
);

onBeforeUnmount(() => lobby?.dispose());

const free = (h: CityHouse) => h.rooms.filter((r) => !r.occupant).length;
</script>

<template>
  <div class="lobby">
    <div ref="host" class="stage" role="img" aria-label="The city as a 3D neighbourhood. Use the list view for a text version." />
    <p v-if="failed" class="failed">Your browser can't show the 3D lobby. Switch to the list.</p>

    <div v-if="near" class="prompt" role="status">
      <div>
        <strong>{{ near.name }}</strong>
        <span class="muted"> · {{ near.city }}<template v-if="free(near)"> · {{ free(near) }} free</template></span>
      </div>
      <button class="primary" @click="lobby?.enterNear()">Enter <kbd>E</kbd></button>
    </div>

    <p class="help muted"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or click to walk · click a house to go in</p>
    <p class="legend">
      <span><i class="sw lit" /> lived in</span>
      <span><i class="sw free" /> free room</span>
      <span><i class="sw making" /> in the making</span>
    </p>
  </div>
</template>

<style scoped>
.lobby { position: relative; height: min(70vh, 640px); min-height: 380px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); background: #a9c6e8; }
.stage { position: absolute; inset: 0; }
.stage :deep(canvas) { display: block; }
.failed { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--text); background: var(--surface); }
.prompt { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 16px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25); white-space: nowrap; }
.prompt .muted { font-size: 13px; }
.help { position: absolute; left: 12px; bottom: 8px; margin: 0; font-size: 12px; background: var(--surface); padding: 2px 8px; border-radius: 8px; }
.legend { position: absolute; right: 12px; bottom: 8px; margin: 0; display: flex; gap: 10px; font-size: 12px; background: var(--surface); padding: 2px 8px; border-radius: 8px; }
.sw { display: inline-block; width: 12px; height: 9px; border-radius: 2px; vertical-align: -1px; margin-right: 3px; }
.sw.lit { background: #ffc96b; }
.sw.free { background: #1e2638; box-shadow: 0 0 0 1.5px #6f9cff inset; }
.sw.making { border: 1.5px dashed #e0a640; }
.primary kbd { background: transparent; border-color: currentColor; color: inherit; }
kbd { font: 11px ui-monospace, monospace; padding: 0 4px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; margin: 0 1px; background: var(--bg); }
@media (max-width: 520px) {
  .help { display: none; }
}
</style>
