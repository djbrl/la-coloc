<script setup lang="ts">
// Inside a house, built like a game's pause menu rather than a page, on the lobby's Panel: the house's name and
// state, its people as a line-up of faces, the tabs (flatmates only), one tab's body, and the one next step in the
// foot. Everything fits the sheet without scrolling; only the body scrolls, inside itself, when a list or the chat
// is longer than the space. The house view arrives from the API and keeps arriving over its stream, as on HousePage.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack, wentDown } from "../../core";
import { openChat } from "../../conversations";
import { notices } from "../../notices";
import { me as session, postJSON, sendJSON } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { HouseView, Room } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import UiNote, { loud, type Note } from "../UiNote.vue";
import Waiting from "../Waiting.vue";
import { dueOf, dueWords, reviewSummary, reviewTitle, splitReviews } from "./house/chores";
import { crewOf, foldedRooms, footFor, personActions, ROWS_SHOWN, rowAction, type Seat, type Situation } from "./house/crew";
import Crew from "./house/Crew.vue";
import { billHead, type BillLine, lineWords, linesYoursFirst, reviewsLine, ruleLine, tontineLine, toPay } from "./house/exchange";
import Icon from "./house/Icon.vue";
import { notesSummary } from "./house/notes";
import PayBill from "./house/PayBill.vue";
import PersonPeek from "./house/PersonPeek.vue";
import RentServer from "./house/RentServer.vue";
import ShareHouse from "./house/ShareHouse.vue";
import Rundown from "./house/Rundown.vue";
import { evenSplit, fcfa, type ServerInfo } from "./house/server";
import { linkedHouse, markTourSeen, toursSeen } from "./house/tours";
import { houseWords as w } from "./house/words";
import ListRow from "./panel/ListRow.vue";
import Panel from "./panel/Panel.vue";
import PanelHead from "./panel/PanelHead.vue";
import PanelTabs, { type Tab } from "./panel/PanelTabs.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseState, houseTrouble, roomLine, roomState } from "./panel/words";
import type { Place } from "./place";
import { seeded } from "../seeded";
import { teamNames, teamUp } from "./team";

// The house's parts, one tab each. The keys are the API's names: "chores" shows as Reviews, "fridge" as News.
type TabKey = "rooms" | "channel" | "chores" | "fridge" | "bill";

const props = defineProps<{
  id: string;
  // The tutorial asks for the window's rundown (Rundown.vue). It also stands in for the first-time tour.
  rundown?: boolean;
  // Open on this tab (flatmates only), and switch to it again whenever it changes: a quest can point at a part of
  // the house ("look at your reviews") without the player hunting for the tab.
  tab?: TabKey;
  // Keep the first-visit rundown from starting by itself, when something else (a quest) is already guiding the
  // player. The rundown still runs when `rundown` asks for it.
  quiet?: boolean;
  // Shown over the 3D city (the lobby), not on a page of its own: a picked person can be waved at from there.
  inCity?: boolean;
  // The tutorial's coach is up with its own main action ("Take the room"): the workshop's room row then keeps
  // quiet, so there's one button for one action.
  coached?: boolean;
}>();
// `wave`: wave at someone picked in the crew (your avatar's emote in the city).
// `view`: the house as it arrives (first fetch, then each push on its stream), for a page that shows more of it.
const emit = defineEmits<{ open: [place: Place]; label: [text: string]; rundownDone: []; view: [house: HouseView | null]; wave: [login: string] }>();

// The chef's server info is new on the API side; reading it through this type works whether or not the shared
// HouseView type has caught up. The exchange (the bill, the tontine, the month's reviews) may be missing from an
// older API: the panel then just doesn't say it.
type View = HouseView & { server?: ServerInfo | null };

const house = ref<View | null>(null);
watch(house, (h) => emit("view", h));
// Why there's no house to show: it doesn't exist (404), the core isn't answering (`waiting`: it reloads by itself when
// the core is back), or the API answered with something else (`failed`: a button to try again).
const error = ref("");
const waiting = ref(false);
const failed = ref(false);
let stream: Stream | null = null;
// Only the newest load may speak: a slow answer for the house you just left is dropped.
let loads = 0;

// `quiet`: a reload behind a house that is already showing (the core came back): it keeps what's on screen, never
// goes back to "Opening the door…", and a failure leaves things as they are.
async function load(id: string, quiet = false) {
  const mine = ++loads;
  if (!quiet) {
    stream?.close();
    stream = null;
    house.value = null;
    error.value = "";
    waiting.value = false;
    failed.value = false;
  }
  const res = await fetch(`/api/houses/${encodeURIComponent(id)}`).catch(() => null);
  if (mine !== loads) return;
  if (!res?.ok) {
    if (quiet && house.value) return;
    if (res?.status === 404) error.value = "missing";
    else if (await wentDown(res)) waiting.value = true;
    else failed.value = true;
    return;
  }
  error.value = "";
  waiting.value = false;
  failed.value = false;
  house.value = await res.json();
  // The API pushes the whole house view whenever something changes. If the stream dies it finds its own way back
  // (stream.ts); it's only opened once per house.
  stream ??= openStream(`/api/houses/${encodeURIComponent(id)}/stream`, { house: (e) => (house.value = JSON.parse(e.data)) });
}

