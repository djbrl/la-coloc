<script setup lang="ts">
// Inside a house, built like a game screen rather than a page: a one-line header, a row of big icon buttons for
// what you can do, and one panel at a time underneath (rooms, people, channel, chores, fridge, bill). The house
// view arrives from the API and keeps arriving over its stream, exactly as on HousePage.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { HouseView, Room } from "../../types";
import ChatPanel from "../ChatPanel.vue";
import FridgeDoor from "../FridgeDoor.vue";
import KnockSteps from "../KnockSteps.vue";
import Avatar from "../Avatar.vue";
import ActionRow, { type Action } from "./house/ActionRow.vue";
import Icon from "./house/Icon.vue";
import RentServer from "./house/RentServer.vue";
import RoomTile from "./house/RoomTile.vue";
import { evenSplit, fcfa, type ServerInfo } from "./house/server";
import Tour from "./house/Tour.vue";
import type { Place } from "./place";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ open: [place: Place]; label: [text: string] }>();

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
onBeforeUnmount(() => source?.close());

// Who's looking, in one word each. Everything below branches on these.
const viewer = computed(() => house.value?.viewer ?? null);
const member = computed(() => !!viewer.value?.member);
const chef = computed(() => viewer.value?.role === "chef");
const making = computed(() => house.value?.status === "making");
const live = computed(() => !!house.value && house.value.status === "live" && house.value.agentOnline);
const keyMade = computed(() => !!house.value?.server?.keyMade);

// The status dot and its one word.
const status = computed(() => (making.value ? { dot: "making", word: "Setting up" } : live.value ? { dot: "live", word: "Live" } : { dot: "danger", word: "Offline" }));

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
const freeRoom = computed(() => house.value?.rooms.find((r) => !r.occupant) ?? null);
// Knocking needs a real house with a free room, and you logged in without living there already.
const canKnock = computed(() => !!viewer.value && !member.value && !house.value?.demo && !!freeRoom.value && !viewer.value.application);
const myChores = computed(() => house.value?.chores?.filter((c) => c.assignee.login === viewer.value?.login) ?? []);
const notes = computed(() => house.value?.notes ?? []);

// Panels, as one word each: only the ones that make sense for the viewer.
type Segment = "rooms" | "people" | "channel" | "chores" | "fridge" | "bill";
const segment = ref<Segment>("rooms");
const segments = computed((): { key: Segment; word: string; badge?: number }[] => {
  const all: { key: Segment; word: string; badge?: number }[] = [
    { key: "rooms", word: "Rooms" },
    { key: "people", word: "People", badge: house.value?.doorbell?.length || undefined },
  ];
  if (member.value) {
    all.push(
      { key: "channel", word: "Channel" },
      { key: "chores", word: "Chores", badge: myChores.value.length || undefined },
      { key: "fridge", word: "Fridge", badge: notes.value.length || undefined },
      { key: "bill", word: "Bill" },
    );
  }
  return all;
});
// A house reloaded as someone else (logging out, say) could leave a panel that isn't offered any more.
watch(segments, (list) => {
  if (!list.some((s) => s.key === segment.value)) segment.value = "rooms";
});

// The action row: what this viewer can do, in the order they should do it.
const copied = ref(false);
const rulesSoon = ref(false);
const actions = computed((): Action[] => {
  const h = house.value;
  if (!h) return [];
  if (!viewer.value) return [{ key: "login", icon: "login", word: "Log in", to: "/login", primary: true }];
  if (!member.value) {
    const list: Action[] = [];
    if (viewer.value.application) list.push({ key: "thread", icon: "thread", word: "Your knock", primary: true });
    else if (canKnock.value) list.push({ key: "knock", icon: "knock", word: "Knock", primary: true });
    list.push({ key: "people", icon: "people", word: "People" });
    return list;
  }
  if (chef.value && making.value) {
    return [
      { key: "rent", icon: keyMade.value ? "key" : "server", word: keyMade.value ? "Waiting" : "Rent", primary: true },
      { key: "invite", icon: copied.value ? "tick" : "link", word: copied.value ? "Copied" : "Invite" },
      { key: "rules", icon: "rules", word: rulesSoon.value ? "Soon" : h.rules.strictReviews ? "Strict" : "Relaxed", pressed: h.rules.strictReviews },
    ];
  }
  const list: Action[] = [];
  if (viewer.value.room && !making.value) list.push({ key: "room", icon: "door", word: "My room", primary: true });
  list.push(
    { key: "chores", icon: "check", word: "Chores", badge: myChores.value.length, alert: myChores.value.some((c) => c.late) },
    { key: "channel", icon: "chat", word: "Channel" },
    { key: "fridge", icon: "fridge", word: "Fridge", badge: notes.value.length },
    { key: "bill", icon: "bill", word: "Bill" },
  );
  return list;
});

