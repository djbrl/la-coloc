<script setup lang="ts">
// The full-screen lobby, one neighbourhood (city) at a time, and everything that sits on top of it: loading, the
// welcome, the prompt for whatever is in reach, emotes, who's here, the lamps, a card for the house, person or
// empty plot you picked (you never leave the lobby to look), the keys in the corner, and sheets to find a house
// or travel to another city.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loading } from "../lobby/assets";
import { type Emote, Lobby, type Target } from "../lobby/Lobby";
import { LobbyLink } from "../lobby/link";
import { generateNeighbourhood } from "../lobby/neighbourhood";
import { play, unlock } from "../lobby/sound";
import { loadMe, me } from "../session";
import { settings } from "../settings";
import type { CityHouse } from "../types";
import KnockSteps from "./KnockSteps.vue";
import { type CityRoom, freeRooms, type Home, plural, statusLine } from "./lobby/cards";
import EmptyCard from "./lobby/EmptyCard.vue";
import HouseCard from "./lobby/HouseCard.vue";
import KeyLegend from "./lobby/KeyLegend.vue";
import PersonCard from "./lobby/PersonCard.vue";
import RentSteps from "./lobby/RentSteps.vue";
import LoadingScreen from "./LoadingScreen.vue";
import Onboarding from "./Onboarding.vue";

// What a card can show: anything you can select. Lamps just switch; they never get a card.
type Card = Exclude<Target, { kind: "lamp" }>;

const props = defineProps<{ houses: CityHouse[] }>();
const route = useRoute();
const router = useRouter();
const host = ref<HTMLElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);
const near = ref<Target | null>(null);
const card = ref<Card | null>(null);
const failed = ref(false);
const progress = ref<number | null>(null);
const ready = ref(false);
const leaving = ref(false);
const others = ref(new Set<string>());
const connected = ref(false);
const census = ref<Record<string, number>>({});
const lamps = ref({ lit: 0, total: 0 });
const sheet = ref<"" | "find" | "travel">("");
const query = ref("");
const legend = ref(true);
// The knock or rent dialog on top of a card, when one is open.
const knock = ref<{ houseId: string; room: CityRoom } | null>(null);
const rent = ref<{ city: string; plot: string } | null>(null);
let lobby: Lobby | null = null;
let link: LobbyLink | null = null;
let walkAfterArrival: string | null = null;
// A house you just started: walk to it once the city stream has pushed it.
let awaiting: string | null = null;

// ---- Which neighbourhood ----

const cities = computed(() => {
  const counts = new Map<string, number>();
  for (const h of props.houses) counts.set(h.city, (counts.get(h.city) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, houses]) => ({ name, houses }));
});
const myCity = computed(() => {
  const mine = me.value?.houses[0]?.id;
  return props.houses.find((h) => h.id === mine)?.city ?? null;
});
// The city in the address bar, else your house's city, else the busiest one.
const city = ref<string>(String(route.query.city ?? "") || myCity.value || cities.value[0]?.name || "Dakar");
const here = computed(() => props.houses.filter((h) => h.city === city.value));

// Who lives where, across every city: rings and cards.
const residents = computed(() => {
  const map = new Map<string, Home>();
  for (const h of props.houses)
    for (const r of h.rooms) if (r.occupant) map.set(r.occupant.login, { houseId: h.id, houseName: h.name, city: h.city, room: r.name, project: r.project });
  return map;
});

function build() {
  if (!lobby) return;
  lobby.setNeighbourhood(generateNeighbourhood(city.value, here.value), here.value);
  lobby.setResidents(residents.value);
  lamps.value = lobby.lampCount();
  if (walkAfterArrival) {
    lobby.goTo(walkAfterArrival);
    walkAfterArrival = null;
  }
  if (awaiting && here.value.some((h) => h.id === awaiting)) {
    lobby.goTo(awaiting);
    awaiting = null;
  }
}