watch(() => props.id, (id) => load(id), { immediate: true });
// The core came back: the house again, quietly if it's showing.
useWhenBack(() => load(props.id, !!house.value));
// Read in the getter, so a change of language says it again too.
watch(
  () => (house.value?.name ? w.inside(house.value.name) : ""),
  (label) => label && emit("label", label),
);
onBeforeUnmount(() => {
  stream?.close();
  clearTimeout(litTimer);
  clearTimeout(rulesNoteTimer);
});

// Who's looking. Everything below branches on these; crew.ts decides what each of them is offered.
const viewer = computed(() => house.value?.viewer ?? null);
const member = computed(() => !!viewer.value?.member);
const chef = computed(() => viewer.value?.role === "chef");
const making = computed(() => house.value?.status === "making");
const live = computed(() => !!house.value && house.value.status === "live" && house.value.agentOnline);
const keyMade = computed(() => !!house.value?.server?.keyMade);

const situation = computed(
  (): Situation => ({
    viewer: viewer.value,
    making: making.value,
    keyMade: keyMade.value,
    demo: !!house.value?.demo,
    tutorial: !!house.value?.tutorial,
    freeRooms: house.value?.rooms.filter((r) => !r.occupant).map((r) => r.name) ?? [],
  }),
);
const foot = computed(() => footFor(situation.value));
const seats = computed(() => (house.value ? crewOf(house.value, viewer.value?.login ?? null) : []));

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
// The house's open reviews (the API's chores), yours apart from the others', most urgent first (chores.ts).
const reviews = computed(() => splitReviews(house.value?.chores, viewer.value?.login ?? null));
const myChores = computed(() => reviews.value.mine);
const notes = computed(() => house.value?.notes ?? []);

// The head's one line, after the state's dot: only what's wrong ("Its server is down for now."), never "running"
// (the green dot, with its hidden name, says that), and never the city (you're standing in it). Then the tagline
// when it's short enough to share the line.
const line = computed(() => {
  const h = house.value;
  if (!h) return "";
  const tagline = seeded(h.tagline);
  const parts = [houseTrouble(h), tagline && tagline.length <= 40 ? tagline : null];
  return parts.filter(Boolean).join(" ");
});

// Under the faces, for flatmates only, the house's exchange: whose project the house rallies behind this fortnight
// (the tontine), with its faces in turn order, and how many reviews were traded this month, with the house's review
// rule. Someone outside doesn't need the house's inner workings (Jib, 15 10).
const me = computed(() => viewer.value?.login ?? null);
const tontine = computed(() => house.value?.tontine ?? null);
const tontineText = computed(() => tontineLine(tontine.value, me.value));
// The faces in turn order: whose turn it is, then the next few.
const turnFaces = computed(() => (tontine.value?.current ? [tontine.value.current, ...tontine.value.line.slice(0, 4)] : []));
const reviewsText = computed(() => {
  const h = house.value;
  if (!h) return "";
  const n = h.reviewsThisMonth;
  return typeof n === "number" ? `${reviewsLine(n)} ${ruleLine(!!h.rules.strictReviews)}` : ruleLine(!!h.rules.strictReviews);
});

// The tabs: flatmates only. A visitor sees the rooms and nothing to switch between.
const tab = ref<TabKey>("rooms");
const tabs = computed((): Tab[] => [
  { key: "rooms", icon: "door", word: w.tabs.rooms },
  { key: "channel", icon: "chat", word: w.tabs.channel },
  { key: "chores", icon: "check", word: w.tabs.chores, badge: myChores.value.length || undefined, alert: myChores.value.some((c) => c.late) },
  { key: "fridge", icon: "pin", word: w.tabs.fridge, badge: notes.value.length || undefined },
  { key: "bill", icon: "bill", word: w.tabs.bill },
]);
// A house reloaded as someone else (logging out, say) shows only the rooms.
watch(member, (is) => {
  if (!is) tab.value = "rooms";
});
// A tab asked for from outside (a quest): taken as soon as the viewer is known to be a flatmate, and again each
// time the ask changes. The player can still move to another tab afterwards.
watch(
  [() => props.tab, member],
  ([asked, is]) => {
    if (asked && is) tab.value = asked;
  },
  { immediate: true },
);
const shownTab = computed((): TabKey => (member.value ? tab.value : "rooms"));