const renting = ref(false);
const knocking = ref<Room | null>(null);

function act(key: string) {
  const h = house.value;
  if (!h || !viewer.value) return;
  switch (key) {
    case "rent":
      renting.value = true;
      break;
    case "invite":
      copyLink();
      break;
    case "rules":
      // There's no endpoint to switch the rule yet; the tile shows the state and says so for a moment.
      rulesSoon.value = true;
      setTimeout(() => (rulesSoon.value = false), 1500);
      break;
    case "room":
      if (viewer.value.room) emit("open", { kind: "room", houseId: h.id, room: viewer.value.room });
      break;
    case "knock":
      knocking.value = freeRoom.value;
      break;
    case "thread":
      if (viewer.value.application) emit("open", { kind: "application", id: viewer.value.application });
      break;
    case "people":
    case "chores":
    case "channel":
    case "fridge":
    case "bill":
      segment.value = key;
      break;
  }
}

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

// What one room tile offers this viewer.
function tileAction(room: Room): "open" | "knock" | null {
  if (room.occupant) return viewer.value?.room === room.name && !making.value ? "open" : null;
  return canKnock.value ? "knock" : null;
}

// Chores: how long until a review is due, in a word or two.
const due = (iso: string) => {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  return hours < 1 ? "due now" : hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};

// The bill: the month's cost shared between the rooms that are lived in.
const occupants = computed(() => house.value?.rooms.filter((r) => r.occupant).map((r) => r.occupant!) ?? []);
const share = computed(() => (house.value?.monthlyCostFcfa ? evenSplit(house.value.monthlyCostFcfa, occupants.value.length) : null));

const tourLast = computed(() => (chef.value && making.value ? "chef" : member.value ? "flatmate" : "visitor"));
</script>

<template>
  <div class="inside-house">
    <div v-if="error" class="empty">
      <h2>{{ error }}</h2>
      <p class="muted">Maybe it moved, or the link is off by a letter.</p>
    </div>

    <template v-else-if="house">
      <!-- One line: the name, the state, the city. -->
      <header class="head">
        <h2>{{ house.name }}</h2>
        <p class="line">
          <span class="dot" :class="status.dot" aria-hidden="true" />{{ status.word }}
          <span class="muted"> · {{ house.city }}</span>
        </p>
      </header>

      <!-- The chef of a house still being made has one next step; this bar is it. -->
      <button v-if="chef && making" type="button" class="next" @click="renting = true">
        <Icon :name="keyMade ? 'key' : 'server'" :size="18" />
        <span>{{ keyMade ? "Key made. Waiting for the server" : "Next: rent the server" }}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>

      <ActionRow :actions="actions" @act="act" />

      <!-- One panel at a time. -->
      <div class="segments" role="tablist" aria-label="Parts of the house">
        <button
          v-for="s in segments"
          :id="`seg-${s.key}`"
          :key="s.key"
          type="button"
          role="tab"
          class="seg"
          :aria-selected="segment === s.key"
          :aria-controls="`panel-${s.key}`"
          :tabindex="segment === s.key ? 0 : -1"
          @click="segment = s.key"
        >
          {{ s.word }}<span v-if="s.badge" class="count" aria-hidden="true">{{ s.badge }}</span>
          <span v-if="s.badge" class="sr-only">, {{ s.badge }}</span>
        </button>
      </div>

      <div :id="`panel-${segment}`" class="panel" role="tabpanel" :aria-labelledby="`seg-${segment}`">
        <div v-if="segment === 'rooms'" class="rooms">
          <RoomTile
            v-for="room in house.rooms"
            :key="room.name"
            :room="room"
            :house-status="house.status"
            :mine="viewer?.room === room.name"
            :chef="!!room.occupant && room.occupant.login === house.chef?.login"
            :action="tileAction(room)"
            @open="emit('open', { kind: 'room', houseId: house.id, room: room.name })"
            @knock="knocking = room"
          />
        </div>

        <template v-else-if="segment === 'people'">
          <!-- Knocks waiting for an answer come first: they're what flatmates should act on. -->
          <ul v-if="member && house.doorbell?.length" class="rows">
            <li v-for="d in house.doorbell" :key="d.id">
              <Avatar :person="d.applicant" :size="36" decorative />
              <span class="grow">
                <strong>{{ nameOf(d.applicant) }}</strong>
                <span class="muted small line"><Icon name="knock" :size="14" /> {{ d.room }} · {{ d.tally.yes }}/{{ d.tally.needed }}</span>
              </span>
              <button type="button" class="link end" :aria-label="`Answer ${nameOf(d.applicant)}`" @click="emit('open', { kind: 'application', id: d.id })">
                Answer <span aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
          <ul class="rows">
            <li v-for="m in house.members" :key="m.login">
              <Avatar :person="m" :size="36" decorative />
              <span class="grow">
                <strong>{{ nameOf(m) }}</strong>
                <span class="muted small line">{{ m.role === "chef" ? "Chef" : "Flatmate" }}</span>
              </span>
              <span class="nums end">
                <span class="num" :aria-label="`${house.ledger.find((l) => l.login === m.login)?.given ?? 0} reviews given`">
                  <Icon name="check" :size="16" />{{ house.ledger.find((l) => l.login === m.login)?.given ?? 0 }}
                </span>
                <span class="num" :aria-label="`${house.ledger.find((l) => l.login === m.login)?.received ?? 0} reviews received`">
                  <Icon name="window" :size="16" />{{ house.ledger.find((l) => l.login === m.login)?.received ?? 0 }}
                </span>
              </span>
            </li>
          </ul>
          <p v-if="!house.members.length" class="muted">Nobody lives here yet.</p>
        </template>

        <ChatPanel v-else-if="segment === 'channel' && viewer" :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="viewer.login" />

        <template v-else-if="segment === 'chores'">
          <p v-if="!house.chores?.length" class="muted">No reviews waiting.</p>
          <ul v-else class="rows">
            <li v-for="c in house.chores" :key="c.id">
              <Avatar :person="c.assignee" :size="32" decorative />
              <span class="grow">
                <strong class="one">{{ c.prTitle }}</strong>
                <span class="muted small line">{{ c.repo }}#{{ c.prNumber }}</span>
              </span>
              <span class="when small" :class="c.late ? 'late' : ''">{{ c.late ? "late" : due(c.dueAt) }}</span>
              <a :href="c.prUrl" target="_blank" rel="noopener" class="more" :aria-label="`Review ${c.repo}#${c.prNumber} on GitHub`">
                Review <span aria-hidden="true">›</span>
              </a>
            </li>
          </ul>
        </template>

        <FridgeDoor v-else-if="segment === 'fridge'" :notes="notes" />

        <template v-else-if="segment === 'bill'">
          <template v-if="house.monthlyCostFcfa && share">
            <p class="cost"><strong>{{ fcfa(house.monthlyCostFcfa) }}</strong> <span class="muted">a month</span></p>
            <ul class="rows">
              <li v-for="p in occupants" :key="p.login">
                <Avatar :person="p" :size="36" decorative />
                <span class="grow"><strong>{{ nameOf(p) }}</strong></span>
                <span class="end amount">{{ fcfa(share) }}</span>
              </li>
            </ul>
          </template>
          <template v-else>
            <p class="muted">No server yet.</p>
            <button v-if="chef" type="button" class="primary" @click="renting = true">Rent the server</button>
          </template>
        </template>
      </div>

      <Tour :last="tourLast" />

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

    <p v-else class="muted empty" aria-live="polite">Opening the door…</p>
  </div>
