<script setup lang="ts">
// The room's Overview tab: a line about the project (and a short flow to name and describe it), how it's doing in
// three numbers, and the one thing to do next: upload a project, put it online or update it. A failed build says why
// and what to do; a house whose server isn't connected says only that.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import StatusDot from "../lobby/panel/StatusDot.vue";
import { bare, explain, roomState } from "../lobby/panel/words";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomInside, RoomManage } from "../../types";
import BuildLog from "./BuildLog.vue";
import RoomServerOff from "./RoomServerOff.vue";
import { addressDead, buildFailed, buildTrouble, canRestart, memoryUse, roomSentence, type SettingsForm, startedByHand, updateTile } from "./room";
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
  // What's inside the room, if anyone has looked (the page does, while this tab is open).
  inside?: RoomInside | null;
}>();
const emit = defineEmits<{ run: [what: "redeploy" | "restart"]; tab: [to: "code"]; inside: []; logShown: [] }>();

const state = computed(() => roomState(props.data.room));
const sshPeople = computed(() => props.data.ssh?.people ?? []);
const sshWho = computed(() => w.inside.who(sshPeople.value.map((p) => p.name ?? p.login).join(", ")));
const started = computed(() => startedByHand(props.inside ?? null));
const dead = computed(() => addressDead(props.inside ?? null));
const said = computed(() => roomSentence(props.data.room, props.data.deployments));
const memory = computed(() => memoryUse(props.data.room.usage));
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
    <p v-if="!step && data.room.url && data.room.status !== 'empty'" class="address">
      <a :href="data.room.url" target="_blank" rel="noopener">{{ bare(data.room.url) }}<span class="sr-only">{{ w.newTab }}</span></a>
      <a v-if="data.room.previewUrl" :href="data.room.previewUrl" target="_blank" rel="noopener">{{ w.andPreview }} {{ bare(data.room.previewUrl) }}<span class="sr-only">{{ w.newTab }}</span></a>
    </p>

    <!-- The server isn't connected: nothing else can happen, so nothing else is offered. -->
    <RoomServerOff v-if="!step && !serverUp" :data="data" />

    <template v-else-if="!step">
      <!-- The last build failed: what to do about it, the log, and a way to change the code. -->
      <div v-if="failed" class="trouble" role="status">
        <p><Icon name="warn" :size="18" /><span>{{ trouble }}</span></p>
        <div class="trouble-keys">
          <button type="button" class="chunk small" @click="logOpen = true">{{ w.seeLog }}</button>
          <button type="button" class="chunk small" @click="emit('tab', 'code')">{{ w.fixSetup }}</button>
        </div>
      </div>

      <!-- The one thing to do next, and restarting beside it once there's something to restart. -->
      <div class="acts">
        <button v-if="noCode" type="button" class="primary go" :class="{ quiet: coached }" @click="emit('tab', 'code')"><Icon name="code" :size="20" />{{ w.uploadProject }}</button>
        <button v-else-if="building" type="button" class="primary go" :class="{ quiet: coached }" @click="logOpen = true"><Icon name="code" :size="20" />{{ w.watchBuild }}</button>
        <button v-else type="button" class="primary go" :class="{ quiet: coached }" :disabled="action !== ''" :title="tile.hint" @click="emit('run', 'redeploy')">
          <Icon :name="tile.icon" :size="20" />{{ action === "redeploy" ? w.starting : failed ? w.buildAgain : tile.verb }}
        </button>
        <button v-if="restartable" type="button" class="chunk restart" :disabled="action !== ''" :title="explain.restart" @click="emit('run', 'restart')">
          <Icon name="power" :size="18" />{{ action === "restart" ? w.restarting : w.restart }}
        </button>
      </div>
    </template>
    <!-- How it's doing, in numbers. The sentence is for screen readers. -->
    <ul v-if="!step" class="stats">
      <li><StatusDot :state="state" class="dot-here" /><strong>{{ state.word }}</strong></li>
      <li><strong>{{ memory ? `${memory.mb} / ${data.room.limits.memoryMb}` : data.room.limits.memoryMb }} {{ w.mb }}</strong> {{ w.statMemory }}</li>
      <li><strong>{{ data.room.limits.cpus }}</strong> {{ w.statCpu }}</li>
      <li v-if="data.ssh" :title="sshPeople.length ? sshWho : undefined">
        <Avatar v-for="p in sshPeople.slice(0, 3)" :key="p.login" :person="p" :size="22" decorative />
        <strong>{{ sshPeople.length }}</strong> {{ w.inside.connected }}
        <span v-if="sshPeople.length" class="sr-only">{{ sshWho }}</span>
      </li>
    </ul>
    <!-- Something started by hand is running, or the address leads nowhere now: only then, and one tap from the Inside tab. -->
    <button v-if="!step && (dead || started.length)" type="button" class="also" :class="{ dead }" @click="emit('inside')">
      <Icon :name="dead ? 'warn' : 'prompt'" :size="20" />
      <span v-if="dead">{{ w.inside.nothingThere }}</span>
      <span v-else>{{ w.inside.alsoRunning }} <code>{{ started.map((r) => r.command ?? `:${r.port}`).join(", ") }}</code></span>
      <span class="see">{{ w.inside.see }} <span aria-hidden="true">›</span></span>
    </button>
    <!-- A line about the project, as it shows on the house page and in the city. -->
    <div v-if="!step" class="project">
      <p class="about" :class="{ unset: !data.settings.projectDescription }">{{ seeded(data.settings.projectDescription) || w.noLine }}</p>
      <button ref="editButton" type="button" class="chunk small" :aria-label="w.editProject" @click="startEdit">
        <Icon name="edit" :size="16" /> {{ w.edit }}
      </button>
    </div>
    <div v-else class="flow">
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
.overview { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-content: start; }

.project { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.about { min-width: 0; font-size: 16px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.unset { color: var(--muted); }

/* The numbers: three tiles side by side, the state first. */
.stats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.stats li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-height: 58px; padding: 8px 12px; border-radius: var(--r-md); background: var(--tile); font-size: 14px; color: var(--muted); }
.stats strong { font-size: 16px; font-weight: 800; color: var(--text); white-space: nowrap; }
.dot-here { flex: none; }
.also { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; border: 0; border-radius: var(--r-md); background: var(--surface-2, var(--surface)); color: var(--text); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
.also.dead { background: var(--danger-soft); }
.also :deep(svg) { flex: none; }
.also > span:not(.see) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.also code { font-size: 14px; }
.see { flex: none; font-weight: 700; color: var(--accent); }
.address { display: grid; gap: 4px; font: 600 15px/1.3 var(--num); overflow-wrap: anywhere; }
.address a { color: var(--accent); }

/* A failed build: what to do, the log, another try. */
.trouble { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-md); background: var(--danger-soft); }
.trouble p { display: flex; gap: 8px; font-size: 15px; line-height: 1.35; }
.trouble p :deep(svg) { flex: none; margin-top: 1px; color: var(--danger); }
.trouble-keys { display: flex; flex-wrap: wrap; gap: 8px; }

.acts { display: flex; gap: 8px; }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 60px; font-size: 22px; }
/* The quest's coach has its own button up: this one steps back. */
.go.quiet { background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); }
.restart { flex: none; min-height: 60px; }
@media (max-width: 480px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .stats li:first-child, .stats li:nth-child(4) { grid-column: 1 / -1; min-height: 44px; }
}
</style>
