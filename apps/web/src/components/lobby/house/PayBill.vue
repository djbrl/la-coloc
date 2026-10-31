<script setup lang="ts">
// Paying your share of the bill, in the Bill tab: how people pay where the house is (mobile money, by name only),
// the amount and the reference to copy, and "Mark as paid". For the contest no money moves: the button only tells
// the house your share is paid (POST /api/houses/:id/bill/paid), and the sheet says so plainly.
import { nextTick, onMounted, ref } from "vue";
import { postJSON } from "../../../session";
import type { BillLine } from "./exchange";
import Icon from "./Icon.vue";
import { fcfa } from "./server";
import { houseWords as w } from "./words";

// `chef`: the one paying is the chef, who pays the landlord rather than themselves.
const props = defineProps<{ houseId: string; line: BillLine; operators: string[]; reference: string; chef?: boolean }>();
const emit = defineEmits<{ paid: []; back: [] }>();

const operator = ref(props.operators[0] ?? "");
const copied = ref<"" | "amount" | "reference">("");
const sending = ref(false);
const error = ref("");
const heading = ref<HTMLElement | null>(null);

// The heading takes the focus, so a screen reader hears where it landed.
onMounted(() => nextTick(() => heading.value?.focus()));

async function copy(what: "amount" | "reference") {
  try {
    await navigator.clipboard.writeText(what === "amount" ? String(props.line.due) : props.reference);
    copied.value = what;
    setTimeout(() => copied.value === what && (copied.value = ""), 2000);
  } catch {
    // No clipboard: both are written out in full, to copy by hand.
  }
}

// The operators are a radio group: the arrow keys move the choice, as in the settings pane.
const els: HTMLButtonElement[] = [];
function onKey(e: KeyboardEvent, i: number) {
  const last = props.operators.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  operator.value = props.operators[to];
  els[to]?.focus();
}

async function markPaid() {
  error.value = "";
  sending.value = true;
  const res = await postJSON(`/api/houses/${encodeURIComponent(props.houseId)}/bill/paid`, {});
  sending.value = false;
  if (res.ok) emit("paid");
  // An API from before the bill answers "Cannot POST …": say it plainly instead.
  else error.value = res.message.startsWith("Cannot POST") ? w.cantMark : res.message;
}
</script>

<template>
  <section class="pay" aria-labelledby="pay-title">
    <h3 id="pay-title" ref="heading" tabindex="-1">{{ w.payTitle(fcfa(line.due)) }}</h3>

    <div v-if="operators.length > 1" class="ops" role="radiogroup" :aria-label="w.howYouPay">
      <button
        v-for="(o, i) in operators"
        :key="o"
        :ref="(el) => (els[i] = el as HTMLButtonElement)"
        type="button"
        role="radio"
        :aria-checked="operator === o"
        :tabindex="operator === o ? 0 : -1"
        @click="operator = o"
        @keydown="onKey($event, i)"
      >
        {{ o }}
      </button>
    </div>

    <!-- The amount and the reference sit inside the sentence, each with its copy button. -->
    <p class="how">
      {{ w.send }}
      <span class="value">{{ fcfa(line.due) }}</span>
      <button type="button" class="copy" :aria-label="copied === 'amount' ? w.amountCopied : w.copyAmount" @click="copy('amount')">
        <Icon :name="copied === 'amount' ? 'tick' : 'copy'" :size="15" />
      </button>
      <template v-if="operator">{{ w.with(operator) }}</template> {{ chef ? w.toHouse : w.toChef }}{{ w.andWrite }}
      <span class="value mono">{{ reference }}</span>
      <button type="button" class="copy" :aria-label="copied === 'reference' ? w.referenceCopied : w.copyReference" @click="copy('reference')">
        <Icon :name="copied === 'reference' ? 'tick' : 'copy'" :size="15" />
      </button>
      {{ w.inItsNote }}
    </p>
    <p class="mock"><Icon name="info" :size="16" />{{ w.mock }}</p>
    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <div class="nav">
      <button type="button" class="back" @click="emit('back')"><span aria-hidden="true">‹</span> {{ w.back }}</button>
      <button type="button" class="primary done" :disabled="sending" @click="markPaid"><Icon name="tick" :size="18" />{{ sending ? w.marking : w.markPaid }}</button>
    </div>
  </section>
</template>

<style scoped>
/* A sub-screen of the Bill tab, like a settings sub-screen: one question, a big button. */
.pay { display: grid; gap: 12px; }
h3 { font-size: 24px; outline: none; }
/* The operators: words on the white, the chosen one on ink, as the panel's tabs. */
.ops { display: flex; flex-wrap: wrap; gap: 4px; justify-self: start; max-width: 100%; }
.ops button { min-height: 46px; padding: 0 14px; background: none; box-shadow: none; color: var(--text); font: 800 17px/1 var(--font); }
.ops button:hover:not(:disabled) { background: var(--tile); }
.ops button[aria-checked="true"], .ops button[aria-checked="true"]:hover:not(:disabled) { background: var(--text); color: var(--surface); }
.how { font-size: 17px; line-height: 46px; }
/* The amount and the reference: bold, on a chip you can copy from. */
.value { font: 800 1em var(--num); white-space: nowrap; padding: 2px 6px; border-radius: var(--r-xs); background: var(--fill); }
.mono { font-family: var(--code); font-size: 14px; overflow-wrap: anywhere; white-space: normal; }
.copy { display: inline-grid; place-items: center; width: 46px; min-height: 46px; height: 46px; padding: 0; margin: 0 2px; vertical-align: middle; border-radius: var(--r-sm); background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); }
.copy:hover:not(:disabled) { background: var(--tile); }
.mock { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; line-height: 1.3; color: var(--muted); }
.mock :deep(svg) { flex: none; margin-top: 1px; }
.nav { display: flex; align-items: center; gap: 8px; }
.back { flex: none; min-height: 60px; padding: 0 16px; background: transparent; box-shadow: var(--quiet-edge); }
.back:hover:not(:disabled) { background: var(--tile); }
.done { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 60px; padding: 0 16px; font-size: 22px; }
</style>
