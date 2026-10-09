<script setup lang="ts">
// The full-screen lobby, and everything that sits on top of it: loading, the welcome, the door prompt, emotes,
// who's here, the lamps, and a sheet to find a house.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { loading } from "../lobby/assets";
import { type Emote, Lobby, type Nearby } from "../lobby/Lobby";
import { LobbyLink } from "../lobby/link";
import { me } from "../session";
import { settings } from "../settings";
import type { CityHouse } from "../types";
import LoadingScreen from "./LoadingScreen.vue";
import Onboarding from "./Onboarding.vue";

const props = defineProps<{ houses: CityHouse[] }>();
const router = useRouter();
const host = ref<HTMLElement | null>(null);
const near = ref<Nearby>(null);
const failed = ref(false);
const progress = ref<number | null>(null);
const ready = ref(false);
const leaving = ref(false);
const others = ref(new Set<string>());
const connected = ref(false);
const lamps = ref({ lit: 0, total: 0 });
const finding = ref(false);
const query = ref("");
let lobby: Lobby | null = null;
let link: LobbyLink | null = null;

const LAMPS_KEY = "coloc.lamps";
function savedLamps(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LAMPS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

onMounted(() => {
  // The loading screen stays until the first models are in (and at least a moment, so it doesn't flash).
  const shownAt = performance.now();
  let finishing = false;
  const finish = () => {
    if (finishing) return;
    finishing = true;
    setTimeout(() => {
      ready.value = true;
      leaving.value = true;
      // Gone once it has faded out.
      setTimeout(() => (leaving.value = false), 650);
    }, Math.max(0, 700 - (performance.now() - shownAt)));
  };
  loading.onProgress = (_url, loaded, total) => (progress.value = total ? loaded / total : null);
  loading.onLoad = finish;
  // Never stuck: a slow model doesn't hold the whole city back.
  setTimeout(finish, 9000);

  try {
    lobby = new Lobby(
      host.value!,
      {
        onNear: (n) => (near.value = n),
        onEnter: (h) => router.push(`/houses/${h.id}`),
        onMove: (s) => link?.move(s),
        onLamps: (lit) => {
          try {
            localStorage.setItem(LAMPS_KEY, JSON.stringify(lit));
          } catch {
            // Private mode: the lamps go dark when the tab closes.
          }
          lamps.value = lobby!.lampCount();
        },
      },
      { login: me.value?.login ?? null, character: me.value?.avatar ?? null, quality: settings.quality, reduceMotion: settings.reduceMotion, litLamps: savedLamps() },
    );
    lobby.setCity(props.houses);
    lamps.value = lobby.lampCount();
  } catch {
    // No WebGL (an old phone, a disabled GPU): the list still works.
    failed.value = true;
    ready.value = true;
    return;
  }

  link = new LobbyLink({
    onSnapshot: (players) => {
      lobby?.clearRemotes();
      players.forEach((p) => lobby?.addRemote(p));
      others.value = new Set(players.map((p) => p.login).filter((l) => l !== me.value?.login));
    },
    onJoin: (p) => {
      lobby?.addRemote(p);
      if (p.login !== me.value?.login) others.value = new Set([...others.value, p.login]);
    },
    onMove: (login, x, z, ry, moving) => lobby?.moveRemote(login, x, z, ry, moving),
    onEmote: (login, name) => lobby?.emoteRemote(login, name),
    onLeave: (login) => {
      lobby?.removeRemote(login);
      const next = new Set(others.value);
      next.delete(login);
      others.value = next;
    },
    onStatus: (up) => (connected.value = up),
  });
});

// Rebuild when the city changes (a room fills up, a house goes online).
watch(
  () => props.houses,
  (houses) => {
    lobby?.setCity(houses);
    if (lobby) lamps.value = lobby.lampCount();
  },
);
watch(
  () => [settings.quality, settings.reduceMotion] as const,
  ([q, calm]) => lobby?.setQuality(q, calm),
);

onBeforeUnmount(() => {
  link?.close();
  lobby?.dispose();
  loading.onProgress = () => undefined;
  loading.onLoad = () => undefined;
});

function emote(name: Emote) {
  lobby?.emote(name);
  link?.emote(name);
}

function goTo(id: string) {
  finding.value = false;
  lobby?.goTo(id);
}

const free = (h: CityHouse) => h.rooms.filter((r) => !r.occupant).length;
const found = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.houses;
  return props.houses.filter((h) => [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad])].join(" ").toLowerCase().includes(q));
});
const hereLine = computed(() => {
  const n = others.value.size;
  if (!connected.value) return "";
  if (me.value) return n === 0 ? "You're the only one here right now." : n === 1 ? "You and one other person are here." : `You and ${n} others are here.`;
  return n === 0 ? "Nobody's walking around right now." : `${n === 1 ? "One person is" : `${n} people are`} walking around.`;
});
const lampLine = computed(() => {
  const { lit, total } = lamps.value;
  if (!total) return "";
  if (lit === total) return "Every lamp in town is lit.";
  return `${lit} of ${total} lamps lit.`;
});
</script>

