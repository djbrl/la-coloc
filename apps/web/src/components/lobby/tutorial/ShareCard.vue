<script setup lang="ts">
// Chapter 7: show it off. A postcard of your new home (the drawing, where it is, your address in the monospace),
// a QR code to open it on your phone, and the ways to send it: copy the link, WhatsApp (a wa.me link with the
// message ready), or the phone's own share sheet where there is one. Any of them counts as shared, and the quest
// moves on; "Later" moves on too, without guilt. On a phone the QR is left out: you're already holding the phone.
import { computed, ref } from "vue";
import { bare } from "../panel/words";
import HouseArt from "./HouseArt.vue";
import QuestIcon from "./QuestIcon.vue";
import { canShareNatively, opensAnywhere, qrPath, whatsappLink } from "./share";
import { tutorialWords as w } from "./words";

const props = defineProps<{ url: string; room: string; house: string; city: string; touch: boolean }>();
const emit = defineEmits<{ shared: []; later: [] }>();

const address = computed(() => bare(props.url));
const message = computed(() => w.shareText(props.url));
const qr = computed(() => qrPath(props.url));
// A laptop's demo address opens nowhere else: no QR, no WhatsApp, no share sheet for it, only the copy.
const anywhere = computed(() => opensAnywhere(props.url));
const native = canShareNatively();

const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.url);
    copied.value = true;
    // A moment to see "Copied" before the quest moves on.
    setTimeout(() => emit("shared"), 900);
  } catch {
    // No clipboard (an old browser, or no permission): the address is on the card to copy by hand.
  }
}

async function shareNatively() {
  try {
    await navigator.share({ title: w.shareTitleText, text: message.value, url: props.url });
    emit("shared");
  } catch {
    // Cancelled, or refused: nothing was shared, the card stays.
  }
}
</script>

<template>
  <div class="share">
    <div class="postcard">
      <div class="art"><HouseArt :name="room" lit /></div>
      <div class="side">
        <p class="from">{{ w.postcardFrom(house, city) }}</p>
        <p class="address">{{ address }}</p>
      </div>
      <figure v-if="!touch && anywhere" class="qr">
        <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" :aria-label="w.qrName(address)" shape-rendering="crispEdges">
          <rect :width="qr.size" :height="qr.size" class="qr-paper" />
          <path :d="qr.d" class="qr-ink" />
        </svg>
        <figcaption><QuestIcon name="phone" :size="14" />{{ w.scan }}</figcaption>
      </figure>
      <div class="ways">
          <button type="button" class="way" :class="{ done: copied }" @click="copy">
            <QuestIcon :name="copied ? 'tick' : 'copy'" :size="18" /><span>{{ copied ? w.copied : w.copy }}</span>
          </button>
          <a v-if="anywhere" class="way" :href="whatsappLink(message)" target="_blank" rel="noopener" :aria-label="w.whatsappName" @click="emit('shared')" @auxclick="emit('shared')">
            <QuestIcon name="chat" :size="18" /><span>{{ w.whatsapp }}</span>
          </a>
          <button v-if="native && anywhere" type="button" class="way" @click="shareNatively"><QuestIcon name="share" :size="18" /><span>{{ w.shareMore }}</span></button>
      </div>
    </div>
    <p v-if="!anywhere" class="here">{{ w.onlyHere }}</p>
    <span class="sr-only" aria-live="polite">{{ copied ? w.copied : "" }}</span>
  </div>
</template>

<style scoped>
.share { display: grid; gap: 10px; }
/* The postcard: a flat card inside the card, with a stamp-like dashed edge. */
.postcard { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; gap: 10px 14px; align-items: center; padding: 12px; border-radius: var(--r-md); background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); outline: 2px dashed var(--line-strong); outline-offset: -6px; }
.art { width: 104px; }
.side { display: grid; gap: 6px; min-width: 0; }
.from { margin: 0; font: 700 13px/1.2 var(--display); color: var(--muted); }
.address { margin: 0; font: 600 15px/1.3 var(--mono); color: var(--text); overflow-wrap: anywhere; }
/* The ways to send it, in a row across the card's foot. */
.ways { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.way { white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 12px; border: 0; border-radius: var(--r-sm); background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; }
.way:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); text-decoration: none; }
.way:active { transform: translateY(1px); }
.way.done { color: var(--live); }
.here { margin: 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
.qr { display: grid; justify-items: center; gap: 4px; margin: 0; }
.qr > svg { width: 96px; height: 96px; border-radius: var(--r-xs); }
/* A QR code reads best dark on light, whatever the theme: the logs' two colours are that in both. */
.qr-paper { fill: var(--code-text); }
.qr-ink { fill: var(--code-bg); }
.qr figcaption { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .postcard { grid-template-columns: 76px minmax(0, 1fr); gap: 10px; padding: 10px; }
  .art { width: 76px; }
  .qr { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .way:active { transform: none; }
}
</style>
