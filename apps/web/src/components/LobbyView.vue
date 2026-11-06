<script setup lang="ts">
// The full-screen lobby, one neighbourhood (city) at a time, and everything that sits on top of it: loading, the
// welcome, the prompt for whatever is in reach, the city's live activity, a card for the house, person or
// empty plot you picked, the city board's window (the city's room and its posts), the inside of a house (its page,
// an application, a room) opened over the city so you never leave it, a minimap (and a big map, from which you can travel to a house's door), the keys in the corner, short news at the
// top, and sheets to find a house or travel to another city on a map of Africa. The first time someone logged in
// arrives, the quest "Your first home" takes the city's place: one street with a house at the end, a beacon at its
// door, a tracker of eight chapters at the top, a coach at the bottom, and the screen empty but for what the step
// has unlocked; the city comes back, behind a last welcome, when it ends.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loading } from "../lobby/assets";
import { styleFor } from "../lobby/cityStyle";
import { Lobby, type LobbyEvents, type Target } from "../lobby/Lobby";
import { checkCore, core } from "../core";
import { language } from "../i18n";
import { caps, cityOwnsKeys } from "../lobby/keys";
import { type LobbyCount, LobbyLink } from "../lobby/link";
import { generateNeighbourhood, type Neighbourhood } from "../lobby/neighbourhood";
import { play, unlock } from "../lobby/sound";
import { tutorialNeighbourhood } from "../lobby/tutorialMap";
import { boardSheet, chatPinged, chatSheet, lastSent, openBoard } from "../conversations";
import { watchPresence } from "../activity";
import { friends, loadFriends } from "../friends";
import { arenaWanted, creditWanted, loadNotices, movedIn, plotWanted } from "../notices";
import { oneAtATime, windows } from "../oneWindow";
import { loadMe, me, meLoaded } from "../session";
import { lobbyUi, settings, settingsPane, slowDevice } from "../settings";
import { openStream, type Stream } from "../stream";
import type { Badge, CityHouse, HouseView, Message } from "../types";
import { type ArenaDisplay, toDisplay } from "./arena/arena";
import ArenaPanel from "./arena/ArenaPanel.vue";
import { arena, followArena, leaveArena, loadArena } from "./arena/store";
import { arenaWords as aw } from "./arena/words";
import KnockSteps from "./KnockSteps.vue";
import { localTime } from "./lobby/africa";
import { chatter, cityHappenings, onceEach } from "./lobby/cityLife";
import { cityAlert, cityStats } from "./lobby/cityStats";
import Icon from "./lobby/house/Icon.vue";
import AfricaMap from "./lobby/AfricaMap.vue";
import CityBoardWindow from "./lobby/CityBoardWindow.vue";
import CityMissions from "./lobby/CityMissions.vue";
import { type CityRoom, freeRooms, type Home, type MapState, nearestEmptyPlot, parsePlace, placeParam } from "./lobby/cards";
import EmptyCard from "./lobby/EmptyCard.vue";
import HouseCard from "./lobby/HouseCard.vue";
import { findHouses, findPeople, workshopRow } from "./lobby/home";
import Inside from "./lobby/Inside.vue";
import KeysSheet from "./lobby/KeysSheet.vue";
import { houseStatsWords } from "./lobby/houseStats";
import Minimap from "./lobby/Minimap.vue";
import { type MissionId, missionOfMessage, tick, upgrade } from "./lobby/missions";
import TouchDash from "./lobby/TouchDash.vue";
import PersonCard from "./lobby/PersonCard.vue";
import { type Place, placeKey } from "./lobby/place";
import RentSteps from "./lobby/RentSteps.vue";
import { evenSplit, fcfa, houseCost, OPERATORS, plans, WORKSHOP_SHARES } from "./lobby/house/server";
import Coach from "./lobby/tutorial/Coach.vue";
import HomeCard from "./lobby/tutorial/HomeCard.vue";
import KeysCard from "./lobby/tutorial/KeysCard.vue";
import QuestTracker from "./lobby/tutorial/QuestTracker.vue";
import Spotlight from "./lobby/tutorial/Spotlight.vue";
import { keyParts } from "./lobby/tutorial/tour";
import TourCard from "./lobby/tutorial/TourCard.vue";
import { CHAPTERS, FREE, HOUSE_CARDS, type Piece, PIECES, SETUP, STEPS, TUTORIAL_HOUSE } from "./lobby/tutorial/tutorial";
import { useTutorial } from "./lobby/tutorial/useTutorial";
import QuestIcon, { type QuestIconName } from "./lobby/tutorial/QuestIcon.vue";
import SkipTutorial from "./lobby/tutorial/SkipTutorial.vue";
import Welcome from "./lobby/tutorial/Welcome.vue";
import { houseLineOf, tutorialWords as qw } from "./lobby/tutorial/words";
import LoadingScreen from "./LoadingScreen.vue";
import CharacterCreation from "./CharacterCreation.vue";
import { digits, needsCharacter } from "./credit";
import CreditCard from "./CreditCard.vue";
import Onboarding from "./Onboarding.vue";
import { boardWords as bw, missionWords } from "./lobby/words";
import { creditWords as cw, lobbyWords as w } from "./words";

const props = defineProps<{ houses: CityHouse[] }>();

// The arena (docs/arena.md): its stadium's entrance is a target like the market's board, and the engine draws the
// week's challenge on its big screen, walks you to it, and counts who's inside. Reached through these shapes, so the
// page also runs on an engine that has no stadium yet: the calls are skipped and the count never comes.
type AnyTarget = Target | { kind: "arena"; city: string };
type ArenaEngine = { setArena?: (display: ArenaDisplay | null) => void; goToArena?: () => void };
type ArenaEvents = { onArenaCrowd(n: number, you: boolean): void };
const route = useRoute();
const router = useRouter();
const host = ref<HTMLElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);
const near = ref<AnyTarget | null>(null);
const card = ref<AnyTarget | null>(null);
const failed = ref(false);
const progress = ref<number | null>(null);
const ready = ref(false);
const leaving = ref(false);
const others = ref(new Set<string>());
// What the live line says about each person walking here: a real GitHub account, an example person. Their card uses it.
const players = ref(new Map<string, { github?: boolean; example?: boolean; badge?: Badge | null }>());
// How many people stand inside the arena right now, as the engine counts them; null until it has said.
const crowd = ref<number | null>(null);
const connected = ref(false);
const census = ref<Record<string, number>>({});
// The lobbies of the cities that need several (32 people each), and the one we're in.
const lobbies = ref<Record<string, LobbyCount[]>>({});
const lobbyHere = ref(1);
const LOBBY_SIZE = 32;
const cityLobbies = computed(() => (inWorkshop.value ? [] : (lobbies.value[city.value] ?? [])));
// The next lobby of this city with room, going round.
const nextLobby = computed(() => {
  const list = cityLobbies.value;
  const at = list.findIndex((l) => l.n === lobbyHere.value);
  for (let i = 1; i < list.length; i++) {
    const l = list[(at + i) % list.length];
    if (l.people < LOBBY_SIZE) return l.n;
  }
  return null;
});
const sheet = ref<"" | "find" | "travel">("");
// The card your credit opens. Back from PayDunya's page, the address says `?credit=added` (or `open`): it opens itself,
// and the parameter goes.
const creditBack = String(route.query.credit ?? "");
const creditOpen = ref(creditBack === "added" || creditBack === "open");
const creditAdded = creditBack === "added";
if (creditBack) {
  const { credit: _, ...rest } = route.query;
  void router.replace({ query: rest });
}
// "Top up" under the bell (rent you were short of) opens it too.
watch(creditWanted, () => (creditOpen.value = true));
const query = ref("");
// Who's in this lobby when Find opened, for its rows.
const peopleHere = ref<{ login: string; name: string }[]>([]);
// The strip of keys, bottom left: folded or not. The full list and the big map are overlays.
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
// The engine's arena part, if it has one.
const stadium = () => lobby as (Lobby & ArenaEngine) | null;
let link: LobbyLink | null = null;
// Stops watching how present you are (activity.ts), which the line tells your friends.
let stopPresence: (() => void) | null = null;
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
// The city in the address bar, else your house's city, else the city you belong to, else the busiest one.
const city = ref<string>(String(route.query.city ?? "") || myCity.value || me.value?.homeCity || cities.value[0]?.name || "Dakar");
// The city board's window is about the city you're in.
watch(city, (c) => (chatSheet.city = c), { immediate: true });
const here = computed(() => props.houses.filter((h) => h.city === city.value));

// Who lives where, across every city: rings and cards.
const residents = computed(() => {
  const map = new Map<string, Home>();
  for (const h of props.houses)
    for (const r of h.rooms)
      if (r.occupant) {
        // Someone with several rooms is shown in their first, and is at home in every city they have one.
        const known = map.get(r.occupant.login);
        if (known) known.cities?.push(h.city);
        else map.set(r.occupant.login, { houseId: h.id, houseName: h.name, city: h.city, cities: [h.city], room: r.name, project: r.project, badge: r.occupant.badge ?? null });
      }
  return map;
});

// Draws the neighbourhood on screen. The engine only rebuilds when what's drawn changed (a house, a plot, who
// lives where); for live news alone (a room going online, a build, a power cut) it redraws those in place.
function build() {
  if (!lobby) return;
  // The tutorial's neighbourhood is one street, drawn by hand, with the workshop at its far end: nowhere to get lost.
  const n = inWorkshop.value ? tutorialNeighbourhood() : generateNeighbourhood(city.value, here.value);
  neighbourhood.value = n;
  // Passers-by walk the city's streets, not the tutorial's: the quest keeps its one street calm.
  lobby.setNeighbourhood(n, shown.value, { passersBy: !inWorkshop.value, close: inWorkshop.value, tourists: !inWorkshop.value });
  lobby.setResidents(residents.value);
  shownArena = "";
  showArenaScreen();
  wearMyBadge();
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
  missionDone("city");
}

