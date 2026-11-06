<script setup lang="ts">
// The room's first tab, with one thing to look at: a soft tile saying how the room is ("Not online yet", "Online for
// 3 days") and, under it, the next step in words (the panel's foot has its button, on RoomPage), the address when
// it's online, or why the last build failed with the log and a way to fix it. Everything else steps back into small
// quiet rows (the project's line with its pencil, the code, memory, CPU, rent, secrets, SSH) and the log's last lines,
// folded. A house whose server isn't connected says only that, in the tile's place.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import { bare } from "../lobby/panel/words";
import { fcfa } from "../lobby/house/server";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomInside, RoomManage } from "../../types";
import RoomFold from "./RoomFold.vue";
import RoomMark from "./RoomMark.vue";
import RoomServerOff from "./RoomServerOff.vue";
import { addressDead, cpuShare, liveVersion, logTail, memoryUse, overviewFocus, refWord, roomSentence, type SettingsForm, sshLine, startedByHand } from "./room";
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
const sshNames = computed(() => sshPeople.value.map((p) => p.name ?? p.login).join(", "));
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

// The one thing to look at: the state, and the next step or the address (or why the build failed).
const focus = computed(() => overviewFocus(props.data.room, props.data.deployments, { has: !noCode.value, branch: props.data.settings.branch }));
const liveUrl = computed(() => (focus.value.kind === "live" ? props.data.room.url : null));

// The quiet rows' values. The code: the branch that's online and since when, the branch it would build, or none yet.
const codeValue = computed(() => {
  if (noCode.value) return w.tile.noCode;
  if (version.value) return `${version.value.branch} · ${version.value.ago}`;
  return refWord(props.data.settings.branch ?? "default");
});
const memoryValue = computed(() => (memory.value ? `${memory.value.mb} ${w.tile.ofMb(props.data.room.limits.memoryMb)}` : `${props.data.room.limits.memoryMb} ${w.mb}`));
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

    <!-- The one thing to look at: how the room is, then the next step, the address, or why the build failed. -->
    <section v-else-if="!step" class="focus" :class="[focus.kind, { marked: focus.mark !== 'none' }]" :role="focus.kind === 'failed' ? 'status' : undefined">
      <p class="focus-title"><RoomMark v-if="focus.mark !== 'none'" :kind="focus.mark" /><span>{{ focus.title }}</span></p>
      <a v-if="liveUrl" class="focus-at" :href="liveUrl" target="_blank" rel="noopener"
        ><span class="at">{{ bare(liveUrl) }}</span><Icon name="external" :size="16" /><span class="sr-only">{{ w.newTab }}</span></a
      >
      <p v-if="focus.line" class="focus-line">{{ focus.line }}</p>
      <!-- Online, but the address leads nowhere: the Inside tab's news, here too. -->
      <p v-if="dead && liveUrl" class="focus-line">{{ w.inside.nothingThere }}</p>
      <div v-if="focus.kind === 'failed'" class="focus-keys">
        <button type="button" class="chunk small" @click="emit('log')">{{ w.seeLog }}</button>
        <button type="button" class="chunk small" @click="emit('tab', 'code')">{{ w.fixSetup }}</button>
      </div>
    </section>

    <!-- The rest, quiet: what each thing is, and its value. -->
    <ul v-if="!step" class="rows">
      <!-- The project's line, as it shows on the house page and in the city, with a small pencil; none yet, a quiet
           "Describe it": a chore, not something to weigh against the foot's button. -->
      <li class="row">
        <span class="term">{{ w.rows.about }}</span>
        <span v-if="about" class="value about">{{ about }}</span>
        <button v-if="about" ref="editButton" type="button" class="pencil" :aria-label="w.editProject" :title="w.editProject" @click="startEdit">
          <Icon name="edit" :size="16" />
        </button>
        <button v-else ref="editButton" type="button" class="add-line" :title="w.editProject" @click="startEdit"><Icon name="edit" :size="14" />{{ w.addLine }}</button>
      </li>
      <li v-if="data.room.previewUrl" class="row">
        <span class="term">{{ w.rows.preview }}</span>
        <a class="value link" :href="data.room.previewUrl" target="_blank" rel="noopener">{{ bare(data.room.previewUrl) }}<span class="sr-only">{{ w.newTab }}</span></a>
      </li>
      <li class="row">
        <span class="term">{{ w.rows.code }}</span>
        <span class="value">{{ codeValue }}</span>
      </li>
      <li class="row">
        <span class="term">{{ w.rows.memory }}</span>
        <span class="value">{{ memoryValue }}</span>
      </li>
      <li class="row">
        <span class="term">{{ w.rows.cpu }}</span>
        <span class="value cap">{{ cpuShare(data.room.limits.cpus) }}</span>
      </li>
      <li v-if="lease !== null" class="row">
        <span class="term">{{ w.rows.rent }}</span>
        <span class="value">{{ fcfa(lease) }} {{ w.tile.aMonth }}</span>
      </li>
      <li class="row">
        <span class="term">{{ w.rows.secrets }}</span>
        <span class="value">{{ data.secrets.length ? w.tile.secrets(data.secrets.length) : w.tile.noSecrets }}</span>
      </li>
      <li v-if="data.ssh" class="row">
        <span class="term">{{ w.rows.ssh }}</span>
        <span v-if="sshPeople.length" class="value" :title="w.inside.who(sshNames)">{{ sshNames }}</span>
        <code v-else class="value" :title="sshLine(data.ssh)">{{ sshLine(data.ssh) }}</code>
      </li>
      <!-- Something started by hand is still going: it isn't the room's project, so it's said. -->
      <li v-if="started.length" class="row">
        <span class="term">{{ w.rows.running }}</span>
        <code class="value">{{ started.map((r) => r.command ?? `:${r.port}`).join(", ") }}</code>
      </li>
    </ul>

    <!-- What the room printed last, folded: one press away. -->
    <RoomFold v-if="!step" :title="w.lastLog">
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
.overview { display: flex; flex-direction: column; gap: 18px; }