<template>
  <div class="lobby">
    <div ref="host" class="stage" role="img" aria-label="The city as a 3D neighbourhood you can walk around. The list view in settings shows the same houses as text." />

    <p v-if="failed" class="failed">This browser can't show the city in 3D. Open settings to see it as a list.</p>

    <template v-if="ready && !failed">
      <div class="hud top" aria-live="polite">
        <p v-if="hereLine">{{ hereLine }}</p>
        <p v-if="lampLine" class="lamps">{{ lampLine }}</p>
      </div>

      <button class="hud find" aria-label="Find a house" @click="finding = true">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>

      <Transition name="rise">
        <div v-if="near && settings.welcomed" class="hud prompt" role="status">
          <template v-if="near.kind === 'door'">
            <span>
              <strong>{{ near.house.name }}</strong>
              <span class="soft"> in {{ near.house.city }}{{ free(near.house) ? `, ${free(near.house)} ${free(near.house) === 1 ? "room" : "rooms"} free` : "" }}</span>
            </span>
            <button class="pill" @click="lobby?.interact()">Go in <kbd>E</kbd></button>
          </template>
          <template v-else>
            <span>{{ near.on ? "This lamp is lit." : "This lamp is off." }}</span>
            <button class="pill" @click="lobby?.interact()">{{ near.on ? "Switch it off" : "Light it" }} <kbd>E</kbd></button>
          </template>
        </div>
      </Transition>

      <div v-if="me" class="hud emotes">
        <button aria-label="Thumbs up (1)" @click="emote('yes')">👍</button>
        <button aria-label="Thumbs down (2)" @click="emote('no')">👎</button>
      </div>

      <Onboarding v-if="!settings.welcomed" @focus="(on) => lobby?.focusOnPlayer(on)" @character="(c) => lobby?.setCharacter(c)" @done="settings.welcomed = true" />
    </template>

    <Transition name="fade">
      <div v-if="finding" class="scrim" @click="finding = false" />
    </Transition>
    <Transition name="sheet">
      <section v-if="finding" class="finder" role="dialog" aria-modal="true" aria-label="Find a house" @keydown.esc="finding = false">
        <input v-model="query" type="search" placeholder="A house, a city, a stack…" aria-label="Search the city" autofocus />
        <ul>
          <li v-for="h in found" :key="h.id">
            <button @click="goTo(h.id)">
              <strong>{{ h.name }}</strong>
              <span>
                {{ h.city }}.
                {{ h.status === "making" ? "Still finding its flatmates." : free(h) ? `${free(h)} ${free(h) === 1 ? "room" : "rooms"} free.` : "Full." }}
                <template v-if="h.demo"> A sample house.</template>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="!found.length" class="none">No house matches that.</p>
      </section>
    </Transition>

    <LoadingScreen v-if="!ready || leaving" :progress="progress" :leaving="leaving" />
  </div>
