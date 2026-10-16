<script setup lang="ts">
// The full-screen lobby, one neighbourhood (city) at a time, and everything that sits on top of it: loading, the
// welcome, the prompt for whatever is in reach, the city's live activity, a card for the house, person,
// empty plot or chores board you picked, the inside of a house (its page, an application, a room) opened over the
// city so you never leave it, a minimap (and a big map, from which you can travel to a house's door), the keys in the corner, short news and tips at the
// top, and sheets to find a house or travel to another city on a map of Africa. The first time someone logged in
// arrives, the quest "Your first home" takes the city's place: one street with a house at the end, a beacon at its
// door, a tracker of eight chapters at the top, a coach at the bottom, and the screen empty but for what the step
// has unlocked; the city comes back, behind a last welcome, when it ends.
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
import { cityAlert, cityStats } from "./lobby/cityStats";
import Icon from "./lobby/house/Icon.vue";
import AfricaMap from "./lobby/AfricaMap.vue";
import BoardCard from "./lobby/BoardCard.vue";
import { type CityRoom, freeRooms, type Home, type MapState, parsePlace, placeParam } from "./lobby/cards";
import EmptyCard from "./lobby/EmptyCard.vue";
import HouseCard from "./lobby/HouseCard.vue";
import Inside from "./lobby/Inside.vue";
import KeyLegend from "./lobby/KeyLegend.vue";
import KeysSheet from "./lobby/KeysSheet.vue";
import HouseBadge from "./lobby/HouseBadge.vue";
import HouseStats from "./lobby/HouseStats.vue";
import Minimap from "./lobby/Minimap.vue";
import TouchDash from "./lobby/TouchDash.vue";
import PersonCard from "./lobby/PersonCard.vue";
import { type Place, placeKey } from "./lobby/place";
import RentSteps from "./lobby/RentSteps.vue";
import { fcfa } from "./lobby/house/server";
import Coach from "./lobby/tutorial/Coach.vue";
import HomeCard from "./lobby/tutorial/HomeCard.vue";
import KeysCard from "./lobby/tutorial/KeysCard.vue";
import QuestTracker from "./lobby/tutorial/QuestTracker.vue";
import { nextTip, type Tip, TIP_TEXT, type TipCue, tipParts } from "./lobby/tutorial/tips";
import { CHAPTERS, FREE, HOUSE_CARDS, type Piece, PIECES, SETUP, STEPS, TUTORIAL_HOUSE } from "./lobby/tutorial/tutorial";
import { useTutorial } from "./lobby/tutorial/useTutorial";
import Welcome from "./lobby/tutorial/Welcome.vue";
import { tutorialWords as qw } from "./lobby/tutorial/words";
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

/** The one fast travel: a house picked on the big map (on the map or in its list) puts you at its door. */
function travelToHouse(id: string) {
  lobby?.travelTo(id);
  bigMap.value = false;
}

