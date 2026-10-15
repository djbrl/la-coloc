<script setup lang="ts">
// The city: a full-screen place to walk around, or (in settings) a plain list of the same houses. The list is the
// lobby's no-3D twin: one floating card, like the lobby's panels, with the city's name and numbers, a search and a
// filter, and the houses as rows (components/list/CityRow.vue), each one way into its house's page.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import LoadingScreen from "../components/LoadingScreen.vue";
import Waiting from "../components/Waiting.vue";
import Choice, { type Option } from "../components/list/Choice.vue";
import { cityTotals, keeps, plural, type Show, yoursFirst } from "../components/list/city";
import CityRow from "../components/list/CityRow.vue";
import ListCard from "../components/list/ListCard.vue";
import { core, useWhenBack, wentDown } from "../core";
import { me, meLoaded } from "../session";
import { settings } from "../settings";
import { openStream, type Stream } from "../stream";
import type { CityHouse } from "../types";

// three.js is big: it only loads when someone opens the lobby, behind the same loading screen.
const LobbyView = defineAsyncComponent({ loader: () => import("../components/LobbyView.vue"), loadingComponent: LoadingScreen, delay: 0 });

const houses = ref<CityHouse[] | null>(null);
// Set when the city can't load for a reason that isn't the core being down (the API answered, and said no).
const error = ref("");
const show = ref<Show>("all");
const search = ref("");
let stream: Stream | null = null;

// The city, as the API last said it. A failed refresh never empties what's already here.
async function loadCity() {
  const res = await fetch("/api/city").catch(() => null);
  if (!res?.ok) {
    if (!houses.value && !(await wentDown(res))) error.value = "The city can't be reached right now. Try again in a moment.";
    return;
  }
  error.value = "";
  houses.value = (await res.json()).houses;
  // The API re-sends the city whenever a house changes. The stream finds its own way back if it dies (stream.ts).
  stream ??= openStream("/api/city/stream", { city: (e) => (houses.value = JSON.parse(e.data).houses) });
}

onMounted(loadCity);
// The core came back: the city again (and the stream, if it never got started).
useWhenBack(loadCity);
onBeforeUnmount(() => stream?.close());

// The lobby shows up as soon as it has something to stand on: the city and who you are, or, when the core is down,
// an empty street with the "can't be reached" card on top. Once it's up it stays up (a recovery in two steps, the
// city then you, must not tear down the 3D scene).
const lobbyUp = ref(false);
watchEffect(() => {
  if (!lobbyUp.value && ((houses.value && meLoaded.value) || core.state === "down")) lobbyUp.value = true;
});
const lobbyHouses = computed(() => houses.value ?? []);

const options: Option[] = [
  { key: "all", icon: "house", word: "All" },
  { key: "free", icon: "door", word: "Free room" },
  { key: "making", icon: "server", word: "Setting up" },
];

const mine = computed(() => me.value?.houses.map((h) => h.id) ?? []);
const totals = computed(() => cityTotals(houses.value ?? []));
const shown = computed(() => yoursFirst((houses.value ?? []).filter((h) => keeps(h, show.value, search.value)), mine.value));
const filtered = computed(() => show.value !== "all" || !!search.value.trim());
// The line under the controls: what the list holds. It's polite live text, so a search or a filter is heard.
const listLine = computed(() => {
  if (!houses.value) return "";
  if (!shown.value.length) return "No house matches that.";
  if (filtered.value) return `${shown.value.length} of ${plural(totals.value.houses, "house", "houses")}.`;
  return "Every house in every city. Go into one to see its rooms and its people.";
});
</script>

<template>
  <div v-if="error" class="list">
    <ListCard>
      <div class="card">
        <h1 class="name">The city</h1>
        <p class="line" role="alert">{{ error }}</p>
        <button type="button" class="primary again" @click="loadCity">Try again</button>
      </div>
    </ListCard>
  </div>

  <!-- The lobby waits for "who am I", so you walk in as yourself; logging in or out rebuilds it. -->
  <LobbyView v-else-if="settings.view === 'lobby' && lobbyUp" :key="me?.login ?? 'visitor'" :houses="lobbyHouses" />
  <LoadingScreen v-else-if="settings.view === 'lobby'" class="full" />

  <div v-else class="list">
    <ListCard>
      <div class="card">
        <header class="head">
          <h1 class="name">The city</h1>
          <p class="line">
            <template v-if="houses">
              {{ plural(totals.houses, "house", "houses") }} · {{ plural(totals.free, "free room", "free rooms") }} · {{ totals.making }} setting up
            </template>
            <template v-else-if="core.state !== 'down'">Opening the city…</template>
          </p>
        </header>

        <Waiting v-if="!houses && core.state === 'down'" @retry="loadCity" />

        <div class="controls" role="search" aria-label="Find a house">
          <input v-model="search" type="search" placeholder="Search houses, cities, projects, people" aria-label="Search the city" />
          <Choice v-model="show" :options="options" label="Which houses" />
        </div>

        <p class="explain" aria-live="polite">{{ listLine }}</p>

        <ul v-if="shown.length" class="plain lines" aria-label="Houses">
          <CityRow v-for="h in shown" :key="h.id" :house="h" :mine="mine.includes(h.id)" />
        </ul>
      </div>
    </ListCard>
  </div>
</template>

<style scoped>
.full { position: fixed; inset: 0; }
/* The top bar floats over this route (it's the lobby's), so the column starts under it. */
.list { max-width: calc(760px + 2 * var(--gutter)); margin: 0 auto; padding: 72px var(--gutter) 80px; }
.card { display: grid; gap: 14px; padding: 26px var(--gutter) 22px; }
.head { display: grid; gap: 6px; }
.name { font-size: 32px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.line { font-size: 14px; color: var(--muted); }
.again { justify-self: start; }
.controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.controls input { min-height: 44px; padding: 10px 16px; border: 0; border-radius: var(--r-md); background: var(--fill); font-size: 15px; }
.controls input:focus { box-shadow: 0 0 0 3px var(--focus); }
.explain { margin-top: -4px; font-size: 13px; line-height: 1.3; color: var(--muted); }
.plain { list-style: none; margin: 0; padding: 0; }
/* The same tight rows as the lobby's panels. */
.lines { display: grid; gap: 6px; align-content: start; line-height: 1.3; }
@media (max-width: 640px) {
  .controls { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .list { padding-top: 60px; }
  .name { font-size: 26px; }
}
</style>
