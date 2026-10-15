<script setup lang="ts">
// The full-screen lobby, one neighbourhood (city) at a time, and everything that sits on top of it: loading, the
// welcome, the prompt for whatever is in reach, emotes, the city's live activity, a card for the house, person,
// empty plot or chores board you picked, the inside of a house (its page, an application, a room) opened over the
// city so you never leave it, a minimap you can travel from, the keys in the corner, short news and tips at the
// top, and sheets to find a house or travel to another city on a map of Africa. The first time someone logged in
// arrives, the tutorial takes the city's place: one street with a workshop at the end, a coach at the bottom, and
// the screen empty but for what the step has unlocked; the city comes back, behind a last welcome, when it ends.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loading } from "../lobby/assets";
import { styleFor } from "../lobby/cityStyle";
import { type Emote, Lobby, type Target } from "../lobby/Lobby";
import { checkCore, core } from "../core";
import { language } from "../i18n";
import { LobbyLink } from "../lobby/link";
import { generateNeighbourhood, type Neighbourhood } from "../lobby/neighbourhood";
import { play, unlock } from "../lobby/sound";
import { tutorialNeighbourhood } from "../lobby/tutorialMap";
import { loadMe, me, meLoaded } from "../session";
import { lobbyUi, settings, settingsPane, slowDevice } from "../settings";
import type { CityHouse } from "../types";
import KnockSteps from "./KnockSteps.vue";
import { localTime } from "./lobby/africa";
import AfricaMap from "./lobby/AfricaMap.vue";
import BoardCard from "./lobby/BoardCard.vue";
import { type CityRoom, freeRooms, type Home, type MapState, parsePlace, placeParam, statusLine } from "./lobby/cards";
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
import { nextTip, type Tip, TIP_TEXT, type TipCue, tipParts } from "./lobby/tutorial/tips";
import { FREE, type Piece, PIECES, SETUP, STEPS, TUTORIAL_HOUSE } from "./lobby/tutorial/tutorial";
import { useTutorial } from "./lobby/tutorial/useTutorial";
import Welcome from "./lobby/tutorial/Welcome.vue";
import LoadingScreen from "./LoadingScreen.vue";
import Onboarding from "./Onboarding.vue";
import { lobbyWords as w } from "./words";

const props = defineProps<{ houses: CityHouse[] }>();
const route = useRoute();
const router = useRouter();
const host = ref<HTMLElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);
const near = ref<Target | null>(null);
const card = ref<Target | null>(null);
const failed = ref(false);
const progress = ref<number | null>(null);
const ready = ref(false);
const leaving = ref(false);
const others = ref(new Set<string>());
const connected = ref(false);
const census = ref<Record<string, number>>({});
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
// A house you just started: walk to it once the city stream has pushed it.
let awaiting: string | null = null;
// The city was opened on a place (`?in=house:…`, a shared link): the tutorial waits, and offers itself in a corner.
const linkedAtStart = !!parsePlace(route.query.in);

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

// Draws the neighbourhood on screen. The engine only rebuilds when what's drawn changed (a house, a plot, who
// lives where); for live news alone (a room going online, a build, a power cut) it redraws those in place.
function build() {
  if (!lobby) return;
  // The tutorial's neighbourhood is one street, drawn by hand, with the workshop at its far end: nowhere to get lost.
  const n = inWorkshop.value ? tutorialNeighbourhood() : generateNeighbourhood(city.value, here.value);
  neighbourhood.value = n;
  lobby.setNeighbourhood(n, shown.value);
  lobby.setResidents(residents.value);
  if (awaiting && here.value.some((h) => h.id === awaiting)) {
    lobby.goTo(awaiting);
    awaiting = null;
  }
}

function travel(to: string) {
  sheet.value = "";
  card.value = null;
  if (to === city.value) return;
  city.value = to;
  router.replace({ query: { ...route.query, city: to } });
  others.value = new Set();
  lobby?.clearRemotes();
  build();
  link?.enter(to);
  greet(to);
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
  notice.value = w.afterTutorial;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = ""), 1800);
}

