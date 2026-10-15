<script setup lang="ts">
// Chapter 4's repo picker: the repos you let La Coloc see on GitHub, the most recently pushed first. Five at a time
// so the card never scrolls; typing narrows them down. Arrow keys move, Enter brings the highlighted one in.
import { computed, onMounted, ref, watch } from "vue";
import type { RepoChoice } from "../../../types";
import QuestIcon from "./QuestIcon.vue";
import { tutorialWords as w } from "./words";

const SHOWN = 5;

const props = defineProps<{ repos: RepoChoice[]; chosen: number | null; busy: boolean }>();
const emit = defineEmits<{ pick: [id: number] }>();

const query = ref("");
const at = ref(0);
const input = ref<HTMLInputElement | null>(null);

const matches = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? props.repos.filter((r) => r.fullName.toLowerCase().includes(q)) : props.repos;
});
const shown = computed(() => matches.value.slice(0, SHOWN));
const more = computed(() => matches.value.length - shown.value.length);
watch(query, () => (at.value = 0));

// "owner/name": the name is what people recognise, so it comes first and bold.
const parts = (r: RepoChoice) => {
  const [owner, ...rest] = r.fullName.split("/");
  return { owner, name: rest.join("/") };
};

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    const n = shown.value.length;
    if (n) at.value = (at.value + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const r = shown.value[at.value];
    if (r && !props.busy) emit("pick", r.id);
  } else {
    // Typing in the search box must not walk the character (W A S D) or open things (E).
    e.stopPropagation();
  }
}

onMounted(() => input.value?.focus({ preventScroll: true }));
</script>

<template>
  <div class="picker">
    <label class="search">
      <QuestIcon name="search" :size="16" />
      <input ref="input" v-model="query" type="search" :placeholder="w.pickSearch" :aria-label="w.pickSearch" autocomplete="off" spellcheck="false" @keydown="onKey" />
    </label>
    <ul class="list" role="listbox" :aria-label="w.pickTitle">
      <li v-for="(r, i) in shown" :key="r.id" role="option" :aria-selected="i === at">
        <button type="button" class="row" :class="{ at: i === at, chosen: r.id === chosen }" :disabled="busy" @mouseenter="at = i" @click="emit('pick', r.id)">
          <span class="name"><strong>{{ parts(r).name }}</strong><span class="owner">{{ parts(r).owner }}</span></span>
          <span class="meta">
            <span v-if="r.language" class="lang">{{ r.language }}</span>
            <span v-if="r.private" class="lock" :title="w.pickPrivate"><QuestIcon name="lock" :size="14" /><span class="sr-only">{{ w.pickPrivate }}</span></span>
            <QuestIcon v-if="r.id === chosen" name="tick" :size="16" />
          </span>
        </button>
      </li>
    </ul>
    <p v-if="!matches.length" class="hint">{{ w.pickNone }}</p>
    <p v-else-if="more > 0" class="hint">{{ w.pickMore(more) }}</p>
  </div>
</template>

<style scoped>
/* Dev-tool calm: a search box and dense rows, names in the monospace, the highlighted row in the accent's edge. */
.picker { display: grid; gap: 6px; margin-top: 4px; }
.search { display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 38px; border-radius: var(--r-md); background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
.search:focus-within { box-shadow: inset 0 0 0 2px var(--accent); }
.search input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0; background: none; color: var(--text); font: 500 15px/1 var(--mono); outline: none; box-shadow: none; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.row { width: 100%; min-height: 0; height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px; border: 0; border-radius: var(--r-sm); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.row.at { background: var(--fill); box-shadow: inset 2px 0 0 var(--accent); }
.row:disabled { opacity: 0.6; cursor: default; }
.name { min-width: 0; display: flex; align-items: baseline; gap: 8px; overflow: hidden; white-space: nowrap; font: 500 14px/1 var(--mono); }
.name strong { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.owner { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.meta { flex: none; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.chosen .meta { color: var(--accent); }
.lock { display: inline-flex; }
.hint { margin: 0; font-size: 13px; color: var(--muted); }
</style>
