<script setup lang="ts">
// The full-screen lobby, one neighbourhood (city) at a time, and everything that sits on top of it: loading, the
// welcome, the prompt for whatever is in reach, emotes, who's here, the lamps, a card for the house, person or
// empty plot you picked, the inside of a house (its page, an application, a room) opened over the city so you
// never leave it, a minimap you can travel from, the keys in the corner, and sheets to find a house or travel
// to another city. The first time someone logged in arrives, the tutorial takes the city's place: one street
// with a workshop at the end, a coach at the bottom, and the screen empty but for what the step has unlocked;
// the city comes back, behind a last welcome, when it ends.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loading } from "../lobby/assets";
import { type Emote, Lobby, type Target } from "../lobby/Lobby";
import { LobbyLink } from "../lobby/link";
import { generateNeighbourhood, type Neighbourhood } from "../lobby/neighbourhood";
import { play, unlock } from "../lobby/sound";
import { tutorialNeighbourhood } from "../lobby/tutorialMap";
import { loadMe, me, meLoaded } from "../session";
import { lobbyUi, settings, settingsPane } from "../settings";
import type { CityHouse } from "../types";
import KnockSteps from "./KnockSteps.vue";
import { type CityRoom, freeRooms, type Home, type MapState, parsePlace, placeParam, plural, statusLine } from "./lobby/cards";
import EmptyCard from "./lobby/EmptyCard.vue";
import HouseCard from "./lobby/HouseCard.vue";
import Inside from "./lobby/Inside.vue";
import KeyLegend from "./lobby/KeyLegend.vue";
import KeysSheet from "./lobby/KeysSheet.vue";
import Minimap from "./lobby/Minimap.vue";
import TouchDash from "./lobby/TouchDash.vue";
import PersonCard from "./lobby/PersonCard.vue";
import { type Place, placeKey } from "./lobby/place";
import RentSteps from "./lobby/RentSteps.vue";
import Coach from "./lobby/tutorial/Coach.vue";
import { FREE, type Piece, PIECES, SETUP, STEPS, TUTORIAL_HOUSE } from "./lobby/tutorial/tutorial";
import { useTutorial } from "./lobby/tutorial/useTutorial";
import Welcome from "./lobby/tutorial/Welcome.vue";
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
// The strip of keys, bottom left: folded or not. The full list and the big map are overlays.
const legend = ref(true);
const keysOpen = ref(false);
const bigMap = ref(false);
// The neighbourhood on screen, as generated, for the minimap; and the engine's latest word on who stands where.
const neighbourhood = shallowRef<Neighbourhood | null>(null);
const mapState = shallowRef<MapState | null>(null);
// Where you are inside: the house, application or room open over the city. `place` is where the Inside sheet
// opened; `top` is what it shows right now (it keeps its own back-stack), as the URL's `in` parameter.
const place = ref<Place | null>(null);
const top = ref("");
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
  // The tutorial's neighbourhood is one street, drawn by hand, with the workshop at its far end: nowhere to get lost.
  const n = inWorkshop.value ? tutorialNeighbourhood() : generateNeighbourhood(city.value, here.value);
  neighbourhood.value = n;
  lobby.setNeighbourhood(n, shown.value);
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

/** Fast travel: the engine lands you on the nearest walkable spot. From the big map, that closes it. */
function fastTravel(x: number, z: number) {
  lobby?.teleport(x, z);
  bigMap.value = false;
}

// The find and travel sheets, unless the tutorial is on: then just a word, and you stay in the workshop.
function openSheet(which: "find" | "travel") {
  if (!inWorkshop.value) {
    sheet.value = which;
    return;
  }
  notice.value = "After the tutorial.";
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = ""), 1800);
}

// ---- The tutorial ----

// Its step machine (tutorial.ts) and the API calls around it (useTutorial.ts); the coach shows the step.
const tutorial = useTutorial();
const t = tutorial.machine;
// In the workshop: the tutorial is on and the city hasn't come back yet (its last step is in the real city).
const inWorkshop = computed(() => t.active && t.step !== "city");
// The houses on screen: the workshop during the tutorial, else this city's.
const shown = computed(() => (inWorkshop.value ? [tutorial.house.value] : here.value));
// What the place button says: the workshop's name, or the city's.
const placeName = computed(() => (inWorkshop.value ? tutorial.house.value.name : city.value));
// In the workshop nothing can be picked (no cards, no going in) until the step that sends you to its door.
const picking = computed(() => !inWorkshop.value || STEPS.indexOf(t.step) >= STEPS.indexOf("go"));
// Travel and find are off during the tutorial; pressing them shows this line for a moment.
const notice = ref("");
let noticeTimer = 0;