// The find and travel sheets, unless the tutorial is on: then just a word, and you stay in the workshop.
function openSheet(which: "find" | "travel") {
  if (!inWorkshop.value) {
    sheet.value = which;
    return;
  }
  say(w.afterTutorial, { ms: 2200 });
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

// ---- The quest: "Your first home" ----

// Its step machine (tutorial.ts) and the API calls around it (useTutorial.ts); the coach and the big cards show it.
const tutorial = useTutorial();
const t = tutorial.machine;
// In the workshop: the quest is on and the city hasn't come back yet (its last step is in the real city).
const inWorkshop = computed(() => t.active && t.step !== "city");
// The houses on screen: the workshop during the quest, else this city's.
const shown = computed(() => (inWorkshop.value ? [tutorial.house.value] : here.value));
// What the place button says: the workshop's name, or the city's.
const placeName = computed(() => (inWorkshop.value ? tutorial.house.value.name : city.value));
// In the workshop nothing can be picked (no cards, no going in) until the step that sends you to its door.
const picking = computed(() => !inWorkshop.value || STEPS.indexOf(t.step) >= STEPS.indexOf("go"));
// Opened on a shared link by someone the quest is for: it didn't start, and this corner button offers it.
const tutorialChip = ref(false);
// The steps shown as a card in the middle of the screen, which hold the keyboard themselves.
const centred = computed(() => t.active && ["welcome", "keys", "home", "city"].includes(t.step));

// The visitors' welcome (Onboarding.vue), for visitors and anyone the quest isn't for (an API without it leaves
// `tutorialDone` out). Someone logged in who hasn't done the quest gets the quest instead. A place opened
// from a link comes first: the welcome waits until it's closed.
const welcoming = computed(() => meLoaded.value && !settings.welcomed && !t.active && me.value?.tutorialDone !== false && !place.value);

// What's on screen besides the city itself. In the quest, only what the step has unlocked, starting from
// nothing; outside it, everything (the keys, the map and the prompt wait for the welcome to end).
const reveal = computed<Set<Piece>>(() => {
  if (t.active) return new Set(SETUP[t.step].reveal);
  if (welcoming.value) return new Set(PIECES.filter((p) => p !== "keys" && p !== "map" && p !== "prompt" && p !== "quest"));
  return new Set(PIECES.filter((p) => p !== "quest"));
});
const shows = (piece: Piece) => reveal.value.has(piece);
// The site's top bar is a piece like the others: App.vue hides it while the quest says so.
watchEffect(() => (lobbyUi.chrome = shows("chrome")));
// A house's window docked on the right: the "can't reach the city" card keeps to the left half (CoreStatus.vue).
watchEffect(() => (lobbyUi.inside = !!place.value));

// The engine lets you do what the step allows; outside the quest, everything.
function applyControls() {
  lobby?.setControls(t.active ? SETUP[t.step].controls : FREE);
}
watch(() => [t.active, t.step], applyControls);

// Chapter 2's goal: a beacon at the workshop's door, and its pin on the map, while you're looking for it.
const goal = computed(() => (inWorkshop.value && SETUP[t.step].beacon ? TUTORIAL_HOUSE : null));
watch(goal, (id) => lobby?.setBeacon(id));

// Where the workshop stands on the quest's map, for the camera to show it: its door, else its plot.
function workshopSpot(): { x: number; z: number } | null {
  const door = lobby?.houseSpot(TUTORIAL_HOUSE);
  if (door) return door;
  const plot = neighbourhood.value?.plots.find((p) => p.lot.kind === "house" && p.lot.houseId === TUTORIAL_HOUSE);
  return plot ? { x: plot.x, z: plot.z } : null;
}

// The "look" step: the camera goes to the beacon at the workshop's door, holds a moment, and comes back to you;
// then you walk there.
watch(
  () => t.active && t.step === "look",
  async (looking) => {
    if (!looking) return;
    const spot = workshopSpot();
    if (lobby && spot) await lobby.showSpot(spot.x, spot.z, { hold: 2 }).catch(() => undefined);
    t.send({ type: "shown" });
  },
);

// The quest takes the city's place: everything open closes, the workshop's street is built, and presence moves
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
  lobby?.setBeacon(null);
  others.value = new Set();
  lobby?.clearRemotes();
  build();
  link?.enter(city.value);
  host.value?.focus({ preventScroll: true });
}
watch(inWorkshop, (now, before) => {
  if (before && !now) leaveWorkshop();
});

// The city's welcome card said "Let's go": the quest is over, and the keyboard goes back to the city. Walking
// was its first lesson, so that tip is never needed.
function endTutorial() {
  t.send({ type: "end" });
  seeTip("walk");
  host.value?.focus({ preventScroll: true });
}

