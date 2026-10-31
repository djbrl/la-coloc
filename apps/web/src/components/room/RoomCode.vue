<script setup lang="ts">
// The room's Code tab: where the code comes from and how it starts, as four short rows, and a flow that asks for
// them one at a time (the repo, the branch and folder, the port), then shows what will be saved.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import Icon from "../lobby/house/Icon.vue";
import UiNote, { type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import type { RoomManage } from "../../types";
import { codeRows, draftRows, parsePort, type SettingsForm } from "./room";
import { roomWords as w } from "./words";

const props = defineProps<{
  data: RoomManage;
  form: SettingsForm;
  saving: boolean;
  formNote: Note | null;
  save: () => Promise<boolean>;
  reset: () => void;
}>();

const rows = computed(() => codeRows(props.data.settings, props.data.github));
const draft = computed(() => draftRows(props.form, props.data.github));

// With GitHub linked the repo comes from the app, so there's no repo question.
type Question = "repo" | "where" | "port" | "review";
const questions = computed<Question[]>(() => (props.data.github ? ["where", "port", "review"] : ["repo", "where", "port", "review"]));
const step = ref(0);
const question = computed(() => questions.value[step.value - 1]);
const portError = ref("");
const editButton = ref<HTMLButtonElement | null>(null);

function startEdit() {
  portError.value = "";
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

function next() {
  if (question.value === "port" && !parsePort(props.form.port).ok) {
    portError.value = w.portRange;
    return;
  }
  step.value++;
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
  <div class="code">
    <template v-if="!step">
      <dl class="facts">
        <div v-for="r in rows" :key="r.term" class="fact">
          <dt>{{ r.term }}</dt>
          <dd :class="{ unset: r.unset }">
            <a v-if="r.href" :href="r.href" target="_blank" rel="noopener" class="mono">{{ r.value }}<span class="sr-only">{{ w.newTab }}</span></a>
            <span v-else :class="{ mono: !r.unset }">{{ r.value }}</span>
          </dd>
        </div>
      </dl>
      <p class="aside">
        <template v-if="data.github">
          {{ w.mergeUpdates }}<template v-if="data.house.strictReviews">{{ w.onceApproved }}</template>.
        </template>
        <template v-else>{{ w.dockerAside }} <code>PORT</code>.</template>
      </p>
      <div class="bar">
        <button ref="editButton" type="button" class="chunk" :aria-label="w.editCode" @click="startEdit">
          <Icon name="edit" :size="16" /> {{ w.edit }}
        </button>
      </div>
      <UiNote :note="formNote" />
    </template>

    <div v-else class="flow">
      <UiSteps :step="step" :total="questions.length" focus-on-mount>
        <form v-if="question === 'repo'" novalidate @submit.prevent="next">
          <h3>{{ w.whereCode }}</h3>
          <p class="hint">{{ w.whereHint }}</p>
          <input
            v-model="form.source"
            data-autofocus
            type="url"
            inputmode="url"
            placeholder="https://github.com/you/your-app.git"
            :aria-label="w.repoLink"
            autocapitalize="off"
            spellcheck="false"
          />
          <div class="flow-nav">
            <button type="button" class="chunk" @click="cancel">{{ w.cancel }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>

        <form v-else-if="question === 'where'" novalidate @submit.prevent="next">
          <h3>{{ w.branchFolder }}</h3>
          <p class="hint">{{ w.branchFolderHint }}</p>
          <div class="pair">
            <input
              v-model="form.branch"
              data-autofocus
              :placeholder="data.github ? w.defaultBranchShort : 'main'"
              :aria-label="w.branch"
              autocapitalize="off"
              spellcheck="false"
            />
            <input v-model="form.buildPath" :placeholder="w.folderPlaceholder" :aria-label="w.folderName" autocapitalize="off" spellcheck="false" />
          </div>
          <div class="flow-nav">
            <button v-if="step > 1" type="button" class="chunk" @click="step--"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button v-else type="button" class="chunk" @click="cancel">{{ w.cancel }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>

        <form v-else-if="question === 'port'" novalidate @submit.prevent="next">
          <h3>{{ w.portQuestion }}</h3>
          <p class="hint">{{ w.portHint }} <code>PORT</code>.</p>
          <input
            v-model="form.port"
            data-autofocus
            inputmode="numeric"
            placeholder="3000"
            :aria-label="w.port"
            :aria-invalid="!!portError"
            @input="portError = ''"
          />
          <p v-if="portError" class="error small" role="alert">{{ portError }}</p>
          <div class="flow-nav">
            <button type="button" class="chunk" @click="step--"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>

        <form v-else novalidate @submit.prevent="finish">
          <h3>{{ w.saveThese }}</h3>
          <dl class="facts tight">
            <div v-for="r in draft" :key="r.term" class="fact">
              <dt>{{ r.term }}</dt>
              <dd :class="{ unset: r.unset, mono: !r.unset }">{{ r.value }}</dd>
            </div>
          </dl>
          <p class="hint">{{ w.appliesNext }}</p>
          <UiNote :note="formNote?.error ? formNote : null" />
          <div class="flow-nav">
            <button type="button" class="chunk" @click="step--"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button class="primary next" :disabled="saving">{{ saving ? w.saving : w.save }}</button>
          </div>
        </form>
      </UiSteps>
    </div>
  </div>
</template>

<style scoped>
.code { display: grid; gap: 10px; align-content: start; }
/* Four short rows, each its own little tile: the name on the left, the value on the right. */
.facts { display: grid; gap: 6px; margin: 0; }
/* Dense dashboard rows: the surface with a 1px edge, the value in the monospace when it's technical. */
.fact { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; padding: 0 14px; border-radius: var(--r-md); background: var(--surface); }
.flow .fact { background: var(--surface); }
.facts.tight .fact { min-height: 38px; }
dt { flex: none; font-size: 14px; font-weight: 600; color: var(--muted); }
dd { margin: 0; min-width: 0; font-size: 15px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
dd a { color: var(--accent); }
dd.unset { color: var(--muted); }
.aside { font-size: 14px; color: var(--muted); }
.bar { display: flex; gap: 8px; }
</style>
