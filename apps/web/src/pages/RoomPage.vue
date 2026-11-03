<script setup lang="ts">
// Your room: the project in it, where its code comes from, its secrets, its logs and its history. It's a Panel
// (see components/lobby/panel), so in the lobby's sheet it fits the sheet's height and never scrolls the sheet:
// each part is made to fit, the long ones (logs, a long history) scroll inside themselves, and anything with more
// than a field or two to fill in is a short step flow. On a page of its own the panel just grows.
// It opens on a menu of tiles (RoomOverview.vue), one per part; a part opens in its place, with a key back to the menu
// (in the lobby's sheet, the sheet's own back key: see lobby/sheetStep.ts).
// The parts live in components/room; this page holds the room's data and talks to the API.
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/lobby/house/Icon.vue";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import type { IconName } from "../components/lobby/house/icons";
import PanelTabs, { type Tab as PanelTab } from "../components/lobby/panel/PanelTabs.vue";
import { bare, explain, roomLine, roomState } from "../components/lobby/panel/words";
import { TUTORIAL_HOUSE } from "../components/lobby/tutorial/tutorial";
import RoomCode from "../components/room/RoomCode.vue";
import RoomHistory from "../components/room/RoomHistory.vue";
import RoomInterior from "../components/room/RoomInterior.vue";
import RoomLease from "../components/room/RoomLease.vue";
import RoomSsh from "../components/room/RoomSsh.vue";
import RoomLogs from "../components/room/RoomLogs.vue";
import RoomOverview from "../components/room/RoomOverview.vue";
import RoomSecrets from "../components/room/RoomSecrets.vue";
import { parsePort, projectTitle, type SettingsForm, settingsBody } from "../components/room/room";
import "../components/room/room.css";
import { roomWords as w } from "../components/room/words";
import Avatar from "../components/Avatar.vue";
import { canRemove, firstName, teamNames } from "../components/lobby/team";
import { sheetStep } from "../components/lobby/sheetStep";
import UiNote, { loud, quiet, type Note } from "../components/UiNote.vue";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { locale } from "../i18n";
import { leaveTeam } from "../notices";
import { me, sendJSON } from "../session";
import { openStream, type Stream } from "../stream";
import type { RoomInside, RoomInsideTrouble, RoomManage } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its link
// back to the house, and tells the sheet what to call it (`label`).
// `coached`: the tutorial's coach is up over this room, with its own "Put it online"; the Overview's tile then
// steps back. Left out, it's worked out: your room in the workshop while your tutorial isn't done.
// Vue turns a missing boolean prop into false; the explicit undefined default keeps "not said" apart from "no".
const props = withDefaults(defineProps<{ id: string; room: string; embedded?: boolean; coached?: boolean }>(), { coached: undefined });
// `left`: you ended your lease here, and the lobby's sheet goes back to the house.
const emit = defineEmits<{ label: [text: string]; left: [houseId: string] }>();
const router = useRouter();
const data = ref<RoomManage | null>(null);
// Why there's no room to show, kept as which sentence it is so it follows a language change.
const errorKind = ref<"" | "needLogin" | "notYours" | "missing">("");
const error = computed(() => (errorKind.value ? w[errorKind.value] : ""));
const status = ref(0);
const base = computed(() => `/api/houses/${encodeURIComponent(props.id)}/rooms/${encodeURIComponent(props.room)}`);

const form = reactive<SettingsForm>({ project: "", projectDescription: "", source: "", branch: "", buildPath: ".", port: "" });
const formNote = ref<Note | null>(null);
const savingSettings = ref(false);
const action = ref<"" | "redeploy" | "restart">("");
const actionNote = ref<Note | null>(null);
// Sent to the Code tab to sort out a failed build, or to upload a project: it opens on that flow.
const fixing = ref(false);
const logs = ref("");
const logsMessage = ref("");
const logsLoading = ref(false);
const follow = ref(false);
let followTimer: number | undefined;
let tailTimer: number | undefined;
const TAIL_EVERY_MS = 10_000;
// No room to show because the core isn't answering (`waiting`: it reloads by itself when the core is back), or
// because the API answered with something unexpected (`failed`: a button to try again).
const waiting = ref(false);
const failed = ref(false);
let source: Stream | null = null;
let reloadTimer: number | undefined;
// What's inside the room: asked again and again only while someone is looking at it, since it runs a script in there.
const inside = ref<RoomInside | null>(null);
const insideTrouble = ref<RoomInsideTrouble | null>(null);
const insideLooked = ref(false);
const addressBusy = ref(false);
const addressNote = ref<Note | null>(null);
let lookTimer: number | undefined;
const LOOK_EVERY_MS = 10_000;

