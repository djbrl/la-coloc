<script setup lang="ts">
// The room's first tab: a line about the project (and a short flow to name and describe it), what it uses in numbers,
// one line per part saying how it's doing (each with its one symbol), and the log's last lines folded under them. The
// one thing to do next (upload a project, put it online, update it) is the panel's foot, on RoomPage. A failed build
// says why and what to do; a house whose server isn't connected says only that.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import { bare } from "../lobby/panel/words";
import { fcfa } from "../lobby/house/server";
import { locale } from "../../i18n";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomInside, RoomManage } from "../../types";
import RoomFold from "./RoomFold.vue";
import RoomMark from "./RoomMark.vue";
import RoomServerOff from "./RoomServerOff.vue";
import { addressDead, buildFailed, buildTrouble, liveVersion, logTail, memoryUse, refWord, roomSentence, type SettingsForm, sshLine, startedByHand, stateWords } from "./room";
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
  // What the room printed, for the log's last lines, and why there's nothing to show if so.
  logs: string;
  logsMessage: string;
  // What's inside the room, if anyone has looked (the page does, while this tab or the Inside tab is open).
  inside?: RoomInside | null;
}>();
// `tab`: sent to the Code tab to fix or upload something. `log`: open the build's log window. `flow`: the naming flow
// is up (it has its own main button, so the panel's foot steps aside).
const emit = defineEmits<{ tab: [to: "code"]; log: []; flow: [on: boolean] }>();

const sshPeople = computed(() => props.data.ssh?.people ?? []);
const sshWho = computed(() => w.inside.who(sshPeople.value.map((p) => p.name ?? p.login).join(", ")));
const started = computed(() => startedByHand(props.inside ?? null));
const dead = computed(() => addressDead(props.inside ?? null));
const said = computed(() => roomSentence(props.data.room, props.data.deployments));
const memory = computed(() => memoryUse(props.data.room.usage));
const version = computed(() => liveVersion(props.data.deployments));
const tail = computed(() => logTail(props.logs));
const about = computed(() => seeded(props.data.settings.projectDescription));
const serverUp = computed(() => props.data.house.agentOnline);
// No code to build yet: uploading a project is the next step.
const noCode = computed(() => !props.data.settings.source && !props.data.github);
// The last build failed, even with the version before it still online: why, and the whole log behind a button.
const lastBuild = computed(() => props.data.deployments.find((d) => d.kind === "prod"));
const failed = computed(() => buildFailed(lastBuild.value));
const trouble = computed(() => w.trouble[buildTrouble(lastBuild.value?.detail)]);

// The first line: how the room is doing, with its symbol. Online is done (a failed build with the version before it
// still up says so above, in its own tile); a room whose build failed is a cross; anything else (never built,
// building, stopped) is the quiet dot, the words saying which.
const stateSaid = computed(() => stateWords(props.data.room.status, props.data.deployments));
const stateMark = computed(() => (props.data.room.status === "live" ? "ok" : props.data.room.status === "failed" ? "fail" : "none"));
// The code's line: what's online and since when, or the branch it would build, or that there's no project yet.
const codeTitle = computed(() => (noCode.value ? w.tile.noCode : w.codeLine(version.value?.branch ?? refWord(props.data.settings.branch ?? "default"))));
const codeEnd = computed(() => version.value?.ago ?? (noCode.value ? "" : w.tile.notOnline));
const lease = computed(() => (props.data.lease && props.data.lease.share !== null ? props.data.lease.share : null));