// Each tab opens on one plain sentence about the viewer's situation, with the longer "what is this, why it
// matters" behind the "?" (Panel shows them through Explain.vue). The chat needs no more than its one line.
const credit = computed(() => fcfa(house.value?.bill?.reviewCredit ?? 500));
const intro = computed((): { summary: string | null; explain: string | null } => {
  const h = house.value;
  if (!h) return { summary: null, explain: null };
  switch (shownTab.value) {
    case "rooms":
      // In the workshop, a room is waiting for you at the top of the list: one line says what a room is. Elsewhere
      // the list speaks for itself: the faces and the empty dashed seat above already say how many rooms are free.
      return { summary: null, explain: takeRow.value ? explain.rooms : null };
    case "channel":
      return { summary: explain.channel, explain: null };
    case "chores":
      return { summary: reviewSummary(reviews.value, credit.value), explain: explain.chores(credit.value) };
    case "fridge":
      return { summary: notesSummary(notes.value), explain: explain.fridge };
    case "bill": {
      // The bill's first sentences are its summary; with no bill and no cost yet, the plain line says what it is.
      const said = bill.value ? billHead(bill.value) : h.monthlyCostFcfa && share.value ? w.perMonth(fcfa(h.monthlyCostFcfa), fcfa(share.value)) : null;
      return { summary: said, explain: explain.bill };
    }
  }
});

// The house's other reviews wait behind a button when you have some of your own; with none of yours, they show.
const othersOpen = ref(false);
const othersShown = computed(() => !reviews.value.mine.length || othersOpen.value);

// The chef of a house being made can invite people from the head. In any state, the chef also sets the review rule,
// with a small switch at the end of the sentence under the faces that says it (flatmates read it there).
const copied = ref(false);
async function copyLink() {
  const link = `${location.origin}/houses/${encodeURIComponent(props.id)}`;
  try {
    await navigator.clipboard.writeText(link);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // No clipboard (an old browser, or no permission): the link is in the address bar anyway.
  }
}

// The review rule, in the words the chef's switch uses. Strict: a merge only goes online once a flatmate approves
// it (the API's GitHub deploys hold it back otherwise).
const strict = computed(() => !!house.value?.rules.strictReviews);
const ruleSentence = computed(() =>
  strict.value ? w.strictSentence : w.relaxedSentence,
);
const savingRules = ref(false);
const rulesNote = ref<Note | null>(null);
let rulesNoteTimer = 0;
async function switchRules() {
  const h = house.value;
  if (!h || savingRules.value) return;
  savingRules.value = true;
  rulesNote.value = null;
  const res = await sendJSON<{ rules: { strictReviews: boolean } }>("PATCH", `/api/houses/${encodeURIComponent(h.id)}/rules`, {
    strictReviews: !h.rules.strictReviews,
  });
  savingRules.value = false;
  // The stream brings the new rule too; taking the answer's copy right away saves the switch a visible lag.
  if (res.ok) {
    if (house.value?.id === h.id) house.value = { ...house.value, rules: res.data.rules };
    return;
  }
  rulesNote.value = loud(res.message);
  clearTimeout(rulesNoteTimer);
  rulesNoteTimer = window.setTimeout(() => (rulesNote.value = null), 5000);
}

// Any house in the city can be shared (ShareHouse.vue); the workshop isn't in a city, and a house being made has
// nothing to see yet (its chef copies an invite link instead).
const shareable = computed(() => !!house.value && !house.value.tutorial && !making.value);

const renting = ref(false);
const knocking = ref<Room | null>(null);

// Rows lit for a moment: the room of a face picked in the crew, or every free room when the foot asks you to pick.
const lit = ref<string[]>([]);
const list = ref<HTMLElement | null>(null);
let litTimer = 0;
async function light(names: string[], focusKnock = false) {
  tab.value = "rooms";
  // A room folded away behind "+N" is unfolded first, so its row can light up.
  if (names.some((n) => !roomRows.value.shown.some((r) => r.name === n))) roomsOpen.value = true;
  await nextTick();
  const rows = names.map((n) => list.value?.querySelector<HTMLElement>(`[data-room="${CSS.escape(n)}"]`)).filter((r): r is HTMLElement => !!r);
  if (!rows.length) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  rows[0].scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  if (focusKnock) rows[0].querySelector<HTMLButtonElement>("button.knock")?.focus({ preventScroll: true });
  lit.value = names;
  clearTimeout(litTimer);
  litTimer = window.setTimeout(() => (lit.value = []), 1500);
}