async function load() {
  const res = await fetch(`${base.value}/manage`).catch(() => null);
  if (!res?.ok) {
    // A refresh that fails keeps the room that's showing.
    if (data.value) return;
    status.value = res?.status ?? 0;
    if (res?.status === 401) errorKind.value = "needLogin";
    else if (res?.status === 403) errorKind.value = "notYours";
    else if (res?.status === 404) errorKind.value = "missing";
    else if (await wentDown(res)) waiting.value = true;
    else failed.value = true;
    return;
  }
  waiting.value = failed.value = false;
  const first = !data.value;
  data.value = await res.json();
  if (first) fillForm();
}

// The form is filled once, on the first load: the live stream reloads the room often, and that mustn't wipe what
// someone is typing. A Cancel in an edit flow fills it again from what's saved.
function fillForm() {
  const s = data.value!.settings;
  Object.assign(form, {
    project: s.project ?? "",
    projectDescription: s.projectDescription ?? "",
    source: s.source ?? "",
    branch: s.branch ?? "",
    buildPath: s.buildPath,
    port: s.port ? String(s.port) : "",
  });
}

async function open() {
  source?.close();
  source = null;
  data.value = null;
  inside.value = null;
  insideTrouble.value = null;
  insideLooked.value = false;
  errorKind.value = "";
  waiting.value = failed.value = false;
  await load();
  if (!data.value) return;
  fetchLogs();
  // The house's live stream says when anything changes (a build step, a crash): refresh, gently. If it dies it finds
  // its own way back (stream.ts).
  source = openStream(`/api/houses/${encodeURIComponent(props.id)}/stream`, {
    house: () => {
      clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(load, 300);
    },
  });
}

watch(() => [props.id, props.room], open, { immediate: true });
// The core came back: this room again (quietly, if it's showing), and its logs.
useWhenBack(() => {
  if (!data.value) void open();
  else {
    void load();
    void fetchLogs();
  }
});
// What the sheet calls this room; a computed, so it's said again when the language changes.
const label = computed(() => {
  const d = data.value;
  if (!d?.house.name) return "";
  if (d.as === "chef") return w.chefLabel(d.room.name, d.house.name);
  // A teammate: the room is its occupant's, the project theirs together.
  if (d.as === "teammate" && d.room.occupant) return w.theirRoom(firstName(d.room.occupant));
  return w.yourRoom;
});
watch(label, (text) => {
  if (text) emit("label", text);
});
onBeforeUnmount(() => {
  source?.close();
  clearInterval(followTimer);
  clearInterval(tailTimer);
  clearInterval(lookTimer);
  clearTimeout(reloadTimer);
});

/** Saves the whole settings form (the Overview and Code flows both end here). True when it went through. */
async function saveSettings(): Promise<boolean> {
  formNote.value = null;
  const port = parsePort(form.port);
  if (!port.ok) {
    formNote.value = loud(w.portRange);
    return false;
  }
  savingSettings.value = true;
  const res = await sendJSON("PATCH", `${base.value}/settings`, settingsBody(form, !!data.value?.github, port.port));
  savingSettings.value = false;
  formNote.value = res.ok ? quiet(w.saved) : loud(res.message);
  if (res.ok) await load();
  return res.ok;
}

const showLog = ref(false);
async function run(what: "redeploy" | "restart") {
  actionNote.value = null;
  action.value = what;
  const res = await sendJSON("POST", `${base.value}/${what}`, {});
  action.value = "";
  showLog.value = res.ok && what === "redeploy";
  // A build shows itself in the log window; only a refusal or a restart needs a line here.
  actionNote.value = !res.ok ? loud(res.message) : what === "restart" ? quiet(w.restartingNote) : null;
}

