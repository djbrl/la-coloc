<script setup lang="ts">
// Inside a house, built like a game's pause menu rather than a page, on the lobby's Panel: the house's name and
// state, the tabs, one tab's body, and in the foot the one next step. It opens on the floor plan (FloorPlan.vue);
// a room pressed there, or a housemate's arrow, opens that room's page in its place (RoomDetails.vue). Everything fits
// the sheet without scrolling; only the body scrolls, inside itself, when a list or the chat is longer than the space.
// The look is carte blanche (style.css): the tabs open on numbers rather than sentences (stats tiles), lists are quiet
// lines with one symbol each, and what most people don't need first waits in a fold. The house view arrives from the API and keeps arriving over its stream, as on
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
import ChatOptions from "../chat/ChatOptions.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import UiNote, { loud, type Note } from "../UiNote.vue";
import Waiting from "../Waiting.vue";
import { dueOf, dueWords, reviewTitle, splitReviews } from "./house/chores";
import { canKnock, chatKey, crewOf, foldedRooms, footFor, myRooms, personActions, type RoomKey, ROWS_SHOWN, type Seat, type Situation } from "./house/crew";
import FloorPlan from "./house/FloorPlan.vue";
import { type BillLine, lineWords, linesYoursFirst, ruleLine, tontineLine, toPay } from "./house/exchange";
import { exampleBill, exampleReviews } from "./house/examples";
import Icon from "./house/Icon.vue";
import { notesThisWeek } from "./house/notes";
import PayBill from "./house/PayBill.vue";
import RentServer from "./house/RentServer.vue";
import RoomDetails from "./house/RoomDetails.vue";
import ShareHouse from "./house/ShareHouse.vue";
import { evenSplit, fcfa, houseCost, OPERATORS, rentOfPerson, rentWithOneMore, type ServerInfo } from "./house/server";
import { houseWords as w } from "./house/words";
import ListRow from "./panel/ListRow.vue";
import Panel from "./panel/Panel.vue";
import PanelHead from "./panel/PanelHead.vue";
import PanelTabs, { type Tab } from "./panel/PanelTabs.vue";
import { explain, houseState, houseTrouble } from "./panel/words";
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
// The house's review rule, said where the reviews are (the chef's switch sits at its end).
const ruleText = computed(() => ruleLine(!!house.value?.rules.strictReviews));
// What a review earns in credit, as the tab's number: "+500 FCFA".
const perReview = computed(() => `+${fcfa(house.value?.bill?.reviewCredit ?? 500)}`);

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
        // A dot (PanelTabs draws a badge as a dot) while there's news from this week, not a count of every note.
        { key: "fridge", icon: "pin", word: w.tabs.fridge, badge: notesThisWeek(notes.value) || undefined },
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

// The tabs open on numbers rather than sentences (Jib, 6 Nov): the housemates, the reviews and the bill each start with
// a row of stats tiles, and the Bill tab ends on the one line that says how the cost is split (explain.bill).
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