// The old five-step welcome, for visitors and anyone the tutorial isn't for (an API without it leaves
// `tutorialDone` out). Someone logged in who hasn't done the tutorial gets the tutorial instead.
const welcoming = computed(() => meLoaded.value && !settings.welcomed && !t.active && me.value?.tutorialDone !== false);

// What's on screen besides the city itself. In the tutorial, only what the step has unlocked, starting from
// nothing; outside it, everything (the keys, the map and the prompt wait for the old welcome to end).
const reveal = computed<Set<Piece>>(() => {
  if (t.active) return new Set(SETUP[t.step].reveal);
  if (welcoming.value) return new Set(PIECES.filter((p) => p !== "keys" && p !== "map" && p !== "prompt"));
  return new Set(PIECES);
});
const shows = (piece: Piece) => reveal.value.has(piece);
// The site's top bar is a piece like the others: App.vue hides it while the tutorial says so.
watchEffect(() => (lobbyUi.chrome = shows("chrome")));

// The engine lets you do what the step allows; outside the tutorial, everything.
function applyControls() {
  lobby?.setControls(t.active ? SETUP[t.step].controls : FREE);
}
watch(() => [t.active, t.step], applyControls);

// Where the workshop stands on the tutorial's map, for the camera to show it.
function workshopSpot(): { x: number; z: number } | null {
  const plot = neighbourhood.value?.plots.find((p) => p.lot.kind === "house" && p.lot.houseId === TUTORIAL_HOUSE);
  return plot ? { x: plot.x, z: plot.z } : null;
}

// The "look" step: the camera goes to the workshop, holds a moment, and comes back to you; then the next step.
watch(
  () => t.active && t.step === "look",
  async (looking) => {
    if (!looking) return;
    const spot = workshopSpot();
    if (lobby && spot) await lobby.showSpot(spot.x, spot.z, { hold: 2 }).catch(() => undefined);
    t.send({ type: "shown" });
  },
);

// The tutorial takes the city's place: everything open closes, the workshop's street is built, and presence moves
// to a place of your own so nobody else walks in. From the welcome card on, the step machine decides what you see.
function enterTutorial() {
  if (!lobby || !me.value || inWorkshop.value) return;
  card.value = null;
  knock.value = null;
  rent.value = null;
  sheet.value = "";
  bigMap.value = false;
  keysOpen.value = false;
  if (place.value) closeInside();
  tutorial.start();
  others.value = new Set();
  lobby.clearRemotes();
  build();
  link?.enter(`tutorial:${me.value.login}`);
  host.value?.focus({ preventScroll: true });
}

// Out of the workshop (finished or skipped): the real city comes back, and so does everyone in it.
function leaveWorkshop() {
  if (place.value) closeInside();
  card.value = null;
  bigMap.value = false;
  keysOpen.value = false;
  others.value = new Set();
  lobby?.clearRemotes();
  build();
  link?.enter(city.value);
  host.value?.focus({ preventScroll: true });
}
watch(inWorkshop, (now, before) => {
  if (before && !now) leaveWorkshop();
});

// The city's welcome card said "Let's go": the tutorial is over, and the keyboard goes back to the city.
function endTutorial() {
  t.send({ type: "end" });
  host.value?.focus({ preventScroll: true });
}

// "Start" on the first card: the keyboard goes to the city, where the walking happens.
function startTutorial() {
  t.send({ type: "start" });
  host.value?.focus({ preventScroll: true });
}

// The "done" step's "Open my room": your workshop room, inside.
function openMyRoom() {
  const room = t.state?.room;
  if (room) goInside({ kind: "room", houseId: TUTORIAL_HOUSE, room: room.name });
}

// It starts on its own, once the lobby is up, for someone logged in who hasn't done it (an API without the
// tutorial leaves `tutorialDone` out, and then nothing starts). Settings can ask for it again.
watch(
  [ready, () => me.value?.tutorialDone],
  ([up, done]) => {
    if (up && done === false && !failed.value) enterTutorial();
  },
  { immediate: true },
);
watch(() => settingsPane.tutorialRequested, enterTutorial);
// The workshop changes as you take a room and it goes live: its windows on the map follow.
watch(tutorial.house, () => {
  if (inWorkshop.value) build();
});
// The big map and the key list, opened and closed, are two of the steps.
watch(bigMap, (open) => t.send({ type: "map", open }));
watch(keysOpen, (open) => t.send({ type: "keys", open }));