// A face picked in the crew: someone knocking opens their knock; a flatmate opens their card under the faces
// (PersonPeek: who they are, and reaching out), and their room's row lights up; a free seat lights its room.
const peeked = ref<string | null>(null);
function pick(seat: Seat) {
  if (seat.kind === "knock") return emit("open", { kind: "application", id: seat.id });
  if (seat.kind === "person") peeked.value = peeked.value === seat.person.login ? null : seat.person.login;
  if (seat.room) light([seat.room]);
}
const peek = computed(() => {
  const s = seats.value.find((x) => x.kind === "person" && x.person.login === peeked.value);
  if (!s || s.kind !== "person") return null;
  const room = s.room ? house.value?.rooms.find((r) => r.name === s.room) : undefined;
  return {
    person: s.person,
    line: room?.project ?? (s.room ? w.person.room(s.room) : null),
    // In the workshop, someone with a real house may invite a newcomer to it (your houses from /api/me leave the workshop out).
    actions: personActions(s.person, !!room?.demo, situation.value, {
      inCity: !!props.inCity,
      home: session.value?.houses[0] ?? null,
      invited: notices.sent.some((n) => n.kind === "house_invite" && n.to === s.person.login),
    }),
    // A flatmate of yours: teaming up on one of your two projects (team.ts).
    team: member.value && house.value ? teamUp({ login: s.person.login, example: !!room?.demo || s.person.github === false }, viewer.value, house.value, viewer.value?.room ?? null, notices.sent) : null,
  };
});
// The channel's composer, started with their first name when you reach out to a flatmate there.
const chatStart = ref<{ text: string; n: number } | null>(null);
function reachOut() {
  const p = peek.value;
  const r = p?.actions.reach;
  if (!p || !r) return;
  if (r.kind === "chat") {
    tab.value = "channel";
    chatStart.value = { text: w.person.chatStart((p.person.name ?? p.person.login).split(" ")[0]), n: (chatStart.value?.n ?? 0) + 1 };
    peeked.value = null;
  } else if (r.kind === "knock") knocking.value = house.value?.rooms.find((x) => x.name === r.room) ?? null;
  else if (r.kind === "pick") light(situation.value.freeRooms, true);
  else if (r.kind === "thread") emit("open", { kind: "application", id: r.id });
}

function go() {
  const h = house.value;
  const f = foot.value;
  if (!h) return;
  switch (f.kind) {
    case "rent":
      renting.value = true;
      break;
    case "room":
      emit("open", { kind: "room", houseId: h.id, room: f.room });
      break;
    case "knock":
      knocking.value = h.rooms.find((r) => r.name === f.room) ?? null;
      break;
    case "pick":
      light(situation.value.freeRooms, true);
      break;
    case "thread":
      emit("open", { kind: "application", id: f.id });
      break;
  }
}

// The foot's button: its icon and its words.
const footButton = computed(() => {
  const f = foot.value;
  switch (f.kind) {
    case "rent":
      return f.waiting ? { icon: "key" as const, word: w.waitingForServer } : { icon: "server" as const, word: w.rentServer };
    case "room":
      return { icon: "door" as const, word: w.openMyRoom };
    case "knock":
    case "pick":
      return { icon: "knock" as const, word: w.knockFree };
    case "thread":
      return { icon: "thread" as const, word: w.seeKnock };
    default:
      return null;
  }
});

// The workshop: a newcomer without a room there takes one from its row at the top of the list. The house stream
// then brings the room, and the tutorial's coach, which polls, moves on by itself.
const takeRow = computed(() => !!house.value?.tutorial && !!viewer.value && !viewer.value.room);
const taking = ref(false);
const takeError = ref("");
async function takeRoom() {
  takeError.value = "";
  taking.value = true;
  const res = await postJSON("/api/tutorial/room", {});
  taking.value = false;
  if (!res.ok) takeError.value = res.message;
}

// A room's row: who and what (the person and their project), then one line with what the project is. Its state
// is the dot on the face; the line says it in words only when it isn't simply online ("Its last build failed.",
// "An example project."). A free room says its size there, in the sentence.
// A team's room names its people together, occupant first: "Awa + Moussa · Ndaje".
function rowTitle(room: Room): string {
  if (!room.occupant) return w.freeRoom;
  const who = teamNames(room.occupant, room.team);
  return room.project ? `${who} · ${room.project}` : who;
}
function rowSub(room: Room): string {
  const h = house.value!;
  if (!room.occupant) return `${w.freeRow(room.limits.memoryMb)} ${seeded(room.ad) ?? w.knockToAsk}`;
  const what = seeded(room.projectDescription) ?? (room.project ? w.noDescription : w.noProject);
  return roomState(room, h.status, h.demo).tone === "live" ? what : `${roomLine(room, h.status, h.demo)} ${what}`;
}
const actionOf = (room: Room) => rowAction(room, situation.value, foot.value);
// The rows shown: all of them once opened, else up to five (four under the workshop's "A room for you" row), yours
// and the free ones first (crew.ts).
const roomsOpen = ref(false);
const roomRows = computed(() => {
  const rooms = house.value?.rooms ?? [];
  return roomsOpen.value ? { shown: rooms, hidden: 0 } : foldedRooms(rooms, viewer.value?.room ?? null, ROWS_SHOWN - (takeRow.value ? 1 : 0));
});

// The bill (flatmates only): the month's total, then one line per flatmate, yours first, each said in two
// sentences: what their reviews took off, and what they owe. An API without the bill yet gives the even split.
const bill = computed(() => house.value?.bill ?? null);
const billLines = computed(() => (bill.value ? linesYoursFirst(bill.value.lines, me.value) : []));
const lived = computed(() => house.value?.rooms.filter((r) => r.occupant) ?? []);
const share = computed(() => (house.value?.monthlyCostFcfa ? evenSplit(house.value.monthlyCostFcfa, lived.value.length) : null));
// A bill line's face: the flatmate as the house knows them.
function personOf(l: Pick<BillLine, "login" | "name">) {
  return house.value?.members.find((m) => m.login === l.login) ?? { login: l.login, name: l.name, avatarUrl: null };
}
const lineState = (l: BillLine) =>
  l.paid ? { tone: "live" as const, word: w.paid } : l.due > 0 ? { tone: "warn" as const, word: w.toPay } : { tone: "neutral" as const, word: w.nothingToPay };

