<script setup lang="ts">
// Your room: the project in it, where its code comes from, its secrets, its logs and its history. It's a Panel
// (see components/lobby/panel), so in the lobby's sheet it fits the sheet's height and never scrolls the sheet:
// each tab is made to fit, the long ones (logs, a long history) scroll inside themselves, and anything with more
// than a field or two to fill in is a short step flow. On a page of its own the panel just grows.
// The tabs live in components/room; this page holds the room's data and talks to the API.
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import Icon from "../components/lobby/house/Icon.vue";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import PanelTabs, { type Tab as PanelTab } from "../components/lobby/panel/PanelTabs.vue";
import { bare, explain, roomLine, roomState } from "../components/lobby/panel/words";
import { TUTORIAL_HOUSE } from "../components/lobby/tutorial/tutorial";
import RoomCode from "../components/room/RoomCode.vue";
import RoomHistory from "../components/room/RoomHistory.vue";
import RoomLogs from "../components/room/RoomLogs.vue";
import RoomOverview from "../components/room/RoomOverview.vue";
import RoomSecrets from "../components/room/RoomSecrets.vue";
import { parsePort, projectTitle, type SettingsForm, settingsBody } from "../components/room/room";
import "../components/room/room.css";
import { loud, quiet, type Note } from "../components/UiNote.vue";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { me, sendJSON } from "../session";
import { openStream, type Stream } from "../stream";
import type { RoomManage } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its link
// back to the house, and tells the sheet what to call it (`label`).
// `coached`: the tutorial's coach is up over this room, with its own "Put it online"; the Overview's tile then
// steps back. Left out, it's worked out: your room in the workshop while your tutorial isn't done.
// Vue turns a missing boolean prop into false; the explicit undefined default keeps "not said" apart from "no".
const props = withDefaults(defineProps<{ id: string; room: string; embedded?: boolean; coached?: boolean }>(), { coached: undefined });
const emit = defineEmits<{ label: [text: string] }>();
const data = ref<RoomManage | null>(null);
const error = ref("");
const status = ref(0);
const base = computed(() => `/api/houses/${encodeURIComponent(props.id)}/rooms/${encodeURIComponent(props.room)}`);

const form = reactive<SettingsForm>({ project: "", projectDescription: "", source: "", branch: "", buildPath: ".", port: "" });
const formNote = ref<Note | null>(null);
const savingSettings = ref(false);
const action = ref<"" | "redeploy" | "restart">("");
const actionNote = ref<Note | null>(null);
const logs = ref("");
const logsMessage = ref("");
const logsLoading = ref(false);
const follow = ref(false);
let followTimer: number | undefined;
// No room to show because the core isn't answering (`waiting`: it reloads by itself when the core is back), or
// because the API answered with something unexpected (`failed`: a button to try again).
const waiting = ref(false);
const failed = ref(false);
let source: Stream | null = null;
let reloadTimer: number | undefined;

