<script setup lang="ts">
// The city: a full-screen place to walk around, or (in settings) its Dashboard, the lobby's no-3D twin: a welcome,
// your friends, the cities and your conversations beside the city's rooms, each with its main action
// (components/list/Dashboard.vue). The setting's value is still called "list", as browsers saved it before.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import LoadingScreen from "../components/LoadingScreen.vue";
import Waiting from "../components/Waiting.vue";
import { mergeCity } from "../components/list/city";
import Dashboard from "../components/list/Dashboard.vue";
import ListCard from "../components/list/ListCard.vue";
import { listWords as w } from "../components/list/words";
import { core, useWhenBack, wentDown } from "../core";
import { opensOnLanding, visiting } from "../landing";
import { me, meLoaded } from "../session";
import { settings } from "../settings";
import { openStream, type Stream } from "../stream";
import type { CityHouse } from "../types";
import LandingPage from "./LandingPage.vue";

const route = useRoute();
// Someone logged out starts on the landing (landing.ts says exactly when); a link to a place in the city goes there.
const landing = computed(() => opensOnLanding({ known: meLoaded.value, loggedIn: !!me.value, visiting: visiting.value, linked: !!route.query.in || !!route.query.city }));

// three.js is big: it only loads when someone opens the lobby, behind the same loading screen.
const LobbyView = defineAsyncComponent({ loader: () => import("../components/LobbyView.vue"), loadingComponent: LoadingScreen, delay: 0 });

const houses = ref<CityHouse[] | null>(null);
// Set when the city can't load for a reason that isn't the core being down (the API answered, and said no).
const error = ref("");
let stream: Stream | null = null;

// The city, as the API last said it. A failed refresh never empties what's already here.
async function loadCity() {
  const res = await fetch("/api/city").catch(() => null);
  if (!res?.ok) {
    if (!houses.value && !(await wentDown(res))) error.value = w.cantReach;
    return;
  }
  error.value = "";
  houses.value = (await res.json()).houses;
  // The API says all of the city first, then only the houses that changed. The stream finds its own way back if it
  // dies (stream.ts).
  stream ??= openStream("/api/city/stream", { city: (e) => (houses.value = mergeCity(houses.value, JSON.parse(e.data))) });
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
</script>

<template>
  <LandingPage v-if="landing" />
  <div v-else-if="error" class="list">
    <ListCard>
      <div class="card">
        <h1 class="name">{{ w.city }}</h1>
        <p class="line" role="alert">{{ error }}</p>
        <button type="button" class="primary again" @click="loadCity">{{ w.tryAgain }}</button>
      </div>
    </ListCard>
  </div>

  <!-- The lobby waits for "who am I", so you walk in as yourself; logging in or out rebuilds it. -->
  <LobbyView v-else-if="settings.view === 'lobby' && lobbyUp" :key="me?.login ?? 'visitor'" :houses="lobbyHouses" />
  <LoadingScreen v-else-if="settings.view === 'lobby'" class="full" />

  <!-- The core is down and the city never came: the same card, waiting for it. -->
  <div v-else-if="!houses && core.state === 'down'" class="list">
    <ListCard>
      <div class="card">
        <h1 class="name">{{ w.city }}</h1>
        <Waiting @retry="loadCity" />
      </div>
    </ListCard>
  </div>
  <Dashboard v-else :houses="houses" />
</template>

<style scoped>
.full { position: fixed; inset: 0; }
/* The top bar floats over this route (it's the lobby's), so the column starts under it. */
.list { max-width: calc(760px + 2 * var(--gutter)); margin: 0 auto; padding: 72px var(--gutter) 80px; }
.card { display: grid; gap: 14px; padding: 26px var(--gutter) 22px; }
.name { font-size: 32px; line-height: 1.1; }
.line { font-size: 14px; color: var(--muted); }
.again { justify-self: start; }
@media (max-width: 480px) {
  .list { padding-top: 60px; }
  .name { font-size: 26px; }
}
</style>
