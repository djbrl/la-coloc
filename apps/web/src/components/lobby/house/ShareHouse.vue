<script setup lang="ts">
// The house panel's share key: an icon in its head that opens a small flat card under it, with the ways to send the
// house to someone: copy the link, WhatsApp (a wa.me link with the message ready), and the phone's own share sheet
// where there is one. The link is the API's share page (shareHouse.ts), so a person lands on "Join <house>" and
// WhatsApp shows the same words with a picture of its city. On a laptop's own site (localhost) the link opens nowhere else: only the copy, and one line
// that says so. Esc or a click outside closes the card.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { language } from "../../../i18n";
import { canShareNatively, whatsappLink } from "../tutorial/share";
import Icon from "./Icon.vue";
import { houseShareLink, shareWays } from "./shareHouse";
import { houseWords as w } from "./words";

const props = defineProps<{ houseId: string; name: string; city: string }>();

const open = ref(false);
const copied = ref(false);
const root = ref<HTMLElement | null>(null);
const key = ref<HTMLButtonElement | null>(null);
let copiedTimer = 0;

const link = computed(() => houseShareLink(location.origin, props.houseId, language.lang));
const text = computed(() => w.share.text(props.name, props.city, link.value));
const ways = computed(() => shareWays(link.value, canShareNatively()));

async function toggle() {
  if (open.value) return close();
  open.value = true;
  copied.value = false;
  document.addEventListener("pointerdown", outside, true);
  await nextTick();
  root.value?.querySelector<HTMLElement>(".way")?.focus();
}
function close(refocus = true) {
  open.value = false;
  document.removeEventListener("pointerdown", outside, true);
  if (refocus) key.value?.focus();
}
function outside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) close(false);
}
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  clearTimeout(copiedTimer);
});

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied.value = false), 2000);
  } catch {
    // No clipboard (an old browser, or no permission): the link is on the card, to copy by hand.
  }
}

async function shareNatively() {
  try {
    await navigator.share({ title: props.name, text: text.value, url: link.value });
    close();
  } catch {
    // Cancelled, or refused: nothing was shared, the card stays.
  }
}
</script>

<template>
  <span ref="root" class="share" @keydown.esc.stop="close()">
    <button ref="key" type="button" class="key" :aria-label="w.share.name(name)" :title="w.share.name(name)" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <Icon name="share" :size="22" />
    </button>
    <Transition name="pop">
      <div v-if="open" class="card" role="dialog" :aria-label="w.share.name(name)">
        <p class="link">{{ link }}</p>
        <div class="ways">
          <button type="button" class="way" :class="{ done: copied }" @click="copy">
            <Icon :name="copied ? 'tick' : 'copy'" :size="18" /><span>{{ copied ? w.copied : w.share.copy }}</span>
          </button>
          <a v-if="ways.whatsapp" class="way" :href="whatsappLink(text)" target="_blank" rel="noopener" :aria-label="w.share.whatsappName">
            <Icon name="chat" :size="18" /><span>{{ w.share.whatsapp }}</span>
          </a>
          <button v-if="ways.native" type="button" class="way" @click="shareNatively"><Icon name="share" :size="18" /><span>{{ w.share.more }}</span></button>
        </div>
        <p v-if="!ways.anywhere" class="here">{{ w.share.onlyHere }}</p>
        <span class="sr-only" aria-live="polite">{{ copied ? w.copied : "" }}</span>
      </div>
    </Transition>
  </span>
</template>

<style scoped>
.share { position: relative; display: inline-flex; }
/* The band's key: white, 46px. */
.key { width: 46px; height: 46px; min-height: 0; padding: 0; display: grid; place-items: center; }
/* A flat card under the key, on the right edge, over the panel: on the band it must set its own colours. */
.card { position: absolute; top: calc(100% + 8px); right: 0; z-index: 5; width: min(320px, 80vw); display: grid; gap: 10px; padding: 12px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 3px var(--panel), var(--lift); }
.link { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.3; color: var(--handle); overflow-wrap: anywhere; }
.ways { display: flex; flex-wrap: wrap; gap: 6px; }
.share .way { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 12px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text); box-shadow: var(--quiet-edge); font: 400 15px/1 var(--display); text-decoration: none; }
.share .way:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.share .way.done { color: var(--live); }
.here { margin: 0; font-size: 14px; line-height: 1.3; color: var(--muted); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
.pop-enter-active, .pop-leave-active { transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease-pop); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