function travel(to: string, thenWalkTo?: string) {
  sheet.value = "";
  card.value = null;
  walkAfterArrival = thenWalkTo ?? null;
  if (to === city.value) {
    if (thenWalkTo) lobby?.goTo(thenWalkTo);
    return;
  }
  city.value = to;
  router.replace({ query: { ...route.query, city: to } });
  others.value = new Set();
  lobby?.clearRemotes();
  build();
  link?.enter(to);
}

// ---- Lamps, remembered per browser ----

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
      setTimeout(() => (leaving.value = false), 650);
    }, Math.max(0, 700 - (performance.now() - shownAt)));
  };
  loading.onProgress = (_url, loaded, total) => (progress.value = total ? loaded / total : null);
  loading.onLoad = finish;
  // Never stuck: a slow model doesn't hold the whole city back.
  setTimeout(finish, 9000);
  window.addEventListener("keydown", onKey);
  // Browsers keep audio asleep until the first click or key press: that's when the sounds wake up.
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  try {
    lobby = new Lobby(
      host.value!,
      {
        onNear: (t) => (near.value = t),
        onSelect: open,
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
    build();
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
    onCensus: (counts) => (census.value = counts),
  });
  link.enter(city.value);
});

// Rebuild when the city changes (a room fills up, a house goes online).
watch(() => props.houses, build);
watch(
  () => [settings.quality, settings.reduceMotion] as const,
  ([q, calm]) => lobby?.setQuality(q, calm),
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  link?.close();
  lobby?.dispose();
  loading.onProgress = () => undefined;
  loading.onLoad = () => undefined;
});

// ---- Cards: a house, a person or an empty plot, floating over the city ----

// One line per thing, so we can tell "the card is already about this" from "something new".
const keyOf = (t: Target | null) => (!t ? "" : t.kind === "house" ? `house:${t.house.id}` : t.kind === "empty" ? `empty:${t.plot.key}` : t.kind === "person" ? `person:${t.login}` : `lamp:${t.id}`);
const cardKey = computed(() => keyOf(card.value));

function open(t: Target) {
  if (t.kind === "lamp") return;
  card.value = t;
}

function closeCard() {
  card.value = null;
}

// The card's house, read from the live list so it updates when a room fills up.
const cardHouse = computed(() => {
  const c = card.value;
  if (c?.kind !== "house") return null;
  return props.houses.find((h) => h.id === c.house.id) ?? c.house;
});
// The card's person: where they live, and that house as the city lists it.
const cardHome = computed(() => {
  const c = card.value;
  return c?.kind === "person" ? (residents.value.get(c.login) ?? null) : null;
});
const cardHomeHouse = computed(() => {
  const home = cardHome.value;
  return home ? (props.houses.find((h) => h.id === home.houseId) ?? null) : null;
});
const nearKey = computed(() => keyOf(near.value));

// A card opens with a sound and takes focus itself; when it closes, focus goes back to the stage so Tab cycles
// through the things on screen again.
watch(cardKey, (now, before) => {
  if (now) play("open");
  else if (before) {
    play("close");
    host.value?.focus({ preventScroll: true });
  }
});

function seeHouse(id: string) {
  const h = props.houses.find((x) => x.id === id);
  if (!h) return;
  card.value = { kind: "house", house: h };
  lobby?.goTo(id);
}

function rentHere() {
  if (card.value?.kind !== "empty") return;
  rent.value = { city: city.value, plot: card.value.plot.key };
}

function built(id: string) {
  awaiting = id;
  card.value = null;
  // You're its chef now: the top bar and the cards should know.
  void loadMe();
}

// ---- Sheets, keys, emotes ----

// A sheet takes focus on its first control; closing it puts focus back on the stage.
watch(sheet, async (now) => {
  await nextTick();
  if (now) sheetEl.value?.querySelector<HTMLElement>("input, button")?.focus();
  else host.value?.focus({ preventScroll: true });
});