async function fetchLogs() {
  logsLoading.value = true;
  logsMessage.value = "";
  const res = await fetch(`${base.value}/logs?lines=300`).catch(() => null);
  logsLoading.value = false;
  if (!res?.ok) {
    // The core being down is not "couldn't read the logs": they come back with it (and are asked for again then).
    logsMessage.value = (await wentDown(res)) ? w.logsWaiting : ((await res?.json().catch(() => null))?.message ?? w.logsFailed);
    return;
  }
  logs.value = (await res.json()).text;
}

watch(follow, (on) => {
  clearInterval(followTimer);
  if (on) followTimer = window.setInterval(fetchLogs, 4000);
});

async function look() {
  if (document.visibilityState === "hidden") return;
  const res = await fetch(`${base.value}/inside`).catch(() => null);
  insideLooked.value = true;
  // The house's server is offline, or the core is: what's showing stays, and the next look tries again.
  if (!res?.ok) {
    if (!inside.value) insideTrouble.value = "failed";
    return;
  }
  const found = (await res.json()) as { inside?: RoomInside; error?: RoomInsideTrouble };
  inside.value = found.inside ?? null;
  insideTrouble.value = found.error ?? null;
}

async function putOnline(port: number) {
  addressBusy.value = true;
  addressNote.value = null;
  const res = await sendJSON<{ inside?: RoomInside }>("PUT", `${base.value}/address`, { port });
  addressBusy.value = false;
  if (!res.ok) addressNote.value = loud(res.message);
  else if (res.data.inside) inside.value = res.data.inside;
}

// Which part of the room is open: the menu of tiles, or what a tile opened. Only the logs and the history share a tab
// row. Only the secrets need a line to say what they are.
type TabKey = "overview" | "code" | "secrets" | "logs" | "history" | "inside" | "ssh" | "lease";
const tab = ref<TabKey>("overview");
watch(
  () => [data.value?.inside, tab.value, props.id, props.room] as const,
  ([allowed, on]) => {
    clearInterval(lookTimer);
    if (!allowed || (on !== "overview" && on !== "inside")) return;
    void look();
    lookTimer = window.setInterval(look, LOOK_EVERY_MS);
  },
  { immediate: true },
);
const logTabs = computed<PanelTab[]>(() => [
  { key: "logs", icon: "logs", word: w.tabs.logs },
  { key: "history", icon: "clock", word: w.tabs.history },
]);
const inLogs = computed(() => tab.value === "logs" || tab.value === "history");
const part = computed((): { icon: IconName; word: string } | null => {
  switch (tab.value) {
    case "code":
      return { icon: "code", word: w.tabs.code };
    case "secrets":
      return { icon: "lock", word: w.tabs.secrets };
    case "inside":
      return { icon: "folder", word: w.tabs.inside };
    case "ssh":
      return { icon: "key", word: w.tabs.ssh };
    case "lease":
      return { icon: "door", word: w.tabs.lease };
    default:
      return null;
  }
});
// A "Saved." from one part shouldn't greet you on the next.
watch(tab, () => (formNote.value = null));

// The focus follows you: to the back key when a part opens, and to its tile when you come back. Set here, and spent
// once the new part has arrived, so moving between the logs and the history keeps it on their tabs.
const backKey = ref<HTMLButtonElement | null>(null);
const panel = ref<{ $el: HTMLElement } | null>(null);
let focusNext: string | null = null;
function openPart(to: Exclude<TabKey, "overview">) {
  focusNext = "back";
  tab.value = to;
}
function backToMenu() {
  focusNext = inLogs.value ? "logs" : tab.value;
  fixing.value = false;
  tab.value = "overview";
}
// In the lobby's sheet, its band's back key is the way back to the menu: the part has no key of its own.
const sheetBack = inject(sheetStep, null);
watch(tab, (on) => {
  if (sheetBack) sheetBack.value = on === "overview" ? null : backToMenu;
});
onBeforeUnmount(() => {
  if (sheetBack?.value === backToMenu) sheetBack.value = null;
});
function arrived() {
  const back = backKey.value ?? panel.value?.$el.closest("[role=dialog]")?.querySelector<HTMLElement>(".back-btn");
  if (focusNext === "back") back?.focus({ preventScroll: true });
  else if (focusNext) panel.value?.$el.querySelector<HTMLElement>(`[data-section="${focusNext}"]`)?.focus({ preventScroll: true });
  focusNext = null;
}
// Esc steps back to the menu from a part, unless a window on top of it has its own Esc. On the menu, it's the sheet's.
// Heard on the way down, before the sheet: focus falls out of the panel when a pressed tile goes, or on a click on a
// blank spot, and Esc must still step back and not close the window. A text field elsewhere (the chat) keeps its Esc.
function onEsc(e: KeyboardEvent) {
  const t = e.target as Element | null;
  if (e.key !== "Escape" || tab.value === "overview" || t?.closest?.("dialog[open]")) return;
  if (t?.closest?.("input, textarea") && !panel.value?.$el.contains(t)) return;
  e.preventDefault();
  e.stopPropagation();
  backToMenu();
}
onMounted(() => window.addEventListener("keydown", onEsc, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onEsc, true));

