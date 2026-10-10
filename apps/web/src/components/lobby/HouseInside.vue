<script setup lang="ts">
// Inside a house, built like a game's pause menu rather than a page, on the lobby's Panel: the house's name and
// state, its people as a line-up of faces, the tabs (flatmates only), one tab's body, and the one next step in the
// foot. Everything fits the sheet without scrolling; only the body scrolls, inside itself, when a list or the chat
// is longer than the space. The house view arrives from the API and keeps arriving over its stream, as on HousePage.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { postJSON } from "../../session";
import type { HouseView, Room } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import { crewOf, footFor, rowAction, type Seat, type Situation } from "./house/crew";
import Crew from "./house/Crew.vue";
import Icon from "./house/Icon.vue";
import RentServer from "./house/RentServer.vue";
import Rundown from "./house/Rundown.vue";
import { evenSplit, fcfa, type ServerInfo } from "./house/server";
import { markTourSeen, toursSeen } from "./house/tours";
import ListRow from "./panel/ListRow.vue";
import Panel from "./panel/Panel.vue";
import PanelHead from "./panel/PanelHead.vue";
import PanelTabs, { type Tab } from "./panel/PanelTabs.vue";
import StatusPill from "./panel/StatusPill.vue";
import { explain, houseState, roomState } from "./panel/words";
import type { Place } from "./place";

const props = defineProps<{
  id: string;
  // The tutorial asks for the window's rundown (Rundown.vue). It also stands in for the first-time tour.
  rundown?: boolean;
}>();
const emit = defineEmits<{ open: [place: Place]; label: [text: string]; rundownDone: [] }>();

// The chef's server info is new on the API side; reading it through this type works whether or not the shared
// HouseView type has caught up.
type View = HouseView & { server?: ServerInfo | null };

const house = ref<View | null>(null);
const error = ref("");
let source: EventSource | null = null;

async function load(id: string) {
  source?.close();
  house.value = null;
  error.value = "";
  const res = await fetch(`/api/houses/${encodeURIComponent(id)}`).catch(() => null);
  if (!res?.ok) {
    error.value = res?.status === 404 ? "This house doesn't exist." : "Couldn't reach the API.";
    return;
  }
  house.value = await res.json();
  // The API pushes the whole house view whenever something changes.
  source = new EventSource(`/api/houses/${encodeURIComponent(id)}/stream`);
  source.addEventListener("house", (e) => (house.value = JSON.parse((e as MessageEvent).data)));
}