/** The one fast travel: a house picked on the big map (on the map or in its list) puts you at its door. */
function travelToHouse(id: string) {
  lobby?.travelTo(id);
  // Should it be off screen (not built yet when you arrive), the arrow at the screen's edge shows the way.
  lobby?.pointAt(id);
  bigMap.value = false;
}

// The find and travel sheets, unless the tutorial is on: then just a word, and you stay in the workshop.
function openSheet(which: "find" | "travel") {
  if (!inWorkshop.value) {
    if (which === "find") {
      query.value = "";
      peopleHere.value = lobby?.peopleHere() ?? [];
    }
    sheet.value = which;
    return;
  }
  say(w.afterTutorial, { ms: 2200 });
}

// Puts you at a house's door, facing it (the engine snaps, no walk), travelling to its city first if it's in
// another one. For a house opened from the address bar, the top bar, Find or the city board's Reviews tab.
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
const inWorkshop = computed(() => t.active && t.step !== "city" && t.step !== "tour");
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
// The walkthrough's steps: a card at the bottom, and the keys stay the city's (TourCard.vue). No coach, no spotlight.
const walkthrough = computed(() => t.active && t.step === "tour");

// The visitors' welcome (Onboarding.vue), for visitors and anyone the quest isn't for (an API without it leaves
// `tutorialDone` out). Someone logged in who hasn't done the quest gets the quest instead. A place opened
// from a link comes first: the welcome waits until it's closed.
// Who you are comes before any of it: at first login, and after the demo restarts, you pick a look and get your credit.
// A place opened from a link comes first here too.
const creating = computed(() => needsCharacter(meLoaded.value, me.value) && !place.value);
const welcoming = computed(() => meLoaded.value && !creating.value && !settings.welcomed && !t.active && me.value?.tutorialDone !== false && !place.value);

// What's on screen besides the city itself. In the quest, only what the step has unlocked, starting from
// nothing; outside it, everything, once the welcome has been read or skipped.
const reveal = computed<Set<Piece>>(() => {
  if (creating.value) return new Set();
  if (t.active) return new Set(SETUP[t.step].reveal);
  if (!meLoaded.value || welcoming.value) return new Set();
  return new Set(PIECES.filter((p) => p !== "quest"));
});
const shows = (piece: Piece) => reveal.value.has(piece);
// The site's top bar is a piece like the others: App.vue hides it while the quest says so.
watchEffect(() => (lobbyUi.chrome = shows("chrome")));
// A house's window docked on the right: the "can't reach the city" card keeps to the left half (CoreStatus.vue).
watchEffect(() => (lobbyUi.inside = !!place.value));

// The engine lets you do what the step allows; outside the quest, everything.
function applyControls() {
  lobby?.setControls(creating.value ? SETUP.welcome.controls : t.active ? SETUP[t.step].controls : FREE);
}
watch(() => [t.active, t.step, creating.value], applyControls);
// The camera stays on you while you pick your look.
watch(
  () => creating.value && ready.value,
  (on) => lobby?.focusOnPlayer(on),
);

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
  chatSheet.open = false;
  boardSheet.open = false;
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
  focusStage();
}

// Out of the workshop (finished or skipped): the real city comes back, and so does everyone in it.
function leaveWorkshop() {
  if (place.value) closeInside();
  // A chat left open in the workshop doesn't greet you in the city (Jib, 6 11: "the chat opens by itself").
  chatSheet.open = false;
  boardSheet.open = false;
  card.value = null;
  bigMap.value = false;
  keysOpen.value = false;
  lobby?.setBeacon(null);
  others.value = new Set();
  lobby?.clearRemotes();
  build();
  link?.enter(city.value);
  focusStage();
}
watch(inWorkshop, (now, before) => {
  if (before && !now) leaveWorkshop();
});

// The city's welcome card said "Let's go": its short walkthrough, then the keyboard goes back to the city.
function endTutorial() {
  t.send({ type: "end" });
  focusStage();
}

// The corner's "Skip the tutorial" (SkipTutorial.vue), the quest's one way out: in the workshop, the quest is marked
// done (as "Into the city" does) and the real city comes back; in the city, its welcome and walkthrough end too.
async function skipTutorial() {
  if (inWorkshop.value) {
    await tutorial.finish();
    if (tutorial.error.value) return;
  }
  t.stop();
  focusStage();
}
// Escape is the corner button's only while nothing else on screen would close with it.
const escFree = computed(() => !place.value && !sheet.value && !card.value && !bigMap.value && !keysOpen.value && !knock.value && !rent.value && !creditOpen.value && !keysFor.value && !chatSheet.open && !boardSheet.open);

// "Start" on the first card: the keyboard goes to the city, where the walking happens. "Continue" jumps to the
// chapter you'd reached; from the keys on, you're put back at the workshop's door.
function startTutorial(resume = false) {
  t.send({ type: "start", resume });
  if (STEPS.indexOf(t.step) >= STEPS.indexOf("keys")) lobby?.arriveAt(TUTORIAL_HOUSE);
  focusStage();
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
    // "Well done" is its own celebration, in the middle of the screen: no line of news over it.
    if (t.step !== "home") say(qw.stamped(n), { ms: 2600 });
  },
);

// Chapter 3: the room is yours. The window closes so you see the house, and the keys come after the first rent: your
// share of the workshop's server, shown as what it would really cost.
const firstRent = computed(() => {
  const view = tutorial.view.value;
  const total = (view && houseCost(view)) ?? plans[1].fcfa;
  return { share: evenSplit(total, WORKSHOP_SHARES), total, shares: WORKSHOP_SHARES, operators: view?.operators?.length ? view.operators : OPERATORS };
});
// Chapter 8: the house's window opens again, on the tab each card talks about; "Well done" closes it.
const questTab = computed(() => {
  if (!inWorkshop.value || t.step !== "house") return undefined;
  return ({ flatmates: "people", channel: "channel", reviews: "chores", news: "fridge", bill: "bill" } as const)[HOUSE_CARDS[t.card]];
});

// The icon on each of chapter 8's spotlight cards, the tab it talks about.
const SPOT_ICON: Record<(typeof HOUSE_CARDS)[number], QuestIconName> = { flatmates: "people", channel: "chat", reviews: "reviews", news: "news", bill: "bill" };

