<script setup lang="ts">
// Going inside without leaving the lobby: a house page, a knock's thread or a room, shown as a wide sheet over
// the 3D city. The sheet keeps its own back-stack, so a link from one page to another slides in on top and Back
// returns. It never touches the router: the list view keeps the real pages, this only shows them.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ApplicationPage from "../../pages/ApplicationPage.vue";
import HousePage from "../../pages/HousePage.vue";
import RoomPage from "../../pages/RoomPage.vue";
import { type Place, placeFromPath, placeKey } from "./place";

const props = defineProps<{ start: Place }>();
const emit = defineEmits<{ change: [top: Place | null]; close: [] }>();

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
  sheet.value?.scrollTo({ top: 0 });
  sheet.value?.focus({ preventScroll: true });
});

const fallback = computed(() => {
  const t = top.value;
  return !t ? "" : t.kind === "house" ? "Inside a house" : t.kind === "application" ? "A knock" : "A room";
});

// Links stay inside. A click on any site link in the sheet is caught before RouterLink sees it: house, room and
// knock links open as places here; "/" closes the sheet. Log in, outside links, and clicks that ask for a new
// tab (cmd, ctrl, shift, middle button) are left alone.
function onClick(e: MouseEvent) {
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
      @keydown="onKey"
    >
      <div class="bar">
        <button v-if="stack.length > 1" type="button" class="link" aria-label="Back" @click="back"><span aria-hidden="true">‹</span> Back</button>
        <span v-else />
        <button type="button" class="close" aria-label="Close" @click="closeAll">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
        </button>
      </div>

      <!-- One page at a time, keyed by place: going back mounts the page afresh, and a popped page closes its own stream. -->
      <div class="page-host">
        <HousePage v-if="top.kind === 'house'" :key="topKey" :id="top.id" embedded @open="go" @label="(l) => (label = l)" />
        <ApplicationPage v-else-if="top.kind === 'application'" :key="topKey" :id="top.id" embedded @label="(l) => (label = l)" />
        <RoomPage v-else :key="topKey" :id="top.houseId" :room="top.room" embedded @label="(l) => (label = l)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Above the HUD (10) and the lobby's own find and travel sheets (50). */
.scrim { position: absolute; inset: 0; z-index: 60; background: var(--scrim); animation: fade-in 0.25s var(--ease); }
.sheet {
  position: absolute;
  z-index: 70;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(760px, 100vw);
  max-width: 100vw;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  color: var(--text);
  box-shadow: var(--shadow);
  outline: none;
  overflow-wrap: anywhere;
  animation: slide-in 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
/* Back and Close stay in reach while the page scrolls under them. */
.bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 6px var(--gutter);
  background: var(--nav-bg);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--hairline);
}
.bar .link { font-size: 15px; }
.close { width: 36px; height: 36px; min-height: 0; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.page-host { padding-bottom: max(24px, env(safe-area-inset-bottom)); }
@keyframes slide-in {
  from { transform: translateX(100%); }
}
@keyframes fade-in {
  from { opacity: 0; }
}
</style>
