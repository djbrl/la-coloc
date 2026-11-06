<script setup lang="ts">
// Inside a house, built like a game's pause menu rather than a page, on the lobby's Panel: the house's name and
// state, the tabs, one tab's body, and in the foot the one next step. It opens on the floor plan (FloorPlan.vue);
// a room pressed there, or a housemate's arrow, opens that room's page in its place (RoomDetails.vue). Everything fits the sheet without scrolling; only the body scrolls, inside itself, when a list
// or the chat is longer than the space. The house view arrives from the API and keeps arriving over its stream, as on
// HousePage.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useWhenBack, wentDown } from "../../core";
import { openChat } from "../../conversations";
import { askToChat } from "../../notices";
import { postJSON, sendJSON } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { HouseView, Person, Room } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import UiNote, { loud, type Note } from "../UiNote.vue";
import Waiting from "../Waiting.vue";
import { dueOf, dueWords, reviewSummary, reviewTitle, splitReviews } from "./house/chores";
import { canKnock, chatKey, crewOf, foldedRooms, footFor, myRooms, personActions, type RoomKey, ROWS_SHOWN, type Seat, type Situation } from "./house/crew";
import FloorPlan from "./house/FloorPlan.vue";
import { billHead, type BillLine, lineWords, linesYoursFirst, reviewsLine, ruleLine, tontineLine, toPay } from "./house/exchange";
import { exampleBill, exampleReviews } from "./house/examples";
import Icon from "./house/Icon.vue";
import { notesSummary } from "./house/notes";
import PayBill from "./house/PayBill.vue";
import RentServer from "./house/RentServer.vue";
import RoomDetails from "./house/RoomDetails.vue";
import ShareHouse from "./house/ShareHouse.vue";
import { evenSplit, fcfa, OPERATORS, rentOfPerson, rentWithOneMore, type ServerInfo } from "./house/server";
import { houseWords as w } from "./house/words";
import ListRow from "./panel/ListRow.vue";
import Panel from "./panel/Panel.vue";
import PanelHead from "./panel/PanelHead.vue";
import PanelTabs, { type Tab } from "./panel/PanelTabs.vue";
import StatusPill from "./panel/StatusPill.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseState, houseTrouble, roomLine, roomState } from "./panel/words";
import type { Place } from "./place";
import { seeded } from "../seeded";

// The house's parts, one tab each. The keys are the API's names: "chores" shows as Reviews, "fridge" as News.
type TabKey = "rooms" | "people" | "channel" | "chores" | "fridge" | "bill";

const props = defineProps<{
  id: string;
  // Open on this tab (flatmates only), and switch to it again whenever it changes: a quest can point at a part of
  // the house ("look at your reviews") without the player hunting for the tab.
  tab?: TabKey;
  // The tutorial's coach is up with its own main action ("Take the room"): the workshop's room row then keeps
  // quiet, so there's one button for one action.
  coached?: boolean;
}>();
// `view`: the house as it arrives (first fetch, then each push on its stream), for a page that shows more of it.
const emit = defineEmits<{ open: [place: Place]; label: [text: string]; view: [house: HouseView | null] }>();

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
// The key is made and paid for: the server is on its way. A key with nothing paid is a house left half-way by the old
// way in, pasting a command: it goes to the pay step (RentServer.vue).
const serverComing = computed(() => keyMade.value && !!house.value?.bill?.lines.find((l) => l.login === viewer.value?.login)?.paid);
const mine = computed(() => myRooms(viewer.value));

