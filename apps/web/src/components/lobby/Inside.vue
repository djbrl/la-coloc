<script setup lang="ts">
// Going inside without leaving the lobby: a house page, a knock's thread or a room, shown as a flat panel docked
// on the right of the 3D city, so the camera can keep your character in view on the left (a bottom sheet on a
// phone). The panel keeps its own back-stack, so a link from one page to another opens on top and Back returns.
// It never touches the router: the list view keeps the real pages, this only shows them.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ApplicationPage from "../../pages/ApplicationPage.vue";
import HouseInside from "./HouseInside.vue";
import RoomPage from "../../pages/RoomPage.vue";
import { type Place, placeFromPath, placeKey } from "./place";
import { hudWords as w } from "./words";

const props = defineProps<{
  start: Place;
  // The tutorial asks a house's view for the window's rundown (HouseInside, house/Rundown.vue).
  rundown?: boolean;
  // The tutorial's coach is up, with its own main action: a room's page then keeps its own buttons quieter.
  coached?: boolean;
}>();
const emit = defineEmits<{
  change: [top: Place | null];
  close: [];
  // An outside link in the panel was clicked (the browser still follows it): its full address.
  link: [url: string];
  // The rundown ended (Got it, or Escape).
  rundownDone: [];
}>();

const sheet = ref<HTMLElement | null>(null);
const stack = ref<Place[]>([props.start]);
const top = computed(() => stack.value[stack.value.length - 1] ?? null);
const topKey = computed(() => (top.value ? placeKey(top.value) : ""));
// The page tells us what it's called once it has loaded; until then a plain fallback.
const label = ref("");

// The same place as the one under us means "go back", not "open it again on top".
function go(place: Place) {
  const key = placeKey(place);
  if (key === topKey.value) return;
  const under = stack.value[stack.value.length - 2];
  if (under && placeKey(under) === key) back();
  else stack.value = [...stack.value, place];
}

function back() {
  stack.value = stack.value.slice(0, -1);
}

function closeAll() {
  stack.value = [];
}

// The rundown runs once per panel: going to a room and back to the house doesn't start it over.
const rundownSeen = ref(false);
function rundownEnded() {
  rundownSeen.value = true;
  emit("rundownDone");
}

watch(topKey, (now) => {
  label.value = "";
  emit("change", top.value);
  if (!now) emit("close");
});

