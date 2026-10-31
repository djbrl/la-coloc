<script setup lang="ts">
// The room's Overview tab: what the project is (and a short flow to name and describe it), how it's doing in one
// sentence with its state's dot and a memory meter, and the two big things you can do with it: update it, or
// restart it.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import Icon from "../lobby/house/Icon.vue";
import StatusDot from "../lobby/panel/StatusDot.vue";
import { TUTORIAL_HOUSE } from "../lobby/tutorial/tutorial";
import { explain, roomState } from "../lobby/panel/words";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomManage } from "../../types";
import { canRestart, memoryUse, projectTitle, roomSentence, type SettingsForm, updateTile } from "./room";
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
}>();
const emit = defineEmits<{ run: [what: "redeploy" | "restart"] }>();

const state = computed(() => roomState(props.data.room));
const said = computed(() => roomSentence(props.data.room, props.data.deployments));
const memory = computed(() => memoryUse(props.data.room.usage));
const tile = computed(() => updateTile(props.data.room.status, props.data.deployments));
const restartable = computed(() => canRestart(props.data.room.status, props.data.deployments));
const serverUp = computed(() => props.data.house.agentOnline);
// The tutorial's workshop: its sample project is the Hello page.
const workshop = computed(() => props.data.house.id === TUTORIAL_HOUSE);

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
    <!-- The project: its name and a line about it, as they show on the house page and in the city. -->
    <div v-if="!step" class="project">
      <div class="what">
        <p class="name" :class="{ unset: !data.settings.project && !workshop }">{{ projectTitle(data.settings, workshop) }}</p>
        <p class="about" :class="{ unset: !data.settings.projectDescription }">
          {{ seeded(data.settings.projectDescription) || w.noLine }}
        </p>
      </div>
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

    <!-- How it's doing, in one sentence: the dot is its state's colour, the meter its memory. -->
    <div class="doing">
      <p aria-live="polite"><StatusDot :state="state" class="dot-here" />{{ said }}</p>
      <div v-if="memory" class="meter" role="img" :aria-label="w.memoryUsed(memory.pct)">
        <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
      </div>
    </div>

    <!-- The two things to do, each with the one line that says what it does. While the project is being named
         they step aside, so the flow and the stats fit without scrolling. -->
    <div v-if="!step" class="acts">
      <button type="button" class="act" :class="{ go: !coached }" :disabled="action !== '' || !serverUp" @click="emit('run', 'redeploy')">
        <span class="ic"><Icon :name="tile.icon" :size="22" /></span>
        <span class="verb">{{ action === "redeploy" ? w.starting : tile.verb }}</span>
        <span class="hint">{{ tile.hint }}</span>
      </button>
      <button type="button" class="act" :disabled="action !== '' || !serverUp || !restartable" @click="emit('run', 'restart')">
        <span class="ic"><Icon name="power" :size="22" /></span>
        <span class="verb">{{ action === "restart" ? w.restarting : w.restart }}</span>
        <span class="hint">{{ restartable ? explain.restart : w.nothingToRestart }}</span>
      </button>
    </div>
    <p v-if="!serverUp && !step" class="down"><Icon name="warn" :size="16" /> {{ w.serverDown }}</p>
    <UiNote :note="actionNote" />
    <UiNote v-if="!step" :note="formNote" />
  </div>
</template>

<style scoped>
.overview { display: grid; gap: 10px; align-content: start; }

/* The project and its state: dashboard cards, the surface with a 1px edge. */
.project { display: flex; align-items: center; gap: 14px; min-height: 76px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface); }
.what { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.name { font: 700 19px/1.2 var(--display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.about { font-size: 14px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.unset { color: var(--muted); }
.name.unset { font-weight: 600; }

.doing { display: grid; gap: 10px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface); }
.doing p { font-size: 15px; line-height: 1.4; }
.dot-here { margin-right: 8px; vertical-align: 0.08em; }

/* The big action tiles: an icon, a verb, one line under it. Update is the accent one: it's the usual next step. */
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.act {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "ic verb" "hint hint";
  align-items: center;
  gap: 8px 10px;
  min-height: 108px;
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--quiet-edge);
  color: var(--text);
  text-align: left;
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.act:hover:not(:disabled) { background: var(--tile); }
.act:active:not(:disabled) { transform: translateY(1px); }
.act .ic { grid-area: ic; display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r-sm); background: var(--fill); }
.act .verb { grid-area: verb; font: 700 19px/1.15 var(--display); }
.act .hint { grid-area: hint; align-self: start; font-size: 14px; line-height: 1.35; color: var(--muted); }
/* The usual next step is the game's key: the red, white on it. */
.act.go { background: var(--accent-fill); color: var(--on-accent); box-shadow: 0 var(--lip) 0 var(--accent-lip); }
.act.go:hover:not(:disabled) { background: var(--accent-fill-hover); }
.act.go:active:not(:disabled) { transform: translateY(calc(var(--lip) - var(--lip-pressed))); box-shadow: 0 var(--lip-pressed) 0 var(--accent-lip); }
.act.go .ic { background: color-mix(in srgb, var(--on-accent) 12%, transparent); }
.act.go .hint { color: color-mix(in srgb, var(--on-accent) 88%, transparent); }

.down { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--danger); }

@media (max-width: 480px) {
  .act { min-height: 96px; padding: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .act { transition: none; }
  .act:active:not(:disabled) { transform: none; }
}
</style>