// Puts you at a house's door, facing it (the engine snaps, no walk), travelling to its city first if it's in
// another one. For a house opened from the address bar, the top bar, Find or the chores board.
function arriveFor(p: Place | null) {
  const id = p?.kind === "house" ? p.id : p?.kind === "room" ? p.houseId : null;
  if (!id || inWorkshop.value) return;
  const h = props.houses.find((x) => x.id === id);
  if (!h) return;
  if (h.city !== city.value) {
    // Before the engine is up, choosing the city is enough: it's built there.
    if (lobby) travel(h.city);
    else city.value = h.city;
  }
  lobby?.arriveAt(id);
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
// Opened on a shared link by someone the tutorial is for: it didn't start, and this corner button offers it.
const tutorialChip = ref(false);

// The visitors' welcome (Onboarding.vue), for visitors and anyone the tutorial isn't for (an API without it leaves
// `tutorialDone` out). Someone logged in who hasn't done the tutorial gets the tutorial instead. A place opened
// from a link comes first: the welcome waits until it's closed.
const welcoming = computed(() => meLoaded.value && !settings.welcomed && !t.active && me.value?.tutorialDone !== false && !place.value);

// What's on screen besides the city itself. In the tutorial, only what the step has unlocked, starting from
// nothing; outside it, everything (the keys, the map and the prompt wait for the welcome to end).
const reveal = computed<Set<Piece>>(() => {
  if (t.active) return new Set(SETUP[t.step].reveal);
  if (welcoming.value) return new Set(PIECES.filter((p) => p !== "keys" && p !== "map" && p !== "prompt"));
  return new Set(PIECES);
});
const shows = (piece: Piece) => reveal.value.has(piece);
// The site's top bar is a piece like the others: App.vue hides it while the tutorial says so.
watchEffect(() => (lobbyUi.chrome = shows("chrome")));
// A house's window docked on the right: the "can't reach the city" card keeps to the left half (CoreStatus.vue).
watchEffect(() => (lobbyUi.inside = !!place.value));

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
  tutorialChip.value = false;
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

// The city's welcome card said "Let's go": the tutorial is over, and the keyboard goes back to the city. Walking
// was its first lesson, so that tip is never needed.
function endTutorial() {
  t.send({ type: "end" });
  seeTip("walk");
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
// tutorial leaves `tutorialDone` out, and then nothing starts). Opened on a shared link, it waits in a corner
// instead, so the link isn't lost. Settings can ask for it again.
watch(
  [ready, () => me.value?.tutorialDone],
  ([up, done]) => {
    if (!up || done !== false || failed.value) return;
    if (linkedAtStart) tutorialChip.value = true;
    else enterTutorial();
  },
  { immediate: true },
);
watch(() => settingsPane.tutorialRequested, enterTutorial);
// The workshop changes as you take a room and it goes live: its windows follow, and going live is celebrated.
watch(tutorial.house, () => {
  if (inWorkshop.value) build();
});
watch(tutorial.live, (live) => {
  if (live && inWorkshop.value) lobby?.celebrate(TUTORIAL_HOUSE);
});

// An outside link was clicked inside a house's window: if it's your live room, the "run" step counts it as opened.
function insideLink(url: string) {
  const mine = t.state?.room?.url;
  const bare = (u: string) => u.replace(/\/+$/, "");
  if (mine && bare(url) === bare(mine)) t.send({ type: "opened" });
}

// ---- News and tips: one short line at a time, under the city's activity ----

// A toast: plain words and key caps (tipParts), and how long it stays.
interface Toast {
  id: number;
  parts: { key: boolean; text: string }[];
  // A second, quieter part of the line (a greeting's meaning).
  soft?: string;
  ms: number;
}
const toast = ref<Toast | null>(null);
const toastQueue: Toast[] = [];
let toastId = 0;
let toastTimer = 0;

function say(text: string, opts: { soft?: string; ms?: number } = {}) {
  toastQueue.push({ id: ++toastId, parts: tipParts(text), soft: opts.soft, ms: opts.ms ?? 4200 });
  if (!toast.value) nextToast();
}
function nextToast() {
  clearTimeout(toastTimer);
  toast.value = toastQueue.shift() ?? null;
  if (toast.value) toastTimer = window.setTimeout(nextToast, toast.value.ms);
}

// Arriving in a city: its greeting, in its own language (lobby/cityStyle.ts), and what it means.
function greet(to: string) {
  const g = styleFor(to).greeting;
  if (!g || g.language === "English") return;
  const fr = language.lang === "fr";
  say(g.text, { soft: fr ? w.greeting(g.fr.meaning, g.fr.language) : w.greeting(g.meaning, g.language), ms: 5500 });
}

// The tips seen in this browser. Each one shows once (tutorial/tips.ts).
const TIPS_KEY = "coloc.tips";
const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
function seenTips(): Tip[] {
  try {
    return JSON.parse(localStorage.getItem(TIPS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function seeTip(tip: Tip) {
  const seen = seenTips();
  if (seen.includes(tip)) return;
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify([...seen, tip]));
  } catch {
    // Private mode: the tips come back next time.
  }
}
// When the last tip showed: a quiet moment brings the next one only after a while.
let lastTipAt = 0;
const TIP_GAP_MS = 25_000;
function cue(c: TipCue) {
  // Tips wait while the tutorial, a welcome, a card or anything else is up.
  const busy = t.active || welcoming.value || !!place.value || !!sheet.value || bigMap.value || keysOpen.value || !!knock.value || !!rent.value || !!card.value;
  if (!ready.value || failed.value || busy || toast.value) return;
  if (c === "idle" && performance.now() - lastTipAt < TIP_GAP_MS) return;
  const tip = nextTip(c, seenTips(), touch);
  if (!tip) return;
  const text = touch ? TIP_TEXT[tip].touch : TIP_TEXT[tip].keys;
  if (!text) return;
  seeTip(tip);
  lastTipAt = performance.now();
  say(text, { ms: 6500 });
}
// Using a control counts as knowing it: its tip never shows.
function used(action: string) {
  if (action === "dash") seeTip("dash");
  if (action === "turn-left" || action === "turn-right") seeTip("turn");
}
// How long you've been walking without a stop: a long walk brings the dash tip.
let walkingSince = 0;
function walking(moving: boolean) {
  if (!moving) walkingSince = 0;
  else if (!walkingSince) walkingSince = performance.now();
  else if (performance.now() - walkingSince > 3500) cue("walking");
}
let idleTimer = 0;
// The city on screen without the tutorial or the welcome: how to walk, once.
watch(
  () => ready.value && !failed.value && !t.active && !welcoming.value,
  (on) => {
    if (on) setTimeout(() => cue("arrived"), 1200);
  },
  { immediate: true },
);

// ---- A slow device: low quality is already the default (settings.ts); the list view is offered once ----

const offerList = computed(() => ready.value && slowDevice() && !settings.listOffered && settings.view === "lobby" && !t.active && !welcoming.value);
function seeAsList() {
  settings.listOffered = true;
  settings.view = "list";
}

// ---- The keyboard: only while the city has it ----

// Clicked or tapped the city at least once: from then on, keys pressed with nothing focused are the city's too.
let stageTouched = false;
function touchStage() {
  stageTouched = true;
}
/**
 * Whether a key press is for the city (WCAG 2.1.4): the stage has focus, or nothing has (the page itself) after a
 * click on the stage, and the shortcuts are on in settings. The engine follows the same rule for its own keys.
 */
function cityHasKeys(): boolean {
  if (!settings.shortcuts) return false;
  const focused = document.activeElement;
  if (focused && focused !== document.body) return !!host.value?.contains(focused);
  return stageTouched;
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
  host.value?.addEventListener("pointerdown", touchStage);
  idleTimer = window.setInterval(() => cue("idle"), 5000);

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
          walking(s.moving);
          // A click or a tap on the ground walks too: the tutorial's walk step counts it.
          if (s.moving) t.send({ type: "moved" });
        },
        // Each control you use (a walk direction, a dash, a turn): the tutorial's steps and the tips listen.
        onAction: (name) => {
          used(name);
          t.send({ type: "action", name });
        },
        onMap: (s) => (mapState.value = s),
      },
      { login: me.value?.login ?? null, character: me.value?.avatar ?? null, quality: settings.quality, reduceMotion: settings.reduceMotion },
    );
    build();
    applyControls();
    lobby.setShortcuts(settings.shortcuts);
    // Opened from the address bar (`?in=…`): the window was already there before the engine. Stand at the house's
    // door, then frame it.
    if (place.value) {
      arriveFor(place.value);
      lobby.frame("left");
    }
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
    // The live line dropping may be the core going away: one health check says (no-op if it's already known down).
    onStatus: (up) => {
      connected.value = up;
      if (!up) void checkCore();
    },
    onCensus: (counts) => (census.value = counts),
  });
  link.enter(city.value);
});