// Naming the project: two questions in place of the block, then back to it.
const step = ref(0);
watch(step, (s) => emit("flow", s > 0));
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
  if (!step.value) return;
  props.reset();
  emit("flow", false);
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
      <p><RoomMark kind="fail" /><span>{{ trouble }}</span></p>
      <div class="trouble-keys">
        <button type="button" class="chunk small" @click="emit('log')">{{ w.seeLog }}</button>
        <button type="button" class="chunk small" @click="emit('tab', 'code')">{{ w.fixSetup }}</button>
      </div>
    </div>

    <!-- A line about the project, as it shows on the house page and in the city, with a small pencil. With no line yet,
         only a quiet "Describe it": a chore, not something to weigh against Update. -->
    <div v-if="!step" class="project">
      <p v-if="about" class="about">{{ about }}</p>
      <a v-if="data.room.previewUrl" class="preview" :href="data.room.previewUrl" target="_blank" rel="noopener">{{ w.tile.preview }} {{ bare(data.room.previewUrl) }}<span class="sr-only">{{ w.newTab }}</span></a>
      <button v-if="about" ref="editButton" type="button" class="pencil" :aria-label="w.editProject" :title="w.editProject" @click="startEdit">
        <Icon name="edit" :size="18" />
      </button>
      <button v-else ref="editButton" type="button" class="add-line" :title="w.editProject" @click="startEdit"><Icon name="edit" :size="16" />{{ w.addLine }}</button>
    </div>

    <!-- What it uses, in numbers: memory against its share, the processor, and the rent it pays for that share. -->
    <ul v-if="!step" class="stats">
      <li class="stat">
        <strong>{{ memory ? memory.mb : data.room.limits.memoryMb }} {{ w.mb }}</strong>
        <span>{{ memory ? w.tile.ofMb(data.room.limits.memoryMb) : w.statMemory }}</span>
      </li>
      <li class="stat">
        <strong>{{ data.room.limits.cpus.toLocaleString(locale()) }}</strong>
        <span>{{ w.cpuMax }}</span>
      </li>
      <li v-if="lease !== null" class="stat">
        <strong>{{ fcfa(lease) }}</strong>
        <span>{{ w.tile.shareOfServer }}</span>
      </li>
    </ul>

    <!-- One line per part, each with its one symbol: how it's running, its code, what's inside, its secrets, SSH. -->
    <ul v-if="!step" class="st-lines">
      <li class="st-line">
        <RoomMark :kind="stateMark" />
        <span class="st-text"><span class="st-title">{{ stateSaid }}</span></span>
      </li>
      <li class="st-line">
        <RoomMark :kind="version ? 'ok' : 'none'" />
        <span class="st-text"><span class="st-title">{{ codeTitle }}</span></span>
        <span v-if="codeEnd" class="st-end">{{ codeEnd }}</span>
      </li>
      <!-- The address leads nowhere, or something started by hand is running: the Inside tab's news, here too. -->
      <li v-if="dead" class="st-line">
        <RoomMark kind="fail" />
        <span class="st-text"><span class="st-title">{{ w.inside.nothingThere }}</span></span>
      </li>
      <li v-else-if="started.length" class="st-line">
        <RoomMark kind="none" />
        <span class="st-text"><span class="st-title">{{ w.inside.alsoRunning }}</span></span>
        <code class="st-end">{{ started.map((r) => r.command ?? `:${r.port}`).join(", ") }}</code>
      </li>
      <li class="st-line">
        <RoomMark :kind="data.secrets.length ? 'ok' : 'none'" />
        <span class="st-text"><span class="st-title">{{ w.tabs.secrets }}</span></span>
        <span class="st-end">{{ data.secrets.length ? w.tile.secrets(data.secrets.length) : w.tile.noSecrets }}</span>
      </li>
      <li v-if="data.ssh" class="st-line" :title="sshPeople.length ? sshWho : undefined">
        <RoomMark :kind="sshPeople.length ? 'ok' : 'none'" />
        <span class="st-text"><span class="st-title">{{ w.tabs.ssh }}</span></span>
        <span v-if="sshPeople.length" class="st-end">{{ sshWho }}</span>
        <code v-else class="st-end">{{ sshLine(data.ssh) }}</code>
      </li>
    </ul>

    <!-- What the room printed last, folded open: it's the quickest way to see it's alive. -->
    <RoomFold v-if="!step" :title="w.lastLog" open>
      <div class="tail">
        <span v-for="(l, i) in tail" :key="i">{{ l }}</span>
        <span v-if="!tail.length" class="no-log">{{ logsMessage || w.tile.noLogs }}</span>
      </div>
    </RoomFold>

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

    <UiNote v-if="!step" :note="formNote" />
  </div>
</template>

<style scoped>
.overview { display: flex; flex-direction: column; gap: 16px; }

.project { flex: none; display: flex; align-items: center; gap: 10px; min-height: 40px; }
.about { flex: 1 1 auto; min-width: 0; font: 600 15px/21px var(--font); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.preview { flex: 0 1 auto; min-width: 0; font: 600 14px/1.2 var(--num); color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A small chore, so a small key, with no lip. */
.pencil { flex: none; width: 40px; height: 40px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 10px; background: none; box-shadow: none; color: var(--muted); }
.pencil:hover:not(:disabled) { background: var(--tile); color: var(--text); }
.add-line { order: -1; flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; margin-left: -10px; margin-right: auto; border-radius: 10px; background: none; box-shadow: none; color: var(--muted); font: 600 15px/1 var(--font); }
.add-line:hover:not(:disabled) { background: var(--tile); color: var(--text); }

/* Code in a line's end: the start command someone typed, the SSH line. */
code.st-end { font: 500 13px/18px var(--code); }
/* The log's last lines, as the log prints them. */
.tail { min-width: 0; display: grid; gap: 2px; padding: 12px 14px; border-radius: 10px; background: var(--surface); font: 500 13px/20px var(--code); }
.tail span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tail .no-log { font-family: var(--font); font-weight: 600; color: var(--muted); }

/* A failed build: what to do, the log, another try. A soft tile; the cross is its only colour. */
.trouble { flex: none; display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.trouble p { display: flex; gap: 10px; font: 600 15px/21px var(--font); }
.trouble p > .status-mark { margin-top: -1px; }
.trouble-keys { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 480px) {
  .overview { gap: 12px; }
}
</style>