// The steps that point at a control in the workshop's window get a spotlight on it, in place of the coach (Jib, 6 11):
// taking the free room (its square on the floor plan), then each of the house's tabs.
const spot = computed(() => {
  if (!inWorkshop.value || centred.value || walkthrough.value || creating.value || place.value?.kind !== "house" || place.value.id !== TUTORIAL_HOUSE) return null;
  if (t.step === "room") return { target: '[data-spot="take"]', focus: "target" as const, side: "below" as const };
  // A tab's line goes above it, over the window's head, so the tab's content shows under the dim.
  if (t.step === "house" && questTab.value) return { target: `#tab-${questTab.value}`, focus: "line" as const, side: "above" as const };
  return null;
});
const questLabel = computed(() => (t.chapter ? `${qw.quest}. ${qw.chapterOf(CHAPTERS.indexOf(t.chapter) + 1, CHAPTERS.length, qw.chapters[t.chapter])}` : qw.quest));
watch(
  () => (t.active ? t.step : null),
  (step) => {
    if (step === "keys") {
      // The keys jingle on their card, once the first rent is paid (KeysCard.vue).
      if (place.value) closeInside();
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
// "Well done": your first name.
const myFirstName = computed(() => me.value?.name?.trim().split(/\s+/)[0] || me.value?.login || null);

// An outside link was clicked inside a house's window: if it's your live room, chapter 6 counts it as opened.
function insideLink(url: string) {
  const mine = t.state?.room?.url;
  const bare = (u: string) => u.replace(/\/+$/, "");
  if (mine && bare(url) === bare(mine)) t.send({ type: "opened" });
}

// ---- News: one short line at a time, under the city's activity ----

// A toast: plain words and key caps (keyParts), and how long it stays.
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
  toastQueue.push({ id: ++toastId, parts: keyParts(text), soft: opts.soft, ms: opts.ms ?? 4200 });
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

// The visitors' welcome is over.
function welcomeDone() {
  settings.welcomed = true;
}

// ---- A slow device: low quality is already the default (settings.ts); the list view is offered once ----

const offerList = computed(() => ready.value && slowDevice() && !settings.listOffered && settings.view === "lobby" && !t.active && !welcoming.value);
function seeAsList() {
  settings.listOffered = true;
  settings.view = "list";
}

// ---- The keyboard: only while the city has it ----

// Clicked or tapped the city at least once, or handed the keys when something closed: from then on, keys pressed
// with nothing focused are the city's too.
let stageTouched = false;
function touchStage() {
  stageTouched = true;
}
/**
 * Gives the keyboard back to the city: the stage takes the focus and counts as touched, here and in the engine. For
 * whenever a welcome, a card, a sheet or a dialog closes, so the keys the screen shows (E, M, W A S D) work at once
 * rather than after a click.
 */
function focusStage() {
  stageTouched = true;
  if (lobby) lobby.takeKeys();
  else host.value?.focus({ preventScroll: true });
}
/** A window closed: the keys go back to the city, unless it closed because another one opened (that one has them). */
function backToCity() {
  if (!windows.anyOpen()) focusStage();
}

// ---- Windows: one at a time, Esc closes the top one, a click on the city closes them (oneWindow.ts) ----

// The lobby's own windows sign up with the page's list (App.vue signs up the top bar's). A house's window and your
// credit (a native dialog) close themselves on Escape.
const letGo = [
  oneAtATime("house", { isOpen: () => !!place.value, close: () => closeInside(), ownEscape: true }),
  oneAtATime("card", { isOpen: () => !!card.value, close: () => closeCard() }),
  oneAtATime("find", { isOpen: () => sheet.value === "find", close: () => (sheet.value = "") }),
  oneAtATime("travel", { isOpen: () => sheet.value === "travel", close: () => (sheet.value = "") }),
  oneAtATime("map", { isOpen: () => bigMap.value, close: () => (bigMap.value = false) }),
  oneAtATime("keys", { isOpen: () => keysOpen.value, close: () => (keysOpen.value = false) }),
  oneAtATime("credit", { isOpen: () => creditOpen.value, close: () => (creditOpen.value = false), ownEscape: true }),
  // A welcome, a tutorial card in the middle, the keys to a new room, a knock or a rent dialog: Esc is theirs.
  windows.hold(() => blocking.value || centred.value),
];
onBeforeUnmount(() => letGo.forEach((f) => f()));

// A click (or a tap) on the city while a window is open closes it, and that's all it does: you don't walk, and no card
// opens. Caught on the way down, before the engine hears it.
function clickOutside(e: PointerEvent) {
  if (!host.value?.contains(e.target as Node) || windows.held() || !windows.anyOpen()) return;
  e.stopPropagation();
  windows.closeAll();
  focusStage();
}
/**
 * Whether a key press is for the city (WCAG 2.1.4): the stage has focus, or nothing has (the page itself, or a button
 * that was hidden under the focus) after the stage was touched, and the shortcuts are on in settings. The engine
 * follows the same rule for its own keys (keys.ts).
 */
function cityHasKeys(): boolean {
  if (!settings.shortcuts || !host.value) return false;
  return cityOwnsKeys(document.activeElement, document.body, host.value, stageTouched);
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
  window.addEventListener("pointerdown", clickOutside, true);
  // Browsers keep audio asleep until the first click or key press: that's when the sounds wake up.
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  host.value?.addEventListener("pointerdown", touchStage);

  try {
    const events: LobbyEvents & ArenaEvents = {
        onNear: (target) => (near.value = target),
        onSelect: open,
        // The engine sets the cursor and the outline itself; there's nothing to add up here.
        onHover: () => undefined,
        onMove: (s) => {
          link?.move(s);
          // A click or a tap on the ground walks too: the tutorial's walk step counts it.
          if (s.moving) t.send({ type: "moved" });
        },
        // Each control you use (a walk direction, a dash, a turn): the tutorial's steps listen.
        onAction: (name) => t.send({ type: "action", name }),
        onMap: (s) => (mapState.value = s),
        onArenaCrowd: (n, you) => {
          crowd.value = n;
          // Walking onto the pitch is checking out the Arena, as much as opening its panel.
          if (you) missionDone("arena");
        },
    };
    lobby = new Lobby(
      host.value!,
      events,
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
    onSnapshot: (list, n) => {
      lobbyHere.value = n;
      lobby?.clearRemotes();
      list.forEach((p) => lobby?.addRemote(p));
      others.value = new Set(list.map((p) => p.login).filter((l) => l !== me.value?.login));
      players.value = new Map(list.map((p) => [p.login, { github: p.github, example: p.example, badge: badgeOf(p) }]));
    },
    onJoin: (p) => {
      lobby?.addRemote(p);
      if (p.login !== me.value?.login) others.value = new Set([...others.value, p.login]);
      players.value = new Map(players.value).set(p.login, { github: p.github, example: p.example, badge: badgeOf(p) });
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
    onCensus: (counts, perLobby) => {
      census.value = counts;
      lobbies.value = perLobby;
    },
    // Something new under your bell: the top bar's bell fetches it.
    onNotice: () => void loadNotices(),
    onChat: chatPinged,
    // A friend came, went, or changed status: the friends list fetches itself again.
    onFriends: () => void loadFriends(),
  });
  link.enter(city.value);
  stopPresence = watchPresence((p) => link?.setPresence(p));
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
      if (inView && cheer(h.id, performance.now())) lobby?.celebrate(h.id);
      if (inView || mine.has(h.id)) {
        const where = inView ? null : h.city;
        say(r.project ? w.projectOnline(firstName(r.occupant), r.project, where) : w.roomOnline(firstName(r.occupant), h.name, where));
      }
    }
  lastRooms = next;
}

// The city's happenings (cityLife.ts): a review done, a room's app crashing and coming back, a project going
// live. Each is played once, by the engine, at its house, if that house is on screen. The
// first list only counts as seen (a list still empty because the core was down doesn't count as a first list).
const happenings = cityHappenings();
// A project going live shows twice (its window lights up, and a "live" happening comes): one set of fireworks.
const cheer = onceEach();
function playHappenings(houses: CityHouse[]) {
  if (!houses.length) return;
  const onScreen = (id: string) => !inWorkshop.value && here.value.some((h) => h.id === id);
  for (const { houseId, happening } of happenings(houses, onScreen)) {
    if (happening.kind === "live" && !cheer(houseId, performance.now())) continue;
    lobby?.happening(houseId, happening);
  }
}

// The city changed: the world follows (build only redraws what changed), then the news.
watch(
  () => props.houses,
  (houses) => {
    build();
    newsFrom(houses);
    playHappenings(houses);
  },
);
newsFrom(props.houses);
playHappenings(props.houses);
watch(
  () => [settings.quality, settings.reduceMotion] as const,
  ([q, calm]) => lobby?.setQuality(q, calm),
);
watch(
  () => settings.shortcuts,
  (on) => lobby?.setShortcuts(on),
);
watch(
  () => language.lang,
  () => lobby?.relabel(),
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("pointerdown", clickOutside, true);
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  host.value?.removeEventListener("pointerdown", touchStage);
  link?.close();
  link = null;
  stopPresence?.();
  stopPresence = null;
  lobby?.dispose();
  lobby = null;
  tutorial.dispose();
  // The site's top bar comes back with whatever page comes next, and so does the plain title.
  lobbyUi.chrome = true;
  lobbyUi.inside = false;
  document.title = "La Coloc";
  clearTimeout(toastTimer);
  loading.onProgress = () => undefined;
  loading.onLoad = () => undefined;
  leaveArena();
});

// ---- The arena ----

// The arena of the city on screen, kept fresh over the city's stream (arena/store.ts). The tutorial's workshop has
// no stadium. Logging in or out changes what the arena says about you (joined, your pull requests): it asks again.
watch([city, inWorkshop], () => followArena(inWorkshop.value ? null : city.value), { immediate: true });
watch(
  () => me.value?.login ?? null,
  () => void loadArena(!!arena.view),
);

// The stadium's big screen, in the chosen language, from the moment the city loads (not only once the panel is
// opened): drawn again whenever what it shows changes, and once more on each new neighbourhood (build()).
const arenaDisplay = computed(() => (arena.view && !inWorkshop.value && arena.city === city.value ? toDisplay(arena.view, language.lang) : null));
let shownArena = "";
function showArenaScreen() {
  const display = arenaDisplay.value;
  const said = JSON.stringify(display);
  if (said === shownArena) return;
  shownArena = said;
  stadium()?.setArena?.(display);
}
watch(arenaDisplay, showArenaScreen);

// Your own title on your own name tag: the live line's snapshot lists everyone but you, so it comes from /api/me
// (and follows a change in Settings).
function wearMyBadge() {
  const login = me.value?.login;
  if (login) lobby?.setBadge(login, me.value?.badge ?? null);
}
watch(() => JSON.stringify(me.value?.badge ?? null), wearMyBadge);

// The HUD's way in: you walk (or travel) to the stadium's entrance, where its panel opens.
function goToArena() {
  closeCard();
  stadium()?.goToArena?.();
  // Back to the city: E at the gate opens the Arena straight away, not the round tool that brought you.
  focusStage();
}
const arenaOpen = computed(() => card.value?.kind === "arena");
// The arena opened right here: you're put at its gate, with its panel open.
function openArena() {
  goToArena();
  card.value = { kind: "arena", city: city.value };
}
// The panel docks on the right like a house's window: the camera puts you on the left half meanwhile.
watch(arenaOpen, (open) => {
  if (!place.value) lobby?.frame(open ? "left" : "follow");
});

// The title someone wears, as the live line says it (its `join` carries it for someone logged in).
const badgeOf = (p: object): Badge | null => (p as { badge?: Badge | null }).badge ?? null;

// ---- The city's missions: five things to try once you've arrived (lobby/missions.ts, CityMissions.vue) ----

// Saved before the city board was a mission: brought up to the five, so the board's row shows up too.
settings.missions = upgrade(settings.missions);
// They begin when the welcomes are over, for someone logged in, and stay until all five are done.
const missionsOn = computed(() => !!me.value && settings.welcomed && !settings.missions.finished && !t.active && !creating.value);
// Like the other corner pieces, they step aside for whatever's open over the city.
const missionsShown = computed(() => missionsOn.value && !blocking.value && !place.value && !sheet.value && !bigMap.value && !keysOpen.value && !arenaOpen.value);
function missionDone(id: MissionId) {
  if (!missionsOn.value) return;
  const next = tick(settings.missions, id);
  if (next === settings.missions) return;
  settings.missions = next;
  play("stamp");
}
// Each is noticed from what already happens: the board's window open; a message gone (conversations.ts), to someone
// who isn't your friend or in a house that isn't yours; the Arena's panel open, or you on its pitch (the engine's
// head count); travel() ticks the last one.
watch(
  () => boardSheet.open,
  (open) => open && missionDone("board"),
);
watch(lastSent, (sent) => {
  const id = sent && missionOfMessage(sent.url, { friends: friends.friends.map((f) => f.login), houses: me.value?.houses.map((h) => h.id) ?? [] });
  if (id) missionDone(id);
});
watch(arenaOpen, (open) => {
  if (open) missionDone("arena");
});
// A row pressed: where that mission happens. The board: you're put in front of it, its window open. A stranger: Find,
// which lists who's walking here. A house: what you can do there, said.
function missionGo(id: MissionId) {
  if (id === "board") {
    if (lobby?.goToBoard()) openBoardHere();
  } else if (id === "talk") openSheet("find");
  else if (id === "arena") openArena();
  else if (id === "city") openSheet("travel");
  else say(missionWords.houseHint);
}

// ---- Cards: a house, a person or an empty plot, floating over the city; and the city board's window ----

// One line per thing, so we can tell "the card is already about this" from "something new".
const keyOf = (t: AnyTarget | null) =>
  !t
    ? ""
    : t.kind === "house"
      ? `house:${t.house.id}`
      : t.kind === "empty"
        ? `empty:${t.plot.key}`
        : t.kind === "person"
          ? `person:${t.login}`
          : `${t.kind}:${t.city}`;
const cardKey = computed(() => keyOf(card.value));
const nearKey = computed(() => keyOf(near.value));

// You used something. A house you're standing at opens straight away; anything else, a person too, gets a card
// first. Early in the tutorial nothing opens: those steps are about walking.
function open(target: AnyTarget, how: "use" | "click" = "click") {
  if (!picking.value) return;
  if (target.kind === "board") {
    openBoardHere();
    return;
  }
  if (target.kind === "house" && nearKey.value === keyOf(target)) {
    goInside({ kind: "house", id: target.house.id });
    return;
  }
  card.value = target;
}

// The city board, used: its window opens on this city, on the tab it was last on. The only way to the city's room
// and its posts (Jib, 6 11), besides the bell's link to a reply.
function openBoardHere() {
  closeCard();
  chatSheet.city = city.value;
  openBoard(boardSheet.tab, boardSheet.post);
}
// It docks on the right like a house's window: the camera puts you (and the board) on the left half meanwhile. Closed,
// the keys go back to the city.
watch(
  () => boardSheet.open,
  (open, before) => {
    if (!place.value) lobby?.frame(open ? "left" : "follow");
    if (open) play("open");
    else if (before) {
      play("close");
      backToCity();
    }
  },
);

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
// Your own house as the city lists it: the person card offers its free room.
const myHouse = computed(() => {
  const mine = me.value?.houses[0]?.id;
  return mine ? (props.houses.find((h) => h.id === mine) ?? null) : null;
});
// ---- Speech bubbles: what people say while you're here ----

// New messages in this city's public room, and (for its flatmates) in your house's channel, show as a bubble over
// whoever said them, if they're on screen (the engine checks). Only what arrives while the page is open: each
// conversation's first load only counts as seen (cityLife.ts). The city's room is heard through the city's stream
// (a "chat" nudge, then a fetch with your own login, so people you blocked stay quiet); your house's channel
// through the house's stream, which carries the whole house view.
const cityTalk = chatter();
const houseTalk = chatter();
let cityTalkStream: Stream | null = null;
let houseTalkStream: Stream | null = null;
// One fetch at a time per conversation; a nudge during one asks again once it's back.
let hearing = false;
let hearAgain = false;
async function hearCity(c: string) {
  if (hearing) {
    hearAgain = true;
    return;
  }
  hearing = true;
  try {
    const res = await fetch(`/api/cities/${encodeURIComponent(c)}/chat`).catch(() => null);
    const data = res?.ok ? ((await res.json().catch(() => null)) as { messages: Message[] } | null) : null;
    // Another city by now: what this one said is for nobody.
    if (data && c === talkCity) for (const line of cityTalk.next(data.messages ?? [])) lobby?.say(line.login, line.text);
  } finally {
    hearing = false;
    if (hearAgain && talkCity) {
      hearAgain = false;
      void hearCity(talkCity);
    }
  }
}
function hearHouse(view: HouseView | null) {
  if (view?.channel) for (const line of houseTalk.next(view.channel)) lobby?.say(line.login, line.text);
}
// The city whose room is listened to: the one on screen, once the city is up (never the workshop's street).
let talkCity: string | null = null;
watch(
  () => (ready.value && !failed.value && !inWorkshop.value ? city.value : null),
  (c) => {
    cityTalkStream?.close();
    cityTalkStream = null;
    cityTalk.reset();
    talkCity = c;
    if (!c) return;
    void hearCity(c);
    cityTalkStream = openStream(`/api/cities/${encodeURIComponent(c)}/stream`, { chat: () => void hearCity(c) });
  },
  { immediate: true },
);
// Your house, when it stands in the city on screen: its channel is for flatmates, and the API sends it only to them.
const talkHouse = computed(() => (ready.value && !failed.value && !inWorkshop.value && myHouse.value?.city === city.value ? myHouse.value.id : null));
// Each change of house is a new turn; an answer that comes back after the next turn began is dropped.
let houseTurn = 0;
watch(
  talkHouse,
  async (id) => {
    const turn = ++houseTurn;
    houseTalkStream?.close();
    houseTalkStream = null;
    houseTalk.reset();
    if (!id) return;
    const url = `/api/houses/${encodeURIComponent(id)}`;
    const res = await fetch(url).catch(() => null);
    if (turn !== houseTurn) return;
    hearHouse(res?.ok ? ((await res.json().catch(() => null)) as HouseView | null) : null);
    houseTalkStream = openStream(`${url}/stream`, { house: (e) => hearHouse(JSON.parse(e.data) as HouseView) });
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cityTalkStream?.close();
  houseTalkStream?.close();
});

// What the live line says about the card's person, if they're walking around.
const cardPlayer = computed(() => (card.value?.kind === "person" ? (players.value.get(card.value.login) ?? null) : null));
// The title the card's person wears: as the live line says, else as their house lists them.
const cardBadge = computed((): Badge | null => {
  const c = card.value;
  if (c?.kind !== "person") return null;
  const occupant = cardHomeHouse.value?.rooms.find((r) => r.occupant?.login === c.login)?.occupant;
  return cardPlayer.value?.badge ?? occupant?.badge ?? null;
});

// A card opens with a sound and takes focus itself; when it closes, focus goes back to the stage so the keys
// work on the city again.
watch(cardKey, (now, before) => {
  if (now) play("open");
  else if (before) {
    play("close");
    backToCity();
  }
});

// A house picked on the board's Reviews tab or a person's card: you're at its door, and inside.
function boardHouse(id: string) {
  card.value = null;
  boardSheet.open = false;
  arriveFor({ kind: "house", id });
  goInside({ kind: "house", id });
}

// "Find a plot" under the bell (two people will rent together): walk to the nearest empty plot; its card offers
// to start a coloc there.
watch(plotWanted, () => {
  if (inWorkshop.value || !neighbourhood.value) return;
  const you = mapState.value?.you ?? { x: 0, z: 0 };
  const key = nearestEmptyPlot(neighbourhood.value.plots, you);
  if (!key) return;
  closeInside();
  lobby?.goToPlot(key);
});

// Someone mentioned you in the Arena's room (the bell's open key): its panel, at its gate.
watch(arenaWanted, () => {
  if (inWorkshop.value) return;
  closeInside();
  openArena();
});

// Moved in through an invitation (the bell's "Move in"): the keys, as in the quest, then the house's window.
const keysFor = computed(() => (movedIn.value && !inWorkshop.value ? movedIn.value : null));
watch(keysFor, (now) => {
  if (!now) return;
  card.value = null;
  window.setTimeout(() => play("keys"), 250);
  void loadMe();
});
function movedInDone() {
  const id = movedIn.value?.houseId;
  movedIn.value = null;
  if (!id) return;
  arriveFor({ kind: "house", id });
  goInside({ kind: "house", id });
}

// The visitors' welcome, a tutorial card in the middle, the keys to a new room, a knock or a rent dialog: when the
// last of them closes, the keys go back to the city (M10).
const blocking = computed(() => creating.value || creditOpen.value || welcoming.value || centred.value || !!keysFor.value || !!knock.value || !!rent.value);
watch(blocking, async (now, before) => {
  if (now || !before) return;
  await nextTick();
  if (!blocking.value && !place.value && !sheet.value && !card.value) focusStage();
});
// You arrive with nothing over the city: the keys work at once, no click needed. The focus isn't moved, so there's no
// ring around the screen and Tab still starts at the top of the page.
watch(
  () => ready.value && !failed.value && meLoaded.value && !blocking.value && !place.value,
  (arrived) => {
    if (!arrived) return;
    stageTouched = true;
    lobby?.keysOnArrival();
  },
  { immediate: true },
);

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
  chatSheet.open = false;
  boardSheet.open = false;
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
  backToCity();
}

// The window docks on the right of a wide screen, so the camera moves you to the left half while it's open.
watch(
  () => !!place.value,
  (open) => lobby?.frame(open ? "left" : "follow"),
);
// The tutorial hears when a house's window opens on the workshop, and when it closes.
watch(place, (now, before) => {
  // Whatever you did in there may have cost credit (a project's first time online, the rent).
  if (before && !now) void loadMe();
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
      focusStage();
    }
  },
  { immediate: true },
);