async function load() {
  const res = await fetch(`${base.value}/manage`).catch(() => null);
  if (!res?.ok) {
    // A refresh that fails keeps the room that's showing.
    if (data.value) return;
    status.value = res?.status ?? 0;
    if (res?.status === 401) error.value = "Log in to manage your room.";
    else if (res?.status === 403) error.value = "This isn't your room.";
    else if (res?.status === 404) error.value = "This room doesn't exist.";
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
  error.value = "";
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
watch(
  () => data.value?.house.name,
  (name) => {
    const d = data.value;
    if (!d || !name) return;
    emit("label", d.as === "chef" ? `Room ${d.room.name} in ${name}` : "Your room");
  },
);
onBeforeUnmount(() => {
  source?.close();
  clearInterval(followTimer);
  clearTimeout(reloadTimer);
});

/** Saves the whole settings form (the Overview and Code flows both end here). True when it went through. */
async function saveSettings(): Promise<boolean> {
  formNote.value = null;
  const port = parsePort(form.port);
  if (!port.ok) {
    formNote.value = loud("The port is a number between 1 and 65535.");
    return false;
  }
  savingSettings.value = true;
  const res = await sendJSON("PATCH", `${base.value}/settings`, settingsBody(form, !!data.value?.github, port.port));
  savingSettings.value = false;
  formNote.value = res.ok ? quiet("Saved. It applies from the next update.") : loud(res.message);
  if (res.ok) await load();
  return res.ok;
}

async function run(what: "redeploy" | "restart") {
  actionNote.value = null;
  action.value = what;
  const res = await sendJSON("POST", `${base.value}/${what}`, {});
  action.value = "";
  actionNote.value = res.ok ? quiet(what === "redeploy" ? "Building. Follow it in History." : "Restarting.") : loud(res.message);
}

async function fetchLogs() {
  logsLoading.value = true;
  logsMessage.value = "";
  const res = await fetch(`${base.value}/logs?lines=300`).catch(() => null);
  logsLoading.value = false;
  if (!res?.ok) {
    // The core being down is not "couldn't read the logs": they come back with it (and are asked for again then).
    logsMessage.value = (await wentDown(res)) ? "Waiting for the city. The logs come back with it." : ((await res?.json().catch(() => null))?.message ?? "Couldn't read the logs.");
    return;
  }
  logs.value = (await res.json()).text;
}

watch(follow, (on) => {
  clearInterval(followTimer);
  if (on) followTimer = window.setInterval(fetchLogs, 4000);
});

// The tabs: an icon and a word each, and the one line under them that says what the open one is for.
type TabKey = "overview" | "code" | "secrets" | "logs" | "history";
const tab = ref<TabKey>("overview");
const tabs = computed<PanelTab[]>(() => [
  { key: "overview", icon: "gauge", word: "Overview" },
  { key: "code", icon: "code", word: "Code" },
  { key: "secrets", icon: "lock", word: "Secrets", badge: data.value?.secrets.length || undefined },
  { key: "logs", icon: "logs", word: "Logs" },
  { key: "history", icon: "clock", word: "History" },
]);
const explains: Record<TabKey, string> = {
  overview: explain.project,
  code: explain.code,
  secrets: explain.secrets,
  logs: explain.logs,
  history: explain.history,
};
// A "Saved." from one tab shouldn't greet you on the next.
watch(tab, () => (formNote.value = null));

const state = computed(() => (data.value ? roomState(data.value.room) : null));
const online = computed(() => !!data.value?.room.url && data.value.room.status !== "empty");
// The head's line, after the state's dot: the state in words, then whose room it is and where. "Online. Your room
// in Sacré-Cœur."
const headLine = computed(() => {
  const d = data.value;
  if (!d) return "";
  const who = d.room.occupant;
  const whose = !who || who.login === me.value?.login ? "Your room" : `${(who.name ?? who.login).split(" ")[0]}'s room`;
  return `${roomLine(d.room)} ${whose} in ${d.house.name}.`;
});
const workshop = computed(() => props.id === TUTORIAL_HOUSE);
const coached = computed(() => props.coached ?? (!!props.embedded && workshop.value && !!me.value && me.value.tutorialDone === false));
const title = computed(() => (data.value ? projectTitle(data.value.settings, workshop.value) : ""));
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="room-page" :class="{ embedded }">
    <RouterLink v-if="!embedded" :to="`/houses/${id}`" class="back"><span aria-hidden="true">‹</span> {{ data?.house.name ?? "The house" }}</RouterLink>

    <Panel
      v-if="data && state"
      class="room-panel"
      :explain="explains[tab]"
      :body-id="`tabpanel-${tab}`"
      :body-labelledby="`tab-${tab}`"
    >
      <template #head>
        <PanelHead :title="title" :state="state" :line="headLine" :class="{ untitled: !data.settings.project && !workshop }">
          <template v-if="online" #aside>
            <a :href="data.room.url!" target="_blank" rel="noopener" class="chunk small">
              <Icon name="external" :size="16" /> Open<span class="sr-only"> the project (opens in a new tab)</span>
            </a>
          </template>
        </PanelHead>
        <!-- What a room is for, in one line, and where it can be seen. -->
        <p class="what">
          {{ explain.room(data.room.limits.memoryMb, data.room.limits.cpus) }}
          <template v-if="online">
            Its address:
            <a :href="data.room.url!" target="_blank" rel="noopener" class="mono">{{ bare(data.room.url!) }}<span class="sr-only"> (opens in a new tab)</span></a><template
              v-if="data.room.previewUrl"
            >, and a preview at
              <a :href="data.room.previewUrl" target="_blank" rel="noopener" class="mono">{{ bare(data.room.previewUrl) }}<span class="sr-only"> (opens in a new tab)</span></a></template>.
          </template>
          <template v-else>{{ explain.online }}</template>
        </p>
        <p class="sr-only" aria-live="polite">Room state: {{ state.word }}</p>
      </template>

      <template #tabs>
        <PanelTabs v-model="tab" :tabs="tabs" label="Room sections" />
      </template>

      <Transition name="fade" mode="out-in">
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
            @run="run"
          />
          <RoomCode
            v-else-if="tab === 'code'"
            :data="data"
            :form="form"
            :saving="savingSettings"
            :form-note="formNote"
            :save="saveSettings"
            :reset="fillForm"
          />
          <RoomSecrets v-else-if="tab === 'secrets'" :data="data" :base="base" :reload="load" :when="when" />
          <RoomLogs v-else-if="tab === 'logs'" v-model:follow="follow" :text="logs" :message="logsMessage" :loading="logsLoading" @refresh="fetchLogs" />
          <RoomHistory v-else :deployments="data.deployments" :github="data.github" :when="when" />
        </div>
      </Transition>
    </Panel>

    <!-- Not yours, not there, or still loading: one short message in the middle of the panel. -->
    <Panel v-else class="room-panel">
      <Waiting v-if="waiting" @retry="open" />
      <Waiting v-else-if="failed" title="That didn't load." line="Something went wrong on our side. Try again in a moment." @retry="open" />
      <div v-else class="message" :aria-live="error ? undefined : 'polite'">
        <span class="icon"><Icon :name="error ? (status === 401 ? 'login' : 'door') : 'key'" :size="28" /></span>
        <p class="said">{{ error || "Unlocking the door…" }}</p>
        <div v-if="error && (status === 401 || !embedded)" class="go">
          <RouterLink v-if="status === 401" to="/login" class="chunk primary"><Icon name="login" :size="16" /> Log in</RouterLink>
          <RouterLink v-if="!embedded" :to="`/houses/${id}`" class="chunk"><Icon name="house" :size="16" /> Back to the house</RouterLink>
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

.untitled :deep(.title) { color: var(--muted); }
.what { margin-top: 10px; font-size: 13px; line-height: 1.45; color: var(--muted); }
.what a { color: var(--accent); }

/* One tab's content. It grows with what it holds (the body scrolls if that's too much), except the logs, which
   take exactly the body's height so only the log box scrolls. */
.tab-body { flex: 1 0 auto; display: flex; flex-direction: column; gap: 10px; }
.tab-body.fill { flex: 1 1 0; min-height: 0; }
.room-page:not(.embedded) .tab-body.fill { height: 60vh; flex: none; }

.message { margin: auto; display: grid; justify-items: center; gap: 14px; padding: 32px 16px; text-align: center; }
.icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; background: var(--fill); color: var(--muted); }
.said { font-size: 19px; font-weight: 600; }
.go { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
</style>