// ---- The city stream: what changed since the last word ----

// Each room as last heard: online or not, and building or not. Null before the first word, so nothing that was
// already true when you arrived is celebrated.
let lastRooms: Map<string, { live: boolean; building: boolean }> | null = null;

/** "Awa" from "Awa Diop", else the login. */
const firstName = (p: { name: string | null; login: string }) => p.name?.trim().split(/\s+/)[0] || p.login;

// A project just went online (a room became live, or a build finished in a live room): fireworks over its house
// if it's in this neighbourhood, and one line of news if it's here or in your own house.
function newsFrom(houses: CityHouse[]) {
  const next = new Map<string, { live: boolean; building: boolean }>();
  const mine = new Set(me.value?.houses.map((h) => h.id) ?? []);
  for (const h of houses)
    for (const r of h.rooms) {
      const now = { live: r.status === "live", building: !!r.building };
      next.set(`${h.id}/${r.name}`, now);
      const before = lastRooms?.get(`${h.id}/${r.name}`);
      if (!before || !r.occupant || !now.live) continue;
      if (before.live && !(before.building && !now.building)) continue;
      const inView = h.city === city.value && !inWorkshop.value;
      if (inView) lobby?.celebrate(h.id);
      if (inView || mine.has(h.id)) {
        const where = inView ? null : h.city;
        say(r.project ? w.projectOnline(firstName(r.occupant), r.project, where) : w.roomOnline(firstName(r.occupant), h.name, where));
      }
    }
  lastRooms = next;
}