</template>

<style scoped>
.inside-house { display: grid; gap: 20px; padding: 8px var(--gutter) 24px; }
.empty { padding: 24px 0; display: grid; gap: 8px; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; }
.head h2 { font-size: 28px; }
.line { font-size: 15px; }
/* The one next step, as a thin accent bar the whole width. */
.next {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  background: var(--accent-fill);
  color: var(--on-accent);
  font-size: 15px;
  text-align: left;
}
.next:hover:not(:disabled) { background: var(--accent-fill-hover); }
.next span:first-of-type { flex: 1; }
.chev { font-size: 20px; }
/* iOS-style segments: a grey bar, the chosen one lifted out in the surface colour. */
.segments {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--fill);
  overflow-x: auto;
  scrollbar-width: none;
}
.segments::-webkit-scrollbar { display: none; }
.seg {
  flex: 1 0 auto;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  background: none;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.seg:hover:not(:disabled) { background: none; color: var(--text); }
.seg[aria-selected="true"] { background: var(--surface); color: var(--text); font-weight: 600; }
.count { margin-left: 6px; padding: 0 6px; border-radius: 8px; background: var(--accent-fill); color: var(--on-accent); font-size: 11px; line-height: 16px; }
.panel { min-height: 160px; display: grid; gap: 16px; align-content: start; }
.rooms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.grow { flex: 1 1 160px; min-width: 0; display: grid; }
.one, .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; align-items: center; gap: 4px; }
.nums { display: flex; gap: 14px; }
.num { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }
.when { color: var(--warn); font-variant-numeric: tabular-nums; }
.when.late { color: var(--danger); font-weight: 600; }
.cost { font-size: 24px; }
.amount { font-variant-numeric: tabular-nums; }
@media (max-width: 480px) {
  .rooms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .head h2 { font-size: 24px; }
}
</style>
