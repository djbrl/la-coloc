<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import Avatar from "./components/Avatar.vue";
import Bell from "./components/bell/Bell.vue";
import CoreStatus from "./components/CoreStatus.vue";
import SettingsPane from "./components/SettingsPane.vue";
import { logout, me, meLoaded } from "./session";
import { lobbyUi, settings, settingsPane } from "./settings";
import { hudWords as w } from "./components/lobby/words";

const route = useRoute();
const router = useRouter();
// Full-screen routes (the lobby) draw edge to edge; the bar floats over them.
const fullscreen = computed(() => route.meta.fullscreen === true);

// "Calmer motion" in the settings pane quiets the whole site, not only the lobby.
watchEffect(() => document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion));

// Day or night: the <html> element carries `data-theme="light"` or `"dark"`, and style.css picks the tokens from it.
// "System" means no attribute at all, so the system's own preference decides.
watchEffect(() => {
  if (settings.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
});

// Logging out needs the server: while the core is down you stay as you are (the card on top says why).
async function leave() {
  if (await logout()) router.push("/");
}

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
  <!-- The lobby can ask for the bar to go (the tutorial does, until its last step). -->
  <header v-show="lobbyUi.chrome" class="bar" :class="{ float: fullscreen }">
    <nav class="inner" :aria-label="w.main">
      <RouterLink to="/" class="logo">La Coloc</RouterLink>
      <div class="side">
        <template v-if="meLoaded">
          <template v-if="me">
            <RouterLink v-for="h in me.houses" :key="h.id" :to="houseLink(h.id)" class="item house">{{ h.name }}</RouterLink>
            <Bell />
            <span class="item me">
              <Avatar :person="me" :size="26" decorative />
              <span class="sr-only">{{ w.loggedInAs(me.login) }}</span>
            </span>
            <button class="item text" @click="leave">{{ w.logOut }}</button>
          </template>
          <RouterLink v-else to="/login" class="item">{{ w.logIn }}</RouterLink>
        </template>
        <button class="item icon" :aria-label="w.settings" :aria-expanded="settingsPane.open" @click="settingsPane.open = true">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="gear" fill="currentColor" fill-rule="evenodd" /></svg>
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
  <!-- "The city can't be reached", over everything while the core is down (components/CoreStatus.vue). -->
  <CoreStatus />
</template>

<style scoped>
.skip { position: absolute; left: 12px; top: -60px; z-index: 100; padding: 10px 16px; border-radius: var(--r-md); background: var(--accent-fill); color: var(--on-accent); font-weight: 700; box-shadow: 0 var(--lip) 0 var(--accent-lip); }
.skip:focus { top: 8px; }

/* A flat bar: the site's surface and a hairline, no blur. Over the lobby it floats at the top edge, the same way. */
.bar {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}
.bar.float { position: fixed; left: 0; right: 0; }
.inner { height: 100%; max-width: calc(var(--wrap) + 2 * var(--gutter)); margin: 0 auto; padding: 0 var(--gutter); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
/* The name in the display face, after a small orange tile: the mark, until there's a real logo. */
.logo { display: inline-flex; align-items: center; gap: 8px; font: 800 18px/1 var(--display); letter-spacing: -0.03em; color: var(--text); white-space: nowrap; }
.logo::before { content: ""; width: 14px; height: 14px; border-radius: 4px; background: var(--accent-fill); box-shadow: 0 2px 0 var(--accent-lip); }
.logo:hover { text-decoration: none; }
.side { display: flex; align-items: center; gap: 4px; min-width: 0; }
.item { display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px; font-size: 14px; font-weight: 500; color: var(--text); opacity: 0.88; white-space: nowrap; }
.item:hover { opacity: 1; text-decoration: none; }
.house { min-width: 0; overflow: hidden; text-overflow: ellipsis; display: inline-block; line-height: 44px; max-width: 160px; }
.house.router-link-active { opacity: 1; font-weight: 600; }
.me { padding: 0 6px; }
button.item { min-height: 36px; background: none; border-radius: var(--r-sm); }
button.item:hover:not(:disabled) { background: var(--fill); }
.icon { width: 36px; justify-content: center; padding: 0; box-shadow: inset 0 0 0 1px var(--line); }

/* While the core is down, the card under the bar (CoreStatus.vue) takes its place in the page instead of covering it. */
.flow { min-height: calc(100vh - 48px); padding-top: var(--core-offset, 0px); outline: none; }
.full { outline: none; }
@media (max-width: 420px) {
  .item { padding: 0 8px; }
  .house { max-width: 110px; }
}
</style>
