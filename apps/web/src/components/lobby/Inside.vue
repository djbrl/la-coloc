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
  // The tutorial's coach is up, with its own main action: a room's page then keeps its own buttons quieter.
  coached?: boolean;
  // For the house the panel opened on (`start`), handed to its HouseInside: the tab to show (a quest pointing at a
  // part of the house). A house opened on top later (from a link) doesn't get it, so a quest's ask never leaks.
  tab?: "rooms" | "people" | "channel" | "chores" | "fridge" | "bill";
}>();

// Whether the page on top is the one the panel opened on.
const atStart = computed(() => topKey.value === placeKey(props.start));
const emit = defineEmits<{
  change: [top: Place | null];
  close: [];
  // An outside link in the panel was clicked (the browser still follows it): its full address.
  link: [url: string];
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

// You ended your lease on the room on top: it isn't yours any more, so you're back at the house.
function leftRoom(houseId: string) {
  const house: Place = { kind: "house", id: houseId };
  const under = stack.value.slice(0, -1);
  stack.value = under.length && placeKey(under[under.length - 1]) === placeKey(house) ? under : [...under, house];
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

// The sheet keeps its keys to itself: the lobby listens on the window (W A S D, E, Tab, Q, R) and must
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
      class="sheet sign"
      :class="{ deep: stack.length > 1 }"
      role="dialog"
      aria-modal="true"
      :aria-label="label || fallback"
      tabindex="-1"
      @click.capture="onClick"
      @auxclick.capture="reportOutsideLink"
      @keydown="onKey"
    >
      <div class="sign-frame">
        <!-- Back and Close sit on the title band of whatever page is open (panel/PanelHead.vue leaves them room). -->
        <button v-if="stack.length > 1" type="button" class="sign-x back-btn" :aria-label="w.back" @click="back">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button type="button" class="sign-x close" :aria-label="w.close" @click="closeAll"><span aria-hidden="true">X</span></button>

      <!-- One page at a time, keyed by place: going back mounts the page afresh, and a popped page closes its own stream. -->
      <div class="page-host">
        <!-- A house inside is its own game-like view (HouseInside); the list view keeps the full page. -->
        <HouseInside
          v-if="top.kind === 'house'"
          :key="topKey"
          :id="top.id"
          :tab="atStart ? tab : undefined"
          :coached="coached"
          @open="go"
          @label="(l) => (label = l)"
        />
        <ApplicationPage v-else-if="top.kind === 'application'" :key="topKey" :id="top.id" embedded @label="(l) => (label = l)" />
        <RoomPage v-else :key="topKey" :id="top.houseId" :room="top.room" embedded :coached="coached" @label="(l) => (label = l)" @left="leftRoom" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Above the HUD (10) and the lobby's own find and travel sheets (50). */
.inside { position: absolute; inset: 0; z-index: 60; }
/* On a wide screen the click-catcher over the city is clear: no dimming, the city stays lit. */
.scrim { position: absolute; inset: 0; }
/* A sign over the city, like a game's pause menu: it pops in on the right with the city still lit beside it, while the
   camera zooms so your character stands on the left. It hangs under the site's keys; a short window gives it the
   whole height, over them. */
.sheet {
  position: absolute;
  top: 98px;
  bottom: 24px;
  right: 32px;
  width: min(720px, 52vw);
  /* The sheet never scrolls: the band stays, and the page under it (a Panel, see panel/Panel.vue) is made to fit.
     Only a panel's body scrolls, inside itself, when it holds a stream. */
  outline: none;
  overflow-wrap: anywhere;
  transform-origin: 70% 50%;
  animation: pop-in var(--dur-slow) var(--ease-pop);
}
.sign-frame { position: relative; }
/* The band's two keys, 44px and centred in its 88px. They're placed from inside the frame's border, and the band
   starts 3px further in, after the frame's padding. */
.sign-x { z-index: 2; top: 44px; }
.back-btn { right: auto; left: 16px; }
.deep { --band-lead: 52px; }
/* The page fills what's left, on the white. If a window is too short for it, it scrolls here rather than spilling out. */
.page-host { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; border-radius: 12px; background: var(--surface); }
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
/* Narrower than 720px there's no room beside the panel: it becomes a sheet along the bottom edge, about 70% of the screen tall so the house still shows above it. The city above stays lit (a light
   veil only), since it's what the sheet is about; a tap there closes. */
@media (max-width: 719px) {
  .inside { display: grid; place-items: end stretch; }
  .scrim { background: color-mix(in srgb, var(--scrim) 45%, transparent); animation: fade-in 0.25s var(--ease); }
  .sheet { position: relative; inset: auto; width: 100%; height: 70dvh; min-height: min(460px, 88dvh); animation-name: rise-in; }
}
@media (min-width: 720px) and (max-height: 720px) {
  .sheet { top: 16px; bottom: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet, .scrim { animation: none; }
}
</style>
