<script setup lang="ts">
// The room's Secrets tab: one row per secret, by name only (values are never shown again), and a three-step flow
// to add one: its name, its value, then a last look. While adding, the flow takes the list's place, so it fits. With
// none yet, one soft tile says so, with the key to add one in it.
import { computed, nextTick, reactive, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import UiNote, { loud, quiet, type Note } from "../UiNote.vue";
import UiSteps from "../UiSteps.vue";
import { sendJSON } from "../../session";
import type { RoomManage } from "../../types";
import { secretName as normalise, secretNameOk } from "./room";
import { roomWords as w } from "./words";

// `flow`: adding a secret, whose steps have their own main button: the panel's foot steps aside meanwhile.
const emit = defineEmits<{ flow: [on: boolean] }>();
const props = defineProps<{
  data: RoomManage;
  // The room's API address: {base}/secrets/:name.
  base: string;
  // Fetches the room again after a change.
  reload: () => Promise<void>;
  when: (iso: string) => string;
}>();

const root = ref<HTMLElement | null>(null);
const secret = reactive({ name: "", value: "" });
const secretNote = ref<Note | null>(null);
const secretStep = ref(0);
watch(secretStep, (s) => emit("flow", s > 0));
const secretError = ref("");
const savingSecret = ref(false);
const addButton = ref<HTMLButtonElement | null>(null);
const secretName = computed(() => normalise(secret.name));
const replacing = computed(() => props.data.secrets.some((s) => s.name === secretName.value));

function startSecret() {
  secret.name = "";
  secret.value = "";
  secretError.value = "";
  secretNote.value = null;
  confirming.value = null;
  secretStep.value = 1;
}

async function endSecret() {
  secretStep.value = 0;
  await nextTick();
  addButton.value?.focus();
}

function secretNext() {
  secretError.value = "";
  if (secretStep.value === 1 && !secretNameOk(secretName.value)) {
    secretError.value = w.badName;
    return;
  }
  if (secretStep.value === 2 && !secret.value) {
    secretError.value = w.enterValue;
    return;
  }
  secretStep.value++;
}

function secretBack() {
  secretError.value = "";
  secretStep.value--;
}

async function saveSecret() {
  secretError.value = "";
  const name = secretName.value;
  savingSecret.value = true;
  const res = await sendJSON("PUT", `${props.base}/secrets/${name}`, { value: secret.value });
  savingSecret.value = false;
  if (!res.ok) {
    secretError.value = res.message;
    return;
  }
  secret.name = "";
  secret.value = "";
  secretNote.value = quiet(w.secretSaved(name));
  await props.reload();
  await endSecret();
}

// Removing asks once more, in the row itself. Focus follows the question so the keyboard never gets lost.
const confirming = ref<string | null>(null);
const rowButton = (name: string, which: "remove" | "keep") =>
  root.value?.querySelector<HTMLButtonElement>(`[data-secret="${name}"][data-act="${which}"]`);

async function ask(name: string) {
  confirming.value = name;
  await nextTick();
  rowButton(name, "keep")?.focus();
}

async function keep(name: string) {
  confirming.value = null;
  await nextTick();
  rowButton(name, "remove")?.focus();
}

async function deleteSecret(name: string) {
  confirming.value = null;
  const res = await sendJSON("DELETE", `${props.base}/secrets/${name}`);
  secretNote.value = res.ok ? quiet(w.secretRemoved(name)) : loud(res.message);
  await props.reload();
  await nextTick();
  addButton.value?.focus();
}
</script>

<template>
  <div ref="root" class="secrets">
    <p v-if="!data.secretsEnabled" class="info-note"><Icon name="warn" :size="16" /><span>{{ w.secretsOff }}</span></p>

    <template v-if="!secretStep">
      <template v-if="data.secrets.length">
        <!-- Add sits above the list, so it's in view however many secrets there are. -->
        <div class="bar">
          <button ref="addButton" type="button" class="chunk small" :disabled="!data.secretsEnabled" @click="startSecret">
            <Icon name="plus" :size="16" /> {{ w.addSecret }}
          </button>
        </div>
        <UiNote :note="secretNote" />
        <ul class="row-list">
          <ListRow v-for="s in data.secrets" :key="s.name" :title="s.name" class="secret">
            <template #lead><span class="lock"><Icon name="lock" :size="18" /></span></template>
            <span class="sub" :class="{ asking: confirming === s.name }">{{ confirming === s.name ? w.removeAsk : w.setAt(when(s.updatedAt)) }}</span>
            <template #end>
              <template v-if="confirming === s.name">
                <button type="button" class="chunk small danger" :data-secret="s.name" data-act="confirm" @click="deleteSecret(s.name)">{{ w.remove }}</button>
                <button type="button" class="chunk small" :data-secret="s.name" data-act="keep" @click="keep(s.name)">{{ w.keep }}</button>
              </template>
              <button v-else type="button" class="chunk small" :data-secret="s.name" data-act="remove" :aria-label="w.removeName(s.name)" @click="ask(s.name)">
                {{ w.remove }}
              </button>
            </template>
          </ListRow>
        </ul>
      </template>
      <template v-else>
        <UiNote :note="secretNote" />
        <div class="none-yet">
          <span class="none-icon" aria-hidden="true"><Icon name="key" :size="20" /></span>
          <strong>{{ w.noSecrets }}</strong>
          <button ref="addButton" type="button" class="chunk small" :disabled="!data.secretsEnabled" @click="startSecret">
            <Icon name="plus" :size="16" /> {{ w.addSecret }}
          </button>
        </div>
      </template>
      <p class="info-note"><Icon name="info" :size="16" /><span>{{ w.valueHint }}</span></p>
    </template>

    <div v-else class="flow">
      <UiSteps :step="secretStep" :total="3" focus-on-mount>
        <form v-if="secretStep === 1" novalidate @submit.prevent="secretNext">
          <h3>{{ w.whatCalled }}</h3>
          <p class="hint">{{ w.secretNameHint }}</p>
          <input
            v-model="secret.name"
            data-autofocus
            placeholder="WAVE_API_KEY"
            :aria-label="w.secretName"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            :aria-invalid="!!secretError"
            class="caps mono"
            @input="secretError = ''"
          />
          <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
          <div class="flow-nav">
            <button type="button" class="chunk" @click="endSecret">{{ w.cancel }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>

        <form v-else-if="secretStep === 2" novalidate @submit.prevent="secretNext">
          <h3>{{ w.pasteValue }}</h3>
          <p class="hint">{{ w.valueHint }}</p>
          <input
            v-model="secret.value"
            data-autofocus
            type="password"
            :placeholder="w.value"
            :aria-label="w.valueOf(secretName)"
            autocomplete="new-password"
            :aria-invalid="!!secretError"
            @input="secretError = ''"
          />
          <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
          <div class="flow-nav">
            <button type="button" class="chunk" @click="secretBack"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button class="primary next">{{ w.next }}</button>
          </div>
        </form>

        <form v-else @submit.prevent="saveSecret">
          <h3>{{ w.saveSecretBefore }} <span class="mono">{{ secretName }}</span>{{ w.saveSecretAfter }}</h3>
          <p class="hint"><template v-if="replacing">{{ w.replaces }}</template>{{ w.seesNext }}</p>
          <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
          <div class="flow-nav">
            <button type="button" class="chunk" @click="secretBack"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            <button class="primary next" :disabled="savingSecret || !data.secretsEnabled">{{ savingSecret ? w.saving : w.saveSecret }}</button>
          </div>
        </form>
      </UiSteps>
    </div>
  </div>
</template>

<style scoped>
.secrets { display: grid; gap: 16px; align-content: start; }
.secret :deep(.title) { font-family: var(--code); font-size: 14px; font-weight: 500; }
.lock { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--tile); color: var(--muted); }
.asking { color: var(--danger) !important; }
.bar { display: flex; gap: 8px; }
/* The note line keeps its live region in the page, but takes no room (nor the gap after it) until it says something. */
.secrets :deep(.note-line) { min-height: 0; }
.secrets :deep(.note-line:empty) { margin-bottom: -16px; }
</style>
