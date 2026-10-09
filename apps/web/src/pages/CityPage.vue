<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import HouseDrawing from "../components/HouseDrawing.vue";
import type { CityHouse } from "../types";

// three.js is big: only load it when someone opens the lobby.
const LobbyView = defineAsyncComponent(() => import("../components/LobbyView.vue"));

const houses = ref<CityHouse[] | null>(null);
const error = ref("");
const show = ref<"all" | "free" | "making">("all");
const city = ref("");
const search = ref("");
let source: EventSource | null = null;

// Lobby or list, remembered per browser. The list is the text version of the same city.
function savedView(): "lobby" | "list" {
  try {
    return localStorage.getItem("coloc.cityView") === "list" ? "list" : "lobby";
  } catch {
    return "lobby";
  }
}
const view = ref<"lobby" | "list">(savedView());
watch(view, (v) => {
  try {
    localStorage.setItem("coloc.cityView", v);
  } catch {
    // Private mode: fine, it just won't be remembered.
  }
});

onMounted(async () => {
  const res = await fetch("/api/city").catch(() => null);
  if (!res?.ok) {
    error.value = "Couldn't reach the city. Is the API running?";
    return;
  }
  houses.value = (await res.json()).houses;
  // The API re-sends the city whenever a house changes.
  source = new EventSource("/api/city/stream");
  source.addEventListener("city", (e) => (houses.value = JSON.parse((e as MessageEvent).data).houses));
});
onBeforeUnmount(() => source?.close());

const free = (h: CityHouse) => h.rooms.filter((r) => !r.occupant);
const cities = computed(() => [...new Set((houses.value ?? []).map((h) => h.city))].sort());
const totals = computed(() => {
  const all = houses.value ?? [];
  return { houses: all.length, free: all.reduce((n, h) => n + free(h).length, 0), making: all.filter((h) => h.status === "making").length };
});

const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (houses.value ?? []).filter((h) => {
    if (show.value === "free" && !free(h).length) return false;
    if (show.value === "making" && h.status !== "making") return false;
    if (city.value && h.city !== city.value) return false;
    if (!q) return true;
    // Search what the house is about, what it's building, and what it's looking for.
    const text = [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad, r.occupant?.login])].join(" ").toLowerCase();
    return text.includes(q);
  });
});
</script>

<template>
  <section class="head">
    <div>
      <h1>The city</h1>
      <p v-if="houses" class="muted">
        {{ totals.houses }} houses · {{ totals.free }} free rooms · {{ totals.making }} in the making
      </p>
    </div>
  </section>

  <p v-if="error" class="error">{{ error }}</p>
  <template v-else-if="houses">
    <section class="filters" aria-label="Filter houses">
      <div class="chips" role="radiogroup">
        <button :class="{ on: show === 'all' }" role="radio" :aria-checked="show === 'all'" @click="show = 'all'">All houses</button>
        <button :class="{ on: show === 'free' }" role="radio" :aria-checked="show === 'free'" @click="show = 'free'">Free rooms</button>
        <button :class="{ on: show === 'making' }" role="radio" :aria-checked="show === 'making'" @click="show = 'making'">In the making</button>
      </div>
      <select v-model="city" aria-label="City">
        <option value="">Every city</option>
        <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
      </select>
      <input v-model="search" type="search" placeholder="mobile, Flutter, fintech…" aria-label="Search houses" />
      <div class="chips views" role="radiogroup" aria-label="View">
        <button :class="{ on: view === 'lobby' }" role="radio" :aria-checked="view === 'lobby'" @click="view = 'lobby'">Lobby</button>
        <button :class="{ on: view === 'list' }" role="radio" :aria-checked="view === 'list'" @click="view = 'list'">List</button>
      </div>
    </section>

    <LobbyView v-if="view === 'lobby'" :houses="shown" />

    <p v-if="!shown.length" class="muted">No house matches. Try another filter.</p>
    <section v-if="view === 'list'" class="street">
      <RouterLink v-for="h in shown" :key="h.id" :to="`/houses/${h.id}`" class="tile">
        <HouseDrawing :house="h" />
        <div class="name">
          <strong>{{ h.name }}</strong>
          <span v-if="h.agentOnline" class="dot on" title="Server online" />
        </div>
        <p class="where muted">{{ h.city }} · {{ h.rooms.filter((r) => r.occupant).length }}/{{ h.rooms.length }}</p>
        <p v-if="h.tagline" class="tagline">{{ h.tagline }}</p>
        <div class="people">
          <Avatar v-for="r in h.rooms.filter((r) => r.occupant)" :key="r.name" :person="r.occupant!" :size="22" />
        </div>
        <div class="tags">
          <span v-if="h.status === 'making'" class="pill making">In the making</span>
          <span v-for="r in free(h).slice(0, 1)" :key="r.name" class="pill free" :title="r.ad ?? ''">{{ r.ad ?? "Free room" }}</span>
          <span v-if="free(h).length > 1" class="pill free">+{{ free(h).length - 1 }}</span>
          <span v-if="h.demo" class="pill" title="A sample house, so the city isn't empty">demo</span>
        </div>
      </RouterLink>
    </section>

    <p v-if="view === 'list'" class="legend muted">
      <span><i class="sw lit" /> lived in</span>
      <span><i class="sw free" /> free room</span>
      <span><i class="sw signed" /> signed up, server not rented yet</span>
    </p>
  </template>
  <p v-else class="muted">Walking into town…</p>
</template>

<style scoped>
.head { margin-bottom: 16px; }
.head p { margin: 4px 0 0; }
.error { color: var(--danger); }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 20px; }
.filters input { flex: 1 1 200px; width: auto; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.views { margin-left: auto; }
.chips button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.street { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.tile { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; align-content: start; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: inherit; text-decoration: none; transition: border-color 0.15s, transform 0.15s; }
.tile:hover, .tile:focus-visible { border-color: var(--accent); transform: translateY(-2px); }
.name { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.where, .tagline { margin: 0; font-size: 13px; }
.tagline { color: var(--text); }
.people { display: flex; gap: 2px; flex-wrap: wrap; min-height: 22px; }
.tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tags .pill { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; margin-top: 20px; }
.sw { display: inline-block; width: 14px; height: 10px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
.sw.lit { background: var(--live); }
.sw.free { border: 1.5px dashed var(--accent); }
.sw.signed { background: var(--warn-soft); border: 1px solid var(--warn); }
</style>