const situation = computed(
  (): Situation => ({
    viewer: viewer.value,
    making: making.value,
    keyMade: serverComing.value,
    demo: !!house.value?.demo,
    tutorial: !!house.value?.tutorial,
    freeRooms: house.value?.rooms.filter((r) => !r.occupant).map((r) => r.name) ?? [],
  }),
);
const foot = computed(() => footFor(situation.value));
const seats = computed(() => (house.value ? crewOf(house.value, viewer.value?.login ?? null) : []));

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
// The workshop, for one of its newcomers: nobody else lives there, so its reviews and its bill are made-up examples
// (house/examples.ts), each tab saying so once.
const example = computed(() => !!house.value?.tutorial && member.value);
const you = computed((): Person => {
  const login = viewer.value?.login ?? "";
  return house.value?.members.find((m) => m.login === login) ?? { login, name: null, avatarUrl: null };
});
const chores = computed(() => (example.value && !house.value?.chores?.length ? exampleReviews(you.value) : house.value?.chores));
// The house's open reviews (the API's chores), yours apart from the others', most urgent first (chores.ts).
const reviews = computed(() => splitReviews(chores.value, viewer.value?.login ?? null));
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

// At the top of the Reviews tab (flatmates only), the house's exchange: whose project the house rallies behind this
// fortnight (the tontine), with its faces in turn order, and how many reviews were traded this month, with the house's
// review rule. Someone outside doesn't need the house's inner workings (Jib, 15 10).
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

// A guest let into the chat from outside a full house reads and writes the channel, and nothing else of the house.
const chatGuest = computed(() => !member.value && viewer.value?.guest === "accepted");

// You live here alone, and nobody is knocking, in the chat or asking for a review: who lives here, the chat and the
// reviews have nothing to show yet, so their tabs wait until someone moves in. The foot invites them.
const alone = computed(() => {
  const h = house.value;
  // The workshop shows every tab: the quest walks through them, and its examples fill them.
  if (!member.value || !h || h.tutorial) return false;
  return h.rooms.filter((r) => r.occupant).length <= 1 && !seats.value.some((s) => s.kind === "knock") && !h.guests?.length && !h.chores?.length && !h.channel?.length;
});