// The lobby's own keys (walking, E, Q, R, 1, 2, Tab) live in the engine. These are the ones around it.
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A knock or rent dialog on top handles its own keys (Escape closes it), and the welcome has its own too.
  if (knock.value || rent.value || !ready.value || failed.value || !settings.welcomed) return;
  if (e.key === "Escape") {
    if (sheet.value) sheet.value = "";
    else if (card.value) closeCard();
  } else if (e.key === "?") legend.value = !legend.value;
  else if (e.key === "f" || e.key === "F") sheet.value = "find";
  else if (e.key === "t" || e.key === "T") sheet.value = "travel";
}

function emote(name: Emote) {
  lobby?.emote(name);
  link?.emote(name);
}

function findHouse(h: CityHouse) {
  travel(h.city, h.id);
}

const found = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.houses;
  return props.houses.filter((h) => [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad, r.occupant?.login])].join(" ").toLowerCase().includes(q));
});
const hereLine = computed(() => {
  const n = others.value.size;
  if (!connected.value) return "";
  if (me.value) return n === 0 ? "You're the only one here right now." : n === 1 ? "You and one other person are here." : `You and ${n} others are here.`;
  return n === 0 ? "Nobody's walking around here right now." : `${n === 1 ? "One person is" : `${n} people are`} walking around.`;
});
const lampLine = computed(() => {
  const { lit, total } = lamps.value;
  if (!total) return "";
  return lit === total ? `Every lamp in ${city.value} is lit.` : `${lit} of ${total} lamps lit.`;
});
const lotWord = { shop: "shop", tower: "tower", trees: "lot" } as const;
</script>