// Focus moves into the sheet when it opens, and back to its top after each change of page, so a reader starts
// from the sheet's name and Tab moves through the new page.
onMounted(() => {
  sheet.value?.focus({ preventScroll: true });
  window.addEventListener("keydown", onWindowKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

// Focus can fall out of the sheet (a button you pressed disappears, a click on the scrim's edge): Escape must still
// work then. Keys inside the sheet never get here; they stop at it.
function onWindowKey(e: KeyboardEvent) {
  const t = e.target as Element | null;
  if (e.key !== "Escape" || t?.closest?.("dialog[open], input, textarea")) return;
  if (sheet.value && t && sheet.value.contains(t)) return;
  e.preventDefault();
  back();
}
watch(topKey, async (now) => {
  if (!now) return;
  await nextTick();
  sheet.value?.querySelector(".page-host")?.scrollTo({ top: 0 });
  sheet.value?.focus({ preventScroll: true });
});

const fallback = computed(() => {
  const t = top.value;
  return !t ? "" : t.kind === "house" ? w.insideHouse : t.kind === "application" ? w.aKnock : w.aRoom;
});

// Links stay inside. A click on any site link in the sheet is caught before RouterLink sees it: house, room and
// knock links open as places here; "/" closes the sheet. Log in, outside links, and clicks that ask for a new
// tab (cmd, ctrl, shift, middle button) are left alone.
function onClick(e: MouseEvent) {
  reportOutsideLink(e);
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest("a[href]");
  if (!a || a.getAttribute("target") === "_blank") return;
  const href = a.getAttribute("href") ?? "";
  if (!href.startsWith("/")) return;
  const place = placeFromPath(href);
  if (place === null) return;
  e.preventDefault();
  e.stopPropagation();
  if (place === "city") closeAll();
  else go(place);
}

// A link to another site (a room's live address, a pull request on GitHub) is reported before the browser
// follows it; the tutorial listens, to see you open your room. Any button and any modifier counts: a plain or
// modified click arrives here through onClick, a middle click through auxclick. Nothing is stopped.
function reportOutsideLink(e: MouseEvent) {
  if (e.type === "auxclick" && e.button !== 1) return;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  // `a.href` is the address fully resolved; a relative one always lands on our own origin.
  if ((a.protocol === "http:" || a.protocol === "https:") && a.origin !== location.origin) emit("link", a.href);
}

// The sheet keeps its keys to itself: the lobby listens on the window (W A S D, E, Tab, Q, R, 1, 2) and must
// not hear a key meant for a page. Escape goes back a page, or closes. Tab stays within the sheet.
function onKey(e: KeyboardEvent) {
  e.stopPropagation();
  const target = e.target as Element | null;
  // A dialog on top (the knock steps) closes itself on Escape; that's not ours.
  if (e.key === "Escape" && !target?.closest("dialog[open]")) {
    e.preventDefault();
    back();
  } else if (e.key === "Tab") trapTab(e);
}

function trapTab(e: KeyboardEvent) {
  const root = sheet.value;
  if (!root) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex='-1'])")).filter(
    (el) => el.offsetParent !== null,
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div class="inside" @keyup.stop>
    <!-- Over the rest of the lobby: a click there closes the panel. Dimmed only on a narrow screen; on a wide one it's
         clear, so the city stays lit beside the panel. -->
    <div class="scrim" @click="closeAll" />
    <section
      v-if="top"
      ref="sheet"
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="label || fallback"
      tabindex="-1"
      @click.capture="onClick"
      @auxclick.capture="reportOutsideLink"
      @keydown="onKey"
    >
      <div class="bar">
        <button v-if="stack.length > 1" type="button" class="back-btn" @click="back">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {{ w.back }}
        </button>
        <span v-else />
        <button type="button" class="close" :aria-label="w.close" @click="closeAll">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
        </button>
      </div>

      <!-- One page at a time, keyed by place: going back mounts the page afresh, and a popped page closes its own stream. -->
      <div class="page-host">
        <!-- A house inside is its own game-like view (HouseInside); the list view keeps the full page. -->
        <HouseInside
          v-if="top.kind === 'house'"
          :key="topKey"
          :id="top.id"
          :rundown="!!rundown && !rundownSeen"
          @open="go"
          @label="(l) => (label = l)"
          @rundown-done="rundownEnded"
        />
        <ApplicationPage v-else-if="top.kind === 'application'" :key="topKey" :id="top.id" embedded @label="(l) => (label = l)" />
        <RoomPage v-else :key="topKey" :id="top.houseId" :room="top.room" embedded :coached="coached" @label="(l) => (label = l)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Above the HUD (10) and the lobby's own find and travel sheets (50). */
.inside { position: absolute; inset: 0; z-index: 60; }
/* On a wide screen the click-catcher over the city is clear: no dimming, the city stays lit. */
.scrim { position: absolute; inset: 0; }
/* A floating card over the city, like a game's pause menu: it pops in on the right with the city still lit beside
   it, while the camera zooms so your character stands on the left. Centred in the height it has, at most 760px
   tall, never under the top bar. */
.sheet {
  position: absolute;
  top: max(72px, calc(50% - 380px));
  bottom: max(24px, calc(50% - 380px));
  right: 32px;
  width: min(600px, 48vw);
  /* The sheet never scrolls: the bar stays, and the page under it (a Panel, see panel/Panel.vue) is made to fit.
     Only a panel's body scrolls, inside itself, when it holds a stream. */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--r-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  outline: none;
  overflow-wrap: anywhere;
  transform-origin: 70% 50%;
  animation: pop-in var(--dur-slow) var(--ease-pop);
}
/* Back and Close: one slim line, no rule under it, so the page's own head is the first thing you read. */
.bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 12px 12px 0 calc(var(--gutter) - 6px);
}
/* Both are small square keys with a hairline edge, quiet next to the panel's own main button. */
.back-btn { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 12px 0 8px; border-radius: var(--r-sm); background: none; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); font-size: 14px; font-weight: 600; }
.close { width: 32px; height: 32px; min-height: 0; padding: 0; border-radius: var(--r-sm); display: grid; place-items: center; background: none; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); }
:is(.back-btn, .close):hover:not(:disabled) { background: var(--tile); color: var(--text); }
/* The page fills what's left. If a window is too short for it, it scrolls here rather than spilling out. */
.page-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; }
.page-host > * { flex: 1 1 auto; min-height: 0; }
/* The pause menu's entrance: a quick scale up from just under full size. */
@keyframes pop-in {
  from { opacity: 0; transform: translateX(12px) scale(0.96); }
}
@keyframes rise-in {
  from { opacity: 0; transform: translateY(12px); }
}
@keyframes fade-in {
  from { opacity: 0; }
}
/* Narrower than 720px there's no room beside the panel: it becomes a sheet along the bottom edge, with rounded
   top corners, about 70% of the screen tall so the house still shows above it. The city above stays lit (a light
   veil only), since it's what the sheet is about; a tap there closes. */
@media (max-width: 719px) {
  .inside { display: grid; place-items: end stretch; }
  .scrim { background: color-mix(in srgb, var(--scrim) 45%, transparent); animation: fade-in 0.25s var(--ease); }
  .sheet { position: relative; inset: auto; width: 100%; height: 70dvh; min-height: min(460px, 88dvh); border-radius: var(--r-xl) var(--r-xl) 0 0; animation-name: rise-in; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet, .scrim { animation: none; }
}
</style>