/* The one thing to look at: a soft tile, the state in big words with its one symbol, and the line under them lined
   up with the words, not the symbol. */
.focus { flex: none; display: grid; gap: 6px; padding: 18px; border-radius: var(--tile-r); background: var(--tile); }
.focus-title { display: flex; align-items: center; gap: 10px; margin: 0; font: 800 21px/27px var(--display); }
.focus-title { align-items: flex-start; }
.focus-title > .status-mark { margin-top: 2px; }
.focus-title > span { min-width: 0; }
.focus-at, .focus-line, .focus-keys { margin: 0; }
.focus.marked { padding-left: 16px; }
.focus.marked > :not(.focus-title) { margin-left: 32px; }
.focus-at { min-width: 0; display: inline-flex; align-items: center; gap: 6px; justify-self: start; max-width: 100%; font: 700 16px/22px var(--num); color: var(--accent); }
.focus.marked > .focus-at { max-width: calc(100% - 32px); }
.focus-at .at { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.focus-at :deep(svg) { flex: none; }
.focus-line { font: 600 15px/21px var(--font); color: var(--muted); }
.focus.failed .focus-line { color: var(--text); }
.focus-keys { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 6px; }

/* The rest: small calm rows, what it is in grey, its value in ink, no lines between them. */
.rows { list-style: none; margin: 0; padding: 0 2px; display: grid; gap: 2px; }
.row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 32px; }
.term { font: 600 13px/18px var(--font); color: var(--muted); }
.value { min-width: 0; font: 600 14px/20px var(--font); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
code.value { font: 500 13px/18px var(--code); }
.value.link { color: var(--accent); }
.value.cap::first-letter { text-transform: uppercase; }
/* The project's line may take two. */
.value.about { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
/* A small chore, so a small key, with no lip. */
.pencil { flex: none; width: 34px; height: 34px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 10px; background: none; box-shadow: none; color: var(--muted); }
.pencil:hover:not(:disabled) { background: var(--tile); color: var(--text); }
.add-line { grid-column: 2 / -1; justify-self: start; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 8px; margin-left: -8px; border-radius: 10px; background: none; box-shadow: none; color: var(--muted); font: 600 14px/1 var(--font); }
.add-line:hover:not(:disabled) { background: var(--tile); color: var(--text); }

/* The log's last lines, as the log prints them. */
.tail { min-width: 0; display: grid; gap: 2px; padding: 12px 14px; border-radius: 10px; background: var(--surface); font: 500 13px/20px var(--code); }
.tail span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tail .no-log { font-family: var(--font); font-weight: 600; color: var(--muted); }
@media (max-width: 480px) {
  .overview { gap: 14px; }
  .focus { padding: 14px; }
  .focus-title { font-size: 19px; line-height: 25px; }
  .row { grid-template-columns: 76px minmax(0, 1fr) auto; }
}
</style>