// An outside link was clicked inside a house's window: if it's your live room, the "run" step counts it as opened.
function insideLink(url: string) {
  const mine = t.state?.room?.url;
  const bare = (u: string) => u.replace(/\/+$/, "");
  if (mine && bare(url) === bare(mine)) t.send({ type: "opened" });
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
        onNear: (target) => (near.value = target),
        onSelect: open,
        // The engine sets the cursor and the outline itself; there's nothing to add up here.
        onHover: () => undefined,
        onMove: (s) => {
          link?.move(s);
          // On a touch screen a tap on the ground is the only way to walk: the tutorial's walk step counts it.
          if (s.moving) t.send({ type: "moved" });
        },
        // Each control you use (a walk direction, a dash, a turn): the tutorial's steps listen.
        onAction: (name) => t.send({ type: "action", name }),
        onMap: (s) => (mapState.value = s),
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
    applyControls();
    // Opened from the address bar (`?in=…`): the window was already there before the engine, so frame it now.
    if (place.value) lobby.frame("left");
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
  link = null;
  lobby?.dispose();
  lobby = null;
  tutorial.dispose();
  // The site's top bar comes back with whatever page comes next.
  lobbyUi.chrome = true;
  clearTimeout(noticeTimer);
  loading.onProgress = () => undefined;
  loading.onLoad = () => undefined;
});

// ---- Cards: a house, a person or an empty plot, floating over the city ----

// One line per thing, so we can tell "the card is already about this" from "something new".
const keyOf = (t: Target | null) => (!t ? "" : t.kind === "house" ? `house:${t.house.id}` : t.kind === "empty" ? `empty:${t.plot.key}` : t.kind === "person" ? `person:${t.login}` : `lamp:${t.id}`);
const cardKey = computed(() => keyOf(card.value));
const nearKey = computed(() => keyOf(near.value));

// You used something. A house you're standing at opens straight away; anything else gets a card first. Early in
// the tutorial nothing opens: those steps are about walking.
function open(target: Target) {
  if (target.kind === "lamp" || !picking.value) return;
  if (target.kind === "house" && nearKey.value === keyOf(target)) {
    goInside({ kind: "house", id: target.house.id });
    return;
  }
  card.value = target;
}

function closeCard() {
  card.value = null;
}

