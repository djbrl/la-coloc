<script setup lang="ts">
// The room's front page, built like a pause menu: a line about the project (and a short flow to name and describe it),
// a tile per part of the room saying how it's doing and opening it, and the one thing to do next: upload a project,
// put it online or update it. A failed build says why and what to do; a house whose server isn't connected says only
// that.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import StatusDot from "../lobby/panel/StatusDot.vue";
import { bare, explain, roomState } from "../lobby/panel/words";
import { fcfa } from "../lobby/house/server";
import { locale } from "../../i18n";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomManage } from "../../types";
import BuildLog from "./BuildLog.vue";
import RoomServerOff from "./RoomServerOff.vue";
import { buildFailed, buildTrouble, canRestart, liveVersion, logTail, memoryUse, refWord, roomSentence, type SettingsForm, sshLine, updateTile } from "./room";
import { roomWords as w } from "./words";
import { seeded } from "../seeded";

const props = defineProps<{
  data: RoomManage;
  // The page's settings form: this tab edits its name and description fields.
  form: SettingsForm;
  saving: boolean;
  formNote: Note | null;
  // Saves the whole form; resolves true when it went through.
  save: () => Promise<boolean>;
  // Puts the form back to what's saved (after a Cancel).
  reset: () => void;
  action: "" | "redeploy" | "restart";
  actionNote: Note | null;
  when: (iso: string) => string;
  // The tutorial's coach is up and has its own "Put it online": this panel's tile steps back to a plain one.
  coached?: boolean;
  // A build was just started, from here or from the Code tab: its log window opens.
  showLog?: boolean;
  // What the room printed, for the Logs tile, and why there's nothing to show if so.
  logs: string;
  logsMessage: string;
}>();
// `tab`: sent to the Code part to fix or upload something. `open`: a tile was pressed.
const emit = defineEmits<{ run: [what: "redeploy" | "restart"]; tab: [to: "code"]; open: [part: "code" | "logs" | "secrets" | "ssh" | "lease"]; logShown: [] }>();

const state = computed(() => roomState(props.data.room));
const said = computed(() => roomSentence(props.data.room, props.data.deployments));
const memory = computed(() => memoryUse(props.data.room.usage));
const version = computed(() => liveVersion(props.data.deployments));
const tail = computed(() => logTail(props.logs));
const tile = computed(() => updateTile(props.data.room.status, props.data.deployments));
const restartable = computed(() => canRestart(props.data.room.status, props.data.deployments));
const serverUp = computed(() => props.data.house.agentOnline);
// No code to build yet: uploading a project is the next step.
const noCode = computed(() => !props.data.settings.source && !props.data.github);
// The last build failed, even with the version before it still online: why, and the whole log behind a button.
const lastBuild = computed(() => props.data.deployments.find((d) => d.kind === "prod"));
const failed = computed(() => buildFailed(lastBuild.value));
const trouble = computed(() => w.trouble[buildTrouble(lastBuild.value?.detail)]);
const logOpen = ref(false);
const building = computed(() => ["queued", "cloning", "building", "starting"].includes(lastBuild.value?.status ?? ""));
watch(
  () => props.showLog,
  (show) => {
    if (!show) return;
    logOpen.value = true;
    emit("logShown");
  },
  { immediate: true },
);

// Naming the project: two questions in place of the block, then back to it.
const step = ref(0);
const editButton = ref<HTMLButtonElement | null>(null);

function startEdit() {
  step.value = 1;
}

async function endEdit() {
  step.value = 0;
  await nextTick();
  editButton.value?.focus();
}

function cancel() {
  props.reset();
  endEdit();
}

// Leaving the tab mid-flow drops what was typed, so it can't ride along with the next save.
onBeforeUnmount(() => {
  if (step.value) props.reset();
});

async function finish() {
  if (await props.save()) await endEdit();
}
</script>

