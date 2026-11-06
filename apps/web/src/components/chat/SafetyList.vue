<script setup lang="ts">
// Settings' list of everyone you blocked or muted, and the group chats you muted: one dense row each (a face or the
// chat's icon, the name, a word saying which), with its way back (Unblock, Unmute) as a quiet grey key. Blocking and
// muting happen in a conversation's "…" (ChatOptions.vue); this is where you find them all again.
import { computed, onMounted, ref } from "vue";
import { loadSafety, safety, unblock, unmute } from "../../conversations";
import type { MutedGroup, Person } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import { chatWords as w } from "./words";

onMounted(() => void loadSafety());

const busy = ref("");
const error = ref("");
const nameOf = (p: Person) => p.name ?? p.login;
const groupName = (g: MutedGroup) => w.place[g.place](g.name);

// One list: the blocked first, then muted people, then muted chats.
const rows = computed(() => [
  ...safety.blocked.map((p) => ({ key: `b:${p.login}`, person: p, group: null, what: "blocked" as const })),
  ...safety.muted.map((p) => ({ key: `m:${p.login}`, person: p, group: null, what: "muted" as const })),
  ...safety.groups.map((g) => ({ key: `g:${g.channel}`, person: null, group: g, what: "muted" as const })),
]);

async function undo(row: (typeof rows.value)[number]) {
  if (busy.value) return;
  busy.value = row.key;
  error.value = "";
  const sent = row.person ? (row.what === "blocked" ? await unblock(row.person.login) : await unmute({ login: row.person.login })) : await unmute({ channel: row.group!.channel });
  busy.value = "";
  if (!sent.ok) error.value = sent.message;
}
</script>

<template>
  <div class="safety">
    <p v-if="!rows.length" class="empty">{{ w.safetyEmpty }}</p>
    <ul v-else class="rows">
      <ListRow v-for="r in rows" :key="r.key" :title="r.person ? nameOf(r.person) : groupName(r.group!)" :sub="r.what === 'blocked' ? w.blockedWord : w.muted">
        <template #lead>
          <Avatar v-if="r.person" :person="r.person" :size="36" decorative />
          <span v-else class="group-tile"><Icon :name="r.group!.place === 'house' ? 'house' : 'chat'" :size="18" /></span>
        </template>
        <template #end>
          <button type="button" class="undo" :disabled="busy === r.key" :aria-label="`${r.what === 'blocked' ? w.unblock : w.unmute}: ${r.person ? nameOf(r.person) : groupName(r.group!)}`" @click="undo(r)">
            {{ r.what === "blocked" ? w.unblock : w.unmute }}
          </button>
        </template>
      </ListRow>
    </ul>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.safety { display: grid; gap: 8px; padding: 6px 12px; border-radius: var(--tile-r); background: var(--tile); }
.empty { margin: 0; padding: 10px 0; font-size: 14px; font-weight: 600; color: var(--muted); text-align: center; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; max-height: 228px; overflow-y: auto; overscroll-behavior: contain; }
.rows :deep(.list-row) { min-height: 52px; }
.rows :deep(.list-row:hover), .rows :deep(.list-row:focus-within) { background: none; box-shadow: none; }
.group-tile { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--surface); color: var(--text); }
/* The way back: a quiet grey key. */
.safety .undo { flex: none; min-height: 40px; padding: 0 14px var(--lip); border-radius: 10px; background: var(--fill); color: var(--text); box-shadow: var(--quiet-edge); font: 800 14px/1 var(--font); white-space: nowrap; }
.safety .undo:hover:not(:disabled) { background: var(--fill-hover); }
.error { margin: 0; font-size: 14px; color: var(--danger); }
</style>