// The card's house, read from the live list so it updates when a room fills up.
const cardHouse = computed(() => {
  const c = card.value;
  if (c?.kind !== "house") return null;
  return shown.value.find((h) => h.id === c.house.id) ?? c.house;
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

// ---- Inside: a house, an application or a room, over the city ----

// Opens the Inside sheet on a place, and the URL remembers it (`?in=house:sacre-coeur`), so a reload or a shared
// link lands right back here.
function goInside(p: Place) {
  openInside(p);
  showInUrl(placeParam(p));
}

// Whatever was open on top of the city closes; the sheet takes its place. Early in the tutorial it waits.
function openInside(p: Place) {
  if (!picking.value) return;
  card.value = null;
  knock.value = null;
  sheet.value = "";
  bigMap.value = false;
  keysOpen.value = false;
  place.value = p;
}

// The sheet went somewhere within itself (back, or deeper): the URL follows.
function insideChanged(now: Place | null) {
  if (now) showInUrl(placeParam(now));
}

function closeInside() {
  place.value = null;
  showInUrl("");
  host.value?.focus({ preventScroll: true });
}

// The window docks on the right of a wide screen, so the camera moves you to the left half while it's open.
watch(
  () => !!place.value,
  (open) => lobby?.frame(open ? "left" : "follow"),
);
// The tutorial hears when a house's window opens on the workshop, and when it closes.
watch(place, (now, before) => {
  if (now?.kind === "house") t.send({ type: "inside", houseId: now.id });
  else if (!now && before) t.send({ type: "inside", houseId: null });
});

// Writes the `in` parameter (or removes it), keeping the rest of the address as it is.
function showInUrl(param: string) {
  top.value = param;
  const query = { ...route.query };
  delete query.in;
  router.replace({ query: param ? { ...query, in: param } : query });
}

// The address bar is the other way in: the top bar sets `in` for your house, and a link may carry one. When it
// names something other than what's showing, open it; when it's gone, close.
watch(
  () => route.query.in,
  (v) => {
    const param = typeof v === "string" ? v : "";
    if (param === top.value) return;
    const p = parsePlace(param);
    top.value = p && picking.value ? param : "";
    if (p) openInside(p);
    else if (place.value) {
      place.value = null;
      host.value?.focus({ preventScroll: true });
    }
  },
  { immediate: true },
);

// ---- Sheets, keys, emotes ----

// A sheet takes focus on its first control; closing it puts focus back on the stage.
watch(sheet, async (now) => {
  await nextTick();
  if (now) sheetEl.value?.querySelector<HTMLElement>("input, button")?.focus();
  else host.value?.focus({ preventScroll: true });
});
// The big map and the key list take focus themselves; when they close, it goes back to the stage.
watch([bigMap, keysOpen], ([map, keys], [mapBefore, keysBefore]) => {
  if ((!map && mapBefore) || (!keys && keysBefore)) host.value?.focus({ preventScroll: true });
});

// The lobby's own keys (walking, E, Q, R, 1, 2, Tab, Shift) live in the engine. These are the ones around it.
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A knock or rent dialog, or the Inside sheet, handles its own keys (Escape closes it), and the welcomes (the
  // old one, and the tutorial's cards at either end) have their own too.
  if (knock.value || rent.value || place.value || !ready.value || failed.value || welcoming.value) return;
  if (t.active && (t.step === "welcome" || t.step === "city")) return;
  if (e.key === "Escape") {
    if (bigMap.value) bigMap.value = false;
    else if (keysOpen.value) keysOpen.value = false;
    else if (sheet.value) sheet.value = "";
    else if (card.value) closeCard();
    return;
  }
  // An overlay on top: only its own key, and Escape, do anything. The map and the key list answer only once the
  // tutorial has shown them.
  if (e.key === "m" || e.key === "M") {
    if (shows("map")) bigMap.value = !bigMap.value;
  } else if (e.key === "?") {
    if (shows("keys")) keysOpen.value = !keysOpen.value;
  } else if (bigMap.value || keysOpen.value) return;
  else if (e.key === "f" || e.key === "F") openSheet("find");
  else if (e.key === "t" || e.key === "T") openSheet("travel");
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
  // The workshop is yours alone: no need to say so.
  if (!connected.value || inWorkshop.value) return "";
  if (me.value) return n === 0 ? "You're the only one here right now." : n === 1 ? "You and one other person are here." : `You and ${n} others are here.`;
  return n === 0 ? "Nobody's walking around here right now." : `${n === 1 ? "One person is" : `${n} people are`} walking around.`;
});
const lampLine = computed(() => {
  const { lit, total } = lamps.value;
  if (!total) return "";
  return lit === total ? `Every lamp in ${placeName.value} is lit.` : `${lit} of ${total} lamps lit.`;
});
const lotWord = { shop: "shop", tower: "tower", trees: "lot" } as const;
</script>

<template>
  <div class="lobby" :class="{ paused: !!place }">
    <div
      ref="host"
      class="stage"
      role="img"
      tabindex="-1"
      :aria-label="`${placeName}, a neighbourhood you can walk around in 3D. The list view in settings shows the same houses as text.`"
    />

    <p v-if="failed" class="failed">This browser can't show the city in 3D. Open settings to see it as a list.</p>

    <template v-if="ready && !failed">
      <!-- Each piece of the screen shows once the tutorial has unlocked it (always, outside the tutorial). -->
      <button v-if="shows('place')" class="hud place" :aria-label="inWorkshop ? `You're in ${placeName}, the tutorial's workshop` : `You're in ${city}. Travel to another city`" @click="openSheet('travel')">
        <span class="city">{{ placeName }}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>

      <div class="hud top" aria-live="polite">
        <p v-if="notice">{{ notice }}</p>
        <p v-if="hereLine && shows('here')">{{ hereLine }}</p>
        <p v-if="lampLine && shows('here')" class="lamps">{{ lampLine }}</p>
      </div>

      <div v-if="shows('tools')" class="hud tools">
        <button aria-label="Find a house (F)" @click="openSheet('find')">
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
            @enter="goInside({ kind: 'house', id: cardHouse!.id })"
            @walk="lobby?.goTo(cardHouse!.id)"
            @thread="(id) => goInside({ kind: 'application', id })"
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
            @thread="(id) => goInside({ kind: 'application', id })"
            @wave="emote('yes')"
            @close="closeCard"
          />
          <EmptyCard v-else-if="card?.kind === 'empty'" :key="cardKey" :plot="card.plot" @rent="rentHere" @close="closeCard" />
        </Transition>
        <KeyLegend v-if="shows('keys')" :open="legend" @toggle="legend = !legend" @keys="keysOpen = true" />
      </div>

      <!-- Bottom centre: the coach during the tutorial, what's in reach (or highlighted with Tab) unless its card is
           already open, and the emotes. The coach must stay usable over a house's window, so the column lifts above
           it; on a wide screen, where the window docks on the right, the column moves out of its way. -->
      <div class="hud centre" :class="{ lifted: inWorkshop, aside: inWorkshop && !!place }">
        <Coach
          v-if="inWorkshop && t.step !== 'welcome' && t.step !== 'rundown'"
          :machine="t"
          :missing="tutorial.missing.value"
          :busy="tutorial.busy.value"
          :error="tutorial.error.value"
          :ran="tutorial.ran.value"
          @room="tutorial.takeRoom"
          @run="tutorial.deploy"
          @opened="t.send({ type: 'opened' })"
          @next="t.send({ type: 'next' })"
          @skip-github="t.send({ type: 'skipGithub' })"
          @open-room="openMyRoom"
          @finish="tutorial.finish"
          @skip="tutorial.finish"
        />
        <Transition name="rise">
          <div v-if="near && shows('prompt') && nearKey !== cardKey && !place" class="prompt" role="status">
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
        <div v-if="me && !card && !place && shows('emotes')" class="emotes">
          <button aria-label="Thumbs up (1)" @click="emote('yes')">👍</button>
          <button aria-label="Thumbs down (2)" @click="emote('no')">👎</button>
        </div>
      </div>

      <!-- Bottom right: the neighbourhood from above. Click it to travel; M opens it big. -->
      <div v-if="neighbourhood && shows('map')" class="hud map" :class="{ covered: !!card }">
        <Minimap :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" @travel="fastTravel" />
      </div>
      <!-- Phones have no Shift: a round dash button above the minimap, there whenever the round tools are. -->
      <TouchDash v-if="shows('tools') && !place && !card" @dash="lobby?.dash()" />

      <!-- The tutorial's two welcome cards: before the first step, and in the real city after the last. -->
      <Welcome v-if="t.active && (t.step === 'welcome' || t.step === 'city')" :key="t.step" :step="t.step === 'city' ? 'city' : 'welcome'" :busy="tutorial.busy.value" @start="startTutorial" @skip="tutorial.finish" @end="endTutorial" />

      <Onboarding v-if="welcoming" @focus="(on) => lobby?.focusOnPlayer(on)" @character="(c) => lobby?.setCharacter(c)" @done="settings.welcomed = true" />

      <KnockSteps
        v-if="knock"
        :house-id="knock.houseId"
        :house-name="houses.find((h) => h.id === knock!.houseId)?.name"
        :room="knock.room"
        stay
        @knocked="(id) => goInside({ kind: 'application', id })"
        @close="knock = null"
      />
      <RentSteps v-if="rent" :city="rent.city" :plot="rent.plot" @built="built" @close="rent = null" />

      <Transition name="fade">
        <Minimap v-if="bigMap && neighbourhood" :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" large @travel="fastTravel" @close="bigMap = false" />
      </Transition>
      <Transition name="fade">
        <KeysSheet v-if="keysOpen" @close="keysOpen = false" />
      </Transition>
    </template>

    <!-- The inside of a house, over the city. Also reachable from the address bar (`?in=…`), 3D or not. -->
    <!-- In the tutorial's rundown step, the window first walks you through itself, then says so. -->
    <Inside
      v-if="place"
      :key="placeKey(place)"
      :start="place"
      :rundown="t.active && t.step === 'rundown'"
      @change="insideChanged"
      @close="closeInside"
      @rundown-done="t.send({ type: 'rundownDone' })"
      @link="insideLink"
    />

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
/* No WebGL: one flat card in the middle says so. */
.failed { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); margin: 0; padding: 20px 24px; border-radius: 20px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); text-align: center; font-size: 17px; }
/* Everything on top of the city is a flat piece of the site's surface, lifted by a shadow: no glass, no blur. */
.hud { position: absolute; z-index: 10; color: var(--text); transition: opacity 0.2s var(--ease); }
/* A house, a room or a knock is open: like a game's pause menu, the HUD around it steps back (who's here, the
   round tools and the minimap, which the panel would half cover), leaving the place and the keys. */