// "Start" on the first card: the keyboard goes to the city, where the walking happens. "Continue" jumps to the
// chapter you'd reached; from the keys on, you're put back at the workshop's door.
function startTutorial(resume = false) {
  t.send({ type: "start", resume });
  if (STEPS.indexOf(t.step) >= STEPS.indexOf("keys")) lobby?.arriveAt(TUTORIAL_HOUSE);
  host.value?.focus({ preventScroll: true });
}
// The welcome card for someone coming back: the chapter they'd reached, to continue from there.
const resumeAt = computed(() => {
  const c = t.saved;
  return t.canResume && c ? { n: CHAPTERS.indexOf(c) + 1, name: qw.chapters[c] } : null;
});
// The welcome card waits for the API's first word, so it doesn't change under you when "Continue" arrives.
const welcomeReady = computed(() => tutorial.loaded.value || tutorial.missing.value || tutorial.waiting.value);

// It starts on its own, once the lobby is up, for someone logged in who hasn't done it (an API without the
// quest leaves `tutorialDone` out, and then nothing starts). Opened on a shared link, it waits in a corner
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
// The workshop changes as you take a room and it goes live: its windows follow.
watch(tutorial.house, () => {
  if (inWorkshop.value) build();
});

// Each finished chapter is stamped on the tracker, with a thump and a line of news.
watch(
  () => t.stamps.length,
  (n, before) => {
    if (!t.active || n <= (before ?? 0) || t.step === "welcome") return;
    play("stamp");
    // "Welcome home" is its own celebration, in the middle of the screen: no line of news over it.
    if (t.step !== "home") say(qw.stamped(n), { ms: 2600 });
  },
);

// Chapter 3: the room is yours. The window closes so you see the house, and the keys jingle on their card.
// Chapter 8: the house's window opens again, on the tab each card talks about; "Welcome home" closes it.
const questTab = computed(() => {
  if (!inWorkshop.value || t.step !== "house") return undefined;
  return ({ flatmates: "rooms", reviews: "chores", news: "fridge" } as const)[HOUSE_CARDS[t.card]];
});
watch(
  () => (t.active ? t.step : null),
  (step) => {
    if (step === "keys") {
      if (place.value) closeInside();
      window.setTimeout(() => play("keys"), 250);
    } else if (step === "house" && place.value?.kind !== "house") {
      goInside({ kind: "house", id: TUTORIAL_HOUSE });
    } else if (step === "home" && place.value) closeInside();
  },
);

// Chapter 5: it went live. Fireworks over the house (its window lights up with the house's next word), then, a
// moment later, the next chapter: your address.
let launchedTimer = 0;
watch(
  () => t.launched,
  (launched) => {
    clearTimeout(launchedTimer);
    if (!launched || !inWorkshop.value) return;
    lobby?.celebrate(TUTORIAL_HOUSE);
    launchedTimer = window.setTimeout(() => t.send({ type: "next" }), 2400);
  },
);
onBeforeUnmount(() => clearTimeout(launchedTimer));

// Chapters 4 and 5: where the project comes from, so "Try again" launches the same thing.
const source = ref<"starter" | "github">("starter");
function run(from: "starter" | "github") {
  source.value = from;
  void tutorial.deploy(from);
}
// Chapter 8: what a review takes off the rent, from the workshop's bill (500 FCFA when it has none).
const credit = computed(() => fcfa(tutorial.view.value?.bill?.reviewCredit ?? 500));
// "Welcome home": your first name.
const myFirstName = computed(() => me.value?.name?.trim().split(/\s+/)[0] || me.value?.login || null);

// An outside link was clicked inside a house's window: if it's your live room, chapter 6 counts it as opened.
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

// ---- Sheets, keys, the wave ----

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