// The Logs tile stays fresh while the menu shows a room that's online.
watch(
  () => tab.value === "overview" && data.value?.room.status === "live",
  (on) => {
    clearInterval(tailTimer);
    if (on)
      tailTimer = window.setInterval(() => {
        if (document.visibilityState !== "hidden") void fetchLogs();
      }, TAIL_EVERY_MS);
  },
  { immediate: true },
);

const state = computed(() => (data.value ? roomState(data.value.room) : null));
const online = computed(() => !!data.value?.room.url && data.value.room.status !== "empty");
// Up and running, the head's line is simply where it lives. Anything else, it says what's going on.
const liveAt = computed(() => (online.value && data.value?.room.status === "live" ? data.value.room.url : null));
// Whose room this is: "Your room", "Awa's room".
const whose = computed(() => {
  const who = data.value?.room.occupant;
  return !who || who.login === me.value?.login ? w.yourRoom : w.theirRoom((who.name ?? who.login).split(" ")[0]);
});
// The project hasn't got a name yet: the room stands in for it, and the line under it only gives the state.
const named = computed(() => !!data.value?.settings.project || workshop.value);
// The head's line, after the state's dot: the state in words, then whose room it is and where. "Online. Your room
// in Sacré-Cœur."
const headLine = computed(() => {
  const d = data.value;
  if (!d) return "";
  return named.value ? w.headLine(roomLine(d.room), whose.value, d.house.name) : `${roomLine(d.room)} ${d.house.name}.`;
});

// Teaming up (components/lobby/team.ts): the occupant and their teammates as faces under the head. The occupant can
// take a teammate off the team; a teammate can leave it (and then loses the room's page: it says so).
const team = computed(() => data.value?.room.team ?? []);
const teamOf = computed(() => (data.value ? { name: data.value.room.name, occupant: data.value.room.occupant, team: team.value } : null));
const teamBusy = ref(false);
const teamNote = ref<Note | null>(null);
async function offTeam(login: string) {
  const d = data.value;
  if (!d || teamBusy.value) return;
  teamBusy.value = true;
  teamNote.value = null;
  const res = await leaveTeam(d.house.id, d.room.name, login);
  teamBusy.value = false;
  if (!res.ok) {
    teamNote.value = loud(res.message);
    return;
  }
  // You left: this room isn't yours to manage any more, and the page says so. Else the team just got smaller.
  if (login === me.value?.login && d.as === "teammate") void open();
  else void load();
}

// The room isn't yours any more: back to the house, in the lobby's sheet or on its own page.
function leftRoom() {
  if (props.embedded) emit("left", props.id);
  else void router.push(`/houses/${props.id}`);
}