.paused .hud.top, .paused .hud.tools, .paused .hud.map { opacity: 0; pointer-events: none; }
.place, .tools button, .emotes button { background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.place { top: 60px; left: 16px; display: flex; align-items: baseline; gap: 6px; padding: 8px 16px; min-height: 44px; border: 0; border-radius: 980px; cursor: pointer; }
.place .city { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.place .chev { font-size: 20px; color: var(--muted); }
/* Who's here, in a pill at the top; it never catches clicks. */
.top { top: 64px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 980px; background: var(--surface); box-shadow: var(--lift); text-align: center; pointer-events: none; max-width: calc(100vw - 32px); }
.top:empty { display: none; }
.top p { margin: 0; font-size: 15px; }
.top .lamps { margin-top: 1px; font-size: 13px; color: var(--muted); }
.tools { top: 60px; right: 16px; display: grid; gap: 8px; }
.tools button { width: 44px; height: 44px; min-height: 0; padding: 0; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; }
/* The dock stacks the card over the keys; its empty space lets clicks through to the city. */
.dock { left: 16px; bottom: max(28px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-start; gap: 12px; pointer-events: none; }
.dock > * { pointer-events: auto; }
/* The middle column: the prompt above, the emotes under it; the gaps let clicks through. */
.centre { left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.centre > * { pointer-events: auto; }
/* During the tutorial the column sits above a house's inside (60), so the coach's buttons stay in reach. */
.centre.lifted { z-index: 70; }
/* A wide screen docks the window on the right: the coach moves to the bottom left, above the keys. */
@media (min-width: 900px) {
  .centre.aside { left: 16px; bottom: max(76px, env(safe-area-inset-bottom)); transform: none; align-items: flex-start; }
}
.prompt { display: flex; align-items: center; gap: 16px; padding: 8px 8px 8px 22px; border-radius: 980px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); white-space: nowrap; font-size: 17px; max-width: calc(100vw - 32px); }
.prompt strong { font-weight: 600; }
.soft { color: var(--muted); }
/* The one main action: the accent pill, with the key it answers to. */
.pill { border: 0; border-radius: 980px; padding: 10px 18px; min-height: 44px; font-size: 17px; font-weight: 500; background: var(--accent-fill); color: var(--on-accent); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
kbd { font: 600 11px/1 var(--font); padding: 3px 5px; border-radius: 5px; border: 1px solid color-mix(in srgb, currentColor 45%, transparent); background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; }
.emotes { display: flex; gap: 8px; }
.emotes button { width: 44px; height: 44px; min-height: 0; padding: 0; border-radius: 50%; border: 0; font-size: 20px; cursor: pointer; }
.emotes button:active { transform: scale(0.94); }
.map { right: 16px; bottom: max(28px, env(safe-area-inset-bottom)); }
/* Our own hovers, so the site's grey button hover doesn't paint over these. */
.pill:hover:not(:disabled) { background: var(--accent-fill-hover); }
.place:hover:not(:disabled), .tools button:hover:not(:disabled), .emotes button:hover:not(:disabled) { background: var(--fill); }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
.scrim { position: absolute; inset: 0; z-index: 40; background: var(--scrim); }
.sheet { position: absolute; z-index: 50; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); padding: 72px 20px 24px; display: grid; grid-template-rows: auto 1fr auto; gap: 16px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.sheet h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.sheet input { width: 100%; min-height: 44px; padding: 10px 16px; border-radius: 12px; border: 0; background: var(--fill); color: inherit; font-size: 17px; }
.sheet ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.sheet li button { width: 100%; text-align: left; display: grid; gap: 2px; padding: 14px 4px; min-height: 0; border: 0; border-bottom: 1px solid var(--hairline); border-radius: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.sheet li button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 4%, transparent); }
.sheet li strong { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.sheet li span { font-size: 15px; color: var(--muted); }
.sheet li .youre-here { font-size: 15px; font-weight: 400; color: var(--accent); }
.none { color: var(--muted); }
.rise-enter-active, .rise-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translateY(8px); }
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
  .top { top: 112px; }
  .map { right: 12px; }
  /* A card is a sheet along the bottom edge here: the map would hide under it. */
  .map.covered { display: none; }
  /* Cards become a sheet along the bottom edge; the keys, if a narrow window still shows them, sit above it. */
  .dock { left: 0; right: 0; bottom: 0; align-items: stretch; gap: 0; }
  .dock .legend, .dock .peek { order: -1; align-self: flex-start; margin: 0 16px 12px; }
}
</style>