// Paying your share: the foot offers it on the Bill tab, and the tab's body becomes the pay sheet (PayBill).
const myDue = computed(() => toPay(bill.value, me.value));
const paying = ref(false);
const paidSaid = ref("");
watch(tab, () => (paying.value = false));
function paid() {
  const h = house.value;
  const b = h?.bill;
  // The stream brings the paid line too; marking it here saves a visible lag.
  if (h && b) house.value = { ...h, bill: { ...b, lines: b.lines.map((l) => (l.login === me.value ? { ...l, paid: true } : l)) } };
  paying.value = false;
  paidSaid.value = w.markedPaid;
}
const payButton = computed(() => member.value && shownTab.value === "bill" && !!myDue.value && !paying.value);

// What the rundown says about the foot, after "Your next step is always here.": the step itself, per viewer.
const tourLast = computed((): string | null => {
  switch (foot.value.kind) {
    case "login":
      return w.tour.login;
    case "rent":
      return w.tour.rent;
    case "room":
      return w.tour.room;
    case "knock":
    case "pick":
      return w.tour.knock;
    case "thread":
      return w.tour.thread;
    default:
      return null;
  }
});

// The rundown: asked for by the tutorial (once, when it reaches its step), or shown on a first visit to a house
// walked into in the lobby (not on a house's own page, and not on the house a link opened).
// It shows the rooms tab. When it ends it counts as the house's tour seen, and the tutorial hears of it if it asked.
const rundownOn = ref(false);
let tutorialAsked = false;
let owed = false;
function startRundown() {
  tab.value = "rooms";
  rundownOn.value = true;
}
watch(
  () => props.rundown,
  (asked) => {
    if (!asked || tutorialAsked) return;
    tutorialAsked = owed = true;
    startRundown();
  },
  { immediate: true },
);
watch(
  () => !!house.value,
  (loaded) => {
    // `quiet`: something else is guiding the player right now, so the first-visit rundown waits for another visit.
    if (!loaded || props.quiet || rundownOn.value || tutorialAsked || toursSeen().includes("house")) return;
    if (props.id === linkedHouse || location.pathname.startsWith("/houses/")) return;
    startRundown();
  },
);
function rundownEnded() {
  rundownOn.value = false;
  markTourSeen("house");
  if (owed) {
    owed = false;
    emit("rundownDone");
  }
}
</script>

