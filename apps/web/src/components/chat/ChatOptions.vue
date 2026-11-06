<script setup lang="ts">
// A conversation's "…" in the window's header, and the small menu it opens. For a person: Add as friend (or a quiet
// line saying you are, or that you asked), Mute, Block, Report. For a group chat (a house's living room, a city's
// room): Mute and Report. Muting and blocking come back the same way (Unmute, Unblock), and Settings lists them all.
// The menu is a white card under the key; Esc or a click elsewhere closes it, the arrows move through it.
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { block, blockedLogin, loadSafety, mute, mutedChannel, mutedLogin, report, unblock, unmute } from "../../conversations";
import { askFriend, friends, loadFriends } from "../../friends";
import Icon from "../lobby/house/Icon.vue";
import { chatWords as w } from "./words";

const props = defineProps<{
  // A person, by login (with a name to say), or a group chat, by channel.
  person?: { login: string; name: string | null } | null;
  group?: { channel: string; name: string } | null;
}>();
// `changed`: you blocked or unblocked them (what the conversation shows may change).
const emit = defineEmits<{ changed: [] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const keyEl = ref<HTMLButtonElement | null>(null);
// "Block them?" waiting for a second press, a report sent, something refused.
const sure = ref(false);
const reported = ref(false);
const busy = ref(false);
const error = ref("");

const name = computed(() => props.person?.name ?? props.person?.login ?? props.group?.name ?? "");
const login = computed(() => props.person?.login ?? "");
const friendState = computed<"yes" | "asked" | "no">(() => {
  if (!props.person) return "no";
  if (friends.friends.some((f) => f.login === login.value)) return "yes";
  return friends.sent.some((s) => s.to.login === login.value) ? "asked" : "no";
});
const isMuted = computed(() => (props.person ? mutedLogin(login.value) : props.group ? mutedChannel(props.group.channel) : false));
const isBlocked = computed(() => !!props.person && blockedLogin(login.value));

// Another conversation: the menu starts over.
watch(
  () => [props.person?.login, props.group?.channel],
  () => {
    open.value = false;
    reported.value = false;
    sure.value = false;
    error.value = "";
  },
);

async function toggle() {
  open.value = !open.value;
  sure.value = false;
  error.value = "";
  if (!open.value) return;
  // Fresh answers for the menu's words: friends, and what you blocked and muted.
  void loadSafety();
  if (props.person) void loadFriends();
  await nextTick();
  items()[0]?.focus();
}

function close(focusKey = true) {
  if (!open.value) return;
  open.value = false;
  sure.value = false;
  if (focusKey) keyEl.value?.focus();
}

// Esc closes the menu first; with the menu shut, it's the window's (it closes).
function onEsc(e: KeyboardEvent) {
  if (!open.value) return;
  e.stopPropagation();
  close();
}

const items = (): HTMLButtonElement[] => Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

// Up and down move through the menu, Home and End to its ends; Tab leaves it.
function menuKey(e: KeyboardEvent) {
  const all = items();
  const i = all.indexOf(document.activeElement as HTMLButtonElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
  if (e.key === "Tab") return close(false);
  if (to === undefined || !all.length) return;
  e.preventDefault();
  all[(to + all.length) % all.length]?.focus();
}

// A click outside closes it.
function outside(e: PointerEvent) {
  if (open.value && !root.value?.contains(e.target as Node)) close(false);
}
watch(open, (on) => (on ? document.addEventListener("pointerdown", outside, true) : document.removeEventListener("pointerdown", outside, true)));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));

// Each action: one request, then the menu says how it went or closes.
async function act(run: () => Promise<{ ok: boolean; message?: string }>, then: "close" | "stay" = "close") {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const sent = await run();
  busy.value = false;
  if (!sent.ok) {
    error.value = sent.message ?? "";
    return;
  }
  if (then === "close") close();
}

const befriend = () => act(() => askFriend(login.value), "stay");
const toggleMute = () =>
  act(() => {
    const target = props.person ? { login: login.value } : { channel: props.group!.channel };
    return isMuted.value ? unmute(target) : mute(target);
  });