// The lobby's own keys (walking, E, Q, R, [ ], Shift) live in the engine. These are the ones around it.
// Escape closes what's open wherever the focus is; the letters only work while the city has the keys.
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A knock or rent dialog, or the Inside sheet, handles its own keys (Escape closes it), and the welcomes (the
  // visitors' one, and the tutorial's cards at either end) have their own too.
  if (knock.value || rent.value || place.value || !ready.value || failed.value || welcoming.value) return;
  if (centred.value) return;
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

// The top chip: only when something in this city needs attention (a real house's server down, a failed build;
// cityStats.ts), said in one line: "Dakar: Sacré-Cœur's server is down." While all is well it says nothing (Jib,
// 15 10). Under 520px the city's name (already top left) is left out, so it fits on one line.
const activity = computed(() => {
  if (inWorkshop.value) return null;
  // The city couldn't be loaded (the core is down): the core's own banner says so.
  if (core.state === "down" && !props.houses.length) return null;
  const alert = cityAlert(here.value);
  if (!alert) return null;
  const line = alert.kind === "down" ? w.alertDown(alert.houses) : w.alertFailed(alert.rooms);
  return { wide: w.cityLine(city.value, line), short: line, tone: alert.kind === "down" ? "danger" : "warn" };
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
// Each city's stats as chips: who's walking around, its houses, its projects online, and its local time.
const statsByCity = computed(() => cityStats(props.houses));
function statsOf(name: string) {
  const s = statsByCity.value.get(name) ?? { houses: 0, online: 0 };
  return { walking: census.value[name] ?? 0, houses: s.houses, online: s.online, time: localTime(name, now.value) };
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

      <!-- Top centre, during the quest: its tracker, eight stamps and the chapter you're in. -->
      <div v-if="inWorkshop && shows('quest') && t.step !== 'home'" class="hud quest">
        <QuestTracker :stamps="t.stamps" :current="t.chapter" />
      </div>

      <!-- Top centre, in the city: what needs attention there, if anything. -->
      <div v-if="!inWorkshop" class="hud top" :class="activity?.tone" aria-live="polite">
        <p v-if="activity && shows('here')">
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

      <div v-if="shows('tools')" class="hud tools" :class="{ questing: inWorkshop }">
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

      <!-- Bottom centre: the quest's coach, what's in reach (or highlighted with [ and ]) while no card is open. The
           HUD's thumbs up and down are gone (Jib, 15 10); waving still happens from a person's card. The coach must stay usable over a house's window, so the column lifts above it; on a wide
           screen, where the window docks on the right, the column moves out of its way. -->
      <div class="hud centre" :class="{ lifted: inWorkshop, aside: inWorkshop && !!place }">
        <Coach
          v-if="inWorkshop && !centred"
          :key="t.step"
          :machine="t"
          :missing="tutorial.missing.value"
          :waiting="tutorial.waiting.value"
          :busy="tutorial.busy.value"
          :error="tutorial.error.value"
          :source="source"
          :credit="credit"
          :choices="tutorial.choices.value"
          @room="tutorial.takeRoom"
          @pick="tutorial.pickRepo"
          @run="run"
          @github="t.send({ type: 'github' })"
          @back="t.send({ type: 'back' })"
          @opened="t.send({ type: 'opened' })"
          @shared="t.send({ type: 'shared' })"
          @later="t.send({ type: 'skip' })"
          @next="t.send({ type: 'next' })"
          @stop="tutorial.finish"
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
      </div>

      <!-- Bottom right: the neighbourhood from above. Clicking it (or M) opens it big; it never moves you. -->
      <div v-if="neighbourhood && shows('map')" class="hud map" :class="{ covered: !!card, questing: inWorkshop, finding: !!goal }">
        <Minimap :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" :goal="goal" @open="bigMap = true" />
      </div>
      <!-- Phones have no Shift: a round dash button above the minimap, there whenever the round tools are. -->
      <TouchDash v-if="shows('tools') && !place && !card" @dash="lobby?.dash()" />

      <!-- The quest's cards in the middle of the screen: the welcome (or "welcome back"), the keys to your room,
           "Welcome home", and the city's own welcome after it. -->
      <Welcome
        v-if="t.active && ((t.step === 'welcome' && welcomeReady) || t.step === 'city')"
        :key="t.step"
        :step="t.step === 'city' ? 'city' : 'welcome'"
        :busy="tutorial.busy.value"
        :error="tutorial.error.value"
        :resume="resumeAt"
        @start="startTutorial(false)"
        @resume="startTutorial(true)"
        @skip="tutorial.finish"
        @end="endTutorial"
      />
      <KeysCard
        v-if="inWorkshop && t.step === 'keys' && t.state?.room"
        :room="t.state.room.name"
        :house="t.state.house.name"
        @next="t.send({ type: 'next' })"
      />
      <HomeCard
        v-if="inWorkshop && t.step === 'home'"
        :first="myFirstName"
        :room="t.state?.room?.name ?? null"
        :url="t.state?.room?.url ?? null"
        :busy="tutorial.busy.value"
        :error="tutorial.error.value"
        @finish="tutorial.finish"
      />

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
        <Minimap v-if="bigMap && neighbourhood" :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" :goal="goal" large @go="travelToHouse" @close="bigMap = false" />
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
    <!-- During the quest the window keeps its own first-visit tour to itself (the quest explains the house one card
         at a time) and, in chapter 8, shows the tab the card talks about. -->
    <Inside
      v-if="place"
      :key="placeKey(place)"
      :start="place"
      :quiet="inWorkshop"
      :tab="questTab"
      :coached="inWorkshop && !centred"
      @change="insideChanged"
      @close="closeInside"
      @link="insideLink"
      @wave="emote('yes')"
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
              <!-- The house in its own colour (dashed for an example), its city, and its people and rooms as icons. -->
              <HouseBadge :id="h.id" :sample="h.demo" />
              <span class="text">
                <span class="title">{{ h.name }}</span>
                <span class="line"><span class="city">{{ h.city }}</span><HouseStats :house="h" :sample="h.demo" /></span>
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
                :aria-current="c.name === city ? 'location' : undefined"
                @click="travel(c.name)"
                @pointerenter="litCity = c.name"
                @pointerleave="litCity = null"
                @focus="litCity = c.name"
                @blur="litCity = null"
              >
                <span class="text">
                  <span class="title">{{ c.name }}</span>
                  <!-- Icon chips, each with its hidden name; the numbers in the monospace, calm like a dashboard. -->
                  <span class="stats">
                    <span class="stat" :class="{ zero: !statsOf(c.name).walking }" role="img" :aria-label="w.walking(statsOf(c.name).walking)"><Icon name="people" :size="14" />{{ statsOf(c.name).walking }}</span>
                    <span class="stat" role="img" :aria-label="w.houses(statsOf(c.name).houses)"><Icon name="house" :size="14" />{{ statsOf(c.name).houses }}</span>
                    <span class="stat" :class="{ zero: !statsOf(c.name).online }" role="img" :aria-label="w.online(statsOf(c.name).online)"><Icon name="rocket" :size="14" />{{ statsOf(c.name).online }}</span>
                    <span v-if="statsOf(c.name).time" class="stat" role="img" :aria-label="w.timeThere(statsOf(c.name).time)"><Icon name="clock" :size="14" />{{ statsOf(c.name).time }}</span>
                  </span>
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
/* Behind the canvas, the 3D city's own day sky (daylight.ts): the city is always seen by day. */
.lobby { position: relative; height: 100dvh; min-height: 420px; overflow: hidden; background: linear-gradient(180deg, #6fa6dc 0%, #cfe2f2 100%); }
/* Its own stacking context: three.js gives every name tag a z-index, which would otherwise float over the sheets. */
.stage { position: absolute; inset: 0; z-index: 0; isolation: isolate; outline: none; }
/* Tabbed to with the keyboard: a ring inside the screen's edge says the city has the keys now. */
.stage:focus-visible { box-shadow: inset 0 0 0 3px var(--accent-fill); }
.stage :deep(canvas) { display: block; }
/* No WebGL: one flat card in the middle says so. */
.failed { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); margin: 0; padding: 20px 24px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); text-align: center; font-size: 17px; }
/* Everything on top of the city is a flat piece of the site's surface, lifted by a shadow: no glass, no blur. */
.hud { position: absolute; z-index: 10; color: var(--text); transition: opacity var(--dur) var(--ease); }
/* A house, a room or a knock is open: like a game's pause menu, the HUD around it steps back (who's here, the
   round tools and the minimap, which the panel would half cover), leaving the place and the keys. */
.paused .hud.top, .paused .hud.tools, .paused .hud.map { opacity: 0; pointer-events: none; }
/* The HUD's pieces are flat keys on the surface: a hairline edge, a small lip under the ones you can press. */
.place, .tools button { background: var(--surface); color: var(--text); box-shadow: var(--lift), 0 2px 0 var(--line-strong); }
/* Where you are, as a breadcrumb: a slash in the monospace, then the city's name in the display face. */
.place { top: 60px; left: 16px; display: flex; align-items: center; gap: 8px; padding: 6px 12px; min-height: 44px; border: 0; border-radius: var(--r-md); cursor: pointer; }
.place::before { content: "/"; font: 500 16px/1 var(--mono); color: var(--accent); }
.place .city { font: 800 20px/1.1 var(--display); letter-spacing: -0.02em; }
.place .chev { font-size: 20px; line-height: 1; color: var(--muted); transition: transform var(--dur-fast) var(--ease); }
.place:hover .chev { transform: translateX(2px); }
/* What needs attention in this city, in a strip at the top with its dot (red: a server down, amber: a failed build);
   absent while all is well. It never catches clicks. */
.top { top: calc(64px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 7px 14px 7px 12px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--lift); text-align: center; pointer-events: none; max-width: calc(100vw - 32px); }
.top::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
.top.danger::before { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.top:empty { display: none; }
.top p { margin: 0; font-size: 14px; font-weight: 500; min-width: 0; }
.top .narrow { display: none; }
/* The quest's tracker takes the pill's place, at the top centre. */
.quest { top: calc(64px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px); }
/* News and tips: one line under the pill, popping in and out; never in the way of a click. */
.news { top: calc(112px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 32px); pointer-events: none; }
/* The toast's look is shared (style.css); here only its place. */
.toast kbd { margin: 0 1px; }
/* The corner offers, under the place button: a soft accent pill and a small way to say no. */
.corner { top: calc(116px + var(--core-offset, 0px)); left: 16px; display: grid; gap: 8px; justify-items: start; max-width: min(340px, calc(100vw - 96px)); }
.chip { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--lift); }
.chip-go { min-height: 40px; padding: 6px 12px; border: 0; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent); font-size: 14px; font-weight: 600; line-height: 1.3; text-align: left; cursor: pointer; }
.chip-go:hover:not(:disabled) { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.chip-x { flex: none; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: var(--r-sm); display: grid; place-items: center; background: none; color: var(--muted); cursor: pointer; }
.chip-x:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.tools { top: 60px; right: 16px; display: grid; gap: 8px; }
/* The "can't reach the city" card (CoreStatus.vue) sits at the top centre. On a screen too narrow to leave it room
   beside the place and the tools, they step down under it, like the pill and the news do at every width. */
@media (max-width: 899px) {
  .place, .tools { top: calc(60px + var(--core-offset, 0px)); }
}
.tools button { width: 44px; height: 44px; min-height: 0; padding: 0; border-radius: var(--r-md); border: 0; display: grid; place-items: center; cursor: pointer; }
.tools button:active:not(:disabled) { transform: translateY(2px); box-shadow: var(--lift); }
/* The dock stacks the card over the keys; its empty space lets clicks through to the city. */
.dock { left: 16px; bottom: max(28px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-start; gap: 12px; pointer-events: none; }
.dock > * { pointer-events: auto; }
/* The middle column: the coach or the prompt; the gaps let clicks through. */
.centre { left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.centre > * { pointer-events: auto; }
/* During the tutorial the column sits above a house's inside (60), so the coach's buttons stay in reach. */
.centre.lifted { z-index: 70; }
/* A wide screen docks the window on the right: the coach moves to the bottom left, above the keys. */
@media (min-width: 900px) {
  .centre.aside { left: 16px; bottom: max(76px, env(safe-area-inset-bottom)); transform: none; align-items: flex-start; }
}
/* The interact prompt, like a game's: what's in reach in the display face, and the one action as the orange key. */
.prompt { display: flex; align-items: center; gap: 16px; padding: 8px 8px 8px 18px; border-radius: var(--r-lg); background: var(--surface); color: var(--text); box-shadow: var(--shadow); white-space: nowrap; font-size: 16px; max-width: calc(100vw - 32px); animation: prompt-pop var(--dur-slow) var(--ease-pop); }
.prompt strong { font: 800 18px/1.1 var(--display); letter-spacing: -0.02em; }
@keyframes prompt-pop {
  from { transform: scale(0.96); }
}
.soft { color: var(--muted); }
/* The one main action: the orange key with its lip, and the key it answers to. */
.pill { border: 0; border-radius: var(--r-md); padding: 8px 14px 8px 16px; min-height: 44px; font: 700 17px/1 var(--display); letter-spacing: -0.01em; background: var(--accent-fill); color: var(--on-accent); box-shadow: 0 var(--lip) 0 var(--accent-lip); cursor: pointer; display: inline-flex; align-items: center; gap: 10px; }
.pill:active:not(:disabled) { transform: translateY(calc(var(--lip) - var(--lip-pressed))); box-shadow: 0 var(--lip-pressed) 0 var(--accent-lip); }
.map { right: 16px; bottom: max(28px, env(safe-area-inset-bottom)); }
/* Our own hovers, so the site's grey button hover doesn't paint over these. */
.pill:hover:not(:disabled) { background: var(--accent-fill-hover); }
.place:hover:not(:disabled), .tools button:hover:not(:disabled) { background: var(--fill); }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
.scrim { position: absolute; inset: 0; z-index: 40; background: var(--scrim); }
/* Find and travel: a floating menu in the middle of the screen, flat and big-cornered, popping in. */
.sheet { position: absolute; z-index: 50; top: 50%; left: 50%; translate: -50% -50%; width: min(500px, calc(100vw - 32px)); max-height: min(640px, calc(100dvh - 96px)); padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 14px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.sheet h2 { flex: none; margin: 0; padding-right: 48px; font-size: 28px; line-height: 1.05; }
/* The round close button in the corner, like the lobby's cards. */
.sheet .x { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.sheet .x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.sheet .search { flex: none; position: relative; }
.sheet .search svg { position: absolute; left: 15px; top: 50%; translate: 0 -50%; color: var(--muted); pointer-events: none; }
.sheet input { width: 100%; min-height: 48px; padding: 10px 16px 10px 46px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--tile); color: inherit; font-size: 17px; }
.sheet input:focus { border-color: var(--accent-fill); background: var(--surface); }
/* The rows: the panels' list rows, each one whole button, lit under the pointer and when it holds the focus. */
.sheet .entries { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0 -6px; padding: 2px 6px; display: grid; gap: 6px; align-content: start; overflow-y: auto; overscroll-behavior: contain; }
/* The same look as the panels' ListRow (a surface row with a 1px edge). Where you are is the orange dot on the map. */
.sheet .entry { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 10px 8px 12px; border: 0; border-radius: var(--r-md); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--text); font: inherit; line-height: 1.3; text-align: left; cursor: pointer; transition: background-color var(--dur-fast) var(--ease), box-shadow var(--dur) var(--ease); }
.sheet .entry:hover:not(:disabled) { background: var(--tile); }
/* The selected entry is filled with the soft orange: a fill, never an outline. */
.sheet .entry:focus-visible { outline: none; background: var(--accent-soft); }
.sheet .entry:active { transform: translateY(1px); }
.sheet .text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.sheet .title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; font-size: 13px; color: var(--muted); }
.sheet .chev { flex: none; display: grid; color: var(--muted); }
.sheet .none { margin: 0; padding: 8px 2px; font-size: 15px; color: var(--muted); }
/* Where to: wider, the map on the left and the cities beside it. */
.sheet.travel { width: min(820px, calc(100vw - 32px)); max-height: min(700px, calc(100dvh - 96px)); }
.atlas { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 18px; align-items: start; }
.atlas .africa { max-height: calc(min(700px, 100dvh - 96px) - 110px); max-width: 100%; justify-self: center; }
.atlas .entries { max-height: calc(min(700px, 100dvh - 96px) - 110px); }
/* A city's stats: small icon chips, the numbers in the monospace; a zero steps back. */
.sheet .stats { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 2px; color: var(--muted); }
.sheet .stat { display: inline-flex; align-items: center; gap: 4px; font: 500 12.5px/1.2 var(--mono); }
.sheet .stat.zero { opacity: 0.55; }
.rise-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.rise-leave-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translateY(8px); }
.fade-enter-active, .fade-leave-active { transition: opacity var(--dur) var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.sheet-leave-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; transform: translateY(10px) scale(0.95); }
@media (prefers-reduced-motion: reduce) {
  .rise-enter-active, .rise-leave-active, .fade-enter-active, .fade-leave-active, .sheet-enter-active, .sheet-leave-active { transition: none; }
  .prompt { animation: none; }
  .pill:active:not(:disabled), .tools button:active:not(:disabled) { transform: none; }
}
/* No keyboard, no key hints. */
@media (hover: none) {
  kbd { display: none; }
}
@media (max-width: 520px) {
  .prompt { gap: 10px; padding-left: 14px; font-size: 15px; max-width: 100%; }
  .prompt strong { font-size: 16px; }
  .prompt .soft { display: none; }
  .prompt > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The prompt moves to the left, beside the minimap rather than under it. The coach (lifted)
     keeps the middle. */
  .centre:not(.lifted) { left: 16px; transform: none; align-items: flex-start; max-width: calc(100vw - 180px); }
  /* One line: the city's name is already top left, and anything longer ends in "…". */
  .top { top: calc(112px + var(--core-offset, 0px)); max-width: calc(100vw - 24px); padding: 7px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top p { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
  .top .wide { display: none; }
  .top .narrow { display: inline; }
  .news { top: calc(156px + var(--core-offset, 0px)); }
  /* The tracker steps down under the place and the tools, like the pill does. */
  .quest { top: calc(112px + var(--core-offset, 0px)); }
  .toast { font-size: 14px; }
  .corner { top: calc(200px + var(--core-offset, 0px)); }
  .map { right: 12px; }
  /* In the quest the coach takes the bottom of a phone's screen: the map moves to the top right, under the
     tracker, while it points at the house you're looking for, and steps aside after that. */
  .map.questing { display: none; }
  /* The quest's tracker needs the phone's width; turning the view can wait for the city. */
  .tools.questing { display: none; }
  .map.questing.finding { display: block; top: calc(160px + var(--core-offset, 0px)); bottom: auto; }
  /* A card is a sheet along the bottom edge here: the map would hide under it. */
  .map.covered { display: none; }
  /* Cards become a sheet along the bottom edge; the keys, if a narrow window still shows them, sit above it. */
  .dock { left: 0; right: 0; bottom: 0; align-items: stretch; gap: 0; }
  .dock .legend, .dock .peek { order: -1; align-self: flex-start; margin: 0 16px 12px; }
  /* Find and travel become a sheet along the bottom edge. */
  .sheet, .sheet.travel { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 86dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
  /* Where to: the map on top, small, and the cities under it, scrolling. */
  .atlas { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; }
  .atlas .africa { width: auto; height: 30dvh; max-height: none; }
  .atlas .entries { max-height: none; overflow: visible; }
}
</style>