<template>
  <div class="lobby">
    <div
      ref="host"
      class="stage"
      role="img"
      tabindex="-1"
      :aria-label="`${city}, a neighbourhood you can walk around in 3D. The list view in settings shows the same houses as text.`"
    />

    <p v-if="failed" class="failed">This browser can't show the city in 3D. Open settings to see it as a list.</p>

    <template v-if="ready && !failed">
      <button class="hud place" :aria-label="`You're in ${city}. Travel to another city`" @click="sheet = 'travel'">
        <span class="city">{{ city }}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>

      <div class="hud top" aria-live="polite">
        <p v-if="hereLine">{{ hereLine }}</p>
        <p v-if="lampLine" class="lamps">{{ lampLine }}</p>
      </div>

      <div class="hud tools">
        <button aria-label="Find a house (F)" @click="sheet = 'find'">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
        <button aria-label="Turn the view left (Q)" @click="lobby?.rotate(-1)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button aria-label="Turn the view right (R)" @click="lobby?.rotate(1)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>

      <!-- Bottom left: the open card, if any, with the keys underneath it. -->
      <div class="hud dock">
        <Transition name="rise">
          <HouseCard
            v-if="card?.kind === 'house' && cardHouse"
            :key="cardKey"
            :house="cardHouse"
            :others="others"
            :near="nearKey === cardKey"
            @knock="(room) => (knock = { houseId: cardHouse!.id, room })"
            @walk="lobby?.goTo(cardHouse!.id)"
            @close="closeCard"
          />
          <PersonCard
            v-else-if="card?.kind === 'person'"
            :key="cardKey"
            :login="card.login"
            :name="card.name"
            :home="cardHome"
            :house="cardHomeHouse"
            :is-me="card.login === me?.login"
            @knock="(houseId, room) => (knock = { houseId, room })"
            @see="seeHouse"
            @wave="emote('yes')"
            @close="closeCard"
          />
          <EmptyCard v-else-if="card?.kind === 'empty'" :key="cardKey" :plot="card.plot" @rent="rentHere" @close="closeCard" />
        </Transition>
        <KeyLegend v-if="settings.welcomed" :open="legend" @toggle="legend = !legend" />
      </div>

      <!-- What's in reach (or highlighted with Tab), unless its card is already open. -->
      <Transition name="rise">
        <div v-if="near && settings.welcomed && nearKey !== cardKey" class="hud prompt" role="status">
          <template v-if="near.kind === 'house'">
            <span>
              <strong>{{ near.house.name }}</strong>
              <span class="soft">{{ freeRooms(near.house).length ? `, ${plural(freeRooms(near.house).length, "room", "rooms")} free` : "" }}</span>
            </span>
            <button class="pill" @click="lobby?.interact()">Go in <kbd>E</kbd></button>
          </template>
          <template v-else-if="near.kind === 'empty'">
            <span>An empty {{ lotWord[near.plot.lot] }}.</span>
            <button class="pill" @click="lobby?.interact()">Have a look <kbd>E</kbd></button>
          </template>
          <template v-else-if="near.kind === 'person'">
            <span>
              <strong>{{ near.name }}</strong>
              <span class="soft">{{ residents.get(near.login) ? `, ${residents.get(near.login)!.houseName}` : ", visiting" }}</span>
            </span>
            <button class="pill" @click="lobby?.interact()">Say hi <kbd>E</kbd></button>
          </template>
          <template v-else>
            <span>{{ near.on ? "This lamp is lit." : "This lamp is off." }}</span>
            <button class="pill" @click="lobby?.interact()">{{ near.on ? "Switch it off" : "Light it" }} <kbd>E</kbd></button>
          </template>
        </div>
      </Transition>

      <div v-if="me && !card" class="hud emotes">
        <button aria-label="Thumbs up (1)" @click="emote('yes')">👍</button>
        <button aria-label="Thumbs down (2)" @click="emote('no')">👎</button>
      </div>

      <Onboarding v-if="!settings.welcomed" @focus="(on) => lobby?.focusOnPlayer(on)" @character="(c) => lobby?.setCharacter(c)" @done="settings.welcomed = true" />

      <KnockSteps v-if="knock" :house-id="knock.houseId" :room="knock.room" @close="knock = null" />
      <RentSteps v-if="rent" :city="rent.city" :plot="rent.plot" @built="built" @close="rent = null" />
    </template>

    <Transition name="fade">
      <div v-if="sheet" class="scrim" @click="sheet = ''" />
    </Transition>
    <Transition name="sheet">
      <section v-if="sheet === 'find'" ref="sheetEl" class="sheet" role="dialog" aria-modal="true" aria-label="Find a house" @keydown.esc="sheet = ''">
        <input v-model="query" type="search" placeholder="A house, a city, a stack…" aria-label="Search the city" autofocus />
        <ul>
          <li v-for="h in found" :key="h.id">
            <button @click="findHouse(h)">
              <strong>{{ h.name }}</strong>
              <span>
                {{ h.city }}. {{ statusLine(h) }}
                <template v-if="h.demo"> A sample house.</template>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="!found.length" class="none">No house matches that.</p>
      </section>
      <section v-else-if="sheet === 'travel'" ref="sheetEl" class="sheet" role="dialog" aria-modal="true" aria-label="Travel to another city" @keydown.esc="sheet = ''">
        <h2>Where to?</h2>
        <ul>
          <li v-for="c in cities" :key="c.name">
            <button :aria-current="c.name === city ? 'location' : undefined" @click="travel(c.name)">
              <strong>{{ c.name }}<span v-if="c.name === city" class="youre-here"> · you're here</span></strong>
              <span>
                {{ c.houses }} {{ c.houses === 1 ? "house" : "houses" }}<template v-if="census[c.name]">, {{ census[c.name] }} {{ census[c.name] === 1 ? "person" : "people" }} walking around</template>.
              </span>
            </button>
          </li>
        </ul>
      </section>
    </Transition>

    <LoadingScreen v-if="!ready || leaving" :progress="progress" :leaving="leaving" />
  </div>
</template>

