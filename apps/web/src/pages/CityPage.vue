<script setup lang="ts">
// The city: a full-screen place to walk around, or (in settings) a plain list of the same houses.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import HouseDrawing from "../components/HouseDrawing.vue";
import LoadingScreen from "../components/LoadingScreen.vue";
import { me, meLoaded } from "../session";
import { settings } from "../settings";
import type { CityHouse } from "../types";

// three.js is big: it only loads when someone opens the lobby, behind the same loading screen.
const LobbyView = defineAsyncComponent({ loader: () => import("../components/LobbyView.vue"), loadingComponent: LoadingScreen, delay: 0 });

const houses = ref<CityHouse[] | null>(null);
const error = ref("");
const show = ref<"all" | "free" | "making">("all");
const search = ref("");
let source: EventSource | null = null;

onMounted(async () => {
  const res = await fetch("/api/city").catch(() => null);
  if (!res?.ok) {
    error.value = "The city can't be reached right now. Try again in a moment.";
    return;
  }
  houses.value = (await res.json()).houses;
  // The API re-sends the city whenever a house changes.
  source = new EventSource("/api/city/stream");
  source.addEventListener("city", (e) => (houses.value = JSON.parse((e as MessageEvent).data).houses));
});
onBeforeUnmount(() => source?.close());

const free = (h: CityHouse) => h.rooms.filter((r) => !r.occupant);
const lived = (h: CityHouse) => h.rooms.filter((r) => r.occupant).length;
const totals = computed(() => {
  const all = houses.value ?? [];
  return { houses: all.length, free: all.reduce((n, h) => n + free(h).length, 0), making: all.filter((h) => h.status === "making").length };
});
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (houses.value ?? []).filter((h) => {
    if (show.value === "free" && !free(h).length) return false;
    if (show.value === "making" && h.status !== "making") return false;
    if (!q) return true;
    // What the house is about, what it's building, what it's looking for, and who lives there.
    return [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad, r.occupant?.login])].join(" ").toLowerCase().includes(q);
  });
});
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function sentence(h: CityHouse): string {
  const parts = [`${h.city}.`];
  if (h.status === "making") parts.push(`${plural(lived(h), "person has", "people have")} signed up; the server isn't rented yet.`);
  else parts.push(`${lived(h)} of ${h.rooms.length} rooms lived in.`);
  const ad = free(h).find((r) => r.ad)?.ad;
  if (ad) parts.push(`${ad}.`);
  if (h.demo) parts.push("A sample house.");
  return parts.join(" ");
}
</script>

<template>
  <div v-if="error" class="list">
    <h1>The city.</h1>
    <p class="lede" role="alert">{{ error }}</p>
  </div>

  <!-- The lobby waits for "who am I", so you walk in as yourself; logging in or out rebuilds it. -->
  <LobbyView v-else-if="settings.view === 'lobby' && houses && meLoaded" :key="me?.login ?? 'visitor'" :houses="houses" />
  <LoadingScreen v-else-if="settings.view === 'lobby'" class="full" />

  <div v-else class="list">
    <h1>The city.</h1>
    <p v-if="houses" class="lede">
      {{ plural(totals.houses, "house", "houses") }}, {{ plural(totals.free, "free room", "free rooms") }}, and {{ totals.making }} still finding their flatmates.
    </p>

    <div class="controls">
      <input v-model="search" type="search" placeholder="Search houses, cities, stacks" aria-label="Search the city" />
      <div class="segmented" role="radiogroup" aria-label="Which houses">
        <button role="radio" :aria-checked="show === 'all'" :class="{ on: show === 'all' }" @click="show = 'all'">Every house</button>
        <button role="radio" :aria-checked="show === 'free'" :class="{ on: show === 'free' }" @click="show = 'free'">With a free room</button>
        <button role="radio" :aria-checked="show === 'making'" :class="{ on: show === 'making' }" @click="show = 'making'">Being set up</button>
      </div>
    </div>

    <p v-if="houses && !shown.length" class="none">No house matches that.</p>
    <ul class="houses">
      <li v-for="h in shown" :key="h.id">
        <RouterLink :to="`/houses/${h.id}`" class="house">
          <HouseDrawing :house="h" class="drawing" aria-hidden="true" />
          <span class="text">
            <span class="name">{{ h.name }}<span v-if="h.agentOnline" class="online" aria-label="server online" /></span>
            <span class="tagline" v-if="h.tagline">{{ h.tagline }}</span>
            <span class="facts">{{ sentence(h) }}</span>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.full { position: fixed; inset: 0; }
.list { max-width: 980px; margin: 0 auto; padding: 96px 22px 80px; }
h1 { margin: 0; font-size: clamp(40px, 6vw, 64px); line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; }
.lede { margin: 12px 0 0; font-size: clamp(19px, 2.2vw, 24px); line-height: 1.4; color: var(--muted, #6e6e73); max-width: 40ch; }
.controls { display: grid; gap: 14px; margin: 48px 0 24px; }
.controls input { width: 100%; min-height: 48px; padding: 12px 18px; border-radius: 14px; border: 0; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; font-size: 17px; }
.segmented { display: inline-grid; grid-auto-flow: column; justify-self: start; padding: 3px; border-radius: 12px; background: color-mix(in srgb, currentColor 6%, transparent); max-width: 100%; overflow-x: auto; }
.segmented button { border: 0; border-radius: 9px; min-height: 38px; padding: 0 16px; background: none; color: inherit; font-size: 15px; white-space: nowrap; cursor: pointer; }
.segmented button.on { background: var(--bg, #fff); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14); font-weight: 500; }
.none { color: var(--muted, #6e6e73); font-size: 17px; }
.houses { list-style: none; margin: 0; padding: 0; }
.house { display: grid; grid-template-columns: 72px 1fr auto; gap: 20px; align-items: center; padding: 22px 0; border-bottom: 1px solid var(--border, #d2d2d7); color: inherit; text-decoration: none; }
.drawing { width: 72px; }
.text { display: grid; gap: 4px; min-width: 0; }
.name { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
.online { width: 8px; height: 8px; border-radius: 50%; background: #34c759; }
.tagline { font-size: 17px; }
.facts { font-size: 15px; line-height: 1.45; color: var(--muted, #6e6e73); }
.chevron { font-size: 28px; color: var(--muted, #86868b); }
.house:hover .name { color: var(--accent, #0071e3); }
.house:focus-visible, .segmented button:focus-visible, .controls input:focus-visible { outline: 3px solid var(--accent, #0071e3); outline-offset: 3px; border-radius: 8px; }
@media (max-width: 520px) {
  .list { padding-top: 80px; }
  .house { grid-template-columns: 52px 1fr; gap: 14px; }
  .drawing { width: 52px; }
  .chevron { display: none; }
}
</style>