// The city changed: the world follows (build only redraws what changed), then the news.
watch(
  () => props.houses,
  (houses) => {
    build();
    newsFrom(houses);
  },
);
newsFrom(props.houses);
watch(
  () => [settings.quality, settings.reduceMotion] as const,
  ([q, calm]) => lobby?.setQuality(q, calm),
);
watch(
  () => settings.shortcuts,
  (on) => lobby?.setShortcuts(on),
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  host.value?.removeEventListener("pointerdown", touchStage);
  link?.close();
  link = null;
  lobby?.dispose();
  lobby = null;
  tutorial.dispose();
  // The site's top bar comes back with whatever page comes next, and so does the plain title.
  lobbyUi.chrome = true;
  lobbyUi.inside = false;
  document.title = "La Coloc";
  clearTimeout(noticeTimer);
  clearTimeout(toastTimer);
  clearInterval(idleTimer);
  loading.onProgress = () => undefined;
  loading.onLoad = () => undefined;
});

// ---- Cards: a house, a person, an empty plot or the chores board, floating over the city ----

// One line per thing, so we can tell "the card is already about this" from "something new".
const keyOf = (t: Target | null) =>
  !t ? "" : t.kind === "house" ? `house:${t.house.id}` : t.kind === "empty" ? `empty:${t.plot.key}` : t.kind === "person" ? `person:${t.login}` : `board:${t.city}`;
const cardKey = computed(() => keyOf(card.value));
const nearKey = computed(() => keyOf(near.value));

// You used something. A house you're standing at opens straight away; anything else gets a card first. Early in
// the tutorial nothing opens: those steps are about walking.
function open(target: Target) {
  if (!picking.value) return;
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

// A card opens with a sound and takes focus itself; when it closes, focus goes back to the stage so the keys
// work on the city again.
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

// A house picked on the chores board: you're at its door, and inside.
function boardHouse(id: string) {
  card.value = null;
  arriveFor({ kind: "house", id });
  goInside({ kind: "house", id });
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
// names something other than what's showing, open it, at the house's door; when it's gone, close.
watch(
  () => route.query.in,
  (v) => {
    const param = typeof v === "string" ? v : "";
    if (param === top.value) return;
    const p = parsePlace(param);
    top.value = p && picking.value ? param : "";
    if (p && picking.value) arriveFor(p);
    if (p) openInside(p);
    else if (place.value) {
      place.value = null;
      host.value?.focus({ preventScroll: true });
    }
  },
  { immediate: true },
);

// The tab's title says where you are: "Sacré-Cœur, Dakar · La Coloc", "Ndaje, Sacré-Cœur · La Coloc", "Dakar · La Coloc".
watchEffect(() => {
  const p = parsePlace(top.value) ?? place.value;
  const houseOf = (id: string) => props.houses.find((h) => h.id === id) ?? (id === TUTORIAL_HOUSE ? tutorial.house.value : null);
  let where = placeName.value;
  if (p?.kind === "house") {
    const h = houseOf(p.id);
    if (h) where = h.city && h.city !== "Atelier" ? `${h.name}, ${h.city}` : h.name;
  } else if (p?.kind === "room") {
    const h = houseOf(p.houseId);
    const r = h?.rooms.find((x) => x.name === p.room);
    where = h ? `${r?.project ?? p.room}, ${h.name}` : p.room;
  } else if (p?.kind === "application") where = w.aKnock;
  document.title = `${where} · La Coloc`;
});

// ---- Sheets, keys, emotes ----

// A sheet takes focus on its first control; closing it puts focus back on the stage.
watch(sheet, async (now) => {
  await nextTick();
  if (now) sheetEl.value?.querySelector<HTMLElement>("input, .entry")?.focus();
  else host.value?.focus({ preventScroll: true });
});
// The big map and the key list take focus themselves; when they close, it goes back to the stage. Opening one
// counts as knowing it: its tip never shows.
watch([bigMap, keysOpen], ([map, keys], [mapBefore, keysBefore]) => {
  if (map) seeTip("map");
  if (keys) seeTip("keys");
  if ((!map && mapBefore) || (!keys && keysBefore)) host.value?.focus({ preventScroll: true });
});

// The lobby's own keys (walking, E, Q, R, 1, 2, [ ], Shift) live in the engine. These are the ones around it.
// Escape closes what's open wherever the focus is; the letters only work while the city has the keys.
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A knock or rent dialog, or the Inside sheet, handles its own keys (Escape closes it), and the welcomes (the
  // visitors' one, and the tutorial's cards at either end) have their own too.
  if (knock.value || rent.value || place.value || !ready.value || failed.value || welcoming.value) return;
  if (t.active && (t.step === "welcome" || t.step === "city")) return;
  if (e.key === "Escape") {
    if (bigMap.value) bigMap.value = false;
    else if (keysOpen.value) keysOpen.value = false;
    else if (sheet.value) sheet.value = "";
    else if (card.value) closeCard();
    return;
  }
  // The big map and the key list hold the focus while they're open, so their own key closes them from there.
  const overlay = bigMap.value || keysOpen.value;
  if (!overlay && !cityHasKeys()) return;
  // An overlay on top: only its own key, and Escape, do anything. The map and the key list answer only once the
  // tutorial has shown them.
  if (e.key === "m" || e.key === "M") {
    if (shows("map") && (bigMap.value || !overlay)) bigMap.value = !bigMap.value;
  } else if (e.key === "?") {
    if (shows("keys") && (keysOpen.value || !overlay)) keysOpen.value = !keysOpen.value;
  } else if (overlay) return;
  else if (e.key === "f" || e.key === "F") openSheet("find");
  else if (e.key === "t" || e.key === "T") openSheet("travel");
}

function emote(name: Emote) {
  lobby?.emote(name);
  link?.emote(name);
}

// A house from Find: its city, then its door, and its card.
function findHouse(h: CityHouse) {
  travel(h.city);
  lobby?.arriveAt(h.id);
  card.value = { kind: "house", house: h };
}

const found = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.houses;
  return props.houses.filter((h) => [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad, r.occupant?.login])].join(" ").toLowerCase().includes(q));
});

