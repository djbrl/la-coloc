<script setup lang="ts">
// The city's four missions, a small flat checklist under the search once you've arrived (LobbyView.vue decides when,
// and notices them happen; missions.ts has the rules). It folds to one key showing "1/4" and remembers that. When the
// last one is ticked it says well done for a moment, then it's gone for good. A row you can act on says where to go.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { settings } from "../../settings";
import { allDone, MISSIONS, type MissionId, missionCount } from "./missions";
import Icon from "./house/Icon.vue";
import { missionWords as w } from "./words";

const emit = defineEmits<{ go: [id: MissionId] }>();

const complete = computed(() => allDone(settings.missions));
const count = computed(() => missionCount(settings.missions));
const isDone = (id: MissionId) => settings.missions.done.includes(id);

// Well done: a moment on screen, then never again. It only starts while it's showing (the last mission may be ticked
// behind a window), and starts over if a window opens on it.
const WELL_DONE_MS = 4000;
let timer = 0;
watch(
  complete,
  (now) => {
    if (now) timer = window.setTimeout(() => (settings.missions.finished = true), WELL_DONE_MS);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

const root = ref<HTMLElement | null>(null);
// By mouse, the keys go back to the city; by keyboard, the focus stays on the key that took the other's place.
async function fold(collapsed: boolean, e: MouseEvent) {
  settings.missions.collapsed = collapsed;
  await nextTick();
  if (e.detail === 0) root.value?.querySelector<HTMLElement>("[data-fold]")?.focus();
}

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div ref="root" class="missions" @keydown="onKey">
    <section v-if="complete" class="card done-card" role="status">
      <span class="box ticked" aria-hidden="true"><Icon name="tick" :size="16" /></span>
      <p>{{ w.wellDone }}</p>
    </section>
    <button v-else-if="settings.missions.collapsed" data-fold type="button" class="key" :aria-label="w.openName(count)" :title="w.title" aria-expanded="false" @click="fold(false, $event)">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 7l2 2 3-4M5 16l2 2 3-4M14 8h6M14 17h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span>{{ count }}</span>
    </button>
    <section v-else class="card" :aria-label="w.title">
      <header>
        <h2>{{ w.title }}</h2>
        <button data-fold type="button" class="fold" :aria-label="w.foldName" aria-expanded="true" @click="fold(true, $event)">
          <span class="count">{{ count }}</span>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </header>
      <ul>
        <li v-for="id in MISSIONS" :key="id">
          <!-- Done: a plain row with its tick. To do: the row takes you there. -->
          <p v-if="isDone(id)" class="row done">
            <span class="box ticked" aria-hidden="true"><Icon name="tick" :size="16" /></span>
            <span>{{ w.rows[id] }}<span class="sr-only"> {{ w.doneName }}</span></span>
          </p>
          <button v-else type="button" class="row" @click="emit('go', id)">
            <span class="box" aria-hidden="true" />
            <span>{{ w.rows[id] }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.card { width: 290px; max-width: 100%; display: grid; gap: 4px; padding: 10px 10px 8px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--lift); }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 4px; }
h2 { font-size: 16px; line-height: 1.1; }
.fold { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 6px; background: none; color: var(--text); font: 800 15px/1 var(--num); font-variant-numeric: tabular-nums; }
.fold:hover:not(:disabled) { background: var(--tile); }
ul { list-style: none; margin: 0; padding: 0; display: grid; }
.row { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 40px; margin: 0; padding: 4px; border-radius: var(--r-sm); background: none; color: var(--text); font: 600 15px/1.2 var(--font); text-align: left; }
button.row:hover:not(:disabled) { background: var(--tile); }
.row.done { color: var(--muted); }
/* The tick box: an empty square of ink, or the live green with its tick. */
.box { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; box-shadow: inset 0 0 0 2px var(--text); }
.box.ticked { background: var(--live); color: var(--on-accent); box-shadow: none; }
.done-card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; animation: missions-pop var(--dur-slow) var(--ease-pop); }
.done-card p { margin: 0; font: 400 16px/1.2 var(--display); text-transform: uppercase; }
@keyframes missions-pop {
  from { transform: scale(0.94); }
}
/* Folded: one small key, the HUD's white with its lip. */
.key { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; background: var(--surface); color: var(--text); box-shadow: var(--lift); font: 800 16px/1 var(--num); font-variant-numeric: tabular-nums; }
.key:hover:not(:disabled) { background: var(--tile); }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .done-card { animation: none; }
}
@media (max-width: 520px) {
  .card { width: 272px; }
  .row { font-size: 14px; }
}
</style>