// The tab's title says where you are: "Sacré-Cœur, Dakar · La Coloc", "Ndaje, Sacré-Cœur · La Coloc", "Dakar · La Coloc".
const houseOf = (id: string) => props.houses.find((h) => h.id === id) ?? (id === TUTORIAL_HOUSE ? tutorial.house.value : null);
// The breadcrumb top left: the house you're inside (its window, or one of its rooms), else the city (or the workshop).
const crumb = computed(() => {
  const p = parsePlace(top.value) ?? place.value;
  const id = p?.kind === "house" ? p.id : p?.kind === "room" ? p.houseId : null;
  return (id && houseOf(id)?.name) || placeName.value;
});
watchEffect(() => {
  const p = parsePlace(top.value) ?? place.value;
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

// ---- Sheets and keys ----

// A sheet takes focus on its first control; closing it puts focus back on the stage.
watch(sheet, async (now) => {
  await nextTick();
  if (now) sheetEl.value?.querySelector<HTMLElement>("input, .entry")?.focus();
  else backToCity();
});
// The big map and the key list take focus themselves; when they close, it goes back to the stage.
watch([bigMap, keysOpen], ([map, keys], [mapBefore, keysBefore]) => {
  if ((!map && mapBefore) || (!keys && keysBefore)) backToCity();
});

// The lobby's own keys (walking, E, Q, R, [ ], Shift) live in the engine. These are the ones around it.
// Escape stops your walk wherever the focus is, and the page closes the window on top (App.vue, oneWindow.ts); the
// letters only work while the city has the keys.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    lobby?.halt();
    return;
  }
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // A knock or rent dialog, or the Inside sheet, handles its own keys (Escape closes it), and the welcomes (the
  // visitors' one, and the tutorial's cards at either end) have their own too.
  if (knock.value || rent.value || place.value || keysFor.value || !ready.value || failed.value || welcoming.value || creating.value || creditOpen.value) return;
  if (centred.value) return;
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

// The workshop as its house view, for someone logged in: it isn't on the city's list, so this says whether you have
// a room there (for the home button) and gives Find its row. Asked once you're out of the quest; a failure (the core
// down, an API without it) just leaves it out.
const workshop = shallowRef<HouseView | null>(null);
watch(
  () => [me.value?.login, inWorkshop.value] as const,
  async ([login, questing]) => {
    if (!login || questing) return;
    const res = await fetch(`/api/houses/${TUTORIAL_HOUSE}`).catch(() => null);
    workshop.value = res?.ok ? await res.json().catch(() => null) : null;
  },
  { immediate: true },
);
// A house from Find: its city, then its door, and its card. The workshop isn't in any city: its window opens.
function findHouse(h: CityHouse) {
  if (h.id === TUTORIAL_HOUSE) {
    goInside({ kind: "house", id: h.id });
    return;
  }
  travel(h.city);
  lobby?.arriveAt(h.id);
  lobby?.pointAt(h.id);
  card.value = { kind: "house", house: h };
}

// An example house says so in its row.
const sampleWord = computed(() => houseStatsWords.sampleTag);
// Find's rows, once you've typed something: the cities, the people in this lobby, and the houses (with the workshop,
// if you live there), matched by house, project or person (home.ts).
const typed = computed(() => query.value.trim().toLowerCase());
const foundCities = computed(() => (typed.value ? cities.value.map((c) => c.name).filter((c) => c.toLowerCase().includes(typed.value)) : []));
const foundPeople = computed(() => (typed.value ? findPeople(peopleHere.value, typed.value) : []));
const found = computed(() => {
  if (!typed.value) return [];
  const row = workshopRow(workshop.value);
  return findHouses(row ? [...props.houses, row] : props.houses, typed.value);
});
function findPerson(login: string) {
  sheet.value = "";
  lobby?.goToPerson(login);
}
// Enter takes the first row.
function findFirst() {
  sheetEl.value?.querySelector<HTMLElement>(".entry")?.click();
}

// The top chip: only when something in this city needs attention (a real house's server down, a failed build;
// cityStats.ts), said in one line: "Dakar: Sacré-Cœur's server is down." While all is well it says nothing (Jib,
// 15 10). Under 520px the city's name (already top left) is left out, so it fits on one line.
const activity = computed(() => {
  if (inWorkshop.value) return null;
  // The city couldn't be loaded (the core is down): the core's own banner says so.
  if (core.state === "down" && !props.houses.length) return null;
  const alert = cityAlert(here.value, me.value?.houses.map((h) => h.id) ?? []);
  if (!alert) return null;
  const line = w.alertDown(alert.houses);
  return { wide: w.cityLine(city.value, line), short: line, tone: "danger" };
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
  <div class="lobby" :class="{ paused: !!place || arenaOpen, windowed: !!place }">
    <p v-if="failed" class="failed">{{ w.noWebgl }}</p>

    <template v-if="ready && !failed">
      <!-- Each piece of the screen shows once the tutorial has unlocked it (always, outside the tutorial). The HUD
           comes first in the page, so Tab reaches the skip link, the top bar and these buttons before the city. -->
      <button
        v-if="shows('place') && cityLobbies.length > 1"
        class="hud lobby-number"
        :disabled="nextLobby === null"
        :aria-label="w.lobbyOf(lobbyHere, cityLobbies.length)"
        @click="nextLobby !== null && link?.changeLobby(nextLobby)"
      >
        <Icon name="people" :size="18" />
        <span>{{ lobbyHere }}</span>
      </button>
      <button v-if="shows('place')" class="hud place" :aria-label="inWorkshop ? w.inWorkshop(placeName) : w.inCity(crumb)" @click="openSheet('travel')">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" /></svg>
        <span class="city">{{ crumb }}</span>
      </button>

      <!-- Top left: the search, one key until you press it (or F). The field opens in the same place. -->
      <!-- Next to it: your credit, the coin and what's left. -->
      <button v-if="shows('tools') && me?.credit !== undefined" class="hud coin-key" :aria-label="cw.chip(fcfa(me.credit))" :title="cw.chip(fcfa(me.credit))" @click="creditOpen = true">
        <Icon name="coin" :size="24" /><span>{{ digits(me.credit) }}</span>
      </button>
      <button v-if="shows('tools')" class="hud find-key" :aria-label="w.find" :title="w.find" @click="openSheet('find')">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="3" /><path d="M16 16l6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
      </button>

      <!-- Top centre, during the quest: its tracker, a slim pill with the chapter you're in. -->
      <div v-if="inWorkshop && shows('quest') && t.step !== 'home'" class="hud quest">
        <QuestTracker :stamps="t.stamps" :current="t.chapter" />
      </div>

      <!-- Top left, all through the quest: its one way out (no card of the quest has a × or a "Not now"). Under the
           search and the coin once they're on screen. -->
      <div v-if="t.active && !creating" class="hud skip-corner" :class="{ low: shows('tools') }">
        <SkipTutorial :esc-free="escFree" :touch="t.touch" :busy="tutorial.busy.value" :error="tutorial.error.value" @skip="skipTutorial" />
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

      <!-- Top left, under the search: what's offered once (the tutorial, after a shared link; the list view, on a
           slow device), and the city's missions until they're done. -->
      <div v-if="tutorialChip || offerList || missionsShown" class="hud corner" :class="{ 'under-chip': !!activity, covered: !!card }">
        <div v-if="tutorialChip" class="chip">
          <button class="chip-go" @click="enterTutorial">{{ w.takeTour }}</button>
          <button class="chip-x" :aria-label="w.noThanks" @click="tutorialChip = false"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button>
        </div>
        <div v-if="offerList" class="chip">
          <button class="chip-go" @click="seeAsList">{{ w.slowHere }}</button>
          <button class="chip-x" :aria-label="w.keep3d" @click="settings.listOffered = true"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button>
        </div>
        <CityMissions v-if="missionsShown" @go="missionGo" />
      </div>

      <!-- A touch screen has no Q and R: two red keys turn the view. -->
      <div v-if="shows('tools')" class="hud tools" :class="{ questing: inWorkshop }">
        <button :aria-label="w.turnLeft" @click="lobby?.rotate(-1)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button :aria-label="w.turnRight" @click="lobby?.rotate(1)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>

      <!-- On the right, under the keys: the open card, if any. -->
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
            :my-house="myHouse"
            :is-me="card.login === me?.login"
            :example="card.example || cardPlayer?.example"
            :github="cardPlayer?.github"
            :badge="cardBadge"
            @see="boardHouse"
            @close="closeCard"
          />
          <EmptyCard v-else-if="card?.kind === 'empty'" :key="cardKey" :plot="card.plot" @rent="rentHere" @close="closeCard" />
        </Transition>
      </div>

      <!-- Bottom right: "?" opens the list of keys, whichever way you ask. No keys on a touch screen. -->
      <button v-if="shows('keys')" class="hud help" :aria-label="w.everyKey" :title="w.everyKey" @click="keysOpen = true">?</button>

      <!-- Bottom centre: the quest's coach, what's in reach (or highlighted with [ and ]) while no card is open. The
           HUD's thumbs up and down are gone (Jib, 15 10); waving still happens from a person's card. The coach must stay usable over a house's window, so the column lifts above it; on a wide
           screen, where the window docks on the right, the column moves out of its way. -->
      <div class="hud centre" :class="{ lifted: inWorkshop, aside: inWorkshop && !!place }">
        <Coach
          v-if="inWorkshop && !centred && !walkthrough && !creating && !spot"
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
          <div v-if="near && shows('prompt') && !card && !place && !boardSheet.open" class="prompt" role="status">
            <template v-if="near.kind === 'house'">
              <span>
                <strong>{{ near.house.name }}</strong>
                <span class="soft">{{ freeRooms(near.house).length ? w.roomsFree(freeRooms(near.house).length) : "" }}</span>
              </span>
              <button class="pill" @click="lobby?.interact()">{{ w.goIn }} <kbd>{{ caps.e }}</kbd></button>
            </template>
            <template v-else-if="near.kind === 'empty'">
              <span>{{ w.emptyLot[near.plot.lot] }}</span>
              <button class="pill" @click="lobby?.interact()">{{ w.haveALook }} <kbd>{{ caps.e }}</kbd></button>
            </template>
            <template v-else-if="near.kind === 'person'">
              <span>
                <strong>{{ near.name }}</strong>
                <span v-if="residents.get(near.login)" class="soft">, {{ residents.get(near.login)!.houseName }}</span>
              </span>
              <button class="pill" @click="lobby?.interact()">{{ w.seePerson }} <kbd>{{ caps.e }}</kbd></button>
            </template>
            <template v-else-if="near.kind === 'arena'">
              <span>
                <strong>{{ aw.arena }}</strong>
                <span v-if="arenaDisplay" class="soft">{{ aw.arenaWhere(arenaDisplay.title) }}</span>
              </span>
              <button class="pill" @click="lobby?.interact()">{{ w.haveALook }} <kbd>{{ caps.e }}</kbd></button>
            </template>
            <template v-else>
              <span><strong>{{ bw.title }}</strong><span class="soft">{{ bw.near }}</span></span>
              <button class="pill" @click="lobby?.interact()">{{ w.haveALook }} <kbd>{{ caps.e }}</kbd></button>
            </template>
          </div>
        </Transition>
      </div>

      <!-- Bottom left (bottom right on a phone): the neighbourhood from above. Clicking it (or M) opens it big; it never moves you. -->
      <div v-if="neighbourhood && shows('map')" class="hud map" :class="{ covered: !!card, questing: inWorkshop, finding: !!goal }">
        <Minimap :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" :goal="goal" @open="bigMap = true" />
      </div>
      <!-- Phones have no Shift: a round dash button above the minimap, there whenever the round tools are. -->
      <TouchDash v-if="shows('tools') && !place && !card" @dash="lobby?.dash()" />

      <!-- The quest's cards in the middle of the screen: the welcome (or "welcome back"), the keys to your room,
           "Well done", and the city's own welcome after it. -->
      <Welcome
        v-if="!creating && t.active && ((t.step === 'welcome' && welcomeReady) || t.step === 'city')"
        :key="t.step"
        :step="t.step === 'city' ? 'city' : 'welcome'"
        :busy="tutorial.busy.value"
        :error="tutorial.error.value"
        :resume="resumeAt"
        @start="startTutorial(false)"
        @resume="startTutorial(true)"
        @end="endTutorial"
      />
      <!-- The walkthrough, one card at a time while nothing moves: what's new on the city's screen after its
           welcome. -->
      <TourCard
        v-if="!creating && walkthrough && t.tourCards[t.card]"
        :card="t.tourCards[t.card]"
        :n="t.card + 1"
        :total="t.tourCards.length"
        :touch="t.touch"
        @next="t.send({ type: 'next' })"
      />
      <KeysCard
        v-if="inWorkshop && t.step === 'keys' && t.state?.room"
        :room="t.state.room.name"
        :house="t.state.house.name"
        :rent="firstRent"
        :credit="credit"
        @next="t.send({ type: 'next' })"
      />
      <KeysCard v-if="keysFor" :room="keysFor.room" :house="keysFor.house" @next="movedInDone" />
      <HomeCard
        v-if="inWorkshop && t.step === 'home'"
        :first="myFirstName"
        :busy="tutorial.busy.value"
        :error="tutorial.error.value"
        @finish="tutorial.finish"
      />

      <CharacterCreation v-if="creating && (ready || failed)" @character="(c) => lobby?.setCharacter(c)" />
      <CreditCard v-if="creditOpen" :added="creditAdded" @close="creditOpen = false" />
      <Onboarding v-if="welcoming" @done="welcomeDone" />

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
        <Minimap v-if="bigMap && neighbourhood" :neighbourhood="neighbourhood" :houses="shown" :residents="residents" :state="mapState" :online="others.size + (me ? 1 : 0)" :goal="goal" large @go="travelToHouse" @arena="bigMap = false; goToArena()" @close="bigMap = false" />
      </Transition>
      <Transition name="fade">
        <KeysSheet v-if="keysOpen" @close="keysOpen = false" />
      </Transition>
    </template>

    <!-- The city itself, after the HUD in the page so Tab reaches the buttons first. It takes the keys when nothing else
         has the focus. Under the HUD on screen all the same (z-index). -->
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
      :tab="questTab"
      :coached="inWorkshop && !centred && !walkthrough && t.step !== 'room'"
      @change="insideChanged"
      @close="closeInside"
      @link="insideLink"
    />
    <!-- The tutorial's spotlight on the control a step is about, in the workshop's window: the free room, then each tab
         of the house with its one line and Next. -->
    <Spotlight v-if="spot" :key="spot.target" :target="spot.target" :label="questLabel" :focus="spot.focus" :side="spot.side">
      <div class="spot-head">
        <span class="icon-tile"><QuestIcon :name="t.step === 'room' ? 'keys' : SPOT_ICON[HOUSE_CARDS[t.card]]" :size="22" /></span>
        <div class="spot-words">
          <p v-if="t.step === 'room'" class="spot-text">{{ tutorial.waiting.value ? qw.waiting : qw.room }}</p>
          <template v-else>
            <p class="spot-text">{{ qw.houseTitles[HOUSE_CARDS[t.card]] }}</p>
            <p class="spot-line">{{ houseLineOf(HOUSE_CARDS[t.card], credit) }}</p>
          </template>
        </div>
      </div>
      <div v-if="t.step !== 'room'" class="spot-nav">
        <span class="spot-dots" role="img" :aria-label="qw.houseCardOf(t.card + 1, HOUSE_CARDS.length)"><i v-for="(c, i) in HOUSE_CARDS" :key="c" :class="{ on: i === t.card }" /></span>
        <button type="button" class="primary go spot-go" @click="t.send({ type: 'next' })">{{ t.card === HOUSE_CARDS.length - 1 ? qw.gotIt : qw.next }}<kbd aria-hidden="true">↵</kbd></button>
      </div>
    </Spotlight>

    <!-- The city board's window, opened at the board on the market square: the city's room and its posts. -->
    <CityBoardWindow v-if="boardSheet.open && !place" :houses="houses" @open="boardHouse" />
    <!-- The arena, opened at the stadium's entrance: a floating card on the right, like a house's window. -->
    <ArenaPanel v-if="card?.kind === 'arena' && !place" :key="cardKey" :city="card.city" :crowd="crowd" @close="closeCard" />

    <Transition name="fade">
      <div v-if="sheet" class="scrim" :class="{ clear: sheet === 'find' }" @click="sheet = ''" />
    </Transition>
    <!-- Find: the search field stays where it was, with the houses under it. Travel: a sign in the middle of the screen.
         One row per house or city, like a game's menu entries. The close button comes after the field, so the field
         takes the focus. -->
    <Transition name="sheet">
      <section v-if="sheet === 'find'" ref="sheetEl" class="find sign" role="dialog" aria-modal="true" aria-labelledby="find-title" @keydown.esc="sheet = ''">
        <div class="sign-frame">
          <header class="sign-band">
            <span class="icon-tile"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4" /><path d="M16 16l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg></span>
            <h2 id="find-title">{{ w.findTitle }}</h2>
            <p class="sign-sub">{{ w.findSub }}</p>
            <button class="sign-x" :aria-label="w.close" @click="sheet = ''"><span aria-hidden="true">X</span></button>
          </header>
          <div class="sign-body">
            <div class="field">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4" /><path d="M16 16l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
              <input v-model="query" type="search" :placeholder="w.searchHint" :aria-label="w.searchName" @keydown.enter="findFirst" />
              <kbd v-if="!typed" aria-hidden="true">F</kbd>
            </div>
            <ul v-if="foundCities.length || foundPeople.length || found.length" class="entries">
              <li v-for="c in foundCities" :key="`city-${c}`">
                <button class="entry" @click="travel(c)">
                  <span class="mark"><Icon name="globe" :size="20" /></span>
                  <span class="title">{{ c }}</span>
                </button>
              </li>
              <li v-for="p in foundPeople" :key="`person-${p.login}`">
                <button class="entry" @click="findPerson(p.login)">
                  <span class="mark"><Icon name="people" :size="20" /></span>
                  <span class="title">{{ p.name }}</span>
                </button>
              </li>
              <li v-for="h in found" :key="h.id">
                <button class="entry" @click="findHouse(h)">
                  <span class="mark"><Icon name="house" :size="20" /></span>
                  <span class="text">
                    <span class="title">{{ h.name }}</span>
                    <span class="where">{{ h.demo ? `${h.city} · ${sampleWord}` : h.city }}</span>
                  </span>
                  <span v-if="freeRooms(h).length" class="free-chip">{{ w.freeChip(freeRooms(h).length) }}</span>
                </button>
              </li>
            </ul>
            <p v-else-if="typed" class="none">{{ w.noMatch }}</p>
          </div>
        </div>
      </section>
      <!-- Where to: Africa with a dot per city, and the cities as rows beside it (under it on a phone). -->
      <section v-else-if="sheet === 'travel'" ref="sheetEl" class="sheet travel sign" role="dialog" aria-modal="true" :aria-label="w.travelName" @keydown.esc="sheet = ''">
        <div class="sign-frame">
        <header class="sign-band">
          <span class="icon-tile"><Icon name="globe" :size="22" /></span>
          <h2>{{ w.whereTo }}</h2>
          <p class="sign-sub">{{ w.citiesLine(cities.length, city) }}</p>
          <button class="sign-x" :aria-label="w.close" @click="sheet = ''"><span aria-hidden="true">X</span></button>
        </header>
        <div class="sign-body">
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
                  <span class="name-line"><span class="title">{{ c.name }}</span><span v-if="c.name === city" class="here-word">{{ w.youAreHere }}</span></span>
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
        </div>
        </div>
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
.stage:focus-visible { box-shadow: inset 0 0 0 3px var(--ring); }
.stage :deep(canvas) { display: block; }
/* No WebGL: one flat card in the middle says so. */
.failed { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); margin: 0; padding: 20px 24px; border-radius: var(--tile-r); background: var(--surface); color: var(--text); box-shadow: var(--shadow); text-align: center; font-size: 17px; }
/* Everything on top of the city is flat, with a hard shadow: no glass, no blur. */
.hud { position: absolute; z-index: 10; color: var(--text); transition: opacity var(--dur) var(--ease); animation: hud-in 0.4s var(--ease); }
@keyframes hud-in {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .hud { animation: none; }
}
/* A house, a room or a knock is open: like a game's pause menu, the HUD around it steps back (the search, the tools, the
   minimap and the key hints, which the panel would half cover), leaving the place and the site's keys. */
.paused .hud.top, .paused .hud.tools, .paused .hud.map, .paused .hud.find-key, .paused .hud.coin-key, .paused .hud.help { opacity: 0; pointer-events: none; }
/* Nothing peeks out from behind the open window: the lobby's number under the place key would show along its top edge,
   and a short window, which gives the window the whole height, covers the place key too (and the site's keys: App.vue). */
.windowed .hud.lobby-number { opacity: 0; pointer-events: none; }
@media (min-width: 720px) and (max-height: 720px) {
  .windowed .hud.place { opacity: 0; pointer-events: none; }
}
/* The quest's way out, top left, over the quest's own cards (their layer is 30). */
.skip-corner { top: 24px; left: 24px; z-index: 40; }
.skip-corner.low { top: calc(24px + 62px + 12px); }
@media (max-width: 520px) {
  .skip-corner { top: 16px; left: 16px; }
  .skip-corner.low { top: calc(16px + 62px + 10px); }
}
/* The search and the credit, top left: white keys over the city, the game's flat shadow under them, the colour only
   on their icons. Pressed, the search opens as a card in the same corner. */
.find-key, .coin-key { top: 24px; display: flex; align-items: center; height: 62px; min-height: 0; border-radius: var(--tile-r); background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.find-key { left: 24px; width: 62px; justify-content: center; padding: 0; }
.coin-key { left: calc(24px + 62px + 8px); gap: 8px; padding: 0 16px; font: 800 18px/1 var(--num); font-variant-numeric: tabular-nums; }
.find-key:hover:not(:disabled), .coin-key:hover:not(:disabled) { background: var(--tile); }
.find-key:active:not(:disabled), .coin-key:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 rgba(20, 12, 18, 0.45); }
.find-key svg, .coin-key svg { flex: none; color: var(--accent); }
.place { top: 24px; right: calc(24px + var(--keys-width, 0px) + 8px); display: flex; align-items: center; gap: 8px; height: 62px; min-height: 0; padding: 0 16px; border: 0; border-radius: var(--tile-r); background: var(--panel-red); color: var(--on-panel); box-shadow: 0 5px 0 var(--accent-lip); cursor: pointer; }
.place .city { font: 800 20px/1.1 var(--font); white-space: nowrap; }
.lobby-number { top: 94px; right: calc(24px + var(--keys-width, 0px) + 8px); display: flex; align-items: center; gap: 6px; height: 46px; min-height: 0; padding: 0 12px; border: 0; border-radius: var(--tile-r); background: var(--surface); color: var(--text); font: 800 16px/1 var(--font); box-shadow: 0 3px 0 var(--hairline); cursor: pointer; }
.place:hover:not(:disabled) { background: var(--accent-fill-hover); }
.place:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 var(--accent-lip); }
/* What needs attention in this city, a yellow chip at the top; absent while all is well. It never catches clicks. */
.top { top: calc(98px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 7px 14px; border-radius: var(--tile-r); background: var(--sticker); color: var(--ink); box-shadow: var(--lift); text-align: center; pointer-events: none; max-width: calc(100vw - 32px); }
.top.danger::before { content: ""; flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--panel-red); }
.top:empty { display: none; }
.top p { margin: 0; font-size: 15px; font-weight: 800; min-width: 0; }
.top .narrow { display: none; }
/* The quest's tracker takes the chip's place, at the top centre. */
.quest { top: calc(24px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px); }
/* News: one line under the chip, popping in and out; never in the way of a click. */
.news { top: calc(146px + var(--core-offset, 0px)); left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 32px); pointer-events: none; }
/* The toast's look is shared (style.css); here only its place. */
.toast kbd { margin: 0 1px; }
/* The corner offers, under the search: a white strip and a small way to say no. */
.corner { top: calc(100px + var(--core-offset, 0px)); left: 24px; display: grid; gap: 8px; justify-items: start; max-width: min(340px, calc(100vw - 96px)); }
.chip { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: var(--tile-r); background: var(--surface); box-shadow: var(--lift); }
.chip-go { min-height: 46px; padding: 6px 12px; border: 0; border-radius: 10px; background: none; color: var(--text); font: 800 15px/1.2 var(--font); text-align: left; cursor: pointer; }
.chip-go:hover:not(:disabled) { background: var(--tile); }
.chip-x { flex: none; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 10px; display: grid; place-items: center; background: none; color: var(--text); cursor: pointer; }
.chip-x:hover:not(:disabled) { background: var(--fill); }
/* A short window: the corner stands beside the minimap rather than running into it. */
@media (min-width: 521px) and (max-height: 580px) {
  .corner { left: calc(24px + 196px + 12px); top: calc(24px + var(--core-offset, 0px)); }
  .corner.covered { display: none; }
}
/* The turning keys, bottom right, on a touch screen only: a keyboard has Q and R. */
.tools { right: 24px; bottom: max(28px, env(safe-area-inset-bottom)); display: none; gap: 8px; }
@media (hover: none) {
  .tools { display: flex; }
  .help { display: none; }
}
.tools button { width: 50px; height: 50px; min-height: 0; padding: 0; border-radius: var(--tile-r); border: 0; display: grid; place-items: center; background: var(--panel-red); color: var(--on-panel); box-shadow: 0 5px 0 var(--accent-lip); cursor: pointer; }
.tools button:hover:not(:disabled) { background: var(--accent-fill-hover); }
.tools button:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 var(--accent-lip); }
/* The open card, under the keys on the right; its empty space lets clicks through to the city. */
.dock { top: 112px; right: 24px; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: none; }
.dock > * { pointer-events: auto; }
/* "?", bottom right: the list of keys. */
.help { right: 24px; bottom: max(28px, env(safe-area-inset-bottom)); width: 50px; height: 50px; min-height: 0; padding: 0; border: 0; border-radius: var(--tile-r); background: var(--surface); color: var(--ink); box-shadow: var(--lift); font: 800 22px/1 var(--font); cursor: pointer; }
.help:hover:not(:disabled) { background: var(--tile); }
/* The middle column along the bottom: the coach or the prompt; the gaps let clicks through. */
.centre { left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.centre > * { pointer-events: auto; }
/* During the tutorial the column sits above a house's inside (60), so the coach's buttons stay in reach. */
.centre.lifted { z-index: 70; }
/* A wide screen docks the window on the right: the coach moves to the bottom left. */
@media (min-width: 900px) {
  .centre.aside { left: 24px; bottom: max(28px, env(safe-area-inset-bottom)); transform: none; align-items: flex-start; }
}
/* The interact prompt, like a game's: what's in reach, and the one action as the red key. */
.prompt { display: flex; align-items: center; gap: 16px; padding: 7px 7px 7px 18px; border-radius: var(--tile-r); background: var(--surface); color: var(--text); box-shadow: var(--lift); white-space: nowrap; font-size: 16px; max-width: calc(100vw - 32px); animation: prompt-pop var(--dur-slow) var(--ease-pop); }
.prompt strong { font-size: 18px; font-weight: 800; }
@keyframes prompt-pop {
  from { transform: scale(0.96); }
}
.soft { color: var(--muted); }
/* The one main action: the red key, and the key it answers to. */
.pill { border: 0; border-radius: 12px; padding: 0 8px var(--lip) 16px; min-height: 48px; font: 800 17px/1 var(--display); background: var(--accent-fill); color: var(--on-accent); box-shadow: inset 0 calc(-1 * var(--lip)) 0 var(--accent-lip); cursor: pointer; display: inline-flex; align-items: center; gap: 10px; }
.pill:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 calc(-1 * var(--lip-pressed)) 0 var(--accent-lip); }
.pill:hover:not(:disabled) { background: var(--accent-fill-hover); }
.map { left: 24px; bottom: max(28px, env(safe-area-inset-bottom)); }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
.scrim { position: absolute; inset: 0; z-index: 40; background: var(--scrim); }
/* The search doesn't dim the city: a click beside it still closes it. */
.scrim.clear { background: none; }
/* Find: a white card in the corner the key was in: its head, a grey field, and the matches as rows under it. */
.find { position: absolute; z-index: 50; top: 24px; left: 24px; width: min(440px, calc(100vw - 48px)); color: var(--text); }
.find .sign-frame { max-height: calc(100dvh - 48px); display: flex; flex-direction: column; }
.find .sign-body { min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.field { flex: none; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px 0 14px; border-radius: 12px; background: var(--sunken); color: var(--muted); }
.field:focus-within { box-shadow: inset 0 0 0 2px var(--text); }
.field svg { flex: none; }
.field input { flex: 1; min-width: 0; min-height: 0; height: 100%; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; color: var(--text); font-size: 17px; font-weight: 800; }
.field input:focus, .field input:focus-visible { outline: none; }
.field input::-webkit-search-cancel-button { display: none; }
.field kbd { flex: none; }
.find .entries { flex: 0 1 auto; min-height: 0; list-style: none; margin: 0 -8px; padding: 0; display: grid; gap: 2px; overflow-y: auto; overscroll-behavior: contain; }
.find .entry { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px; border: 0; border-radius: 12px; background: none; color: var(--text); box-shadow: none; font: 600 15px/1.2 var(--font); text-align: left; cursor: pointer; }
.find .entry:hover:not(:disabled), .find .entry:focus-visible { outline: none; background: var(--tile); }
.find .mark { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--sunken); color: var(--text); }
.find .text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.find .title { flex: 1; min-width: 0; font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.find .where { min-width: 0; color: var(--muted); font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.find .free-chip { flex: none; padding: 3px 9px; border-radius: 999px; background: rgba(30, 79, 168, 0.12); color: var(--panel-blue); font-size: 13px; font-weight: 800; }
.find .none { margin: 0; padding: 4px 0 2px; color: var(--muted); font-size: 15px; font-weight: 700; }
/* Travel: a white card in the middle of the screen, popping in. */
.sheet { position: absolute; z-index: 50; top: 50%; left: 50%; translate: -50% -50%; display: flex; flex-direction: column; color: var(--text); }
.sheet.travel { width: min(900px, calc(100vw - 32px)); max-height: min(720px, calc(100dvh - 48px)); }
.sheet .sign-body { display: flex; flex-direction: column; min-height: 0; }
/* The rows: soft tiles, each one whole button; the one under the pointer or the focus lifts to white with an ink
   edge, and so does the city you're in, which says so. */
.sheet .entries { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0; padding: 2px; display: grid; gap: 6px; align-content: start; overflow-y: auto; overscroll-behavior: contain; }
.sheet .entry { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 9px 12px 9px 14px; border: 0; border-radius: var(--tile-r); background: var(--tile); color: var(--text); box-shadow: none; font: 600 16px/1.2 var(--font); text-align: left; cursor: pointer; }
.sheet .entry:hover:not(:disabled), .sheet .entry:focus-visible { outline: none; background: var(--surface); box-shadow: inset 0 0 0 2px var(--text); }
.sheet .entry[aria-current="location"] { background: var(--surface); box-shadow: inset 0 0 0 2px var(--accent); }
.sheet .entry:active { transform: translateY(1px); }
.sheet .text { flex: 1 1 auto; min-width: 0; display: grid; gap: 4px; }
.sheet .name-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.sheet .title { min-width: 0; font-size: 16px; font-weight: 800; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .here-word { flex: none; font-size: 12px; font-weight: 800; color: var(--accent); }
.sheet .chev { flex: none; display: grid; color: var(--muted); }
/* Where to: the map on the left, bigger than the list, and the cities beside it. */
.atlas { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 16px; align-items: stretch; }
.atlas .africa { align-self: start; }
.atlas .entries { max-height: calc(min(720px, 100dvh - 48px) - 130px); }
/* A city's stats: icons and numbers, in the muted ink; a zero steps further back. */
.sheet .stats { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); }
.sheet .stat { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
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
  .pill:active:not(:disabled), .tools button:active:not(:disabled), .place:active:not(:disabled) { transform: none; }
}
/* No keyboard, no key hints. */
@media (hover: none) {
  kbd { display: none; }
  .centre { bottom: max(28px, env(safe-area-inset-bottom)); }
}
/* Not much width: the search shrinks to its icon, the place to its name. */
@media (max-width: 520px) {
  /* A phone: the keys are smaller and tighter (App.vue), and so are these. */
  .coin-key { top: 12px; left: calc(12px + 46px + 6px); height: 46px; padding: 0 10px; gap: 5px; font-size: 15px; }
  .find-key { top: 12px; left: 12px; width: 46px; height: 46px; box-shadow: 0 3px 0 rgba(20, 12, 18, 0.45); }
  .find-key svg { width: 22px; height: 22px; }
  .lobby-number { top: 66px; right: calc(12px + var(--keys-width, 0px) + 6px); }
  .place { top: 12px; right: calc(12px + var(--keys-width, 0px) + 6px); height: 46px; max-width: 110px; padding: 0 8px; gap: 4px; box-shadow: 0 3px 0 var(--accent-lip); }
  .place svg { display: none; }
  .place .city { font-size: 16px; overflow: hidden; text-overflow: ellipsis; }
  .prompt { gap: 10px; padding-left: 14px; font-size: 15px; max-width: 100%; }
  .prompt strong { font-size: 16px; }
  .prompt .soft, .prompt kbd { display: none; }
  .prompt > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The prompt moves to the left, beside the minimap rather than under it. The coach (lifted)
     keeps the middle. */
  .centre:not(.lifted) { left: 12px; bottom: max(28px, env(safe-area-inset-bottom)); transform: none; align-items: flex-start; max-width: calc(100vw - 180px); }
  /* The tools stand in a column down the right, under the keys, in the thumb's way of nothing. */
  .tools { top: calc(68px + var(--core-offset, 0px)); right: 12px; bottom: auto; flex-direction: column; gap: 6px; }
  .tools button { width: 46px; height: 46px; box-shadow: 0 3px 0 var(--accent-lip); }
  /* One line: the city's name is already top right, and anything longer ends in "…". */
  .top { top: calc(68px + var(--core-offset, 0px)); left: 12px; right: 64px; transform: none; max-width: none; padding: 7px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top p { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
  .top .wide { display: none; }
  .top .narrow { display: inline; }
  .news { top: calc(112px + var(--core-offset, 0px)); max-width: calc(100vw - 80px); }
  /* The tracker steps down under the place and the keys. */
  .quest { top: calc(68px + var(--core-offset, 0px)); }
  .toast { font-size: 14px; }
  .corner { top: calc(68px + var(--core-offset, 0px)); left: 12px; }
  /* Under the one-line chip when there's one, and out of the way of a card's sheet along the bottom. */
  .corner.under-chip { top: calc(112px + var(--core-offset, 0px)); }
  .corner.covered { display: none; }
  /* The minimap stays on the thumb's side on a phone. */
  .map { left: auto; right: 12px; }
  /* In the quest the coach takes the bottom of a phone's screen: the map moves to the top right, under the
     tracker, while it points at the house you're looking for, and steps aside after that. */
  .map.questing { display: none; }
  /* The quest's tracker needs the phone's width; turning the view can wait for the city. */
  .tools.questing { display: none; }
  .map.questing.finding { display: block; top: calc(160px + var(--core-offset, 0px)); bottom: auto; }
  /* A card is a sheet along the bottom edge here: the map would hide under it. */
  .map.covered { display: none; }
  /* Cards become a sheet along the bottom edge. */
  .dock { top: auto; left: 0; right: 0; bottom: 0; align-items: stretch; gap: 0; }
  /* Find keeps the top of the screen, clear of the on-screen keyboard. */
  .find { top: 12px; left: 12px; width: calc(100vw - 24px); }
  .find .sign-frame { max-height: calc(100dvh - 24px); }
  /* Travel becomes a sheet along the bottom edge. */
  .sheet, .sheet.travel { top: auto; bottom: 0; left: 0; translate: none; width: 100%; max-height: 86dvh; padding-bottom: max(7px, env(safe-area-inset-bottom)); }
  /* Where to: the map on top, small, and the cities under it, scrolling. */
  .atlas { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; }
  .atlas .africa :deep(.paper) { width: min(100%, calc(28dvh * 0.97)); }
  .atlas .entries { max-height: none; overflow: visible; }
}
/* The spotlight's line (Spotlight.vue holds the card): a bold sentence, and on the house's tabs a line and Next. */
/* The spotlight's card, carte blanche: the icon's tile, a title and one line, then the dots and the one way on. */
.spot-head { display: flex; align-items: flex-start; gap: 14px; }
.spot-words { min-width: 0; display: grid; gap: 4px; }
.spot-text { margin: 0; padding-top: 1px; font: 800 20px/26px var(--display); }
.spot-line { margin: 0; font-size: 15px; line-height: 21px; color: var(--muted); }
.spot-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 6px; }
.spot-dots { display: flex; gap: 6px; }
.spot-dots i { width: 8px; height: 8px; border-radius: 4px; background: var(--line); }
.spot-dots i.on { width: 18px; background: var(--text); }
.spot-go { min-width: 140px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.spot-go:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
</style>