// The top pill: what this city is doing right now, from the city stream. "Dakar: 7 projects online, 1 building,
// 2 reviews waiting." Under 520px the city's name (already top left) is left out, so it fits on one line.
const activity = computed(() => {
  if (inWorkshop.value) return null;
  // The city couldn't be loaded (the core is down): an empty street isn't news, so the pill says nothing.
  if (core.state === "down" && !props.houses.length) return null;
  let online = 0;
  let building = 0;
  let reviews = 0;
  for (const h of here.value) {
    for (const r of h.rooms) {
      if (r.occupant && r.status === "live") online++;
      if (r.building) building++;
    }
    reviews += h.openChores ?? 0;
  }
  const parts = [online ? w.online(online) : w.noneOnline];
  if (building) parts.push(w.building(building));
  if (reviews) parts.push(w.reviewsWaiting(reviews));
  const line = `${parts.join(", ")}.`;
  return { wide: w.cityLine(city.value, line), short: line[0].toUpperCase() + line.slice(1) };
});

// The travel menu's rows: each city's houses, who's walking around there right now, and its local time (the clock
// ticks while the menu is open).
const now = ref(new Date());
let clock = 0;
watch(sheet, (s) => {
  clearInterval(clock);
  if (s !== "travel") return;
  now.value = new Date();
  clock = window.setInterval(() => (now.value = new Date()), 15_000);
});
onBeforeUnmount(() => clearInterval(clock));
const litCity = ref<string | null>(null);
function cityLine(c: { name: string; houses: number }): string {
  return w.cityRow(c.houses, census.value[c.name] ?? 0, localTime(c.name, now.value));
}
</script>

