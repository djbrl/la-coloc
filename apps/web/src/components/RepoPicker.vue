<script setup lang="ts">
// Your GitHub repos, in any window that wants one: the room's Code tab, the knock, the quest. It asks the API itself
// (GET /api/github/repos, the most recently pushed first) and says `pick` with the repo pressed. Without a list it says
// the way forward: install the App, log in with GitHub, try again. Where GitHub isn't set up at all it shows nothing,
// says `off`, and the window falls back on its paste field. The list scrolls inside itself; past 8 repos a search field
// narrows it, and there the arrow keys move and Enter picks.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ConnectedRepos, RepoChoice } from "../types";
import QuestIcon from "./lobby/tutorial/QuestIcon.vue";
import { repoWords as w } from "./repoWords";

const SEARCH_FROM = 9;

const props = defineProps<{
  // The full name of the repo that's in already, marked in the list.
  selected?: string;
  // Only public ones, for a window whose words other people read.
  publicOnly?: boolean;
  busy?: boolean;
  // Take the keyboard as soon as the list is there.
  focus?: boolean;
}>();
const emit = defineEmits<{ pick: [repo: RepoChoice]; off: [] }>();

const answer = ref<ConnectedRepos | null>(null);
const failed = ref(false);
const query = ref("");
const at = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

async function load() {
  failed.value = false;
  const res = await fetch("/api/github/repos").catch(() => null);
  if (!res?.ok) {
    // A hiccup after a list came keeps the list.
    failed.value = !answer.value;
    return;
  }
  answer.value = await res.json();
  if (answer.value?.reason === "off") emit("off");
}

// Installing the App happens on GitHub, in another tab: coming back here shows what it allowed.
onMounted(() => {
  void load();
  window.addEventListener("focus", load);
});
onBeforeUnmount(() => window.removeEventListener("focus", load));

const repos = computed(() => (answer.value?.repos ?? []).filter((r) => !props.publicOnly || !r.private));
const searching = computed(() => repos.value.length >= SEARCH_FROM);
const matches = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? repos.value.filter((r) => r.fullName.toLowerCase().includes(q)) : repos.value;
});
watch(query, () => (at.value = 0));
watch(
  () => [searching.value, repos.value.length] as const,
  async () => {
    if (!props.focus) return;
    await nextTick();
    (input.value ?? list.value?.querySelector("button"))?.focus({ preventScroll: true });
  },
);

// "owner/name": the name is what people recognise, so it comes first and bold.
const nameOf = (r: RepoChoice) => r.fullName.slice(r.fullName.indexOf("/") + 1);
const ownerOf = (r: RepoChoice) => r.fullName.slice(0, r.fullName.indexOf("/"));

function onKey(e: KeyboardEvent) {
  // Typing here must not walk the character (W A S D) or open things (E). Escape still closes the window.
  if (e.key !== "Escape") e.stopPropagation();
  const n = matches.value.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (n) at.value = (at.value + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
    nextTick(() => list.value?.querySelector(".at")?.scrollIntoView({ block: "nearest" }));
  } else if (e.key === "Enter") {
    e.preventDefault();
    const r = matches.value[at.value];
    if (r && !props.busy) emit("pick", r);
  }
}
</script>

<template>
  <div v-if="answer?.reason !== 'off'" class="picker">
    <div v-if="failed" class="way">
      <p>{{ w.down }}</p>
      <button type="button" class="key" @click="load">{{ w.tryAgain }}</button>
    </div>
    <p v-else-if="!answer" class="wait">{{ w.asking }}</p>
    <div v-else-if="answer.reason === 'no-github'" class="way">
      <p>{{ w.noGithub }}</p>
      <a class="key" href="/login">{{ w.noGithubGo }}</a>
    </div>
    <div v-else-if="answer.reason === 'not-installed'" class="way">
      <p>{{ w.install }}</p>
      <a v-if="answer.installUrl" class="key" :href="answer.installUrl" target="_blank" rel="noopener">{{ w.installGo }} <QuestIcon name="open" :size="16" /><span class="sr-only">{{ w.newTab }}</span></a>
    </div>

    <template v-else>
      <label v-if="searching" class="search">
        <QuestIcon name="search" :size="16" />
        <input ref="input" v-model="query" type="search" :placeholder="w.search" :aria-label="w.search" autocomplete="off" spellcheck="false" @keydown="onKey" />
      </label>
      <ul ref="list" class="list" :aria-label="w.label">
        <li v-for="(r, i) in matches" :key="r.id">
          <button
            type="button"
            class="tile"
            :class="{ at: searching && i === at, chosen: r.fullName === selected }"
            :disabled="busy"
            :title="r.description ?? undefined"
            :aria-current="r.fullName === selected ? 'true' : undefined"
            @mouseenter="at = i"
            @click="emit('pick', r)"
          >
            <span class="name"><strong>{{ nameOf(r) }}</strong><span class="owner">{{ ownerOf(r) }}</span></span>
            <span class="meta">
              <span v-if="r.language">{{ r.language }}</span>
              <span v-if="r.private" class="lock" :title="w.private"><QuestIcon name="lock" :size="14" /><span class="sr-only">{{ w.private }}</span></span>
              <QuestIcon v-if="r.fullName === selected" name="tick" :size="16" />
            </span>
          </button>
        </li>
      </ul>
      <p v-if="!repos.length" class="wait">{{ w.empty }}</p>
      <p v-else-if="!matches.length" class="wait">{{ w.none }}</p>
      <a v-if="answer.installUrl" class="allow" :href="answer.installUrl" target="_blank" rel="noopener">{{ w.allow }} <QuestIcon name="open" :size="14" /><span class="sr-only">{{ w.newTab }}</span></a>
    </template>
  </div>
</template>

<style scoped>
/* Flat tiles, names in the monospace, the one under the keys filled. The list scrolls inside itself, so the window around it never has to. */
.picker { display: grid; gap: 6px; min-width: 0; }
.search { display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 40px; border-radius: var(--r-md); background: var(--tile); color: var(--muted); }
.search:focus-within { box-shadow: inset 0 0 0 2px var(--accent); }
.search input { flex: 1; min-width: 0; min-height: 0; height: 100%; border: 0; padding: 0; background: none; color: var(--text); font: 600 15px/1 var(--num); outline: none; box-shadow: none; }
.list { display: grid; gap: 4px; max-height: min(264px, 38dvh); margin: 0; padding: 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; }
.list:empty { display: none; }
.tile { width: 100%; min-height: 0; height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border: 0; border-radius: var(--r-md); background: var(--tile); box-shadow: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.tile:hover:not(:disabled), .tile.at { background: var(--fill); }
.tile.chosen { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.tile:disabled { opacity: 0.6; cursor: default; }
.name { min-width: 0; display: flex; align-items: baseline; gap: 8px; overflow: hidden; white-space: nowrap; font: 600 14px/1.2 var(--num); }
.name strong { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.owner { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.meta { flex: none; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; }
.chosen .meta { color: var(--accent); }
.lock { display: inline-flex; }
.wait { margin: 0; font-size: 14px; color: var(--muted); }
.allow { justify-self: start; display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 14px; }

/* No list yet: what's missing, and the one press that gets it. */
.way { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 10px 12px; border-radius: var(--r-md); background: var(--tile); }
.way p { flex: 1 1 180px; margin: 0; font-size: 15px; line-height: 1.3; }
.key { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.key:hover { background: var(--surface); text-decoration: none; }
</style>
