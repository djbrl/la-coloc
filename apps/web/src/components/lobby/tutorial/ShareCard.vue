<script setup lang="ts">
// Chapter 7: show it off. A postcard of your new home (the drawing, where it is, your address in the monospace),
// a QR code to open it on your phone, and the ways to send it: first your own house's chat ("Tell the house": one
// message, by the same address the house's chat posts to), then copy the link, WhatsApp (a wa.me link with the
// message ready), or the phone's own share sheet where there is one. Any of them counts as shared, and the quest
// moves on; "Later" moves on too, without guilt. On a phone the QR is left out: you're already holding the phone.
import { computed, onMounted, ref } from "vue";
import { postJSON } from "../../../session";
import { bare } from "../panel/words";
import HouseArt from "./HouseArt.vue";
import QuestIcon from "./QuestIcon.vue";
import { canShareNatively, opensAnywhere, qrPath, whatsappLink } from "./share";
import { tutorialWords as w } from "./words";

const props = defineProps<{ url: string; room: string; house: string; houseId: string; project: string; city: string; touch: boolean }>();
const emit = defineEmits<{ shared: []; later: [] }>();

const address = computed(() => bare(props.url));
const message = computed(() => w.shareText(props.url));
const qr = computed(() => qrPath(props.url));
// A laptop's demo address opens nowhere else: no QR, no WhatsApp, no share sheet for it, only the copy.
const anywhere = computed(() => opensAnywhere(props.url));
const native = canShareNatively();

const copied = ref(false);
// The house's chat: the workshop's, in the quest, whose host answers a first message. A failure says so and leaves
// the other ways as they are; a success is a tick, a moment to see it, and the quest moves on.
const tellKey = ref<HTMLButtonElement | null>(null);
const telling = ref(false);
const told = ref(false);
const tellError = ref("");
async function tell() {
  if (telling.value || told.value) return;
  telling.value = true;
  tellError.value = "";
  const sent = await postJSON(`/api/houses/${encodeURIComponent(props.houseId)}/messages`, { body: w.tellText(props.project, props.url) });
  telling.value = false;
  if (!sent.ok) {
    tellError.value = w.tellFailed;
    return;
  }
  told.value = true;
  setTimeout(() => emit("shared"), 900);
}
// The keyboard lands on the main action, once the coach has settled (Coach.vue does the same for its own keys).
onMounted(() => setTimeout(() => tellKey.value?.focus({ preventScroll: true }), 160));

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
    <p class="heading">{{ w.shareHeading }}</p>
    <div class="postcard">
      <div class="art"><HouseArt :name="room" lit /></div>
      <p class="from">{{ w.postcardFrom(house, city) }}</p>
      <figure v-if="!touch && anywhere" class="qr">
        <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" :aria-label="w.qrName(address)" shape-rendering="crispEdges">
          <rect :width="qr.size" :height="qr.size" class="qr-paper" />
          <path :d="qr.d" class="qr-ink" />
        </svg>
        <figcaption><QuestIcon name="phone" :size="14" />{{ w.scan }}</figcaption>
      </figure>
    </div>
    <p class="address">{{ address }}</p>
    <button ref="tellKey" type="button" class="primary tell" :class="{ told }" :disabled="telling || told" @click="tell">
      <QuestIcon :name="told ? 'tick' : 'people'" :size="20" /><span>{{ told ? w.told : w.tellHouse }}</span>
    </button>
    <p v-if="tellError" class="here error" role="alert">{{ tellError }}</p>
    <div class="ways">
      <button type="button" class="way" :class="{ done: copied }" @click="copy">
        <QuestIcon :name="copied ? 'tick' : 'copy'" :size="18" /><span>{{ copied ? w.copied : w.copy }}</span>
      </button>
      <a v-if="anywhere" class="way" :href="whatsappLink(message)" target="_blank" rel="noopener" :aria-label="w.whatsappName" @click="emit('shared')" @auxclick="emit('shared')">
        <QuestIcon name="chat" :size="18" /><span>{{ w.whatsapp }}</span>
      </a>
      <button v-if="native && anywhere" type="button" class="way" @click="shareNatively"><QuestIcon name="share" :size="18" /><span>{{ w.shareMore }}</span></button>
    </div>
    <p v-if="!anywhere" class="here">{{ w.onlyHere }}</p>
    <span class="sr-only" aria-live="polite">{{ told ? w.told : copied ? w.copied : "" }}</span>
  </div>
</template>

<style scoped>
.share { display: grid; gap: 14px; }
/* Leaves room for the coach's close key in the corner. */
.heading { margin: 0; padding-right: 46px; font: 500 18px/1.3 var(--font); }
/* The postcard: a flat card inside the card, with a stamp-like dashed edge. The drawing, where it's from, the QR. */
.postcard { display: grid; grid-template-columns: 190px minmax(0, 1fr) auto; gap: 18px; align-items: center; padding: 18px; border-radius: var(--r-md); background: var(--tile); outline: 2px dashed var(--line-strong); outline-offset: -6px; }
.art { min-width: 0; }
.from { margin: 0; font: 500 16px/1.3 var(--font); color: var(--muted); }
/* The address on its own line, across the card: the thing being shared. A long one wraps rather than widen the card. */
.address { margin: 0; font: 600 18px/1.3 var(--code); color: var(--accent); text-align: center; overflow-wrap: anywhere; }
.tell { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60px; font-size: 19px; }
/* A tick, in the live green, for the moment before the quest moves on. */
.tell.told:disabled { opacity: 1; background: var(--live); color: var(--on-accent); }
/* The other ways, sharing one row evenly: never a lone key on a second line. */
.ways { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
.way { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 50px; padding: 0 10px; border: 0; border-radius: var(--r-sm); background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer; }
.way:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); text-decoration: none; }
.way:active { transform: translateY(1px); }
.way.done { color: var(--live); }
.here { margin: 0; font-size: 14px; line-height: 1.4; color: var(--muted); }
.here.error { color: var(--danger); }
.qr { display: grid; justify-items: center; gap: 6px; margin: 0; }
.qr > svg { width: 124px; height: 124px; border-radius: var(--r-xs); }
/* A QR code reads best dark on light: the logs' two colours are that. */
.qr-paper { fill: var(--code-text); }
.qr-ink { fill: var(--code-bg); }
.qr figcaption { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: var(--muted); white-space: nowrap; }
a:focus-visible, button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
/* A short screen: the drawing gives way before the card can need scrolling. */
@media (max-height: 640px) {
  .postcard { grid-template-columns: 120px minmax(0, 1fr) auto; padding: 12px; }
  .qr > svg { width: 84px; height: 84px; }
  .qr figcaption { display: none; }
}
/* A phone: no QR, the drawing beside where it's from, and each way an icon over its word, so three still fit a row. */
@media (max-width: 620px) {
  .share { gap: 12px; }
  .postcard { grid-template-columns: 132px minmax(0, 1fr); gap: 14px; padding: 14px; }
  .qr { display: none; }
  .from { font-size: 15px; }
  .address { font-size: 16px; }
  .way { flex-direction: column; gap: 3px; min-height: 60px; padding: 6px 4px; font-size: 14px; line-height: 1.1; white-space: normal; text-align: center; }
}
@media (prefers-reduced-motion: reduce) {
  .way:active { transform: none; }
}
</style>