<template>
  <div class="overview">
    <p class="sr-only" aria-live="polite">{{ said }}</p>

    <!-- The server isn't connected: nothing can go online, and it says only that. -->
    <RoomServerOff v-if="!step && !serverUp" :data="data" />

    <!-- The last build failed: what to do about it, the log, and a way to change the code. -->
    <div v-else-if="!step && failed" class="trouble" role="status">
      <p><Icon name="warn" :size="18" /><span>{{ trouble }}</span></p>
      <div class="trouble-keys">
        <button type="button" class="chunk small" @click="logOpen = true">{{ w.seeLog }}</button>
        <button type="button" class="chunk small" @click="emit('tab', 'code')">{{ w.fixSetup }}</button>
      </div>
    </div>

    <!-- A line about the project, as it shows on the house page and in the city. -->
    <div v-if="!step" class="project">
      <p class="about" :class="{ unset: !data.settings.projectDescription }">{{ seeded(data.settings.projectDescription) || w.noLine }}</p>
      <a v-if="data.room.previewUrl" class="preview" :href="data.room.previewUrl" target="_blank" rel="noopener">{{ w.tile.preview }} {{ bare(data.room.previewUrl) }}<span class="sr-only">{{ w.newTab }}</span></a>
      <button ref="editButton" type="button" class="pencil" :aria-label="w.editProject" :title="w.editProject" @click="startEdit">
        <Icon name="edit" :size="18" />
      </button>
    </div>

    <!-- The room's menu: each tile says how that part is doing, and opens it. Resources has nothing to open. -->
    <ul v-if="!step" class="tiles" :aria-label="w.sections">
      <li>
        <button type="button" class="tile" data-section="code" @click="emit('open', 'code')">
          <span class="word"><Icon name="code" :size="22" />{{ w.tabs.code }}</span>
          <span class="low">
            <strong>{{ version?.branch ?? (noCode ? w.tile.noCode : refWord(data.settings.branch ?? "default")) }}</strong>
            <small>{{ version?.ago ?? w.tile.notOnline }}</small>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="tile dark" data-section="logs" @click="emit('open', 'logs')">
          <span class="word"><StatusDot :state="state" class="dot-here" />{{ w.tabs.logs }}</span>
          <span class="tail">
            <span v-for="(l, i) in tail" :key="i">{{ l }}</span>
            <span v-if="!tail.length">{{ logsMessage || w.tile.noLogs }}</span>
          </span>
        </button>
      </li>
      <li v-if="data.ssh">
        <button type="button" class="tile" data-section="ssh" @click="emit('open', 'ssh')">
          <span class="word"><Icon name="key" :size="22" />{{ w.tabs.ssh }}</span>
          <span class="low">
            <strong>{{ w.tile.server }}</strong>
            <code>{{ sshLine(data.ssh) }}</code>
          </span>
        </button>
      </li>
      <li>
        <div class="tile still">
          <span class="word"><Icon name="gauge" :size="22" />{{ w.tile.resources }}</span>
          <span class="low">
            <strong>{{ memory ? `${memory.mb} / ${data.room.limits.memoryMb}` : data.room.limits.memoryMb }} {{ w.mb }}</strong>
            <span v-if="memory" class="bar" aria-hidden="true"><span :style="{ width: `${memory.pct}%` }"></span></span>
            <small>{{ w.tile.cpuMax(data.room.limits.cpus.toLocaleString(locale())) }}</small>
          </span>
        </div>
      </li>
      <li>
        <button type="button" class="tile" data-section="secrets" @click="emit('open', 'secrets')">
          <span class="word"><Icon name="lock" :size="22" />{{ w.tabs.secrets }}</span>
          <span class="low"><strong>{{ data.secrets.length ? w.tile.secrets(data.secrets.length) : w.tile.noSecrets }}</strong></span>
        </button>
      </li>
      <li v-if="data.lease">
        <button type="button" class="tile" data-section="lease" @click="emit('open', 'lease')">
          <span class="word"><Icon name="door" :size="22" />{{ w.tabs.lease }}</span>
          <span class="low">
            <strong>{{ data.lease.share === null ? w.tile.noBill : fcfa(data.lease.share) }}</strong>
            <small v-if="data.lease.share !== null">{{ w.tile.aMonth }}</small>
          </span>
        </button>
      </li>
    </ul>

    <div v-if="step" class="flow">
      <UiSteps :step="step" :total="2" focus-on-mount>
        <form v-if="step === 1" novalidate @submit.prevent="step = 2">
          <h3>{{ w.nameIt }}</h3>
          <p class="hint">{{ w.nameHint }}</p>
          <input v-model="form.project" data-autofocus maxlength="60" :placeholder="w.projectName" :aria-label="w.projectName" />
          <div class="flow-nav">
            <button type="button" class="chunk" @click="cancel">{{ w.cancel }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>
        <form v-else novalidate @submit.prevent="finish">
          <h3>{{ w.describeIt }}</h3>
          <p class="hint">{{ w.describeHint }}</p>
          <input v-model="form.projectDescription" data-autofocus maxlength="200" :placeholder="w.describePlaceholder" :aria-label="w.describeName" />
          <UiNote :note="formNote?.error ? formNote : null" />
          <div class="flow-nav">
            <button type="button" class="chunk" @click="step = 1"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button class="primary next" :disabled="saving">{{ saving ? w.saving : w.save }}</button>
          </div>
        </form>
      </UiSteps>
    </div>

    <!-- The one thing to do next, and restarting beside it once there's something to restart. -->
    <div v-if="!step && serverUp" class="acts">
      <button v-if="noCode" type="button" class="primary go" :class="{ quiet: coached }" @click="emit('tab', 'code')"><Icon name="code" :size="20" />{{ w.uploadProject }}</button>
      <button v-else-if="building" type="button" class="primary go" :class="{ quiet: coached }" @click="logOpen = true"><Icon name="code" :size="20" />{{ w.watchBuild }}</button>
      <button v-else type="button" class="primary go" :class="{ quiet: coached }" :disabled="action !== ''" :title="tile.hint" @click="emit('run', 'redeploy')">
        <Icon :name="tile.icon" :size="20" />{{ action === "redeploy" ? w.starting : failed ? w.buildAgain : tile.verb }}
      </button>
      <button v-if="restartable" type="button" class="chunk restart" :disabled="action !== ''" :title="explain.restart" @click="emit('run', 'restart')">
        <Icon name="power" :size="18" />{{ action === "restart" ? w.restarting : w.restart }}
      </button>
    </div>

    <BuildLog
      v-if="logOpen"
      :house-id="data.house.id"
      :room="data.room.name"
      :url="data.room.url"
      :other-word="w.fixSetup"
      :refusal="actionNote?.error ? actionNote.text : ''"
      :retrying="action === 'redeploy'"
      @close="logOpen = false"
      @retry="emit('run', 'redeploy')"
      @other="logOpen = false; emit('tab', 'code')"
    />
    <UiNote :note="actionNote" />
    <UiNote v-if="!step" :note="formNote" />
  </div>
</template>

<style scoped>
/* It takes the whole body: the tiles share what's left between the project's line and the keys. */
.overview { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }

.project { flex: none; display: flex; align-items: center; gap: 10px; min-height: 40px; }
.about { flex: 1 1 auto; min-width: 0; font-size: 15px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.unset { color: var(--muted); }
.preview { flex: 0 1 auto; min-width: 0; font: 600 14px/1.2 var(--num); color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A small chore, so a small key. */
.pencil { flex: none; width: 40px; height: 40px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-md); background: none; box-shadow: none; color: var(--muted); }
.pencil:hover:not(:disabled) { background: var(--tile); color: var(--text); }

/* The menu: two across, the rows sharing the height, and a last tile alone takes the whole row. */
.tiles { flex: 1 1 auto; min-height: 0; list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(104px, 1fr); gap: 8px; }
.tiles > li { min-width: 0; display: flex; }
.tiles > li:last-child:nth-child(odd) { grid-column: 1 / -1; }
.tile { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 6px; padding: 12px 14px; border: 0; border-radius: var(--r-md); background: var(--tile); box-shadow: none; color: var(--text); font: inherit; text-align: left; overflow: hidden; transition: background-color var(--dur-fast) var(--ease); }
button.tile { cursor: pointer; }
button.tile:hover:not(:disabled) { background: var(--fill); }
button.tile:active:not(:disabled) { transform: none; }
button.tile:focus-visible { outline: 3px solid var(--ring); outline-offset: -3px; }
.word { flex: none; display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; line-height: 1.1; }
.word :deep(svg) { flex: none; }
.low { min-width: 0; display: grid; gap: 2px; }
.low strong { font: 800 21px/1.15 var(--num); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.low small { font-size: 14px; line-height: 1.2; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.low code { font-size: 12px; line-height: 1.3; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { display: block; height: 6px; margin: 3px 0; border-radius: 3px; background: var(--fill); overflow: hidden; }
.bar span { display: block; min-width: 6px; height: 100%; border-radius: 3px; background: var(--live); }
/* The logs read like logs. */
.tile.dark { background: var(--ink); color: var(--on-panel); }
button.tile.dark:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 86%, white); }
.dark .word { gap: 16px; padding-left: 5px; }
.tail { min-width: 0; display: grid; gap: 2px; font: 500 12px/1.3 var(--code); }
.tail span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot-here { flex: none; }

/* A failed build: what to do, the log, another try. */
.trouble { flex: none; display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-md); background: var(--danger-soft); }
.trouble p { display: flex; gap: 8px; font-size: 15px; line-height: 1.35; }
.trouble p :deep(svg) { flex: none; margin-top: 1px; color: var(--danger); }
.trouble-keys { display: flex; flex-wrap: wrap; gap: 8px; }

.acts { flex: none; display: flex; gap: 8px; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; font-size: 20px; }
/* The quest's coach has its own button up: this one steps back. */
.go.quiet { background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); }
.restart { flex: none; min-height: 56px; }
/* A phone's sheet is short: everything tightens, and the memory's bar goes, so the menu still fits without a scroll. */
@media (max-width: 480px) {
  .tiles { grid-auto-rows: minmax(84px, 1fr); gap: 6px; }
  .tile { gap: 4px; padding: 8px 12px; }
  .word { font-size: 16px; }
  .low strong { font-size: 18px; }
  .bar { display: none; }
  .go, .restart { min-height: 48px; padding: 0 10px; gap: 6px; font-size: 16px; }
  .go { flex: 1 1 0; min-width: 0; white-space: nowrap; }
}
@media (prefers-reduced-motion: reduce) {
  .tile { transition: none; }
}
</style>
