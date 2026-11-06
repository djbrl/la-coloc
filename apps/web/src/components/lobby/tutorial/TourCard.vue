<script setup lang="ts">
// One card of the walkthrough, in carte blanche, at the bottom of the screen: an icon, a title, one line, and for a
// key, "Try it" with its caps, which light up as you press them. The card never takes the keyboard (Jib, 6 11: "the
// dialogue shouldn't prevent you from touching your keys"): the city keeps the keys, so you walk, dash and press ? while
// it shows, and nothing is dimmed or blocked around it except the ring on what a card talks about. Enter (or Next)
// moves on. There's no Skip on it any more: the whole quest's way out is the corner button (SkipTutorial.vue).
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Icon from "../house/Icon.vue";
import type { IconName } from "../house/icons";
import { ringAround } from "./spot";
import { keyParts, TOUR_TARGET, TOUR_TEXT } from "./tour";
import type { TourCardName } from "./tutorial";
import { tutorialWords as w } from "./words";

const props = defineProps<{ card: TourCardName; n: number; total: number; touch: boolean }>();
const emit = defineEmits<{ next: [] }>();

const text = computed(() => TOUR_TEXT[props.card]);
const parts = computed(() => keyParts((props.touch && text.value.touch) || text.value.keys));
// The line under the title says the keys as plain letters; the caps to try are on the strip under it.
const line = computed(() => parts.value.map((p) => p.text).join(""));
const caps = computed(() => (props.touch ? [] : parts.value.filter((p) => p.key).map((p) => p.text)));
const last = computed(() => props.n === props.total);

// The card's icon: the icon set's where it has one, a few drawn here in the same stroke where it doesn't.
const ICON: Partial<Record<TourCardName, IconName>> = { help: "keyboard", dash: "bolt", use: "door", map: "map", pick: "pin", chat: "chat" };
const DRAWN: Partial<Record<TourCardName, string>> = {
  walk: "M13 4.5a2 2 0 1 0 0 .01M10 21l2-6 3 3v4M8 12l3-4 3 2 3 1M12 8l-1 6",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M16 16l4.5 4.5",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
};

// The caps you've pressed light up, one by one: proof the keys are yours while the card is there.
const lit = reactive(new Set<string>());
watch(() => props.card, () => lit.clear());
function matches(cap: string, e: KeyboardEvent) {
  if (/^(shift|maj)$/i.test(cap)) return e.key === "Shift";
  return e.key.toLowerCase() === cap.toLowerCase();
}

// Where the ring goes: the thing's place on screen, a little bigger than it (spot.ts, like the spotlight's hole).
const ring = ref<{ left: string; top: string; width: string; height: string } | null>(null);
function measure() {
  const selector = TOUR_TARGET[props.card];
  const box = selector ? document.querySelector(selector)?.getBoundingClientRect() : null;
  const r = box?.width ? ringAround(box) : null;
  ring.value = r ? { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` } : null;
}

const root = ref<HTMLElement | null>(null);
// The pieces around the card may still be popping in when it opens: measure again once they've landed.
let again = 0;
async function settle() {
  await nextTick();
  measure();
  clearTimeout(again);
  again = window.setTimeout(measure, 350);
}
watch(() => props.card, settle);

// Before the city hears it: a key the card shows lights its cap (and still reaches the city), and Enter moves on,
// unless the focus is on some other button, which Enter presses as usual.
function onKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  for (const cap of caps.value) if (matches(cap, e)) lit.add(cap);
  if (e.key !== "Enter" || e.repeat) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (el?.closest?.("button, a, [role='button']") && !root.value?.contains(el)) return;
  e.preventDefault();
  e.stopPropagation();
  emit("next");
}
onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", measure);
  void settle();
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", measure);
  clearTimeout(again);
});
</script>

<template>
  <Teleport to="body">
    <div class="tour">
      <span v-if="ring" class="spot" :style="ring" aria-hidden="true" />
      <section ref="root" class="card sign" role="region" aria-live="polite" aria-labelledby="tour-title" aria-describedby="tour-line">
        <div class="sign-frame">
          <header class="sign-band">
            <span class="chip">
              <Icon v-if="ICON[card]" :name="ICON[card]!" :size="22" />
              <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="DRAWN[card]" /></svg>
            </span>
            <h2 id="tour-title">{{ text.title }}</h2>
            <p id="tour-line" class="sign-sub lines">{{ line }}</p>
          </header>
          <div class="sign-body body">
            <!-- "Try it": the caps light up as you press them; the city has the keys, so it really works. -->
            <p v-if="caps.length" class="try" aria-hidden="true">
              <span class="label">{{ w.tryIt }}</span>
              <span class="caps"><kbd v-for="c in caps" :key="c" :class="{ on: lit.has(c) }">{{ c }}</kbd></span>
            </p>
            <div class="nav">
              <span class="dots" role="img" :aria-label="w.stepOf(n, total)"><i v-for="i in total" :key="i" :class="{ on: i === n }" /></span>
              <button type="button" class="primary go" @click="emit('next')">{{ last ? w.gotIt : w.next }}<kbd v-if="!touch" aria-hidden="true">↵</kbd></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* Above everything, but in the way of nothing: clicks and keys go through to the city around the card. */
.tour { position: fixed; inset: 0; z-index: 900; display: grid; justify-items: center; align-items: end; padding: 16px 16px 24px; overflow: hidden; pointer-events: none; }
/* The hole in the dark around what a card points at, with the sticker's yellow at its edge. */
.spot { position: fixed; border-radius: 12px; box-shadow: 0 0 0 3px var(--sticker), 0 0 0 100vmax rgba(24, 12, 22, 0.35); transition: left var(--dur-slow) var(--ease), top var(--dur-slow) var(--ease), width var(--dur-slow) var(--ease), height var(--dur-slow) var(--ease); }
.card { position: relative; width: min(480px, 100%); pointer-events: auto; animation: rise var(--dur-slow) var(--ease-pop); }
@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
}
.sign-sub.lines { white-space: normal; }
.body { display: grid; gap: 14px; }
/* The strip: "Try it" and the caps, raised like keys; a pressed one turns to ink. */
.try { display: flex; align-items: center; gap: 12px; margin: 0; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.caps { display: flex; flex-wrap: wrap; gap: 6px; }
.caps kbd { min-width: 32px; height: 32px; padding: 0 8px 3px; border-radius: 8px; background: var(--surface); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 14px; transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease); }
.caps kbd.on { background: var(--text); color: var(--surface); box-shadow: inset 0 -3px 0 #000000; }
.nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.dots { display: flex; gap: 6px; }
.dots i { width: 8px; height: 8px; border-radius: 4px; background: var(--line); }
.dots i.on { width: 18px; background: var(--text); }
.go { min-width: 160px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
@media (prefers-reduced-motion: reduce) {
  .spot { transition: none; }
  .card { animation: none; }
}
</style>