const workshop = computed(() => props.id === TUTORIAL_HOUSE);
const coached = computed(() => props.coached ?? (!!props.embedded && workshop.value && !!me.value && me.value.tutorialDone === false));
const title = computed(() => (!data.value ? "" : named.value ? projectTitle(data.value.settings, workshop.value) : whose.value));
const when = (iso: string) => new Date(iso).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="room-page" :class="{ embedded }">
    <RouterLink v-if="!embedded" :to="`/houses/${id}`" class="back"><span aria-hidden="true">‹</span> {{ data?.house.name ?? w.theHouse }}</RouterLink>

    <Panel
      v-if="data && state"
      ref="panel"
      class="room-panel"
      :explain="tab === 'secrets' ? explain.secrets : null"
      :body-id="`tabpanel-${tab}`"
      :body-labelledby="inLogs ? `tab-${tab}` : undefined"
      :body-label="part?.word"
    >
      <template #head>
        <PanelHead :title="title" :state="state" :line="liveAt ? null : headLine">
          <template v-if="liveAt" #line>
            <a class="lives-at" :href="liveAt" target="_blank" rel="noopener"><span class="at">{{ bare(liveAt) }}</span><Icon name="external" :size="14" /><span class="sr-only">{{ w.newTab }}</span></a>
          </template>
          <!-- Online, the address under the name is the way to the project. Not up yet, an older version still answers there: a key. -->
          <template v-if="online && !liveAt" #aside>
            <a :href="data.room.url!" target="_blank" rel="noopener" class="button open-key">
              <Icon name="external" :size="16" /> <span class="open-word">{{ w.open }}</span><span class="sr-only">{{ w.openProject }}</span>
            </a>
          </template>
        </PanelHead>
        <!-- A team on this project: the occupant's face, then each teammate's (with a × for whoever may take them
             off), and "Leave the team" for a teammate. -->
        <div v-if="team.length && data.room.occupant && teamOf" class="team" role="group" :aria-label="w.team">
          <span class="faces">
            <Avatar :person="data.room.occupant" :size="28" decorative />
            <span v-for="p in team" :key="p.login" class="mate">
              <Avatar :person="p" :size="28" decorative />
              <button
                v-if="canRemove(me?.login ?? null, teamOf, p.login) && p.login !== me?.login"
                type="button"
                class="off"
                :disabled="teamBusy"
                :aria-label="w.removeTeammate(firstName(p))"
                :title="w.removeTeammate(firstName(p))"
                @click="offTeam(p.login)"
              >
                <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
              </button>
            </span>
          </span>
          <span class="names">{{ teamNames(data.room.occupant, team) }}</span>
          <button v-if="data.as === 'teammate' && me && canRemove(me.login, teamOf, me.login)" type="button" class="chunk small" :disabled="teamBusy" @click="offTeam(me.login)">
            <Icon name="logout" :size="16" /> {{ w.leaveTeam }}
          </button>
        </div>
        <UiNote v-if="teamNote" :note="teamNote" />
        <p class="sr-only" aria-live="polite">{{ w.stateSr(state.word) }}</p>
      </template>

      <!-- In a part: the key back to the menu, and what this part is. -->
      <template v-if="tab !== 'overview'" #tabs>
        <div class="part-bar">
          <button v-if="!sheetBack" ref="backKey" type="button" class="chunk small to-menu" :aria-label="w.tile.backToRoom" :title="w.tile.backToRoom" @click="backToMenu"><Icon name="back" :size="20" /></button>
          <PanelTabs v-if="inLogs" v-model="tab" :tabs="logTabs" :label="w.sections" />
          <h3 v-else-if="part" class="part-word"><Icon :name="part.icon" :size="22" />{{ part.word }}</h3>
        </div>
      </template>

      <Transition name="fade" mode="out-in" @after-enter="arrived">
        <div :key="tab" class="tab-body" :class="{ fill: tab === 'logs' }">
          <RoomOverview
            v-if="tab === 'overview'"
            :data="data"
            :form="form"
            :saving="savingSettings"
            :form-note="formNote"
            :save="saveSettings"
            :reset="fillForm"
            :action="action"
            :action-note="actionNote"
            :when="when"
            :coached="coached"
            :show-log="showLog"
            :logs="logs"
            :logs-message="logsMessage"
            :inside="inside"
            @log-shown="showLog = false"
            @run="run"
            @tab="(to) => { fixing = true; openPart(to); }"
            @open="openPart"
          />
          <RoomCode
            v-else-if="tab === 'code'"
            :data="data"
            :base="base"
            :fixing="fixing"
            @run="(what) => { fixing = false; tab = 'overview'; run(what); }"
            @fixed="fixing = false"
            :form="form"
            :reset="fillForm"
            :reload="load"
          />
          <RoomSecrets v-else-if="tab === 'secrets'" :data="data" :base="base" :reload="load" :when="when" />
          <RoomLogs v-else-if="tab === 'logs'" v-model:follow="follow" :text="logs" :message="logsMessage" :loading="logsLoading" @refresh="fetchLogs" />
          <RoomInterior
            v-else-if="tab === 'inside' && data.inside"
            :inside="inside"
            :trouble="insideTrouble"
            :looked="insideLooked"
            :deploying="data.room.status === 'deploying'"
            :busy="addressBusy"
            :note="addressNote"
            @put-online="putOnline"
          />
          <RoomSsh v-else-if="tab === 'ssh' && data.ssh" :data="data" />
          <RoomLease v-else-if="tab === 'lease' && data.lease" :lease="data.lease" :base="base" @left="leftRoom" />
          <RoomHistory v-else :deployments="data.deployments" :github="data.github" :when="when" />
        </div>
      </Transition>
    </Panel>

    <!-- Not yours, not there, or still loading: one short message in the middle of the panel. -->
    <Panel v-else class="room-panel">
      <Waiting v-if="waiting" @retry="open" />
      <Waiting v-else-if="failed" :title="w.loadFailed" :line="w.loadFailedWhy" @retry="open" />
      <div v-else class="message" :aria-live="error ? undefined : 'polite'">
        <span class="icon"><Icon :name="error ? (status === 401 ? 'login' : 'door') : 'key'" :size="28" /></span>
        <p class="said">{{ error || w.unlocking }}</p>
        <div v-if="error && (status === 401 || !embedded)" class="go">
          <RouterLink v-if="status === 401" to="/login" class="chunk primary"><Icon name="login" :size="16" /> {{ w.logIn }}</RouterLink>
          <RouterLink v-if="!embedded" :to="`/houses/${id}`" class="chunk"><Icon name="house" :size="16" /> {{ w.backToHouse }}</RouterLink>
        </div>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
