<script setup lang="ts">
// Your room: the project in it, where its code comes from, its secrets, its logs and its history. It's a Panel
// (see components/lobby/panel), so in the lobby's sheet it fits the sheet's height and never scrolls the sheet:
// each part is made to fit, the long ones (logs, a long history) scroll inside themselves, and anything with more
// than a field or two to fill in is a short step flow. On a page of its own the panel just grows.
// Carte blanche: one window, its parts in one row of tabs (no tiles opening sub-pages), and the room's two actions,
// Restart and Update, always at the foot, whatever tab is open (Jib, 6 Nov). The foot steps aside only while a tab
// runs a flow with its own main button (naming the project, choosing the code, adding a secret, ending the lease).
// The parts live in components/room; this page holds the room's data and talks to the API.
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/lobby/house/Icon.vue";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import PanelTabs, { type Tab as PanelTab } from "../components/lobby/panel/PanelTabs.vue";
import { bare, explain, roomLine, roomState } from "../components/lobby/panel/words";
import BuildLog from "../components/room/BuildLog.vue";
import { TUTORIAL_HOUSE } from "../components/lobby/tutorial/tutorial";
import RoomCode from "../components/room/RoomCode.vue";
import RoomFold from "../components/room/RoomFold.vue";
import RoomHistory from "../components/room/RoomHistory.vue";
import RoomInterior from "../components/room/RoomInterior.vue";
import RoomLease from "../components/room/RoomLease.vue";
import RoomSsh from "../components/room/RoomSsh.vue";
import RoomLogs from "../components/room/RoomLogs.vue";
import RoomOverview from "../components/room/RoomOverview.vue";
import RoomSecrets from "../components/room/RoomSecrets.vue";
import { buildFailed, canRestart, parsePort, projectTitle, refWord, type SettingsForm, settingsBody, updateTile } from "../components/room/room";
import "../components/room/room.css";
import { roomWords as w } from "../components/room/words";
import UiNote, { loud, quiet, type Note } from "../components/UiNote.vue";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { locale } from "../i18n";
import { me, sendJSON } from "../session";
import { openStream, type Stream } from "../stream";
import type { RoomInside, RoomInsideTrouble, RoomManage } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its link
// back to the house, and tells the sheet what to call it (`label`).
// `coached`: the tutorial's coach is up over this room, with its own "Put it online"; the foot's main button then
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