<template>
  <div class="inside-house">
    <div v-if="error" class="empty">
      <h2>{{ w.missing }}</h2>
      <p class="muted">{{ w.missingWhy }}</p>
    </div>

    <!-- The core isn't answering: a calm wait, not a dead end. It loads by itself when the core is back. -->
    <Waiting v-else-if="waiting" @retry="load(id)" />
    <Waiting v-else-if="failed" :title="w.failed" :line="w.failedWhy" @retry="load(id)" />

    <Panel
      v-else-if="house"
      :summary="intro.summary"
      :explain="intro.explain"
      :body-id="member ? `tabpanel-${shownTab}` : undefined"
      :body-labelledby="member ? `tab-${shownTab}` : undefined"
      :body-label="member ? undefined : w.rooms"
    >
      <template #head>
        <div class="head">
          <div data-tour="header">
            <PanelHead :title="house.name" :state="houseState(house.status, house.agentOnline, house.demo)" :line="line">
              <!-- The chef of a house being made: copy an invite link. Any other house (not the workshop): share it. -->
              <template v-if="(chef && making) || shareable" #aside>
                <button v-if="chef && making" type="button" class="chip" :aria-label="copied ? w.inviteCopied : w.copyInvite" @click="copyLink">
                  <Icon :name="copied ? 'tick' : 'link'" :size="16" /><span class="chip-word">{{ copied ? w.copied : w.invite }}</span>
                </button>
                <ShareHouse v-else :house-id="house.id" :name="house.name" :city="house.city" />
              </template>
            </PanelHead>
          </div>
          <UiNote v-if="rulesNote" :note="rulesNote" />
          <Crew data-tour="crew" :seats="seats" @pick="pick" />
          <PersonPeek
            v-if="peek"
            :key="peek.person.login"
            :person="peek.person"
            :line="peek.line"
            :actions="peek.actions"
            :team="peek.team"
            :house-id="house.id"
            @reach="reachOut"
            @wave="emit('wave', peek.person.login)"
            @close="peeked = null"
          />
          <!-- Flatmates only: the tontine's turn (its faces in order, the one whose turn it is lit) and the month's
               reviews with the house's review rule. -->
          <div v-if="member" class="life" data-tour="life">
            <p v-if="tontineText" class="tontine">
              <span class="turns" aria-hidden="true">
                <Avatar v-for="(p, i) in turnFaces" :key="p.login" :person="p" :size="i === 0 ? 26 : 20" decorative :class="{ now: i === 0 }" />
              </span>
              <span class="turn-said">{{ tontineText }}</span>
            </p>
            <p class="reviews">
              {{ reviewsText }}
              <!-- The chef switches the rule right where it's said: a toggle, pressed is strict. Its name stays "Strict
                   reviews" so the pressed state reads true. -->
              <button
                v-if="chef && !house.demo"
                type="button"
                class="rule"
                :aria-pressed="strict"
                :aria-label="w.strictName"
                :title="w.pressToSwitch(ruleSentence)"
                :disabled="savingRules"
                @click="switchRules"
              >
                <Icon name="rules" :size="14" />
              </button>
            </p>
          </div>
        </div>
      </template>

      <template v-if="member" #tabs>
        <div data-tour="tabs">
          <PanelTabs v-model="tab" :tabs="tabs" :label="w.parts" />
        </div>
      </template>

      <!-- Rooms: one row each, with who lives there, what they build, and whether it's online. -->
      <ul v-if="shownTab === 'rooms'" ref="list" class="plain lines" data-tour="rooms">
        <ListRow v-if="takeRow" :title="w.roomForYou" open>
          <span v-if="takeError" class="sub warn" role="alert">{{ takeError }}</span>
          <span v-else class="sub">{{ explain.room(256, 0.5) }}</span>
          <template #lead><span class="door"><Icon name="plus" :size="20" /></span></template>
          <template v-if="!coached" #end>
            <button type="button" class="primary" :disabled="taking" @click="takeRoom"><Icon name="door" :size="16" />{{ w.takeIt }}</button>
          </template>
        </ListRow>
        <ListRow
          v-for="room in roomRows.shown"
          :key="room.name"
          :data-room="room.name"
          :title="rowTitle(room)"
          :sub="rowSub(room)"
          :mine="viewer?.room === room.name"
          :open="!room.occupant"
          :lit="lit.includes(room.name)"
        >
          <template #lead>
            <!-- The room's state as a dot on the face; the row's line says it in words. -->
            <span v-if="room.occupant" class="face">
              <Avatar :person="room.occupant" :size="40" decorative />
              <!-- Teammates on its project: their small faces on the lower left, the first two. -->
              <span v-if="room.team?.length" class="mates" aria-hidden="true">
                <Avatar v-for="p in room.team.slice(0, 2)" :key="p.login" :person="p" :size="20" decorative />
              </span>
              <StatusDot class="on-face" :state="roomState(room, house.status, house.demo)" />
            </span>
            <span v-else class="door"><Icon name="door" :size="20" /></span>
          </template>
          <template v-if="actionOf(room)" #end>
            <button
              v-if="actionOf(room) === 'open'"
              type="button"
              class="primary"
              :aria-label="w.openName(room.name)"
              @click="emit('open', { kind: 'room', houseId: house.id, room: room.name })"
            >
              <Icon name="door" :size="16" />{{ w.open }}
            </button>
            <a
              v-else-if="actionOf(room) === 'visit' && room.url"
              class="button"
              :href="room.url"
              target="_blank"
              rel="noopener"
              :aria-label="w.visitName(room.occupant ? nameOf(room.occupant) : room.name)"
            >
              {{ w.visit }}<Icon name="external" :size="16" />
            </a>
            <button v-else-if="actionOf(room) === 'knock'" type="button" class="knock" :aria-label="w.knockName(room.name)" @click="knocking = room">
              <Icon name="knock" :size="16" />{{ w.knock }}
            </button>
          </template>
        </ListRow>
        <!-- A long list folds after five rows, so the panel fits: "+3" brings the rest. -->
        <li v-if="roomRows.hidden">
          <button type="button" class="more" :aria-label="w.moreRooms(roomRows.hidden)" @click="roomsOpen = true">
            <span class="door" aria-hidden="true"><Icon name="plus" :size="20" /></span>
            <span class="more-count" aria-hidden="true">+{{ roomRows.hidden }}</span>
          </button>
        </li>
      </ul>

      <div v-else-if="shownTab === 'channel' && viewer" class="chat-host">
        <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="viewer.login" :start="chatStart" tools @message="(login) => openChat('dm', { with: login })" />
      </div>

      <!-- Reviews (the API's chores): yours first, each a sentence with when it's due and a link to the pull request
           on GitHub. The rest of the house's reviews wait behind a quiet button, unless you have none of your own.
           The summary sentence above the list (Panel) already says what to do, or that there's nothing. -->
      <template v-else-if="shownTab === 'chores'">
        <ul v-if="reviews.mine.length" class="plain lines">
          <ListRow v-for="c in reviews.mine" :key="c.id" :title="reviewTitle(c, me)" mine>
            <span class="sub">
              <span class="when" :class="{ late: c.late }">{{ dueWords(dueOf(c)) }}</span> · {{ c.repo }}#{{ c.prNumber }}
            </span>
            <template #lead>
              <Avatar v-if="c.author" :person="c.author" :size="40" decorative />
              <span v-else class="door"><Icon name="check" :size="20" /></span>
            </template>
            <template #end>
              <a :href="c.prUrl" class="button" target="_blank" rel="noopener" :aria-label="w.reviewName(`${c.repo}#${c.prNumber}`)">
                {{ w.review }}<Icon name="external" :size="16" />
              </a>
            </template>
          </ListRow>
        </ul>
        <button
          v-if="reviews.mine.length && reviews.others.length"
          type="button"
          class="others-toggle"
          :aria-expanded="othersOpen"
          aria-controls="house-other-reviews"
          @click="othersOpen = !othersOpen"
        >
          <Icon name="next" :size="16" class="chev" />{{ othersOpen ? w.reviews.hideOthers : w.reviews.showOthers(reviews.others.length) }}
        </button>
        <ul v-if="reviews.others.length" v-show="othersShown" id="house-other-reviews" class="plain lines">
          <ListRow v-for="c in reviews.others" :key="c.id" :title="reviewTitle(c, me)">
            <span class="sub">
              <span class="when" :class="{ late: c.late }">{{ dueWords(dueOf(c)) }}</span> · {{ c.repo }}#{{ c.prNumber }}
            </span>
            <template #lead><Avatar :person="c.assignee" :size="40" decorative /></template>
          </ListRow>
        </ul>
      </template>

      <!-- News (the API's fridge): the notes the house pinned, one row each. -->
      <FridgeDoor v-else-if="shownTab === 'fridge'" compact :notes="notes" />

      <template v-else-if="shownTab === 'bill'">
        <PayBill
          v-if="paying && myDue && bill"
          :house-id="house.id"
          :line="myDue"
          :operators="bill.operators"
          :reference="bill.reference"
          :chef="chef"
          @paid="paid"
          @back="paying = false"
        />
        <!-- The month's bill: a line per flatmate, yours first, in two sentences each. The total is the tab's
             summary sentence, above (Panel). -->
        <template v-else-if="bill">
          <ul class="plain lines">
            <ListRow v-for="l in billLines" :key="l.login" :title="lineWords(l, me).reviews" :mine="l.login === me">
              <span class="sub">{{ lineWords(l, me).owes }}</span>
              <template #lead>
                <span class="face">
                  <Avatar :person="personOf(l)" :size="40" decorative />
                  <StatusDot class="on-face" :state="lineState(l)" />
                </span>
              </template>
            </ListRow>
          </ul>
        </template>
        <!-- An API without the bill yet: the month's cost split evenly, as an estimate (its total is the summary). -->
        <template v-else-if="house.monthlyCostFcfa && share">
          <ul class="plain lines">
            <ListRow
              v-for="r in lived"
              :key="r.name"
              :title="viewer?.room === r.name ? w.yourShare(fcfa(share)) : w.theirShare(nameOf(r.occupant!).split(' ')[0], fcfa(share))"
              :mine="viewer?.room === r.name"
            >
              <template #lead><Avatar :person="r.occupant!" :size="40" decorative /></template>
            </ListRow>
          </ul>
        </template>
        <p v-else class="muted none">{{ chef ? w.noServerChef : w.noServer }}</p>
        <p class="sr-only" aria-live="polite">{{ paidSaid }}</p>
      </template>

      <template #foot>
        <div class="foot" data-tour="foot">
          <!-- On the Bill tab, with your share still to pay, paying it is the next step. While the pay sheet is up,
               its own button is the one to press, so the foot stays empty. -->
          <button v-if="payButton" type="button" class="primary go" @click="paying = true"><Icon name="bill" :size="20" />{{ w.pay(fcfa(myDue!.due)) }}</button>
          <template v-else-if="!paying || shownTab !== 'bill'">
            <RouterLink v-if="foot.kind === 'login'" to="/login" class="button primary go"><Icon name="login" :size="20" />{{ w.logInToKnock }}</RouterLink>
            <button v-else-if="footButton" type="button" class="primary go" @click="go"><Icon :name="footButton.icon" :size="20" />{{ footButton.word }}</button>
            <p v-else-if="foot.kind === 'say'" class="say">{{ foot.text }}</p>
          </template>
        </div>
      </template>
    </Panel>

    <p v-else class="muted empty" aria-live="polite">{{ w.opening }}</p>

    <template v-if="house">
      <!-- The parts it points at carry data-tour="header | crew | tabs | rooms | foot". -->
      <Rundown v-if="rundownOn" :name="house.name" :demo="house.demo" :next="tourLast" @done="rundownEnded" />
      <RentServer v-if="renting" :house-id="house.id" :live="live" :resume="keyMade" @close="renting = false" />
      <KnockSteps
        v-if="knocking"
        :house-id="house.id"
        :room="knocking"
        stay
        @knocked="(id) => emit('open', { kind: 'application', id })"
        @close="knocking = null"
      />
    </template>
  </div>
</template>

<style scoped>
/* Positioned, so the rundown can place its ring and bubble over the parts in this box's own pixels. The panel
   inside it is exactly as tall as the sheet leaves. */
.inside-house { position: relative; display: flex; flex-direction: column; min-height: 0; }
.inside-house > :deep(.panel-shape), .inside-house > :deep(.waiting) { flex: 1 1 auto; }
.empty { padding: 24px var(--gutter); display: grid; gap: 8px; }
.head { display: grid; gap: 8px; min-width: 0; }

/* The chef's invite in the head: a chunky pill with an icon, like a game's menu buttons. */
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--quiet-edge); font-size: 14px; font-weight: 600; }
.chip:hover:not(:disabled) { background: var(--tile); }
.chip:active:not(:disabled) { transform: translateY(1px); }
/* The review rule's switch, at the end of its sentence: a small key, orange while strict. */
.rule { display: inline-grid; place-items: center; width: 24px; height: 24px; min-height: 0; padding: 0; margin-left: 4px; vertical-align: middle; border-radius: var(--r-xs); background: var(--surface); color: var(--muted); box-shadow: var(--quiet-edge); }
.rule:hover:not(:disabled) { background: var(--tile); color: var(--text); }
.rule[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-fill); }
/* The exchange under the faces: two quiet sentences, each at most two lines. */
.life { display: grid; gap: 4px; font-size: 13px; line-height: 1.35; color: var(--muted); }
.life p { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tontine { color: var(--text); }
/* The tontine's line shows its faces' glow whole, so it doesn't clip like the other line. */
.life p.tontine { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; overflow: visible; padding-left: 3px; }
/* The tontine's faces in turn order: whose turn it is, lit in warm light, then the next ones, smaller. */
.turn-said { flex: 1 1 220px; min-width: 0; }
.turns { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.turns > :not(.now) { opacity: 0.75; }
.turns > .now { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--warn), 0 0 12px 3px var(--warn-soft); margin: 0 4px 0 3px; }

.plain { list-style: none; margin: 0; padding: 0; }
/* A tighter line height than the page's, so a row stays at the row's 60px and six of them fit with the head. */
.lines { display: grid; gap: 4px; align-content: start; line-height: 1.3; }
.none { padding: 8px 0; }
/* A free room's door, in an outlined circle where a face would be. */
.door { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--line-strong); color: var(--free); }
/* The "+N" row: as tall as a room's row, a dashed circle and the count, lit like a menu entry. */
.more { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border: 0; border-radius: var(--r-md); background: none; box-shadow: inset 0 0 0 1px var(--line); color: var(--text); cursor: pointer; }
.more:hover:not(:disabled) { background: var(--tile); }
.more:focus-visible { outline: none; background: var(--accent-soft); }
.more .door { color: var(--muted); }
.more-count { font: 700 16px/1 var(--mono); color: var(--muted); }
.sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub.warn { color: var(--danger); }
/* A face with its state's dot on the lower right, like a presence dot in a game's friend list. */
.face { position: relative; display: inline-grid; }
/* A team's other faces, small and overlapping on the face's lower left, each ringed in the row's colour. */
.face .mates { position: absolute; left: -6px; bottom: -4px; display: flex; }
.face .mates > * { box-shadow: 0 0 0 2px var(--surface); border-radius: 50%; }
.face .mates > * + * { margin-left: -8px; }
/* Ringed in the row's colour, so the dot reads as a badge on the face (it replaces the dot's own halo). */
.face .on-face { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; box-shadow: 0 0 0 2px var(--surface); animation: none; }
/* Buttons and links in a row carry an icon beside their word. */
.lines :deep(.end button), .lines :deep(.end a.button) { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
/* When a review is due: in the row's muted words, and in the danger colour once it's late (it costs rent then). */
.when { font-weight: 600; }
.when.late { color: var(--danger); }
/* "See the house's other reviews (2)": a quiet, full-width key under your own rows, with a chevron that turns down
   when they're shown. Quieter than a row, so your own reviews stay what the tab is about. */
.others-toggle {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: none;
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}
.others-toggle:hover:not(:disabled) { background: var(--tile); color: var(--text); }
.chev { transition: transform var(--dur) var(--ease); }
.others-toggle[aria-expanded="true"] .chev { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  .chev { transition: none; }
}

/* The channel fills the body, so the chat can keep its box and scroll its messages inside it. */
.chat-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.chat-host > :deep(*) { flex: 1 1 auto; min-height: 0; }

/* The foot: one big button across the width, or the one line that says why there's none. */
.foot { flex: 1 1 auto; display: flex; align-items: center; min-width: 0; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; font-size: 18px; }
a.go:hover { text-decoration: none; }
.say { min-height: 48px; display: flex; align-items: center; font-size: 14px; color: var(--muted); }
@media (max-width: 480px) {
  /* A phone keeps only whose turn it is beside the sentence, so the line stays two lines high. */
  .life p.tontine { flex-wrap: nowrap; }
  .turns > :not(.now) { display: none; }
  .chip { padding: 0 10px; }
  .chip-word { display: none; }
}
</style>