/* In the lobby's sheet the page is a column the panel fills; on its own it's a centred column that grows. */
.room-page { display: flex; flex-direction: column; min-height: 0; }
.room-page:not(.embedded) { max-width: calc(640px + 2 * var(--gutter)); margin: 0 auto; padding: 24px 0 64px; }
.room-page:not(.embedded) .back { align-self: flex-start; margin: 0 var(--gutter) 4px; }
.room-panel { flex: 1 1 auto; }
/* A room's name is a project's, often a repo's: it keeps the case it was written in. */
.room-panel :deep(.panel-head .title) { text-transform: none; }
.lives-at { min-width: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 15px; color: inherit; }
.lives-at .at { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lives-at :deep(svg) { flex: none; }
/* On a phone the name needs the width: the key keeps its icon, and its word for screen readers. */
@media (max-width: 480px) {
  .open-key { width: 46px; padding: 0; justify-content: center; }
  .open-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
.part-bar { display: flex; align-items: center; gap: 10px; min-width: 0; }
.part-bar > :not(.to-menu) { flex: 1 1 auto; min-width: 0; }
.room-panel .part-bar .to-menu { flex: none; width: 46px; padding: 0; }
.part-word { display: flex; align-items: center; gap: 10px; font: 800 19px/1.1 var(--font); text-transform: none; }

/* One part's content. It grows with what it holds (the body scrolls if that's too much), except the logs, which
   take exactly the body's height so only the log box scrolls. */
.tab-body { flex: 1 0 auto; display: flex; flex-direction: column; gap: 10px; }
.tab-body.fill { flex: 1 1 0; min-height: 0; }
.room-page:not(.embedded) .tab-body.fill { height: 60vh; flex: none; }

/* The team: overlapping faces, each teammate's with a small × on its corner for whoever may take them off. */
.team { margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.faces { display: inline-flex; align-items: center; }
.faces > * + * { margin-left: -6px; }
.faces :deep(img), .faces :deep(.avatar) { box-shadow: 0 0 0 2px var(--surface); }
.mate { position: relative; display: inline-grid; }
.off { position: absolute; top: -5px; right: -5px; width: 16px; height: 16px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 50%; background: var(--surface); color: var(--muted); box-shadow: 0 0 0 1px var(--line-strong); }
.off:hover:not(:disabled) { background: var(--sticker); color: var(--ink); }
.names { flex: 1 1 auto; min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.message { margin: auto; display: grid; justify-items: center; gap: 14px; padding: 32px 16px; text-align: center; }
.icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--r-lg); background: var(--fill); color: var(--muted); }
.said { font-size: 19px; font-weight: 600; }
.go { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
</style>
