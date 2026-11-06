<script setup lang="ts">
// Chapter 7: show it off, in carte blanche: no drawing, the address itself is the thing (in the monospace, with its copy
// key), a small QR code to open it on your phone, and the ways to send it: first your own house's chat ("Tell the house": one
// message, by the same address the house's chat posts to), then copy the link, WhatsApp (a wa.me link with the
// message ready), or the phone's own share sheet where there is one. Any of them counts as shared, and the quest
// moves on; "Later" moves on too, without guilt. On a phone the QR is left out: you're already holding the phone.
import { computed, onMounted, ref } from "vue";
import { postJSON } from "../../../session";
import { bare } from "../panel/words";
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
    <div class="top">
      <span class="icon-tile"><QuestIcon name="share" :size="22" /></span>
      <div class="words">
        <p class="heading">{{ w.shareHeading }}</p>
        <p class="from">{{ w.postcardFrom(house, city) }}</p>
      </div>
    </div>
    <div class="addr">
      <p class="address" :title="address">{{ address }}</p>
      <button type="button" class="copy" :class="{ done: copied }" :aria-label="copied ? w.copied : w.copy" @click="copy"><QuestIcon :name="copied ? 'tick' : 'copy'" :size="18" /></button>
    </div>
    <figure v-if="!touch && anywhere" class="qr">
      <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" :aria-label="w.qrName(address)" shape-rendering="crispEdges">
        <rect :width="qr.size" :height="qr.size" class="qr-paper" />
        <path :d="qr.d" class="qr-ink" />
      </svg>
      <figcaption><QuestIcon name="phone" :size="16" />{{ w.scan }}</figcaption>
    </figure>
    <p v-if="!anywhere" class="here"><QuestIcon name="phone" :size="16" />{{ w.onlyHere }}</p>
    <button ref="tellKey" type="button" class="primary tell" :class="{ told }" :disabled="telling || told" @click="tell">
      <QuestIcon :name="told ? 'tick' : 'people'" :size="20" /><span>{{ told ? w.told : w.tellHouse }}</span>
    </button>
    <p v-if="tellError" class="here error" role="alert">{{ tellError }}</p>
    <div v-if="anywhere" class="ways">
      <a class="way" :href="whatsappLink(message)" target="_blank" rel="noopener" :aria-label="w.whatsappName" @click="emit('shared')" @auxclick="emit('shared')">
        <QuestIcon name="chat" :size="18" /><span>{{ w.whatsapp }}</span>
      </a>
      <button v-if="native" type="button" class="way" @click="shareNatively"><QuestIcon name="share" :size="18" /><span>{{ w.shareMore }}</span></button>
    </div>
    <span class="sr-only" aria-live="polite">{{ told ? w.told : copied ? w.copied : "" }}</span>
  </div>
</template>

<style scoped>
.share { display: grid; gap: 14px; }
.top { display: flex; align-items: flex-start; gap: 14px; }
.words { min-width: 0; display: grid; gap: 4px; }
.heading { margin: 0; padding-top: 1px; font: 800 22px/28px var(--display); }
.from { margin: 0; font-size: 15px; line-height: 21px; color: var(--muted); }
/* The address: the thing being shared, on a soft tile in the monospace, one line, with its copy key. */
.addr { display: flex; align-items: center; gap: 8px; }
.address { flex: 1 1 auto; min-width: 0; margin: 0; height: 44px; padding: 0 14px; border-radius: 12px; background: var(--tile); font: 500 14px/44px var(--code); color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy { flex: none; width: 44px; min-height: 44px; height: 44px; padding: 0; display: grid; place-items: center; border-radius: 12px; background: var(--sunken); color: var(--text); box-shadow: none; }
.copy.done { color: var(--live); }
.tell { display: flex; align-items: center; justify-content: center; gap: 10px; }
/* A tick, in the live green, for the moment before the quest moves on. */
.tell.told:disabled { opacity: 1; background: var(--live); color: var(--on-accent); box-shadow: none; }
/* The other ways, sharing one row evenly: grey keys with their lip. */
.ways { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
.way { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 12px var(--lip); border: 0; border-radius: 12px; background: var(--sunken); color: var(--text); box-shadow: var(--quiet-edge); font: 800 15px/1 var(--display); text-decoration: none; cursor: pointer; }
.way:hover:not(:disabled) { background: var(--fill); text-decoration: none; }
.way:active { transform: translateY(2px); }
.here { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; line-height: 18px; color: var(--muted); }
.here.error { color: var(--danger); }
/* The QR, small, beside how to use it: a way to open it on a phone, not a picture. */
.qr { display: flex; align-items: center; gap: 14px; margin: 0; padding: 10px; border-radius: var(--tile-r); background: var(--tile); }
.qr > svg { flex: none; width: 84px; height: 84px; border-radius: 8px; }
/* A QR code reads best dark on light: the logs' two colours are that. */
.qr-paper { fill: var(--code-text); }
.qr-ink { fill: var(--code-bg); }
.qr figcaption { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--muted); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (max-height: 640px) {
  .qr { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .way:active { transform: none; }
}
</style>
