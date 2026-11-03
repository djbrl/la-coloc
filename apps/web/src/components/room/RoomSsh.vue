<script setup lang="ts">
// The room's SSH tab: the one line to type, and your keys. Your keys are yours, not the room's: they open every room you
// live or work in. A GitHub account starts with the keys GitHub already has, the first time this tab opens, and never
// again on its own: a key someone removed stays removed.
import { computed, onMounted, ref } from "vue";
import { sendJSON } from "../../session";
import type { RoomManage } from "../../types";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import UiNote, { loud, quiet, type Note } from "../UiNote.vue";
import { sshLine } from "./room";
import { roomWords as w } from "./words";

const props = defineProps<{ data: RoomManage }>();

interface Key {
  id: string;
  fingerprint: string;
  type: string;
  fromGithub: boolean;
}

const API = "/api/me/ssh-keys";
const keys = ref<Key[] | null>(null);
const github = ref(false);
const busy = ref(false);
const note = ref<Note | null>(null);
const pasted = ref("");
const copied = ref(false);

const line = computed(() => sshLine(props.data.ssh!));
const running = computed(() => props.data.room.status === "live");

async function copy() {
  await navigator.clipboard.writeText(line.value).catch(() => undefined);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

// Short enough for a row: the type's last word and the start of the fingerprint, as `ssh-keygen -l` would show it.
const short = (k: Key) => `${k.type.replace(/^ssh-/, "")} ${k.fingerprint.slice(0, 19)}…`;

async function useGithub() {
  busy.value = true;
  note.value = null;
  const res = await sendJSON<{ keys: Key[]; found: number }>("POST", `${API}/github`, {});
  busy.value = false;
  if (!res.ok) note.value = loud(res.message);
  else {
    keys.value = res.data.keys;
    if (!res.data.found) note.value = quiet(w.ssh.noGithubKeys);
  }
}

async function add() {
  if (!pasted.value.trim() || busy.value) return;
  busy.value = true;
  note.value = null;
  const res = await sendJSON<{ keys: Key[] }>("POST", API, { key: pasted.value });
  busy.value = false;
  if (!res.ok) note.value = loud(res.message);
  else {
    keys.value = res.data.keys;
    pasted.value = "";
  }
}

async function remove(k: Key) {
  busy.value = true;
  note.value = null;
  const res = await sendJSON<{ keys: Key[] }>("DELETE", `${API}/${k.id}`);
  busy.value = false;
  if (!res.ok) note.value = loud(res.message);
  else keys.value = res.data.keys;
}

onMounted(async () => {
  const res = await fetch(API).catch(() => null);
  if (!res?.ok) return;
  const body = (await res.json()) as { keys: Key[]; github: boolean; fetchFromGithub: boolean };
  keys.value = body.keys;
  github.value = body.github;
  if (body.fetchFromGithub) await useGithub();
});
</script>

<template>
  <div class="ssh">
    <div class="line">
      <code>{{ line }}</code>
      <button type="button" class="chunk small" @click="copy"><Icon :name="copied ? 'tick' : 'copy'" :size="18" />{{ copied ? w.ssh.copied : w.ssh.copy }}</button>
    </div>
    <p class="soft small">{{ running ? w.ssh.limits : w.ssh.notRunning }}</p>

    <h3>{{ w.ssh.keys }}</h3>
    <ul v-if="keys?.length" class="keys">
      <ListRow v-for="k in keys" :key="k.id" :title="short(k)" :sub="k.fromGithub ? w.ssh.fromGithub : undefined">
        <template #lead><Icon name="key" :size="22" /></template>
        <template #end>
          <button type="button" class="chunk small" :disabled="busy" :aria-label="w.ssh.remove(k.fingerprint)" @click="remove(k)"><Icon name="trash" :size="18" /></button>
        </template>
      </ListRow>
    </ul>
    <p v-else-if="keys" class="soft small">{{ w.ssh.noKeys }}</p>

    <form class="paste" @submit.prevent="add">
      <input v-model="pasted" type="text" spellcheck="false" autocomplete="off" :placeholder="w.ssh.paste" :aria-label="w.ssh.paste" />
      <button type="submit" class="chunk small" :disabled="busy || !pasted.trim()">{{ w.ssh.add }}</button>
    </form>
    <button v-if="github" type="button" class="chunk small github" :disabled="busy" @click="useGithub">{{ w.ssh.useGithub }}</button>
    <UiNote :note="note" />
  </div>
</template>

<style scoped>
.ssh { display: grid; gap: 10px; align-content: start; }
.line { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-radius: var(--r-md); background: var(--ink); color: var(--on-panel); }
.line code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 14px; line-height: 1.35; }
.line button { flex: none; background: var(--surface); color: var(--ink); }
h3 { margin: 8px 0 0; font-size: 16px; }
.keys { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.paste { display: flex; gap: 8px; }
.paste input { flex: 1; min-width: 0; }
.github { justify-self: start; }
</style>
