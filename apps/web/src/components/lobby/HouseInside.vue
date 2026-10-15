<script setup lang="ts">
// Inside a house, built like a game's pause menu rather than a page, on the lobby's Panel: the house's name and
// state, its people as a line-up of faces, the tabs (flatmates only), one tab's body, and the one next step in the
// foot. Everything fits the sheet without scrolling; only the body scrolls, inside itself, when a list or the chat
// is longer than the space. The house view arrives from the API and keeps arriving over its stream, as on HousePage.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack, wentDown } from "../../core";
import { postJSON, sendJSON } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { HouseView, Room } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import UiNote, { loud, type Note } from "../UiNote.vue";
import Waiting from "../Waiting.vue";
import { crewOf, footFor, rowAction, type Seat, type Situation } from "./house/crew";
import Crew from "./house/Crew.vue";
import { billHead, type BillLine, lineWords, linesYoursFirst, reviewsLine, ruleLine, tontineLine, toPay } from "./house/exchange";
import Icon from "./house/Icon.vue";
import PayBill from "./house/PayBill.vue";
import RentServer from "./house/RentServer.vue";
import Rundown from "./house/Rundown.vue";
import { evenSplit, fcfa, type ServerInfo } from "./house/server";
import { linkedHouse, markTourSeen, toursSeen } from "./house/tours";
import ListRow from "./panel/ListRow.vue";
import Panel from "./panel/Panel.vue";
import PanelHead from "./panel/PanelHead.vue";
import PanelTabs, { type Tab } from "./panel/PanelTabs.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseLine, houseState, roomLine, roomState } from "./panel/words";
import type { Place } from "./place";