<template>
  <div class="lobby" :class="{ paused: !!place }">
    <p v-if="failed" class="failed">{{ w.noWebgl }}</p>

    <template v-if="ready && !failed">
      <!-- Each piece of the screen shows once the tutorial has unlocked it (always, outside the tutorial). The HUD
           comes first in the page, so Tab reaches the skip link, the top bar and these buttons before the city. -->
      <button v-if="shows('place')" class="hud place" :aria-label="inWorkshop ? w.inWorkshop(placeName) : w.inCity(city)" @click="openSheet('travel')">
        <span class="city">{{ placeName }}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>

      <!-- Top centre: what the city is doing right now (and, for a moment, a word from the tutorial). -->
      <div class="hud top" aria-live="polite">
        <p v-if="notice">{{ notice }}</p>
        <p v-else-if="activity && shows('here')">
          <span class="wide">{{ activity.wide }}</span>
          <span class="narrow">{{ activity.short }}</span>
        </p>
      </div>

      <!-- Under it: one line of news (a project went online), a city's greeting, or a one-time tip. -->
      <div class="hud news" role="status">
        <Transition name="rise">
          <p v-if="toast" :key="toast.id" class="toast">
            <span class="said"><template v-for="(part, i) in toast.parts" :key="i"><kbd v-if="part.key">{{ part.text }}</kbd><template v-else>{{ part.text }}</template></template></span>
            <span v-if="toast.soft" class="soft">{{ " " + toast.soft }}</span>
          </p>
        </Transition>
      </div>

      <!-- Top left, under the place: what's offered once (the tutorial, after a shared link; the list view, on a
           slow device). -->
      <div v-if="tutorialChip || offerList" class="hud corner">
        <div v-if="tutorialChip" class="chip">
          <button class="chip-go" @click="enterTutorial">{{ w.takeTour }}</button>
          <button class="chip-x" :aria-label="w.noThanks" @click="tutorialChip = false"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button>
        </div>
        <div v-if="offerList" class="chip">
          <button class="chip-go" @click="seeAsList">{{ w.slowHere }}</button>
          <button class="chip-x" :aria-label="w.keep3d" @click="settings.listOffered = true"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button>
        </div>
      </div>

      <div v-if="shows('tools')" class="hud tools">
        <button :aria-label="w.find" @click="openSheet('find')">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
        <button :aria-label="w.turnLeft" @click="lobby?.rotate(-1)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button :aria-label="w.turnRight" @click="lobby?.rotate(1)">
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
          <BoardCard v-else-if="card?.kind === 'board'" :key="cardKey" :city="city" :houses="here" @open="boardHouse" @close="closeCard" />
        </Transition>
        <KeyLegend v-if="shows('keys')" :open="legend" @toggle="legend = !legend" @keys="keysOpen = true" />
      </div>

      <!-- Bottom centre: the coach during the tutorial, what's in reach (or highlighted with [ and ]) while no card
           is open, and the emotes. The coach must stay usable over a house's window, so the column lifts above it;
           on a wide screen, where the window docks on the right, the column moves out of its way. -->
      <div class="hud centre" :class="{ lifted: inWorkshop, aside: inWorkshop && !!place }">
        <Coach
          v-if="inWorkshop && t.step !== 'welcome' && t.step !== 'rundown'"
          :machine="t"
          :missing="tutorial.missing.value"
          :waiting="tutorial.waiting.value"
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
          <div v-if="near && shows('prompt') && !card && !place" class="prompt" role="status">
            <template v-if="near.kind === 'house'">
              <span>
                <strong>{{ near.house.name }}</strong>
                <span class="soft">{{ freeRooms(near.house).length ? w.roomsFree(freeRooms(near.house).length) : "" }}</span>
              </span>
              <button class="pill" @click="lobby?.interact()">{{ w.goIn }} <kbd>E</kbd></button>
            </template>
            <template v-else-if="near.kind === 'empty'">
              <span>{{ w.emptyLot[near.plot.lot] }}</span>
              <button class="pill" @click="lobby?.interact()">{{ w.haveALook }} <kbd>E</kbd></button>
            </template>
            <template v-else-if="near.kind === 'person'">
              <span>
                <strong>{{ near.name }}</strong>
                <span class="soft">{{ residents.get(near.login) ? `, ${residents.get(near.login)!.houseName}` : w.visiting }}</span>
              </span>
              <button class="pill" @click="lobby?.interact()">{{ w.sayHi }} <kbd>E</kbd></button>
            </template>
            <template v-else>
              <span>{{ w.board }}<span class="soft">{{ w.boardWhere(city) }}</span></span>
              <button class="pill" @click="lobby?.interact()">{{ w.haveALook }} <kbd>E</kbd></button>
            </template>
          </div>
        </Transition>
        <div v-if="me && !card && !place && shows('emotes')" class="emotes">
          <button :aria-label="w.thumbsUp" @click="emote('yes')">👍</button>
          <button :aria-label="w.thumbsDown" @click="emote('no')">👎</button>
        </div>
      </div>

      <!-- Bottom right: the neighbourhood from above. Click it to travel; M opens it big. -->
      <div v-if="neighbourhood && shows('map')" class="hud map" :class="{ covered: !!card }">
        <Minimap :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" @travel="fastTravel" />
      </div>
      <!-- Phones have no Shift: a round dash button above the minimap, there whenever the round tools are. -->
      <TouchDash v-if="shows('tools') && !place && !card" @dash="lobby?.dash()" />

      <!-- The tutorial's two welcome cards: before the first step, and in the real city after the last. -->
      <Welcome v-if="t.active && (t.step === 'welcome' || t.step === 'city')" :key="t.step" :step="t.step === 'city' ? 'city' : 'welcome'" :busy="tutorial.busy.value" :error="tutorial.error.value" @start="startTutorial" @skip="tutorial.finish" @end="endTutorial" />

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
        <Minimap v-if="bigMap && neighbourhood" :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" large @travel="fastTravel" @close="bigMap = false" />
      </Transition>
      <Transition name="fade">
        <KeysSheet v-if="keysOpen" @close="keysOpen = false" />
      </Transition>
    </template>

    <!-- The city itself, after the HUD in the page so Tab reaches the buttons first. It takes the keys only while it
         has the focus (a click on it, or Tab to it). Under the HUD on screen all the same (z-index). -->
    <div
      ref="host"
      class="stage"
      role="application"
      tabindex="0"
      :aria-label="w.stage(placeName)"
    />

    <!-- The inside of a house, over the city. Also reachable from the address bar (`?in=…`), 3D or not. -->
    <!-- In the tutorial's rundown step, the window first walks you through itself, then says so. -->
    <Inside
      v-if="place"
      :key="placeKey(place)"
      :start="place"
      :rundown="t.active && t.step === 'rundown'"
      :coached="inWorkshop && t.step !== 'welcome' && t.step !== 'rundown'"
      @change="insideChanged"
      @close="closeInside"
      @rundown-done="t.send({ type: 'rundownDone' })"
      @link="insideLink"
    />

    <Transition name="fade">
      <div v-if="sheet" class="scrim" @click="sheet = ''" />
    </Transition>
    <!-- Find and travel: floating menus in the middle of the screen, a bold title, then one row per house or city,
         like a game's menu entries. The close button comes last, so the first field or row takes the focus. -->
    <Transition name="sheet">
      <section v-if="sheet === 'find'" ref="sheetEl" class="sheet" role="dialog" aria-modal="true" :aria-label="w.findTitle" @keydown.esc="sheet = ''">
        <h2>{{ w.findTitle }}</h2>
        <div class="search">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L21 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <input v-model="query" type="search" :placeholder="w.searchHint" :aria-label="w.searchName" autofocus />
        </div>
        <ul v-if="found.length" class="entries">
          <li v-for="h in found" :key="h.id">
            <button class="entry" @click="findHouse(h)">
              <span class="lead"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11l9-8 9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
              <span class="text">
                <span class="title">{{ h.name }}</span>
                <span class="sub">{{ h.city }}. {{ statusLine(h) }}{{ h.demo ? w.exampleHouse : "" }}</span>
              </span>
              <span class="chev"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
            </button>
          </li>
        </ul>
        <p v-else class="none">{{ w.noMatch }}</p>
        <button class="x" :aria-label="w.close" @click="sheet = ''"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg></button>
      </section>
      <!-- Where to: Africa with a dot per city, and the cities as rows beside it (under it on a phone). -->
      <section v-else-if="sheet === 'travel'" ref="sheetEl" class="sheet travel" role="dialog" aria-modal="true" :aria-label="w.travelName" @keydown.esc="sheet = ''">
        <h2>{{ w.whereTo }}</h2>
        <div class="atlas">
          <AfricaMap class="africa" :cities="cities.map((c) => c.name)" :here="city" :lit="litCity" @travel="travel" @hover="(c) => (litCity = c)" />
          <ul class="entries">
            <li v-for="c in cities" :key="c.name">
              <button
                class="entry"
                :class="{ here: c.name === city }"
                :aria-current="c.name === city ? 'location' : undefined"
                @click="travel(c.name)"
                @pointerenter="litCity = c.name"
                @pointerleave="litCity = null"
                @focus="litCity = c.name"
                @blur="litCity = null"
              >
                <span class="text">
                  <span class="title">{{ c.name }}<span v-if="c.name === city" class="you">{{ w.youreHere }}</span></span>
                  <span class="sub lines">{{ cityLine(c) }}</span>
                </span>
                <span class="chev"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
              </button>
            </li>
          </ul>
        </div>
        <button class="x" :aria-label="w.close" @click="sheet = ''"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg></button>
      </section>
    </Transition>

    <LoadingScreen v-if="!ready || leaving" :progress="progress" :leaving="leaving" />
  </div>
