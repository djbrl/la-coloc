<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import Bell from "./components/bell/Bell.vue";
import ChatButton from "./components/chat/ChatButton.vue";
import ChatSheet from "./components/chat/ChatSheet.vue";
import CoreStatus from "./components/CoreStatus.vue";
import FriendsButton from "./components/friends/FriendsButton.vue";
import SettingsPane from "./components/SettingsPane.vue";
import Icon from "./components/lobby/house/Icon.vue";
import { me, meLoaded } from "./session";
import { lobbyUi, settings, settingsPane } from "./settings";
import { hudWords as w } from "./components/lobby/words";

const route = useRoute();
// Full-screen routes (the lobby) draw edge to edge; the bar floats over them.
const fullscreen = computed(() => route.meta.fullscreen === true);

// "Calmer motion" in the settings pane quiets the whole site, not only the lobby.
watchEffect(() => document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion));

// The lobby's place key stands just left of the keys here, however many there are: they say how wide they are.
const keysEl = ref<HTMLElement | null>(null);
let keysWatcher: ResizeObserver | null = null;
onMounted(() => {
  keysWatcher = new ResizeObserver(() => document.documentElement.style.setProperty("--keys-width", `${keysEl.value?.offsetWidth ?? 0}px`));
  if (keysEl.value) keysWatcher.observe(keysEl.value);
});
onBeforeUnmount(() => keysWatcher?.disconnect());

// Your house, in the top bar: in the lobby it opens inside the city (never leaving the game); in the list view it's
// the house's page.
const houseLink = (id: string) => (settings.view === "lobby" ? { path: "/", query: { ...(route.path === "/" ? route.query : {}), in: `house:${id}` } } : `/houses/${id}`);

// A gear: eight teeth around a hole, drawn once.
const gear = (() => {
  const teeth = 8;
  const points: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / (teeth * 4);
    const r = i % 4 < 2 ? 10 : 7.6;
    points.push(`${(12 + r * Math.cos(angle)).toFixed(2)},${(12 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z M15.2,12 A3.2,3.2 0 1 0 8.8,12 A3.2,3.2 0 1 0 15.2,12 Z`;
})();
</script>

<template>
  <a class="skip" href="#main">{{ w.skip }}</a>
  <!-- The lobby can ask for the bar to go (the tutorial does, until its last step; so does the landing). -->
  <header v-show="lobbyUi.chrome" class="bar" :class="{ float: fullscreen, 'under-window': lobbyUi.inside }">
    <nav class="inner" :aria-label="w.main">
      <RouterLink to="/" class="logo">La Coloc</RouterLink>
      <div ref="keysEl" class="side">
        <template v-if="meLoaded">
          <!-- The chat: your own conversations. The city's chat and its board are on the board in the square. -->
          <ChatButton />
          <template v-if="me">
            <!-- Your friends, who's around, and a message away (components/friends). -->
            <FriendsButton />
            <!-- Your house: an icon key, its name for a screen reader and on hover. -->
            <RouterLink v-for="h in me.houses" :key="h.id" :to="houseLink(h.id)" class="item icon house" :title="h.name">
              <Icon name="house" />
              <span class="sr-only">{{ h.name }}</span>
            </RouterLink>
            <Bell />
          </template>
          <RouterLink v-else-if="route.path !== '/login'" to="/login" class="item word-key">
            <Icon name="login" class="narrow" />
            <span class="word">{{ w.logIn }}</span>
          </RouterLink>
        </template>
        <button class="item icon" data-tour="settings" :aria-label="w.settings" :aria-expanded="settingsPane.open" @click="settingsPane.open = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="gear" fill="currentColor" fill-rule="evenodd" /></svg>
        </button>
      </div>
    </nav>
  </header>

  <main id="main" :class="fullscreen ? 'full' : 'flow'" tabindex="-1">
    <RouterView v-slot="{ Component, route: r }">
      <Transition name="route" mode="out-in">
        <div :key="r.path" class="view">
          <component :is="Component" />
        </div>
      </Transition>
    </RouterView>
  </main>

  <SettingsPane />
  <!-- The chat sheet (components/chat), over whatever page is open: talking never leaves the city. -->
  <ChatSheet />
  <!-- "Offline", in the bar's row while the core is down (components/CoreStatus.vue). -->
  <CoreStatus :float="fullscreen" />
</template>

<style scoped>
.skip { position: absolute; left: 12px; top: -60px; z-index: 100; display: inline-flex; align-items: center; height: 50px; padding: 0 16px; border-radius: var(--r-md); background: var(--accent-fill); color: var(--on-accent); font-family: var(--display); }
.skip:focus { top: 8px; }

/* On a page of its own the bar is the sign's red, flat, the name on the left and small keys on the right. */
.bar {
  --key: 40px;
  --key-icon: 22px;
  position: sticky;
  top: 0;
  z-index: 50;
  height: 56px;
  background: var(--panel-red);
  color: var(--on-panel);
}
.inner { height: 100%; max-width: calc(var(--wrap) + 2 * var(--gutter)); margin: 0 auto; padding: 0 var(--gutter); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.logo { font: 400 20px/1 var(--brand); text-transform: uppercase; color: inherit; white-space: nowrap; }
.logo:hover { text-decoration: none; }
.side { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* The chat, the bell and the gear are the same key, in or out of the lobby: red, with a lip. */
.item, .side :deep(.ring) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  height: var(--key);
  padding: 0;
  border-radius: var(--r-md);
  background: var(--panel-red);
  color: var(--on-panel);
  white-space: nowrap;
}
.icon, .side :deep(.ring) { width: var(--key); }
.item svg, .side :deep(.ring svg) { width: var(--key-icon); height: var(--key-icon); }
.word-key { padding: 0 14px; font: 400 18px/1 var(--display); }
.word-key .narrow { display: none; }
.item:hover, .side :deep(.ring:hover:not(:disabled)), .side :deep(.ring[aria-expanded="true"]) { background: var(--accent-fill-hover); text-decoration: none; }
.house.router-link-active { background: var(--accent-lip); }
.item:focus-visible, .side :deep(.ring:focus-visible) { outline-color: var(--ink); }

/* Over the city (and the login's picture) there's no bar at all: the same keys, big, in the top right corner. */
.bar.float { --key: 62px; --key-icon: 28px; position: fixed; left: 0; right: 0; height: 0; background: none; }
.bar.float .inner { display: block; max-width: none; padding: 0; }
.bar.float .logo { display: none; }
.bar.float .side { position: absolute; top: 24px; right: 24px; }
/* A short window gives the lobby's open window the whole height, over these keys: they step back rather than peek out
   behind its edge. */
@media (min-width: 720px) and (max-height: 720px) {
  .bar.float.under-window { visibility: hidden; }
}
.bar.float :is(.item, :deep(.ring)) { box-shadow: 0 5px 0 var(--accent-lip); }
.bar.float :is(.item, :deep(.ring)):active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 var(--accent-lip); }
.bar.float .word-key { padding: 0 18px; font-size: 20px; }

.flow { min-height: calc(100vh - 56px); outline: none; }
.full { outline: none; }
@media (max-width: 520px) {
  /* A phone: smaller keys in a tighter corner, and the login's word becomes its icon (the word stays for a screen reader). */
  .bar.float { --key: 44px; --key-icon: 22px; }
  .bar.float .side { top: 12px; right: 12px; gap: 6px; }
  .bar.float :is(.item, :deep(.ring)) { box-shadow: 0 3px 0 var(--accent-lip); }
  .word-key .narrow { display: block; }
  .word-key .word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bar.float .word-key { width: var(--key); padding: 0; }
}
</style>