</template>

<style scoped>
.lobby { position: relative; height: 100dvh; min-height: 420px; overflow: hidden; background: linear-gradient(180deg, #2a2148 0%, #4b3a74 45%, #8a6aa0 100%); }
/* Its own stacking context: three.js gives every name tag a z-index, which would otherwise float over the sheets. */
.stage { position: absolute; inset: 0; z-index: 0; isolation: isolate; }
.stage :deep(canvas) { display: block; }
.failed { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 24px; text-align: center; color: #f5f5f7; font-size: 17px; }
.hud { position: absolute; z-index: 10; color: #f5f5f7; }
.top { top: 64px; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; }
.top p { margin: 0; font-size: 15px; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45); }
.top .lamps { margin-top: 2px; font-size: 13px; color: rgba(245, 245, 247, 0.75); }
.find { top: 60px; right: 16px; width: 44px; height: 44px; border-radius: 50%; border: 0; display: grid; place-items: center; background: rgba(28, 24, 44, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); cursor: pointer; }
.prompt { left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; align-items: center; gap: 16px; padding: 10px 10px 10px 22px; border-radius: 980px; background: rgba(28, 24, 44, 0.72); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); white-space: nowrap; font-size: 17px; max-width: calc(100vw - 32px); }
.prompt strong { font-weight: 600; }
.soft { color: rgba(245, 245, 247, 0.72); }
.pill { border: 0; border-radius: 980px; padding: 10px 18px; min-height: 44px; font-size: 17px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
kbd { font: 600 11px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 3px 5px; border-radius: 5px; border: 1px solid rgba(0, 0, 0, 0.2); color: #6e6e73; }
.emotes { right: 16px; bottom: max(28px, env(safe-area-inset-bottom)); display: flex; gap: 8px; }
.emotes button { width: 48px; height: 48px; border-radius: 50%; border: 0; font-size: 22px; background: rgba(28, 24, 44, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); cursor: pointer; }
.emotes button:active { transform: scale(0.94); }
/* Our own hovers: the site's button styles are for light pages, not this dark glass. */
.pill:hover:not(:disabled) { background: #e8e8ed; }
.find:hover:not(:disabled), .emotes button:hover:not(:disabled) { background: rgba(28, 24, 44, 0.75); }
.find, .emotes button { padding: 0; min-height: 0; }
.finder li button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 4%, transparent); }
button:focus-visible, input:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
.scrim { position: absolute; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.35); }
.finder { position: absolute; z-index: 50; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); padding: 72px 20px 24px; display: grid; grid-template-rows: auto 1fr auto; gap: 16px; background: var(--bg, #fff); color: var(--text, #1d1d1f); }
.finder input { width: 100%; min-height: 44px; padding: 10px 16px; border-radius: 12px; border: 0; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; font-size: 17px; }
.finder ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.finder li button { width: 100%; text-align: left; display: grid; gap: 2px; padding: 14px 4px; border: 0; border-bottom: 1px solid var(--border, #d2d2d7); background: none; color: inherit; font: inherit; cursor: pointer; }
.finder li strong { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.finder li span { font-size: 15px; color: var(--muted, #6e6e73); }
.none { color: var(--muted, #6e6e73); }
.rise-enter-active, .rise-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active, .sheet-leave-active { transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.sheet-enter-from, .sheet-leave-to { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) {
  .rise-enter-active, .rise-leave-active, .fade-enter-active, .fade-leave-active, .sheet-enter-active, .sheet-leave-active { transition: none; }
}
/* No keyboard, no key hints. */
@media (hover: none) {
  kbd { display: none; }
}
@media (max-width: 520px) {
  .prompt { gap: 10px; padding-left: 16px; font-size: 15px; }
  .prompt .soft { display: none; }
  .emotes { bottom: 96px; }
}
</style>