// The build's own window (BuildLog.vue): it opens on a build just started, or from the foot and the Overview.
const logOpen = ref(false);
async function run(what: "redeploy" | "restart") {
  actionNote.value = null;
  action.value = what;
  const res = await sendJSON("POST", `${base.value}/${what}`, {});
  action.value = "";
  if (res.ok && what === "redeploy") logOpen.value = true;
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

// Which tab is open. The history is folded under the logs, so it has no tab of its own.
type TabKey = "overview" | "code" | "logs" | "inside" | "secrets" | "ssh" | "lease";
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
// The tabs this room has: Inside where it can be looked into, SSH and Lease for whoever lives in it. On a phone each
// is its icon (PanelTabs). With all seven, the first takes its short word, so no tab's word is cut.
const tabs = computed<PanelTab[]>(() => {
  const d = data.value;
  if (!d) return [];
  const rest: PanelTab[] = [
    { key: "code", icon: "code", word: w.tabs.code },
    { key: "logs", icon: "logs", word: w.tabs.logs },
    ...(d.inside ? [{ key: "inside", icon: "folder", word: w.tabs.inside } as PanelTab] : []),
    { key: "secrets", icon: "lock", word: w.tabs.secrets },
    ...(d.ssh ? [{ key: "ssh", icon: "key", word: w.tabs.ssh } as PanelTab] : []),
    ...(d.lease ? [{ key: "lease", icon: "door", word: w.tabs.lease } as PanelTab] : []),
  ];
  return [{ key: "overview", icon: "gauge", word: rest.length > 4 ? w.tabs.overviewShort : w.tabs.overview }, ...rest];
});
// A tab that isn't offered (any more: the lease just ended, say) shows the Overview.
const shown = computed((): TabKey => (tabs.value.some((t) => t.key === tab.value) ? tab.value : "overview"));
watch(shown, (now) => {
  if (data.value && tab.value !== now) tab.value = now;
});
// A "Saved." from one tab shouldn't greet you on the next, and a flow left behind doesn't hide the next tab's foot.
const flow = ref(false);
watch(tab, () => {
  formNote.value = null;
  flow.value = false;
});

// Sent to another tab by a button in this one (Upload a project, Fix the setup): the pressed button goes with the tab,
// so the focus lands on the tab it went to, once that has arrived.
const panel = ref<{ $el: HTMLElement } | null>(null);
let focusNext: TabKey | null = null;
function goTo(to: TabKey) {
  if (shown.value === to) return;
  focusNext = to;
  tab.value = to;
}
function toCode() {
  fixing.value = true;
  goTo("code");
}
function arrived() {
  if (focusNext) panel.value?.$el.querySelector<HTMLElement>(`#tab-${focusNext}`)?.focus({ preventScroll: true });
  focusNext = null;
}

// The log's last lines stay fresh while the Overview shows a room that's online.
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

// The foot: Restart once there's something to restart, and the one thing to do next: upload a project, watch the
// build under way, try a failed build again, put it online the first time, or update it. Nothing while the house's
// server isn't connected (the tab says so).
const serverUp = computed(() => !!data.value?.house.agentOnline);
const noCode = computed(() => !!data.value && !data.value.settings.source && !data.value.github);
const lastBuild = computed(() => data.value?.deployments.find((d) => d.kind === "prod"));
const buildBroke = computed(() => buildFailed(lastBuild.value));
const building = computed(() => ["queued", "cloning", "building", "starting"].includes(lastBuild.value?.status ?? ""));
const tile = computed(() => (data.value ? updateTile(data.value.room.status, data.value.deployments) : null));
// Update builds from a branch: said to a screen reader after the verb ("Update from main"), and on hover.
const from = computed(() => (tile.value?.verb === w.update && !noCode.value ? w.fromBranch(refWord(data.value?.settings.branch ?? "default")) : null));
const restartable = computed(() => !!data.value && canRestart(data.value.room.status, data.value.deployments));
const footShown = computed(() => !!data.value && serverUp.value && !flow.value);
// The history's row says the newest build: its branch and when.
const newest = computed(() => data.value?.deployments[0] ?? null);

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
      :explain="shown === 'secrets' ? explain.secrets : null"
      :body-id="`tabpanel-${shown}`"
      :body-labelledby="`tab-${shown}`"
    >
      <template #head>
        <PanelHead :title="title" :state="state" :line="liveAt ? null : headLine">
          <!-- The icon's tile: a room is a box the project lives in. -->
          <template #lead><Icon name="box" :size="22" /></template>
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
        <p class="sr-only" aria-live="polite">{{ w.stateSr(state.word) }}</p>
      </template>

      <template #tabs>
        <PanelTabs v-model="tab" :tabs="tabs" :label="w.sections" />
      </template>

      <Transition name="fade" mode="out-in" @after-enter="arrived">
        <div :key="shown" class="tab-body" :class="{ fill: shown === 'logs' }">
          <RoomOverview
            v-if="shown === 'overview'"
            :data="data"
            :form="form"
            :saving="savingSettings"
            :form-note="formNote"
            :save="saveSettings"
            :reset="fillForm"
            :logs="logs"
            :logs-message="logsMessage"
            :inside="inside"
            @log="logOpen = true"
            @tab="toCode"
            @flow="(on) => (flow = on)"
          />
          <RoomCode
            v-else-if="shown === 'code'"
            :data="data"
            :base="base"
            :fixing="fixing"
            @run="(what) => { fixing = false; tab = 'overview'; run(what); }"
            @fixed="fixing = false"
            @flow="(on) => (flow = on)"
            :form="form"
            :reset="fillForm"
            :reload="load"
          />
          <RoomSecrets v-else-if="shown === 'secrets'" :data="data" :base="base" :reload="load" :when="when" @flow="(on) => (flow = on)" />
          <template v-else-if="shown === 'logs'">
            <RoomLogs v-model:follow="follow" :text="logs" :message="logsMessage" :loading="logsLoading" @refresh="fetchLogs" />
            <!-- Every build, newest first, folded under the logs: its row says the newest one. -->
            <RoomFold class="history" :title="w.tabs.history" :meta="newest ? `${refWord(newest.ref)} · ${when(newest.createdAt)}` : null">
              <RoomHistory :deployments="data.deployments" :github="data.github" :when="when" />
            </RoomFold>
          </template>
          <RoomInterior
            v-else-if="shown === 'inside'"
            :inside="inside"
            :trouble="insideTrouble"
            :looked="insideLooked"
            :deploying="data.room.status === 'deploying'"
            :busy="addressBusy"
            :note="addressNote"
            @put-online="putOnline"
          />
          <RoomSsh v-else-if="shown === 'ssh' && data.ssh" :data="data" />
          <RoomLease v-else-if="shown === 'lease' && data.lease" :lease="data.lease" :base="base" @left="leftRoom" @flow="(on) => (flow = on)" />
        </div>
      </Transition>
      <!-- What Restart or Update answered, when it's a refusal or a restart: the build itself shows in its window. -->
      <div class="action-note"><UiNote :note="actionNote" /></div>

      <template v-if="footShown" #foot>
        <button v-if="restartable" type="button" class="second restart" :disabled="action !== ''" :title="explain.restart" @click="run('restart')">
          {{ action === "restart" ? w.restarting : w.restart }}
        </button>
        <button v-if="noCode" type="button" class="primary go" :class="{ quiet: coached }" @click="toCode">{{ w.uploadProject }}</button>
        <button v-else-if="building" type="button" class="primary go" :class="{ quiet: coached }" @click="logOpen = true">{{ w.watchBuild }}</button>
        <button v-else-if="tile" type="button" class="primary go" :class="{ quiet: coached }" :disabled="action !== ''" :title="from ? `${tile.hint} (${from})` : tile.hint" @click="run('redeploy')">
          <span class="go-word">{{ action === "redeploy" ? w.starting : buildBroke ? w.buildAgain : tile.verb }}</span>
          <span v-if="from && action !== 'redeploy' && !buildBroke" class="sr-only"> {{ from }}</span>
        </button>
      </template>
    </Panel>

    <!-- Not yours, not there, or still loading: one short message in the middle of the panel. -->
    <Panel v-else class="room-panel">
      <Waiting v-if="waiting" @retry="open" />
      <Waiting v-else-if="failed" :title="w.loadFailed" :line="w.loadFailedWhy" @retry="open" />
      <div v-else class="message" :aria-live="error ? undefined : 'polite'">
        <span class="icon"><Icon :name="error ? (status === 401 ? 'login' : 'door') : 'key'" :size="22" /></span>
        <p class="said">{{ error || w.unlocking }}</p>
        <div v-if="error && (status === 401 || !embedded)" class="go-on">
          <RouterLink v-if="status === 401" to="/login" class="chunk primary"><Icon name="login" :size="16" /> {{ w.logIn }}</RouterLink>
          <RouterLink v-if="!embedded" :to="`/houses/${id}`" class="chunk"><Icon name="house" :size="16" /> {{ w.backToHouse }}</RouterLink>
        </div>
      </div>
    </Panel>

    <BuildLog
      v-if="logOpen && data"
      :house-id="data.house.id"
      :room="data.room.name"
      :url="data.room.url"
      :other-word="w.fixSetup"
      :refusal="actionNote?.error ? actionNote.text : ''"
      :retrying="action === 'redeploy'"
      @close="logOpen = false"
      @retry="run('redeploy')"
      @other="logOpen = false; toCode()"
    />
  </div>
</template>

<style scoped>
/* In the lobby's sheet the page is a column the panel fills; on its own it's a centred column that grows. */
.room-page { display: flex; flex-direction: column; min-height: 0; }
.room-page:not(.embedded) { max-width: calc(680px + 2 * var(--gutter)); margin: 0 auto; padding: 24px 0 64px; }
.room-page:not(.embedded) .back { align-self: flex-start; margin: 0 var(--gutter) 4px; }
/* On its own the page has no window around it, so the panel is the white card itself. */
.room-page:not(.embedded) .room-panel { border-radius: var(--card-r); background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.room-panel { flex: 1 1 auto; }
/* The head's icon: the soft red tile, the icon in the red. */
.room-panel :deep(.panel-head .lead) { background: var(--accent-soft); color: var(--accent); }
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

/* One tab's content. It grows with what it holds (the body scrolls if that's too much), except the logs, which
   take exactly the body's height so only the log box scrolls. */
.tab-body { flex: 1 0 auto; display: flex; flex-direction: column; gap: 16px; }
.tab-body.fill { flex: 1 1 0; min-height: 0; }
.room-page:not(.embedded) .tab-body.fill { height: 60vh; flex: none; }
/* An open history keeps the log box in view: it scrolls inside its fold. */
.history :deep(.fold-body) { max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }
/* The live region stays in the page, but takes no room until it says something. */
.action-note { flex: none; }
.action-note :deep(.note-line) { min-height: 0; }

/* The foot: Restart in grey, the main key red and twice as wide. With the coach up, the main key steps back to grey. */
.restart { flex: 1 1 0; min-width: 0; }
.go { flex: 2 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; }
.go-word { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go.quiet, .go.quiet:hover:not(:disabled) { background: var(--sunken); color: var(--text); box-shadow: var(--quiet-edge); }

.message { margin: auto; display: grid; justify-items: center; gap: 14px; padding: 32px 16px; text-align: center; }
.icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--tile); color: var(--muted); }
.said { font-size: 17px; font-weight: 700; }
.go-on { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
</style>