// The squares shown: all of them once opened, else two rows of four with the house's own square last (and the
// workshop's "A room for you" first), yours and the free ones first (crew.ts).
const roomsOpen = ref(false);
const planSum = computed(() => !!house.value && !!houseCost(house.value) && !inviteFoot.value);
const roomRows = computed(() => {
  const rooms = house.value?.rooms ?? [];
  const room = ROWS_SHOWN - 1 - (planSum.value ? 1 : 0) - (takeRow.value ? 1 : 0);
  return roomsOpen.value ? { shown: rooms, hidden: 0 } : foldedRooms(rooms, mine.value, room);
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
// Your own line of the bill: the third number at the top, and your reviews this month.
const myLine = computed(() => bill.value?.lines.find((l) => l.login === me.value) ?? null);
// Everyone's part waits in a fold: the numbers at the top are what most people come for.
const linesOpen = ref(false);
// The housemates' numbers: how many, what each pays, and who's the chef.
const people = computed(() => seats.value.filter((s) => s.kind === "person").length);
const chefFirst = computed(() => (house.value?.chef ? nameOf(house.value.chef).split(" ")[0] : null));

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

    <Panel v-else-if="house" class="house-panel" :body-id="`tabpanel-${shownTab}`" :body-labelledby="`tab-${shownTab}`">
      <template #head>
        <PanelHead :title="house.name" :state="houseState(house.status, house.agentOnline, house.demo)" :line="line">
          <template #lead><span class="icon-tile"><Icon name="house" :size="22" /></span></template>
          <!-- The chef of a house being made: copy an invite link. Any other house (not the workshop): share it. -->
          <template v-if="(shownTab === 'channel' && viewer) || (chef && making) || (shareable && !inviteFoot)" #aside>
            <!-- On the Channel tab: the house chat's "…" (Mute, Report), as in the chat sheet. -->
            <ChatOptions v-if="shownTab === 'channel' && viewer" :group="{ channel: `house:${house.id}`, name: house.name }" />
            <button v-else-if="chef && making" type="button" class="chip" :aria-label="copied ? w.inviteCopied : w.copyInvite" @click="copyLink">
              <Icon :name="copied ? 'tick' : 'link'" :size="16" /><span class="chip-word">{{ copied ? w.copied : w.invite }}</span>
            </button>
            <ShareHouse v-else :house-id="house.id" :name="house.name" :city="house.city" />
          </template>
        </PanelHead>
      </template>

      <template #tabs>
        <PanelTabs v-model="tab" :tabs="tabs" :label="w.parts" />
      </template>

      <!-- The floor plan: one square per room, and the house's own square last. -->
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
        :no-numbers="!planSum"
        @pick="(room) => (openRoom = room.name)"
        @take="takeRoom"
        @more="roomsOpen = true"
      />

      <!-- Who lives here: their numbers first (how many, what each pays, the chef), then one line each: their project,
           their rent, a Chat key, and the arrow to their room's page. -->
      <template v-else-if="shownTab === 'people'">
        <ul class="stats">
          <li><strong>{{ people }}</strong><span>{{ w.stats.flatmates(people) }}</span></li>
          <li v-if="share"><strong>{{ fcfa(share) }}</strong><span>{{ w.stats.eachMonth }}</span></li>
          <li v-if="chefFirst"><strong>{{ chefFirst }}</strong><span>{{ w.stats.chef }}</span></li>
        </ul>
        <ul class="plain lines people">
          <ListRow v-for="s in seats" :key="s.key" class="pickable" :data-room="s.room" :title="nameOf(s.person)" :sub="seatSub(s)" @click="pick(s)">
            <template #lead><Avatar :person="s.person" :size="40" decorative /></template>
            <template v-if="s.kind === 'person' && (s.chef || s.you)" #tag>
              <span v-if="s.chef" class="tag">{{ w.chefTag }}</span>
              <span v-if="s.you" class="tag">{{ w.you }}</span>
            </template>
            <template #meta>
              <span v-if="seatRent(s)" class="amount">{{ seatRent(s) }}</span>
            </template>
            <template #end>
              <button v-if="rowChat(s.person)" type="button" :aria-label="w.person.chatName(nameOf(s.person).split(' ')[0])" @click.stop="press(rowChat(s.person)!)"><Icon name="chat" :size="16" />{{ w.person.chat }}</button>
              <a v-if="rowGithub(s.person, s.room)" class="button git-key" :href="rowGithub(s.person, s.room)!" target="_blank" rel="noopener" :aria-label="w.person.githubName(s.person.login)" :title="w.person.githubName(s.person.login)" @click.stop><Icon name="external" :size="16" /></a>
              <button v-if="s.kind === 'knock' || s.room" type="button" class="see" :aria-label="w.peopleName(nameOf(s.person))" @click.stop="pick(s)"><Icon name="next" :size="18" /></button>
            </template>
          </ListRow>
          <!-- Guests in the chat, from outside a full house: flatmates can take them out, and a guest can leave. -->
          <ListRow v-for="g in house.guests ?? []" :key="`g:${g.login}`" :title="nameOf(g)" :sub="w.guests.line">
            <template #lead><Avatar :person="g" :size="40" decorative /></template>
            <template #end>
              <button v-if="rowChat(g)" type="button" :aria-label="w.person.chatName(nameOf(g).split(' ')[0])" @click="press(rowChat(g)!)"><Icon name="chat" :size="16" />{{ w.person.chat }}</button>
              <a v-if="rowGithub(g, null)" class="button git-key" :href="rowGithub(g, null)!" target="_blank" rel="noopener" :aria-label="w.person.githubName(g.login)" :title="w.person.githubName(g.login)"><Icon name="external" :size="16" /></a>
              <button v-if="member || g.login === me" type="button" :aria-label="g.login === me ? w.guests.leaveName : w.guests.removeName(nameOf(g))" @click="removeGuest(g.login)">{{ g.login === me ? w.guests.leave : w.guests.remove }}</button>
            </template>
          </ListRow>
          <li v-if="guestError" class="error" role="alert">{{ guestError }}</li>
        </ul>
      </template>

      <div v-else-if="shownTab === 'channel' && viewer" class="chat-host">
        <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="viewer.login" tools @message="(login) => openChat('dm', { with: login })" />
      </div>

      <!-- Reviews (the API's chores): the numbers first (yours to do, the house's this month, what one is worth), then
           yours, each a line with when it's due and a key to the pull request on GitHub. The rest of the house's
           reviews wait behind a fold, unless you have none of your own. With none at all, one calm tile says so. -->
      <template v-else-if="shownTab === 'chores'">
        <UiNote v-if="rulesNote" :note="rulesNote" />
        <ul class="stats">
          <li><strong>{{ myChores.length }}</strong><span>{{ w.stats.toDo(myChores.length) }}</span></li>
          <li v-if="typeof house.reviewsThisMonth === 'number'"><strong>{{ house.reviewsThisMonth }}</strong><span>{{ w.stats.traded(house.reviewsThisMonth) }}</span></li>
          <li><strong>{{ perReview }}</strong><span>{{ w.stats.perReview }}</span></li>
        </ul>
        <!-- Whose turn it is: their face, the next few smaller, and the sentence. -->
        <p v-if="tontineText" class="tontine">
          <span class="turns" aria-hidden="true">
            <Avatar v-for="(p, i) in turnFaces" :key="p.login" :person="p" :size="i === 0 ? 24 : 20" decorative :class="{ now: i === 0 }" />
          </span>
          <span class="turn-said">{{ tontineText }}</span>
        </p>
        <div v-if="!reviews.mine.length && !reviews.others.length" class="calm tile-box">
          <span class="status-mark ok big"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <strong class="calm-title">{{ w.reviews.none }}</strong>
          <span class="calm-line">{{ ruleText }}<button
              v-if="chef && !house.demo"
              type="button"
              class="rule"
              :aria-pressed="strict"
              :aria-label="w.strictName"
              :title="w.pressToSwitch(ruleSentence)"
              :disabled="savingRules"
              @click="switchRules"
            ><Icon name="rules" :size="14" /></button></span>
        </div>
        <template v-else>
          <p v-if="example" class="label">{{ w.exampleTag }}</p>
          <ul v-if="reviews.mine.length" class="plain lines">
            <ListRow v-for="c in reviews.mine" :key="c.id" :title="reviewTitle(c, me)">
              <span class="sub">{{ dueWords(dueOf(c)) }} · {{ c.repo }}#{{ c.prNumber }}</span>
              <template #lead>
                <span class="status-mark" :class="c.late ? 'fail' : 'todo'">
                  <template v-if="c.late"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></template>
                </span>
              </template>
              <template #end>
                <a :href="c.prUrl" class="button" target="_blank" rel="noopener" :aria-label="w.reviewName(`${c.repo}#${c.prNumber}`)">{{ w.review }}</a>
              </template>
            </ListRow>
          </ul>
          <div v-if="reviews.mine.length && reviews.others.length" class="fold tile-box">
            <button type="button" class="fold-key" :aria-expanded="othersOpen" aria-controls="house-other-reviews" @click="othersOpen = !othersOpen">
              <span class="fold-title">{{ othersOpen ? w.reviews.hideOthers : w.reviews.showOthers(reviews.others.length) }}</span><svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
          <ul v-if="reviews.others.length" v-show="othersShown" id="house-other-reviews" class="plain lines">
            <ListRow v-for="c in reviews.others" :key="c.id" :title="reviewTitle(c, me)">
              <span class="sub">{{ dueWords(dueOf(c)) }} · {{ c.repo }}#{{ c.prNumber }}</span>
              <template #lead><span class="status-mark" :class="c.late ? 'fail' : 'none'"><template v-if="c.late"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></template></span></template>
            </ListRow>
          </ul>
          <p class="note"><Icon name="info" :size="16" /><span>{{ ruleText }}<button
              v-if="chef && !house.demo"
              type="button"
              class="rule"
              :aria-pressed="strict"
              :aria-label="w.strictName"
              :title="w.pressToSwitch(ruleSentence)"
              :disabled="savingRules"
              @click="switchRules"
            ><Icon name="rules" :size="14" /></button></span></p>
        </template>
      </template>

      <!-- News (the API's fridge): quiet lines by day, one symbol each. -->
      <FridgeDoor v-else-if="shownTab === 'fridge'" compact :notes="notes" />

      <template v-else-if="shownTab === 'bill'">
        <PayBill
          v-if="paying && myDue && bill"
          :house-id="house.id"
          :line="myDue"
          @paid="paid"
          @back="paying = false"
        />
        <!-- The month's bill in numbers: the server, the rooms, your part. Then what a review earns in credit and how
             many you did, and everyone's line in a fold: who, what their reviews earned, what they owe (the sentence
             for it on hover and for a screen reader), and a tick once paid. -->
        <template v-else-if="bill">
          <p v-if="example" class="label">{{ w.exampleTag }}</p>
          <ul class="stats">
            <li><strong>{{ fcfa(bill.total) }}</strong><span>{{ w.stats.server }}</span></li>
            <li><strong>{{ house.rooms.length }}</strong><span>{{ w.stats.rooms(house.rooms.length) }}</span></li>
            <li v-if="myLine"><strong>{{ fcfa(myLine.paid ? (myLine.paidAmount ?? myLine.due) : myLine.due) }}</strong><span>{{ myLine.paid ? w.stats.paid : w.stats.yourPart }}</span></li>
          </ul>
          <div class="facts">
            <p class="fact"><span>{{ w.bill.eachReview }}</span><strong>+{{ fcfa(bill.reviewCredit) }}</strong></p>
            <p v-if="myLine" class="fact"><span>{{ w.bill.yourReviews }}</span><strong>{{ myLine.reviews }}</strong></p>
          </div>
          <div class="fold tile-box">
            <button type="button" class="fold-key" :aria-expanded="linesOpen" aria-controls="house-bill-lines" @click="linesOpen = !linesOpen">
              <span class="fold-title">{{ w.bill.everyone }}</span>
              <span class="fold-meta">{{ billLines.length }} {{ w.stats.flatmates(billLines.length) }}</span><svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <ul v-show="linesOpen" id="house-bill-lines" class="plain lines bill-lines">
              <ListRow v-for="l in billLines" :key="l.login" :title="nameOf(personOf(l))" :sub="lineWords(l, me).reviews">
                <template #lead><Avatar :person="personOf(l)" :size="32" decorative /></template>
                <template #meta>
                  <span class="amount" :title="lineWords(l, me).owes">{{ fcfa(l.due) }}<span class="sr-only">. {{ lineWords(l, me).owes }}</span></span>
                  <span class="status-mark" :class="l.paid ? 'ok' : 'none'" aria-hidden="true"><template v-if="l.paid"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg></template></span>
                </template>
              </ListRow>
            </ul>
          </div>
        </template>
        <!-- An API without the bill yet: the month's cost split evenly, as an estimate. -->
        <template v-else-if="house.monthlyCostFcfa && share">
          <ul class="stats">
            <li><strong>{{ fcfa(house.monthlyCostFcfa) }}</strong><span>{{ w.stats.server }}</span></li>
            <li><strong>{{ house.rooms.length }}</strong><span>{{ w.stats.rooms(house.rooms.length) }}</span></li>
            <li><strong>{{ fcfa(share) }}</strong><span>{{ w.stats.eachMonth }}</span></li>
          </ul>
          <ul class="plain lines">
            <ListRow
              v-for="r in lived"
              :key="r.name"
              :title="mine.includes(r.name) ? w.yourShare(fcfa(share)) : w.theirShare(nameOf(r.occupant!).split(' ')[0], fcfa(share))"
            >
              <template #lead><Avatar :person="r.occupant!" :size="32" decorative /></template>
            </ListRow>
          </ul>
        </template>
        <p v-else class="muted none">{{ chef ? w.noServerChef : w.noServer }}</p>
        <p class="sr-only" aria-live="polite">{{ paidSaid }}</p>
      </template>

      <template v-if="footShown" #foot>
        <div class="foot">
          <!-- On the Bill tab, with your share still to pay, paying it is the next step; how the cost is split under it. -->
          <template v-if="payButton">
            <button type="button" class="primary go" @click="paying = true">{{ w.pay(fcfa(myDue!.due)) }}</button>
            <p class="note"><Icon name="info" :size="16" /><span>{{ explain.bill }}</span></p>
          </template>
          <template v-else-if="inviteFoot">
            <p v-if="inviteRent" class="less">
              <!-- A paragraph can't carry a name, so the sentence is said in words and the drawing is skipped. -->
              <span class="sr-only">{{ w.plan.rentFalls(fcfa(inviteRent.now), fcfa(inviteRent.then)) }}</span>
              <span class="sums" aria-hidden="true">
                <span class="was">{{ bare(inviteRent.now) }}</span>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
.empty { padding: 24px 20px; display: grid; gap: 8px; }
/* The head's icon: the house on the soft red (PanelHead's lead is a plain tile; this fills it). */
.icon-tile { width: 44px; height: 44px; }

/* The chef's invite on the head: a small grey key with an icon, the size PanelHead gives its aside. */
.chip { display: inline-flex; align-items: center; gap: 6px; box-shadow: inset 0 -3px 0 var(--quiet-lip); }
.chip:active:not(:disabled) { transform: translateY(1px); }

/* Numbers rather than sentences: a tile each, the number at 20 and what it counts at 13 under it, one line each. */
.stats { flex: none; list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
.stats li { min-width: 0; display: grid; gap: 2px; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.stats strong, .stats span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats strong { font-size: 20px; font-weight: 800; line-height: 26px; font-variant-numeric: tabular-nums; }
.stats span { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }

.plain { list-style: none; margin: 0; padding: 0; }
.lines { flex: none; display: grid; align-content: start; gap: 4px; }
/* A housemate's line is one big key: it lights under the pointer, and its arrow is the way in for the keyboard. */
.people :deep(.list-row) { min-height: 56px; }
.people :deep(.list-row.pickable) { cursor: pointer; }
.amount { font-size: 14px; font-weight: 800; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
/* An icon on a line, so it stays dense: its name is for a screen reader and a hover. */
.lines :deep(.end a.button.git-key) { width: 40px; padding: 0 0 3px; }
.lines :deep(.end button.see) { width: 40px; padding: 0; background: none; box-shadow: none; color: var(--muted); }
.lines :deep(.end button.see:hover:not(:disabled)) { background: var(--tile); color: var(--text); }
.sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.none { padding: 8px 0; }
.label { flex: none; }

/* Whose turn it is, above the reviews: the faces in turn order, the one whose turn it is ringed in ink. */
.tontine { flex: none; display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.turn-said { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.turns { flex: none; display: inline-flex; align-items: center; gap: 4px; padding-left: 2px; }
.turns > :not(.now) { opacity: 0.75; }
.turns > .now { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); margin: 0 4px 0 2px; }
/* Nothing to review: one calm tile, a tick, and the house's rule under it. */
.calm { flex: none; display: grid; justify-items: center; gap: 6px; padding: 18px 12px; text-align: center; }
.status-mark.big { width: 28px; height: 28px; }
.status-mark.big svg { width: 16px; height: 16px; }
.calm-title { font-size: 17px; font-weight: 800; line-height: 22px; }
.calm-line { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
/* The review rule's switch, at the end of its sentence: a small grey key, ink while strict. */
.rule { display: inline-grid; place-items: center; width: 26px; height: 26px; min-height: 0; padding: 0; margin-left: 6px; vertical-align: middle; border-radius: 8px; background: var(--sunken); color: var(--text); box-shadow: none; }
.rule:hover:not(:disabled) { background: var(--fill); }
.rule[aria-pressed="true"], .rule[aria-pressed="true"]:hover:not(:disabled) { background: var(--text); color: var(--surface); }
/* A muted line with the info sign: how something works, said once at the end. */
.note { flex: none; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.note > svg { flex: none; }

/* A fold: a row you open, for what most people don't need to read first. Its chevron turns when it's open. */
.fold { flex: none; display: grid; }
.fold-key { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 14px; border-radius: var(--tile-r); background: transparent; box-shadow: none; color: var(--text); text-align: left; }
.fold-key:hover:not(:disabled) { background: transparent; }
.fold-key:active:not(:disabled) { transform: none; }
.fold-title { flex: 1 1 auto; min-width: 0; font: 800 15px/1.2 var(--font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fold-meta { flex: none; font: 600 13px/1.2 var(--font); color: var(--muted); }
.chev { flex: none; color: var(--muted); transition: transform var(--dur) var(--ease); }
.fold-key[aria-expanded="true"] .chev { transform: rotate(180deg); }
.fold .lines { padding: 0 14px 10px; }
/* On the paper, a hovered line lights one step darker. */
.fold :deep(.list-row:hover), .fold :deep(.list-row:focus-within) { background: var(--fill); box-shadow: -8px 0 0 var(--fill), 8px 0 0 var(--fill); }
.bill-lines :deep(.meta) { gap: 8px; }
@media (prefers-reduced-motion: reduce) {
  .chev { transition: none; }
}

/* The bill's rows: what a word stands for on the left, its number on the right, each on the soft paper. */
.facts { flex: none; display: grid; gap: 6px; }
.fact { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; padding: 0 14px; border-radius: 12px; background: var(--tile); font-size: 15px; line-height: 22px; }
.fact span { min-width: 0; font-weight: 600; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fact strong { flex: none; font-weight: 800; font-variant-numeric: tabular-nums; }

/* The channel fills the body, so the chat can keep its box and scroll its messages inside it. */
.chat-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.chat-host > :deep(*) { flex: 1 1 auto; min-height: 0; }

/* The foot: one button across the width (red: the one main action), or the one line that says why there's none. */
.foot { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; min-width: 0; }
.foot .error { flex-basis: 100%; font-size: 14px; }
.foot .note { flex-basis: 100%; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
a.go:hover { text-decoration: none; }
.say { min-height: 48px; display: flex; align-items: center; font-size: 15px; font-weight: 600; color: var(--muted); }
/* Your rent with one more flatmate, beside the button that brings them in. */
.foot :deep(.share) { margin-left: auto; }
.less { flex: 1 1 200px; min-width: 0; display: grid; gap: 1px; }
.sums { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800; line-height: 22px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sums svg { flex: none; color: var(--muted); }
.was { font-weight: 600; color: var(--muted); }
.less-word { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
@media (max-width: 560px) {
  /* Three numbers don't fit side by side on a phone: the third goes under, across. */
  .stats { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  .chip-word { display: none; }
}
</style>