</template>

<style scoped>
.lobby { position: relative; height: 100dvh; min-height: 420px; overflow: hidden; background: linear-gradient(180deg, #2a2148 0%, #4b3a74 45%, #8a6aa0 100%); }
/* Its own stacking context: three.js gives every name tag a z-index, which would otherwise float over the sheets. */
.stage { position: absolute; inset: 0; z-index: 0; isolation: isolate; outline: none; }
/* Tabbed to with the keyboard: a ring inside the screen's edge says the city has the keys now. */
.stage:focus-visible { box-shadow: inset 0 0 0 3px var(--accent-fill); }
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
/* What the city is doing, in a pill at the top; it never catches clicks. */
.top { top: calc(64px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 980px; background: var(--surface); box-shadow: var(--lift); text-align: center; pointer-events: none; max-width: calc(100vw - 32px); }
.top:empty { display: none; }
.top p { margin: 0; font-size: 15px; }
.top .narrow { display: none; }
/* News and tips: one line under the pill, popping in and out; never in the way of a click. */
.news { top: calc(112px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 32px); pointer-events: none; }
.toast { margin: 0; padding: 8px 16px; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow); font-size: 15px; line-height: 1.45; text-align: center; }
.toast .said { font-weight: 600; }
.toast kbd { margin: 0 1px; }
/* The corner offers, under the place button: a soft accent pill and a small way to say no. */
.corner { top: calc(116px + var(--core-offset, 0px)); left: 16px; display: grid; gap: 8px; justify-items: start; max-width: min(340px, calc(100vw - 96px)); }
.chip { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 18px; background: var(--surface); box-shadow: var(--lift); }
.chip-go { min-height: 40px; padding: 6px 12px; border: 0; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font-size: 14px; font-weight: 600; line-height: 1.3; text-align: left; cursor: pointer; }
.chip-go:hover:not(:disabled) { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.chip-x { flex: none; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; background: none; color: var(--muted); cursor: pointer; }
.chip-x:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.tools { top: 60px; right: 16px; display: grid; gap: 8px; }
/* The "can't reach the city" card (CoreStatus.vue) sits at the top centre. On a screen too narrow to leave it room
   beside the place and the tools, they step down under it, like the pill and the news do at every width. */
@media (max-width: 899px) {
  .place, .tools { top: calc(60px + var(--core-offset, 0px)); }
}
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
/* Find and travel: a floating menu in the middle of the screen, flat and big-cornered, popping in. */
.sheet { position: absolute; z-index: 50; top: 50%; left: 50%; translate: -50% -50%; width: min(500px, calc(100vw - 32px)); max-height: min(640px, calc(100dvh - 96px)); padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 14px; border-radius: 28px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.sheet h2 { flex: none; margin: 0; padding-right: 48px; font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
/* The round close button in the corner, like the lobby's cards. */
.sheet .x { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 50%; background: var(--fill); color: var(--muted); }
.sheet .x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.sheet .search { flex: none; position: relative; }
.sheet .search svg { position: absolute; left: 15px; top: 50%; translate: 0 -50%; color: var(--muted); pointer-events: none; }
.sheet input { width: 100%; min-height: 50px; padding: 10px 16px 10px 46px; border-radius: 14px; border: 1px solid transparent; background: var(--tile); color: inherit; font-size: 17px; }
.sheet input:focus { border-color: var(--accent-fill); background: var(--surface); }
/* The rows: the panels' list rows, each one whole button, lit under the pointer and when it holds the focus. */
.sheet .entries { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0 -6px; padding: 2px 6px; display: grid; gap: 6px; align-content: start; overflow-y: auto; overscroll-behavior: contain; }
.sheet .entry { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 10px 8px 12px; border: 0; border-radius: 14px; background: var(--tile); color: var(--text); font: inherit; line-height: 1.3; text-align: left; cursor: pointer; transition: background-color 0.15s var(--ease), box-shadow 0.2s var(--ease); }
.sheet .entry:hover:not(:disabled) { background: var(--fill); }
.sheet .entry:focus-visible { outline: none; background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.sheet .entry:active { transform: scale(0.99); }
.sheet .entry.here { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.sheet .lead { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: var(--surface); color: var(--muted); }
.sheet .here .lead { background: var(--accent-fill); color: var(--on-accent); }
.sheet .text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.sheet .title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .chev { flex: none; display: grid; color: var(--muted); }
.sheet .none { margin: 0; padding: 8px 2px; font-size: 15px; color: var(--muted); }
/* Where to: wider, the map on the left and the cities beside it. */
.sheet.travel { width: min(820px, calc(100vw - 32px)); max-height: min(700px, calc(100dvh - 96px)); }
.atlas { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 18px; align-items: start; }
.atlas .africa { max-height: calc(min(700px, 100dvh - 96px) - 110px); max-width: 100%; justify-self: center; }
.atlas .entries { max-height: calc(min(700px, 100dvh - 96px) - 110px); }
.sheet .sub.lines { white-space: normal; }
.sheet .you { font-weight: 500; color: var(--accent); }
.rise-enter-active, .rise-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translateY(8px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active { transition: opacity 0.22s var(--ease), transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.sheet-leave-active { transition: opacity 0.15s var(--ease), transform 0.15s var(--ease); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; transform: translateY(10px) scale(0.94); }
@media (prefers-reduced-motion: reduce) {
  .rise-enter-active, .rise-leave-active, .fade-enter-active, .fade-leave-active, .sheet-enter-active, .sheet-leave-active { transition: none; }
}
/* No keyboard, no key hints. */
@media (hover: none) {
  kbd { display: none; }
}
@media (max-width: 520px) {
  .prompt { gap: 10px; padding-left: 16px; font-size: 15px; max-width: 100%; }
  .prompt .soft { display: none; }
  .prompt > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The prompt and the emotes move to the left, beside the minimap rather than under it. The coach (lifted)
     keeps the middle. */
  .centre:not(.lifted) { left: 16px; transform: none; align-items: flex-start; max-width: calc(100vw - 180px); }
  /* One line: the city's name is already top left, and anything longer ends in "…". */
  .top { top: calc(112px + var(--core-offset, 0px)); max-width: calc(100vw - 24px); padding: 7px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top p { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
  .top .wide { display: none; }
  .top .narrow { display: inline; }
  .news { top: calc(156px + var(--core-offset, 0px)); }
  .toast { font-size: 14px; }
  .corner { top: calc(200px + var(--core-offset, 0px)); }
  .map { right: 12px; }
  /* A card is a sheet along the bottom edge here: the map would hide under it. */
  .map.covered { display: none; }
  /* Cards become a sheet along the bottom edge; the keys, if a narrow window still shows them, sit above it. */
  .dock { left: 0; right: 0; bottom: 0; align-items: stretch; gap: 0; }
  .dock .legend, .dock .peek { order: -1; align-self: flex-start; margin: 0 16px 12px; }
  /* Find and travel become a sheet along the bottom edge. */
  .sheet, .sheet.travel { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 86dvh; border-radius: 24px 24px 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
  /* Where to: the map on top, small, and the cities under it, scrolling. */
  .atlas { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; }
  .atlas .africa { width: auto; height: 30dvh; max-height: none; }
  .atlas .entries { max-height: none; overflow: visible; }
}
</style>