watch(() => props.id, load, { immediate: true });
watch(
  () => house.value?.name,
  (name) => name && emit("label", `Inside ${name}`),
);
onBeforeUnmount(() => {
  source?.close();
  clearTimeout(litTimer);
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

// The head's one line: the city, and the tagline when it's short enough to share the line with the pill.
const line = computed(() => {
  const h = house.value;
  if (!h) return "";
  return h.tagline && h.tagline.length <= 40 ? `${h.city} · ${h.tagline}` : h.city;
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

// The chef of a house being made can invite people and see the review rule from the head.
const copied = ref(false);
const rulesSoon = ref(false);
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
function rules() {
  // There's no endpoint to switch the rule yet; the button shows the state and says so for a moment.
  rulesSoon.value = true;
  setTimeout(() => (rulesSoon.value = false), 1500);
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

// A room's row: who and what (the person and their project), what the project is, and its one button.
const ledger = (login: string) => house.value?.ledger.find((l) => l.login === login) ?? { given: 0, received: 0 };
function rowTitle(room: Room): string {
  if (!room.occupant) return `Free room · ${room.name}`;
  return room.project ? `${nameOf(room.occupant)} · ${room.project}` : nameOf(room.occupant);
}
function rowSub(room: Room): string {
  if (!room.occupant) return room.ad ?? "Free room. Knock to ask for it.";
  return room.projectDescription ?? (room.project ? "No description yet." : "No project yet.");
}
const actionOf = (room: Room) => rowAction(room, situation.value, foot.value);

// Chores: how long until a review is due, in a word or two.
const due = (iso: string) => {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  return hours < 1 ? "due now" : hours < 24 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
};

// The bill: the month's cost shared between the rooms that are lived in.
const lived = computed(() => house.value?.rooms.filter((r) => r.occupant) ?? []);
const share = computed(() => (house.value?.monthlyCostFcfa ? evenSplit(house.value.monthlyCostFcfa, lived.value.length) : null));

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

// The rundown: asked for by the tutorial (once, when it reaches its step), or shown on a first visit to any house.
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
    if (loaded && !rundownOn.value && !tutorialAsked && !toursSeen().includes("house")) startRundown();
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
              <template v-if="chef && making" #aside>
                <button type="button" class="chip" :aria-label="copied ? 'Invite link copied' : 'Copy an invite link'" @click="copyLink">
                  <Icon :name="copied ? 'tick' : 'link'" :size="16" /><span class="chip-word">{{ copied ? "Copied" : "Invite" }}</span>
                </button>
                <button
                  type="button"
                  class="chip"
                  :aria-pressed="house.rules.strictReviews"
                  :aria-label="`Review rule: ${house.rules.strictReviews ? 'strict' : 'relaxed'}`"
                  @click="rules"
                >
                  <Icon name="rules" :size="16" /><span class="chip-word">{{ rulesSoon ? "Soon" : house.rules.strictReviews ? "Strict" : "Relaxed" }}</span>
                </button>
              </template>
            </PanelHead>
          </div>
          <Crew data-tour="crew" :seats="seats" @pick="pick" />
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
            <Avatar v-if="room.occupant" :person="room.occupant" :size="40" decorative />
            <span v-else class="door"><Icon name="door" :size="20" /></span>
          </template>
          <template #meta>
            <StatusPill :state="roomState(room, house.status)" />
            <span :aria-label="`${room.limits.memoryMb} MB of memory`">{{ room.limits.memoryMb }} MB</span>
            <!-- Reviews given, only once there are some: a row of zeros says nothing. -->
            <span
              v-if="room.occupant && ledger(room.occupant.login).given > 0"
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
        <template v-if="house.monthlyCostFcfa && share">
          <p class="cost">
            <strong>{{ fcfa(house.monthlyCostFcfa) }}</strong>
            <span class="muted"> a month, about {{ fcfa(share) }} a room</span>
          </p>
          <ul class="plain lines">
            <ListRow
              v-for="r in lived"
              :key="r.name"
              :title="nameOf(r.occupant!)"
              :sub="r.project ? `${r.project} · room ${r.name}` : `Room ${r.name}`"
              :mine="viewer?.room === r.name"
            >
              <template #lead><Avatar :person="r.occupant!" :size="40" decorative /></template>
              <template #meta><span class="amount">{{ fcfa(share) }}</span></template>
            </ListRow>
          </ul>
        </template>
        <p v-else class="muted none">{{ chef ? "No server yet. Rent it with the button below." : "No server yet. The chef rents it." }}</p>
      </template>

      <template #foot>
        <div class="foot" data-tour="foot">
          <RouterLink v-if="foot.kind === 'login'" to="/login" class="button primary go"><Icon name="login" :size="20" />Log in to knock</RouterLink>
          <button v-else-if="footButton" type="button" class="primary go" @click="go"><Icon :name="footButton.icon" :size="20" />{{ footButton.word }}</button>
          <p v-else-if="foot.kind === 'say'" class="say">{{ foot.text }}</p>
        </div>
      </template>
    </Panel>

    <p v-else class="muted empty" aria-live="polite">Opening the door…</p>

    <template v-if="house">
      <!-- The parts it points at carry data-tour="header | crew | tabs | rooms | foot". -->
      <Rundown v-if="rundownOn" :name="house.name" :next="tourLast" @done="rundownEnded" />
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
.inside-house > :deep(.panel-shape) { flex: 1 1 auto; }
.empty { padding: 24px var(--gutter); display: grid; gap: 8px; }
.head { display: grid; gap: 8px; min-width: 0; }

/* The chef's two small things in the head: chunky pills with an icon, like a game's menu buttons. */
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; font-size: 14px; font-weight: 600; }
.chip[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }

.plain { list-style: none; margin: 0; padding: 0; }
/* A tighter line height than the page's, so a row stays at the row's 60px and six of them fit with the head. */
.lines { display: grid; gap: 4px; align-content: start; line-height: 1.3; }
.none { padding: 8px 0; }
/* A free room's door, in an outlined circle where a face would be. */
.door { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--border); color: var(--accent); }
.sub { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub.warn { color: var(--danger); }
.given { display: inline-flex; align-items: center; gap: 3px; }
/* Buttons and links in a row carry an icon beside their word. */
.lines :deep(.end button), .lines :deep(.end a.button) { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.when { color: var(--warn); font-weight: 600; }
.when.late { color: var(--danger); }
.cost { font-size: 15px; }
.cost strong { font-size: 22px; }
.amount { color: var(--text); font-weight: 600; }

/* The channel fills the body, so the chat can keep its box and scroll its messages inside it. */
.chat-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.chat-host > :deep(*) { flex: 1 1 auto; min-height: 0; }

/* The foot: one big button across the width, or the one line that says why there's none. */
.foot { flex: 1 1 auto; display: flex; align-items: center; min-width: 0; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; font-size: 17px; font-weight: 700; }
a.go:hover { text-decoration: none; }
.say { min-height: 48px; display: flex; align-items: center; font-size: 14px; color: var(--muted); }
@media (max-width: 480px) {
  .chip { padding: 0 10px; }
  .chip-word { display: none; }
}
</style>