const props = defineProps<{
  id: string;
  // The tutorial asks for the window's rundown (Rundown.vue). It also stands in for the first-time tour.
  rundown?: boolean;
}>();
// `view`: the house as it arrives (first fetch, then each push on its stream), for a page that shows more of it.
const emit = defineEmits<{ open: [place: Place]; label: [text: string]; rundownDone: []; view: [house: HouseView | null] }>();

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
    if (res?.status === 404) error.value = "This house doesn't exist.";
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
watch(
  () => house.value?.name,
  (name) => name && emit("label", `Inside ${name}`),
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
const myChores = computed(() => house.value?.chores?.filter((c) => c.assignee.login === viewer.value?.login) ?? []);
const notes = computed(() => house.value?.notes ?? []);

// The head's one line, after the state's dot: where the house is and its state in words ("Dakar. Its server is
// running."), then the tagline when it's short enough to share the line.
const line = computed(() => {
  const h = house.value;
  if (!h) return "";
  const said = houseLine(h);
  return h.tagline && h.tagline.length <= 40 ? `${said} ${h.tagline}` : said;
});

// Under the faces, the house's exchange in public sentences: whose project the house rallies behind this
// fortnight (the tontine), with its faces in turn order, and how many reviews were traded this month, with the
// house's review rule.
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
type TabKey = "rooms" | "channel" | "chores" | "fridge" | "bill";
const tab = ref<TabKey>("rooms");
const tabs = computed((): Tab[] => [
  { key: "rooms", icon: "door", word: "Rooms" },
  { key: "channel", icon: "chat", word: "Channel" },
  { key: "chores", icon: "check", word: "Chores", badge: myChores.value.length || undefined, alert: myChores.value.some((c) => c.late) },
  { key: "fridge", icon: "fridge", word: "Fridge", badge: notes.value.length || undefined },
  { key: "bill", icon: "bill", word: "Bill" },
]);
// A house reloaded as someone else (logging out, say) shows only the rooms.
watch(member, (is) => {
  if (!is) tab.value = "rooms";
});
const shownTab = computed((): TabKey => (member.value ? tab.value : "rooms"));
const explainLine = computed(() => explain[shownTab.value]);

// The chef of a house being made can invite people from the head. In any state, the chef also sets the review rule
// there; everyone reads it in the sentence under the faces.
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
const ruleWord = computed(() => (strict.value ? "Strict" : "Relaxed"));
const ruleSentence = computed(() =>
  strict.value ? "Strict reviews: merges go online once a flatmate approves." : "Relaxed reviews: merges go online without waiting for a review.",
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

const renting = ref(false);
const knocking = ref<Room | null>(null);

// Rows lit for a moment: the room of a face picked in the crew, or every free room when the foot asks you to pick.
const lit = ref<string[]>([]);
const list = ref<HTMLElement | null>(null);
let litTimer = 0;
async function light(names: string[], focusKnock = false) {
  tab.value = "rooms";
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

function pick(seat: Seat) {
  if (seat.kind === "knock") emit("open", { kind: "application", id: seat.id });
  else if (seat.room) light([seat.room]);
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
      return f.waiting ? { icon: "key" as const, word: "Waiting for the server" } : { icon: "server" as const, word: "Rent the server" };
    case "room":
      return { icon: "door" as const, word: "Open my room" };
    case "knock":
    case "pick":
      return { icon: "knock" as const, word: "Knock on a free room" };
    case "thread":
      return { icon: "thread" as const, word: "See your knock" };
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

// A room's row: who and what (the person and their project), then one line that starts with its state in words
// ("Online.", "An example project.") and goes on with what the project is. A free room says its size there, in
// the sentence. The state's colour is the dot on the face.
const ledger = (login: string) => house.value?.ledger.find((l) => l.login === login) ?? { given: 0, received: 0 };
function rowTitle(room: Room): string {
  if (!room.occupant) return "A free room";
  return room.project ? `${nameOf(room.occupant)} · ${room.project}` : nameOf(room.occupant);
}
function rowSub(room: Room): string {
  const h = house.value!;
  if (!room.occupant) return `Free, with ${room.limits.memoryMb} MB of memory. ${room.ad ?? "Knock to ask for it."}`;
  const what = room.projectDescription ?? (room.project ? "No description yet." : "No project yet.");
  return `${roomLine(room, h.status, h.demo)} ${what}`;
}
const actionOf = (room: Room) => rowAction(room, situation.value, foot.value);

// Chores: how long until a review is due, in a word or two.
const due = (iso: string) => {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  return hours < 1 ? "due now" : hours < 24 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
};

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
  l.paid ? { tone: "live" as const, word: "Paid" } : l.due > 0 ? { tone: "warn" as const, word: "To pay" } : { tone: "neutral" as const, word: "Nothing to pay" };

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
  paidSaid.value = "Marked as paid.";
}
const payButton = computed(() => member.value && shownTab.value === "bill" && !!myDue.value && !paying.value);

// What the rundown says about the foot, after "Your next step is always here.": the step itself, per viewer.
const tourLast = computed((): string | null => {
  switch (foot.value.kind) {
    case "login":
      return "Log in first, then you can knock.";
    case "rent":
      return "Yours: rent the server.";
    case "room":
      return "Yours: open your room to put your project online.";
    case "knock":
    case "pick":
      return "Yours: knock on a free room to ask for it.";
    case "thread":
      return "Yours: see how your knock is going.";
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
    if (!loaded || rundownOn.value || tutorialAsked || toursSeen().includes("house")) return;
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
      <h2>{{ error }}</h2>
      <p class="muted">Maybe it moved, or the link is off by a letter.</p>
    </div>

    <!-- The core isn't answering: a calm wait, not a dead end. It loads by itself when the core is back. -->
    <Waiting v-else-if="waiting" @retry="load(id)" />
    <Waiting v-else-if="failed" title="That didn't load." line="Something went wrong on our side. Try again in a moment." @retry="load(id)" />

    <Panel
      v-else-if="house"
      :explain="explainLine"
      :body-id="member ? `tabpanel-${shownTab}` : undefined"
      :body-labelledby="member ? `tab-${shownTab}` : undefined"
      :body-label="member ? undefined : 'Rooms'"
    >
      <template #head>
        <div class="head">
          <div data-tour="header">
            <PanelHead :title="house.name" :state="houseState(house.status, house.agentOnline, house.demo)" :line="line">
              <template v-if="chef && (making || !house.demo)" #aside>
                <button v-if="making" type="button" class="chip" :aria-label="copied ? 'Invite link copied' : 'Copy an invite link'" @click="copyLink">
                  <Icon :name="copied ? 'tick' : 'link'" :size="16" /><span class="chip-word">{{ copied ? "Copied" : "Invite" }}</span>
                </button>
                <!-- A toggle: pressed is strict. Its name stays "Strict reviews" so the pressed state reads true. -->
                <button
                  v-if="!house.demo"
                  type="button"
                  class="chip"
                  :aria-pressed="strict"
                  aria-label="Strict reviews"
                  :title="`${ruleSentence} Press to switch.`"
                  :disabled="savingRules"
                  @click="switchRules"
                >
                  <Icon name="rules" :size="16" /><span class="chip-word">{{ ruleWord }}</span>
                </button>
              </template>
            </PanelHead>
          </div>
          <UiNote v-if="rulesNote" :note="rulesNote" />
          <Crew data-tour="crew" :seats="seats" @pick="pick" />
          <!-- The exchange, in public sentences: the tontine's turn (its faces in order, the one whose turn it is lit)
               and the month's reviews with the house's review rule. -->
          <div class="life" data-tour="life">
            <p v-if="tontineText" class="tontine">
              <span class="turns" aria-hidden="true">
                <Avatar v-for="(p, i) in turnFaces" :key="p.login" :person="p" :size="i === 0 ? 26 : 20" decorative :class="{ now: i === 0 }" />
              </span>
              <span class="turn-said">{{ tontineText }}</span>
            </p>
            <p class="reviews">{{ reviewsText }}</p>
          </div>
        </div>
      </template>

      <template v-if="member" #tabs>
        <div data-tour="tabs">
          <PanelTabs v-model="tab" :tabs="tabs" label="Parts of the house" />
        </div>
      </template>

      <!-- Rooms: one row each, with who lives there, what they build, and whether it's online. -->
      <ul v-if="shownTab === 'rooms'" ref="list" class="plain lines" data-tour="rooms">
        <ListRow v-if="takeRow" title="A room for you" open>
          <span v-if="takeError" class="sub warn" role="alert">{{ takeError }}</span>
          <span v-else class="sub">{{ explain.room(256, 0.5) }}</span>
          <template #lead><span class="door"><Icon name="plus" :size="20" /></span></template>
          <template #end>
            <button type="button" class="primary" :disabled="taking" @click="takeRoom"><Icon name="door" :size="16" />Take it</button>
          </template>
        </ListRow>
        <ListRow
          v-for="room in house.rooms"
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
              <StatusDot class="on-face" :state="roomState(room, house.status, house.demo)" />
            </span>
            <span v-else class="door"><Icon name="door" :size="20" /></span>
          </template>
          <template v-if="room.occupant && ledger(room.occupant.login).given > 0" #meta>
            <!-- Reviews given, only once there are some: a row of zeros says nothing. -->
            <span
              class="given"
              :title="`${ledger(room.occupant.login).given} reviews given, ${ledger(room.occupant.login).received} received`"
              :aria-label="`${ledger(room.occupant.login).given} reviews given`"
            >
              <Icon name="check" :size="14" />{{ ledger(room.occupant.login).given }}
            </span>
          </template>
          <template v-if="actionOf(room)" #end>
            <button
              v-if="actionOf(room) === 'open'"
              type="button"
              class="primary"
              :aria-label="`Open your room, ${room.name}`"
              @click="emit('open', { kind: 'room', houseId: house.id, room: room.name })"
            >
              <Icon name="door" :size="16" />Open
            </button>
            <a
              v-else-if="actionOf(room) === 'visit' && room.url"
              class="button"
              :href="room.url"
              target="_blank"
              rel="noopener"
              :aria-label="`Visit ${room.occupant ? nameOf(room.occupant) : room.name}'s project (opens in a new tab)`"
            >
              Visit<Icon name="external" :size="16" />
            </a>
            <button v-else-if="actionOf(room) === 'knock'" type="button" class="knock" :aria-label="`Knock on room ${room.name}`" @click="knocking = room">
              <Icon name="knock" :size="16" />Knock
            </button>
          </template>
        </ListRow>
      </ul>

      <div v-else-if="shownTab === 'channel' && viewer" class="chat-host">
        <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="viewer.login" />
      </div>

      <template v-else-if="shownTab === 'chores'">
        <p v-if="!house.chores?.length" class="muted none">No reviews waiting.</p>
        <ul v-else class="plain lines">
          <ListRow
            v-for="c in house.chores"
            :key="c.id"
            :title="c.prTitle"
            :sub="`${c.repo}#${c.prNumber}${c.author ? ` · by ${nameOf(c.author)}` : ''} · for ${nameOf(c.assignee)}`"
            :mine="c.assignee.login === viewer?.login"
          >
            <template #lead><Avatar :person="c.assignee" :size="40" decorative /></template>
            <template #meta>
              <span class="when" :class="{ late: c.late }">{{ c.late ? "Late" : due(c.dueAt) }}</span>
            </template>
            <template #end>
              <a :href="c.prUrl" class="button" target="_blank" rel="noopener" :aria-label="`Review ${c.repo}#${c.prNumber} on GitHub (opens in a new tab)`">
                Review<Icon name="external" :size="16" />
              </a>
            </template>
          </ListRow>
        </ul>
      </template>

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
        <!-- The month's bill: the total, then a line per flatmate, yours first, in two sentences each. -->
        <template v-else-if="bill">
          <p class="cost">{{ billHead(bill) }}</p>
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
        <!-- An API without the bill yet: the month's cost split evenly, as an estimate. -->
        <template v-else-if="house.monthlyCostFcfa && share">
          <p class="cost">{{ fcfa(house.monthlyCostFcfa) }} a month, about {{ fcfa(share) }} a room.</p>
          <ul class="plain lines">
            <ListRow
              v-for="r in lived"
              :key="r.name"
              :title="viewer?.room === r.name ? `Your share is about ${fcfa(share)}.` : `${nameOf(r.occupant!).split(' ')[0]}'s share is about ${fcfa(share)}.`"
              :mine="viewer?.room === r.name"
            >
              <template #lead><Avatar :person="r.occupant!" :size="40" decorative /></template>
            </ListRow>
          </ul>
        </template>
        <p v-else class="muted none">{{ chef ? "No server yet. Rent it with the button below." : "No server yet. The chef rents it." }}</p>
        <p class="sr-only" aria-live="polite">{{ paidSaid }}</p>
      </template>

      <template #foot>
        <div class="foot" data-tour="foot">
          <!-- On the Bill tab, with your share still to pay, paying it is the next step. While the pay sheet is up,
               its own button is the one to press, so the foot stays empty. -->
          <button v-if="payButton" type="button" class="primary go" @click="paying = true"><Icon name="bill" :size="20" />Pay your {{ fcfa(myDue!.due) }}</button>
          <template v-else-if="!paying || shownTab !== 'bill'">
            <RouterLink v-if="foot.kind === 'login'" to="/login" class="button primary go"><Icon name="login" :size="20" />Log in to knock</RouterLink>
            <button v-else-if="footButton" type="button" class="primary go" @click="go"><Icon :name="footButton.icon" :size="20" />{{ footButton.word }}</button>
            <p v-else-if="foot.kind === 'say'" class="say">{{ foot.text }}</p>
          </template>
        </div>
      </template>
    </Panel>

    <p v-else class="muted empty" aria-live="polite">Opening the door…</p>

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

/* The chef's two small things in the head: chunky pills with an icon, like a game's menu buttons. */
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--quiet-edge); font-size: 14px; font-weight: 600; }
.chip:hover:not(:disabled) { background: var(--tile); }
.chip[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-fill), 0 2px 0 var(--accent-fill); }
.chip:active:not(:disabled) { transform: translateY(1px); }
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
.sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub.warn { color: var(--danger); }
.given { display: inline-flex; align-items: center; gap: 3px; }
/* A face with its state's dot on the lower right, like a presence dot in a game's friend list. */
.face { position: relative; display: inline-grid; }
/* Ringed in the row's colour, so the dot reads as a badge on the face (it replaces the dot's own halo). */
.face .on-face { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; box-shadow: 0 0 0 2px var(--surface); animation: none; }
/* Buttons and links in a row carry an icon beside their word. */
.lines :deep(.end button), .lines :deep(.end a.button) { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.when { color: var(--warn); font-weight: 600; }
.when.late { color: var(--danger); }
.cost { font-size: 15px; line-height: 1.4; font-variant-numeric: tabular-nums; }

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