async function toggleBlock() {
  if (!isBlocked.value && !sure.value) {
    sure.value = true;
    return;
  }
  await act(async () => {
    const sent = isBlocked.value ? await unblock(login.value) : await block(login.value);
    if (sent.ok) emit("changed");
    return sent;
  });
}
const sendReport = () =>
  act(async () => {
    const sent = props.person ? await report("person", login.value) : await report("group", props.group!.channel);
    if (sent.ok) reported.value = true;
    return sent;
  }, "stay");
</script>

<template>
  <div ref="root" class="options" @keydown.esc="onEsc">
    <button
      ref="keyEl"
      type="button"
      class="more"
      :aria-label="w.optionsName(name)"
      :title="w.options"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5.5 12h.01M12 12h.01M18.5 12h.01" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" /></svg>
    </button>
    <Transition name="drop">
      <div v-if="open" class="menu" role="menu" :aria-label="w.optionsName(name)" @keydown="menuKey">
        <template v-if="person">
          <button v-if="friendState === 'no'" type="button" role="menuitem" class="item" :disabled="busy" @click="befriend"><Icon name="addFriend" :size="18" />{{ w.addFriend }}</button>
          <p v-else class="item quiet"><Icon :name="friendState === 'yes' ? 'tick' : 'clock'" :size="18" />{{ friendState === "yes" ? w.friends : w.friendAsked }}</p>
        </template>
        <button type="button" role="menuitem" class="item" :disabled="busy" @click="toggleMute"><Icon name="mute" :size="18" />{{ isMuted ? w.unmute : w.mute }}</button>
        <button v-if="person" type="button" role="menuitem" class="item" :class="{ sure }" :disabled="busy" @click="toggleBlock">
          <Icon name="block" :size="18" />{{ isBlocked ? w.unblock : sure ? w.blockSure : w.block }}
        </button>
        <p v-if="reported" class="item quiet" role="status"><Icon name="tick" :size="18" />{{ w.reported }}</p>
        <button v-else type="button" role="menuitem" class="item danger" :disabled="busy" @click="sendReport"><Icon name="flag" :size="18" />{{ w.report }}</button>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.options { position: relative; flex: none; }
/* The "…": a grey key like the window's close key, beside it. */
.options .more { display: grid; place-items: center; width: 40px; height: 40px; min-height: 0; padding: 0; border-radius: 12px; background: var(--sunken); color: var(--text); box-shadow: none; }
.options .more:hover:not(:disabled), .options .more[aria-expanded="true"] { background: var(--fill); }
/* The menu: a small white card under the key, right-aligned, one row per choice. */
.menu { position: absolute; z-index: 5; top: calc(100% + 8px); right: 0; display: grid; gap: 2px; width: max-content; min-width: 210px; max-width: min(280px, calc(100vw - 48px)); padding: 6px; border-radius: var(--tile-r); background: var(--surface); box-shadow: 0 0 0 1px var(--hairline), var(--lift); }
.options .item { display: flex; align-items: center; gap: 10px; min-height: 44px; margin: 0; padding: 0 12px; border-radius: 10px; background: none; color: var(--text); box-shadow: none; font: 700 15px/1.2 var(--font); text-align: left; white-space: nowrap; }
.item svg { color: var(--muted); }
.options button.item:hover:not(:disabled), .options button.item:focus-visible { background: var(--tile); }
button.item:focus-visible { outline-offset: -2px; }
.item.danger, .item.danger svg { color: var(--danger); }
/* "Block them?": the second press is asked for in the soft red. */
.item.sure { background: var(--accent-soft); color: var(--accent); }
.item.sure svg { color: inherit; }
/* A line, not a choice: already friends, asked, reported. */
.item.quiet { color: var(--muted); font-weight: 600; }
.error { margin: 4px 8px 6px; font-size: 14px; font-weight: 600; color: var(--danger); white-space: normal; }
.drop-enter-active { transition: opacity var(--dur-fast) var(--ease), transform var(--dur) var(--ease-pop); }
.drop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.drop-enter-from { opacity: 0; transform: translateY(-4px); }
.drop-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .drop-enter-active, .drop-leave-active { transition: none; }
}
</style>