<style scoped>
.lobby { position: relative; height: 100dvh; min-height: 420px; overflow: hidden; background: linear-gradient(180deg, #2a2148 0%, #4b3a74 45%, #8a6aa0 100%); }
/* Its own stacking context: three.js gives every name tag a z-index, which would otherwise float over the sheets. */
.stage { position: absolute; inset: 0; z-index: 0; isolation: isolate; outline: none; }
.stage :deep(canvas) { display: block; }
.failed { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 24px; text-align: center; color: #f5f5f7; font-size: 17px; }
.hud { position: absolute; z-index: 10; color: #f5f5f7; }
.glass, .place, .tools button, .emotes button { background: rgba(28, 24, 44, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.place { top: 60px; left: 16px; display: flex; align-items: baseline; gap: 6px; padding: 8px 16px; min-height: 44px; border: 0; border-radius: 980px; cursor: pointer; }
.place .city { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.place .chev { font-size: 20px; opacity: 0.7; }
.top { top: 64px; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none; }
.top p { margin: 0; font-size: 15px; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45); }
.top .lamps { margin-top: 2px; font-size: 13px; color: rgba(245, 245, 247, 0.75); }
.tools { top: 60px; right: 16px; display: grid; gap: 8px; }
.tools button { width: 44px; height: 44px; min-height: 0; padding: 0; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; }
/* The dock stacks the card over the keys; its empty space lets clicks through to the city. */
.dock { left: 16px; bottom: max(28px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-start; gap: 12px; pointer-events: none; }
.dock > * { pointer-events: auto; }
.prompt { left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; align-items: center; gap: 16px; padding: 10px 10px 10px 22px; border-radius: 980px; background: rgba(28, 24, 44, 0.72); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); white-space: nowrap; font-size: 17px; max-width: calc(100vw - 32px); }
.prompt strong { font-weight: 600; }
.soft { color: rgba(245, 245, 247, 0.72); }
.pill { border: 0; border-radius: 980px; padding: 10px 18px; min-height: 44px; font-size: 17px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
kbd { font: 600 11px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 3px 5px; border-radius: 5px; border: 1px solid rgba(0, 0, 0, 0.2); color: #6e6e73; }
.emotes { right: 16px; bottom: max(28px, env(safe-area-inset-bottom)); display: flex; gap: 8px; }
.emotes button { width: 48px; height: 48px; min-height: 0; padding: 0; border-radius: 50%; border: 0; font-size: 22px; cursor: pointer; }
.emotes button:active { transform: scale(0.94); }
/* Our own hovers: the site's button styles are for light pages, not this dark glass. */
.pill:hover:not(:disabled) { background: #e8e8ed; }
.place:hover:not(:disabled), .tools button:hover:not(:disabled), .emotes button:hover:not(:disabled) { background: rgba(28, 24, 44, 0.75); }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
.scrim { position: absolute; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.35); }
.sheet { position: absolute; z-index: 50; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); padding: 72px 20px 24px; display: grid; grid-template-rows: auto 1fr auto; gap: 16px; background: var(--bg, #fff); color: var(--text, #1d1d1f); }
.sheet h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.sheet input { width: 100%; min-height: 44px; padding: 10px 16px; border-radius: 12px; border: 0; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; font-size: 17px; }
.sheet ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.sheet li button { width: 100%; text-align: left; display: grid; gap: 2px; padding: 14px 4px; min-height: 0; border: 0; border-bottom: 1px solid var(--border, #d2d2d7); border-radius: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.sheet li button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 4%, transparent); }
.sheet li strong { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.sheet li span { font-size: 15px; color: var(--muted, #6e6e73); }
.sheet li .youre-here { font-size: 15px; font-weight: 400; color: var(--accent, #0071e3); }
.none { color: var(--muted, #6e6e73); }
.rise-enter-active, .rise-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translateY(8px); }
.prompt.rise-enter-from, .prompt.rise-leave-to { transform: translate(-50%, 8px); }
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
  .top { top: 112px; }
  /* Cards become a sheet along the bottom edge; the keys, if a narrow window still shows them, sit above it. */
  .dock { left: 0; right: 0; bottom: 0; align-items: stretch; gap: 0; }
  .dock .legend, .dock .peek { order: -1; align-self: flex-start; margin: 0 16px 12px; }
}
</style>