// The tabs: the floor plan and who lives here for anyone; the channel for a chat guest too; the rest for flatmates.
const tab = ref<TabKey>("rooms");
const tabs = computed((): Tab[] => [
  { key: "rooms", icon: "door", word: w.tabs.rooms },
  ...(alone.value ? [] : [{ key: "people", icon: "people", word: w.tabs.people }]),
  ...(member.value
    ? [
        ...(alone.value
          ? []
          : [
              { key: "channel", icon: "chat", word: w.tabs.channel },
              { key: "chores", icon: "check", word: w.tabs.chores, badge: myChores.value.length || undefined, alert: myChores.value.some((c) => c.late) },
            ]),
        { key: "fridge", icon: "pin", word: w.tabs.fridge, badge: notes.value.length || undefined },
        { key: "bill", icon: "bill", word: w.tabs.bill },
      ]
    : chatGuest.value
      ? [{ key: "channel", icon: "chat", word: w.tabs.channel }]
      : []),
] as Tab[]);
// A house reloaded as someone else (logging out, say) goes back to what anyone can see.
watch(member, (is) => {
  if (!is && tab.value !== "people" && !chatGuest.value) tab.value = "rooms";
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
// A tab that isn't offered (yet, or to you) shows the floor plan.
const shownTab = computed((): TabKey => (tabs.value.some((t) => t.key === tab.value) ? tab.value : "rooms"));

// Some tabs open on one plain sentence about the viewer's situation, with the longer "what is this, why it matters"
// behind the "?" (Panel shows them through Explain.vue). The floor plan, the housemates and the chat speak for themselves.
const credit = computed(() => fcfa(house.value?.bill?.reviewCredit ?? 500));
const intro = computed((): { summary: string | null; explain: string | null } => {
  const h = house.value;
  if (!h) return { summary: null, explain: null };
  switch (shownTab.value) {
    case "rooms":
    case "people":
    case "channel":
      return { summary: null, explain: null };
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
  openRoom.value = null;
  tab.value = "rooms";
  // A room folded away behind "+N" is unfolded first, so its row can light up.
  if (names.some((n) => !roomRows.value.shown.some((r) => r.name === n))) roomsOpen.value = true;
  await nextTick();
  const rows = names.map((n) => list.value?.querySelector<HTMLElement>(`[data-room="${CSS.escape(n)}"]`)).filter((r): r is HTMLElement => !!r);
  if (!rows.length) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  rows[0].scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  if (focusKnock) rows[0].querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  lit.value = names;
  clearTimeout(litTimer);
  litTimer = window.setTimeout(() => (lit.value = []), 1500);
}

// A room's page, in place of the tabs: by name, so the stream keeps it fresh, and it goes away if the room does.
const openRoom = ref<string | null>(null);
const shownRoom = computed(() => (openRoom.value ? (house.value?.rooms.find((r) => r.name === openRoom.value) ?? null) : null));
watch(tab, () => (openRoom.value = null));
// Back from a room's page: the focus goes to what opened it.
async function closeRoom() {
  const name = openRoom.value;
  openRoom.value = null;
  await nextTick();
  if (name) list.value?.querySelector<HTMLElement>(`[data-room="${CSS.escape(name)}"] .see, [data-room="${CSS.escape(name)}"] .cell`)?.focus({ preventScroll: true });
}
// Someone on the housemates' list: someone knocking opens their knock; a flatmate opens their room's page.
function pick(seat: Seat) {
  if (seat.kind === "knock") return emit("open", { kind: "application", id: seat.id });
  if (seat.room) openRoom.value = seat.room;
}
// A key pressed on a room's page or a housemate's row.
const router = useRouter();
function press(key: RoomKey) {
  switch (key.kind) {
    case "manage":
      if (openRoom.value) emit("open", { kind: "room", houseId: props.id, room: openRoom.value });
      break;
    case "chat":
      void openChat("dm", { with: key.login });
      break;
    case "chatLogin":
      void router.push("/login");
      break;
    case "knock":
      knocking.value = house.value?.rooms.find((r) => r.name === key.room) ?? null;
      break;
    case "pick":
      light(situation.value.freeRooms, true);
      break;
    case "thread":
      emit("open", { kind: "application", id: key.id });
      break;
  }
}
// Someone on the housemates' list (a flatmate, someone knocking, a guest in the chat): their Chat key, on everyone but
// you, and their GitHub, for a real account. `room`: the room they're listed with, whose flag says if they're made up.
const inExampleRoom = (room: string | null) => !!(room && house.value?.rooms.find((r) => r.name === room)?.demo);
const rowChat = (person: Person) => chatKey(person, situation.value);
const rowGithub = (person: Person, room: string | null) => (person.login === me.value ? null : personActions(person, inExampleRoom(room), situation.value, {}).github);

// A full house: asking to join its group chat. The house's stream brings the answer; a refusal says why in the foot.
const chatError = ref("");
async function askChat() {
  chatError.value = "";
  const sent = await askToChat(props.id);
  if (!sent.ok) chatError.value = sent.message;
  else if (sent.data.status === "accepted") tab.value = "channel";
}
// A guest leaves the chat, or a flatmate takes them out of it.
const guestError = ref("");
async function removeGuest(login: string) {
  guestError.value = "";
  const res = await sendJSON("DELETE", `/api/houses/${encodeURIComponent(props.id)}/guests/${encodeURIComponent(login)}`);
  if (!res.ok) guestError.value = res.message;
}

function go() {
  const h = house.value;
  const f = foot.value;
  if (!h) return;
  switch (f.kind) {
    case "rent":
      renting.value = true;
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
    case "askChat":
      void askChat();
      break;
  }
}

// The foot's button: its icon and its words.
const footButton = computed(() => {
  const f = foot.value;
  switch (f.kind) {
    case "rent":
      return f.waiting ? { icon: "key" as const, word: w.waitingForServer } : { icon: "server" as const, word: w.rentServer };
    case "knock":
    case "pick":
      return { icon: "knock" as const, word: w.knockFree };
    case "thread":
      return { icon: "thread" as const, word: w.seeKnock };
    case "askChat":
      return { icon: "chat" as const, word: w.askChat };
    default:
      return null;
  }
});

// The workshop: a newcomer without a room there takes one from its square at the start of the plan. The house stream
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

// The squares shown: all of them once opened, else up to eight (seven with the workshop's "A room for you"), yours and
// the free ones first (crew.ts).
const roomsOpen = ref(false);
const roomRows = computed(() => {
  const rooms = house.value?.rooms ?? [];
  return roomsOpen.value ? { shown: rooms, hidden: 0 } : foldedRooms(rooms, mine.value, ROWS_SHOWN - (takeRow.value ? 1 : 0));
});

// The bill (flatmates only): the month's total, then one line per flatmate, yours first, each said in two
// sentences: what their reviews took off, and what they owe. An API without the bill yet gives the even split.
const bill = computed(() => house.value?.bill ?? (example.value && house.value ? exampleBill(you.value, house.value.operators ?? OPERATORS) : null));
const billLines = computed(() => (bill.value ? linesYoursFirst(bill.value.lines, me.value) : []));
const lived = computed(() => house.value?.rooms.filter((r) => r.occupant) ?? []);
const share = computed(() => (house.value?.monthlyCostFcfa ? evenSplit(house.value.monthlyCostFcfa, lived.value.length) : null));
// The foot: the bill's button on its tab, or the house's one next step. It only shows on the floor plan and the
// housemates' list, so the channel and the rest keep the whole height.
const footShown = computed(() => {
  if (payButton.value) return true;
  if (!["rooms", "people"].includes(shownTab.value)) return false;
  return foot.value.kind !== "none";
});
// You live here and a room is free: the foot invites someone, and shows what that does to your rent. It's then the way
// to share the house, so the head's share key steps aside.
const inviteFoot = computed(() => foot.value.kind === "invite" && ["rooms", "people"].includes(shownTab.value));
const inviteRent = computed(() => (house.value && me.value ? rentWithOneMore(house.value, me.value) : null));
const bare = (amount: number) => fcfa(amount).replace(/\s*FCFA$/, "");
// A housemate's row: what they make, and what they pay.
function seatSub(seat: Seat): string {
  // Someone may rent several rooms: the first with a project in it says what they make.
  const room = house.value?.rooms.find((r) => r.occupant?.login === seat.person.login && r.project);
  return room?.project ?? (seat.room ? w.person.room(seat.room) : "");
}
const seatRent = (seat: Seat) => {
  const pays = seat.kind === "person" && house.value ? rentOfPerson(house.value, seat.person.login) : null;
  return pays ? fcfa(pays) : "";
};
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

</script>

<template>
  <div ref="list" class="inside-house">
    <div v-if="error" class="empty">
      <h2>{{ w.missing }}</h2>
      <p class="muted">{{ w.missingWhy }}</p>
    </div>

    <!-- The core isn't answering: a calm wait, not a dead end. It loads by itself when the core is back. -->
    <Waiting v-else-if="waiting" @retry="load(id)" />
    <Waiting v-else-if="failed" :title="w.failed" :line="w.failedWhy" @retry="load(id)" />

    <RoomDetails v-else-if="house && shownRoom" :key="shownRoom.name" :house="house" :room="shownRoom" :situation="situation" @back="closeRoom" @press="press" />

    <Panel
      v-else-if="house"
      :summary="intro.summary"
      :explain="intro.explain"
      :body-id="`tabpanel-${shownTab}`"
      :body-labelledby="`tab-${shownTab}`"
    >
      <template #head>
        <div class="head">
          <div>
            <PanelHead :title="house.name" :state="houseState(house.status, house.agentOnline, house.demo)" :line="line">
              <!-- The chef of a house being made: copy an invite link. Any other house (not the workshop): share it. -->
              <template v-if="(chef && making) || (shareable && !inviteFoot)" #aside>
                <button v-if="chef && making" type="button" class="chip" :aria-label="copied ? w.inviteCopied : w.copyInvite" @click="copyLink">
                  <Icon :name="copied ? 'tick' : 'link'" :size="16" /><span class="chip-word">{{ copied ? w.copied : w.invite }}</span>
                </button>
                <ShareHouse v-else :house-id="house.id" :name="house.name" :city="house.city" />
              </template>
            </PanelHead>
          </div>
        </div>
      </template>

      <template #tabs>
        <div>
          <PanelTabs v-model="tab" :tabs="tabs" :label="w.parts" />
        </div>
      </template>

      <!-- The floor plan: one tile per room. -->
      <FloorPlan
        v-if="shownTab === 'rooms'"
        :house="house"
        :rooms="roomRows.shown"
        :hidden="roomRows.hidden"
        :mine="mine"
        :knockable="canKnock(situation)"
        :lit="lit"
        :take="takeRow"
        :coached="coached"
        :taking="taking"
        :take-error="takeError"
        :no-numbers="inviteFoot"
        @pick="(room) => (openRoom = room.name)"
        @take="takeRoom"
        @more="roomsOpen = true"
      />

      <!-- Who lives here, one row each: their project, their rent, a Chat key, and the arrow to their room's page. -->
      <ul v-else-if="shownTab === 'people'" class="plain lines people">
        <ListRow v-for="s in seats" :key="s.key" class="pickable" :data-room="s.room" :title="nameOf(s.person)" :sub="seatSub(s)" @click="pick(s)">
          <template #lead>
            <span class="face">
              <Avatar :person="s.person" :size="44" decorative />
              <span v-if="s.kind === 'person' && s.chef" class="crown" :title="w.chefTag"><Icon name="crown" :size="12" /></span>
            </span>
          </template>
          <template #meta>
            <span v-if="seatRent(s)" class="amount small">{{ seatRent(s) }}</span>
          </template>
          <template #end>
            <button v-if="rowChat(s.person)" type="button" class="chat-key" :aria-label="w.person.chatName(nameOf(s.person).split(' ')[0])" @click.stop="press(rowChat(s.person)!)"><Icon name="chat" :size="16" />{{ w.person.chat }}</button>
            <a v-if="rowGithub(s.person, s.room)" class="button git-key" :href="rowGithub(s.person, s.room)!" target="_blank" rel="noopener" :aria-label="w.person.githubName(s.person.login)" :title="w.person.githubName(s.person.login)" @click.stop><Icon name="external" :size="16" /></a>
            <button v-if="s.kind === 'knock' || s.room" type="button" class="see" :aria-label="w.peopleName(nameOf(s.person))" @click.stop="pick(s)"><Icon name="next" :size="18" /></button>
          </template>
        </ListRow>
        <!-- Guests in the chat, from outside a full house: flatmates can take them out, and a guest can leave. -->
        <ListRow v-for="g in house.guests ?? []" :key="`g:${g.login}`" :title="nameOf(g)" :sub="w.guests.line">
          <template #lead><Avatar :person="g" :size="44" decorative /></template>
          <template #end>
            <button v-if="rowChat(g)" type="button" class="chat-key" :aria-label="w.person.chatName(nameOf(g).split(' ')[0])" @click="press(rowChat(g)!)"><Icon name="chat" :size="16" />{{ w.person.chat }}</button>
            <a v-if="rowGithub(g, null)" class="button git-key" :href="rowGithub(g, null)!" target="_blank" rel="noopener" :aria-label="w.person.githubName(g.login)" :title="w.person.githubName(g.login)"><Icon name="external" :size="16" /></a>
            <button v-if="member || g.login === me" type="button" class="chat-key" :aria-label="g.login === me ? w.guests.leaveName : w.guests.removeName(nameOf(g))" @click="removeGuest(g.login)">{{ g.login === me ? w.guests.leave : w.guests.remove }}</button>
          </template>
        </ListRow>
        <li v-if="guestError" class="error" role="alert">{{ guestError }}</li>
      </ul>

      <div v-else-if="shownTab === 'channel' && viewer" class="chat-host">
        <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="viewer.login" tools @message="(login) => openChat('dm', { with: login })" />
      </div>

      <!-- Reviews (the API's chores): yours first, each a sentence with when it's due and a link to the pull request
           on GitHub. The rest of the house's reviews wait behind a quiet button, unless you have none of your own.
           The summary sentence above the list (Panel) already says what to do, or that there's nothing. -->
      <template v-else-if="shownTab === 'chores'">
        <span v-if="example" class="example-tag">{{ w.exampleTag }}</span>
        <UiNote v-if="rulesNote" :note="rulesNote" />
        <!-- Whose turn it is (its faces in order, the one whose turn it is lit), and the month's reviews with the
             house's review rule. -->
        <div class="life">
          <p v-if="tontineText" class="tontine">
            <span class="turns" aria-hidden="true">
              <Avatar v-for="(p, i) in turnFaces" :key="p.login" :person="p" :size="i === 0 ? 26 : 20" decorative :class="{ now: i === 0 }" />
            </span>
            <span class="turn-said">{{ tontineText }}</span>
          </p>
          <p class="reviews-line">
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
        <ul v-if="reviews.mine.length" class="plain lines">
          <ListRow v-for="c in reviews.mine" :key="c.id" :title="reviewTitle(c, me)" mine>
            <span class="sub">
              <span class="when" :class="{ late: c.late }">{{ dueWords(dueOf(c)) }}</span> · {{ c.repo }}#{{ c.prNumber }}
            </span>
            <template #lead>
              <Avatar v-if="c.author" :person="c.author" :size="56" decorative />
              <span v-else class="door"><Icon name="check" :size="28" /></span>
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
            <template #lead><Avatar :person="c.assignee" :size="56" decorative /></template>
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
          @paid="paid"
          @back="paying = false"
        />
        <!-- The month's bill: a line per flatmate, yours first: who, what their reviews took off, what they owe (the
             sentence for it on hover and for a screen reader), and a tick once paid. Then your part, big. The whole
             bill is the tab's summary, above (Panel). -->
        <template v-else-if="bill">
          <span v-if="example" class="example-tag">{{ w.exampleTag }}</span>
          <ul class="plain lines bill-lines">
            <ListRow v-for="l in billLines" :key="l.login" :title="nameOf(personOf(l))" :sub="lineWords(l, me).reviews" :mine="l.login === me">
              <template #meta>
                <span class="amount" :title="lineWords(l, me).owes" :class="{ due: !l.paid && l.due > 0 }">{{ fcfa(l.due) }}<span class="sr-only">. {{ lineWords(l, me).owes }}</span></span>
                <Icon v-if="l.paid" name="tick" :size="26" class="paid" />
              </template>
              <template #lead>
                <span class="face">
                  <Avatar :person="personOf(l)" :size="40" decorative />
                  <StatusDot class="on-face" :state="lineState(l)" />
                </span>
              </template>
            </ListRow>
          </ul>
          <p v-if="myDue" class="your-part">
            <span class="part-word">{{ w.yourPart }}</span>
            <span class="part-sum"><span class="part-n">{{ fcfa(myDue.due).replace(/\s*FCFA$/, "") }}</span> FCFA</span>
          </p>
        </template>
        <!-- An API without the bill yet: the month's cost split evenly, as an estimate (its total is the summary). -->
        <template v-else-if="house.monthlyCostFcfa && share">
          <ul class="plain lines">
            <ListRow
              v-for="r in lived"
              :key="r.name"
              :title="mine.includes(r.name) ? w.yourShare(fcfa(share)) : w.theirShare(nameOf(r.occupant!).split(' ')[0], fcfa(share))"
              :mine="mine.includes(r.name)"
            >
              <template #lead><Avatar :person="r.occupant!" :size="56" decorative /></template>
            </ListRow>
          </ul>
        </template>
        <p v-else class="muted none">{{ chef ? w.noServerChef : w.noServer }}</p>
        <p class="sr-only" aria-live="polite">{{ paidSaid }}</p>
      </template>

      <template v-if="footShown" #foot>
        <div class="foot">
          <!-- On the Bill tab, with your share still to pay, paying it is the next step. -->
          <button v-if="payButton" type="button" class="primary go" @click="paying = true"><Icon name="bill" :size="20" />{{ w.pay(fcfa(myDue!.due)) }}</button>
          <template v-else-if="inviteFoot">
            <p v-if="inviteRent" class="less">
              <!-- A paragraph can't carry a name, so the sentence is said in words and the drawing is skipped. -->
              <span class="sr-only">{{ w.plan.rentFalls(fcfa(inviteRent.now), fcfa(inviteRent.then)) }}</span>
              <span class="sums" aria-hidden="true">
                <span class="was">{{ bare(inviteRent.now) }}</span>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span>{{ fcfa(inviteRent.then) }}</span>
              </span>
              <span class="less-word" aria-hidden="true">{{ w.plan.withOneMore }}</span>
            </p>
            <ShareHouse :house-id="house.id" :name="house.name" :city="house.city" :word="w.plan.invite" />
          </template>
          <RouterLink v-else-if="foot.kind === 'login'" to="/login" class="button primary go"><Icon name="login" :size="20" />{{ w.logInToKnock }}</RouterLink>
          <button v-else-if="footButton" type="button" class="primary go" @click="go"><Icon :name="footButton.icon" :size="20" />{{ footButton.word }}</button>
          <p v-else-if="foot.kind === 'say'" class="say">{{ foot.text }}</p>
          <p v-if="chatError" class="error" role="alert">{{ chatError }}</p>
        </div>
      </template>
    </Panel>

    <p v-else class="muted empty" aria-live="polite">{{ w.opening }}</p>

    <template v-if="house">
      <RentServer v-if="renting" :house-id="house.id" :live="live" :resume="serverComing" :key-made="keyMade" :plan="house.server?.plan" @close="renting = false" />
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
/* The panel inside it is exactly as tall as the sheet leaves. */
.inside-house { position: relative; display: flex; flex-direction: column; min-height: 0; }
.inside-house > :deep(.panel-shape), .inside-house > :deep(.waiting) { flex: 1 1 auto; }
.empty { padding: 24px var(--gutter); display: grid; gap: 8px; }
.head { display: grid; gap: 8px; min-width: 0; }

/* The chef's invite on the band: a white key with an icon, the ones PanelHead sizes. */
.chip { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; }
.chip:active:not(:disabled) { transform: translateY(1px); }
/* The review rule's switch, at the end of its sentence: a small key, yellow while strict. */
.rule { display: inline-grid; place-items: center; width: 26px; height: 26px; min-height: 0; padding: 0; margin-left: 4px; vertical-align: middle; border-radius: var(--r-xs); background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); }
.rule:hover:not(:disabled) { background: var(--tile); }
.rule[aria-pressed="true"] { background: var(--sticker); color: var(--ink); box-shadow: none; }
/* The exchange above the reviews: two sentences, each at most two lines. */
.life { display: grid; gap: 4px; font-size: 14px; line-height: 1.25; color: var(--muted); }
.life p { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tontine { color: var(--text); }
/* The tontine's line keeps its ring whole, so it doesn't clip like the other line. */
.life p.tontine { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; overflow: visible; padding-left: 3px; }
/* The tontine's faces in turn order: whose turn it is, ringed in yellow, then the next ones, smaller. */
.turn-said { flex: 1 1 220px; min-width: 0; }
.turns { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.turns > :not(.now) { opacity: 0.75; }
.turns > .now { box-shadow: 0 0 0 3px var(--sticker); margin: 0 4px 0 3px; }

.plain { list-style: none; margin: 0; padding: 0; }
/* The workshop's made-up reviews and bill say so once, with a small tag at the top of the tab. */
.example-tag { justify-self: start; align-self: flex-start; flex: none; padding: 3px 8px; border-radius: var(--r-xs); background: var(--sticker); color: var(--ink); font: 800 12px/1.2 var(--font); text-transform: uppercase; letter-spacing: 0.04em; }
.lines { display: grid; align-content: start; line-height: 1.3; }
.lines :deep(.list-row) { min-height: 76px; }
.lines :deep(.lead) { color: var(--ink); }
/* A housemate's row is one big key: it lights under the pointer, never pink, and its arrow is the way in for the keyboard. */
.people { gap: 2px; }
.people :deep(.list-row) { min-height: 60px; }
.people :deep(.list-row.pickable) { cursor: pointer; }
.people :deep(.list-row:focus-within) { background: var(--tile); box-shadow: -6px 0 0 var(--tile), 6px 0 0 var(--tile); }
.people :deep(.end) .chat-key { min-height: 40px; padding: 0 12px; background: var(--tile); box-shadow: none; color: var(--text); font: 800 15px/1 var(--font); }
.people :deep(.end) .chat-key:hover:not(:disabled) { background: var(--fill); }
/* An icon on a row, so the row stays dense: its name is for a screen reader and a hover. */
.people :deep(.end) a.button.git-key { width: 46px; padding: 0; background: var(--tile); box-shadow: none; color: var(--text); }
.people :deep(.end) a.button.git-key:hover { background: var(--fill); }
.people .see { width: 40px; min-height: 40px; height: 40px; padding: 0; display: grid; place-items: center; background: none; box-shadow: none; color: var(--muted); }
.crown { position: absolute; top: -6px; right: -6px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--sticker); color: var(--ink); }
.bill-lines :deep(.list-row) { min-height: 50px; }
.paid { flex: none; color: var(--live); }
.none { padding: 8px 0; }
.sub { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.face { position: relative; display: inline-grid; }
.face .on-face { position: absolute; right: -3px; bottom: -3px; width: 14px; height: 14px; box-shadow: 0 0 0 2px var(--surface); animation: none; }
/* Buttons and links in a row carry an icon beside their word. */
.lines :deep(.end button), .lines :deep(.end a.button) { display: inline-flex; align-items: center; gap: 6px; }
/* When a review is due: in the row's muted words, and in the danger colour once it's late (it costs rent then). */
.when { font-weight: 600; }
.when.late { color: var(--danger); }
/* A bill's amount, and your part of it on red under the rows. The amounts line up, with or without a tick. */
.amount { font-size: 18px; font-weight: 800; white-space: nowrap; }
.amount.small { font: 700 14px/1 var(--num); color: var(--muted); }
.your-part { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 6px 12px; border-radius: var(--r-md); background: var(--panel-red); color: var(--on-panel); }
.part-word { font-size: 20px; font-weight: 800; }
.part-sum { font-size: 20px; font-weight: 800; white-space: nowrap; }
.part-n { font: 400 48px/1.05 var(--display); }
/* "See the house's other reviews (2)": a ghost across the width under your own rows, with a chevron that turns down
   when they're shown. Quieter than a row, so your own reviews stay what the tab is about. */
.others-toggle {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  margin: 8px 0;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: none;
  box-shadow: var(--quiet-edge);
  color: var(--text);
  font: 800 15px/1.2 var(--font);
  text-align: left;
}
.others-toggle:hover:not(:disabled) { background: var(--tile); }
.chev { transition: transform var(--dur) var(--ease); }
.others-toggle[aria-expanded="true"] .chev { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  .chev { transition: none; }
}

/* The channel fills the body, so the chat can keep its box and scroll its messages inside it. */
.chat-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.chat-host > :deep(*) { flex: 1 1 auto; min-height: 0; }

/* The foot: one big button across the width, or the one line that says why there's none. */
.foot { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.foot .error { flex-basis: 100%; font-size: 14px; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 60px; font-size: 24px; }
a.go:hover { text-decoration: none; }
.say { min-height: 50px; display: flex; align-items: center; font-size: 15px; color: var(--muted); }
/* Your rent with one more flatmate, beside the button that brings them in. */
.foot :deep(.share) { margin-left: auto; }
.less { flex: 1 1 200px; min-width: 0; display: grid; gap: 1px; }
.sums { display: flex; align-items: center; gap: 8px; font: 800 22px/1.15 var(--num); white-space: nowrap; }
.sums svg { flex: none; color: var(--muted); }
.was { font-weight: 600; color: var(--muted); }
.less-word { font-size: 14px; line-height: 1.2; color: var(--muted); }
@media (max-width: 560px) {
  .lines :deep(.list-row) { min-height: 64px; }
  .part-n { font-size: 44px; }
  .go { font-size: 20px; }
}
@media (max-width: 480px) {
  /* A phone keeps only whose turn it is beside the sentence, so the line stays two lines high. */
  .life p.tontine { flex-wrap: nowrap; }
  .turns > :not(.now) { display: none; }
  .chip-word { display: none; }
}
</style>
