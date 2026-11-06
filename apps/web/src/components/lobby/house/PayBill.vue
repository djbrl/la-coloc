<script setup lang="ts">
// Paying your share of the bill, in the Bill tab, from your credit: what it does to it, and one button. Short of it:
// how much, and how to earn more (POST /api/houses/:id/bill/paid).
import { computed, nextTick, onMounted, ref } from "vue";
import { loadMe, me, postJSON } from "../../../session";
import { shortBy } from "../../credit";
import CreditAfter from "./CreditAfter.vue";
import type { BillLine } from "./exchange";
import { fcfa } from "./server";
import { houseWords as w } from "./words";

const props = defineProps<{ houseId: string; line: BillLine }>();
const emit = defineEmits<{ paid: []; back: [] }>();

const sending = ref(false);
const error = ref("");
const heading = ref<HTMLElement | null>(null);
const short = computed(() => shortBy(me.value?.credit, props.line.due));

// The heading takes the focus, so a screen reader hears where it landed.
onMounted(() => nextTick(() => heading.value?.focus()));

async function markPaid() {
  error.value = "";
  sending.value = true;
  const res = await postJSON(`/api/houses/${encodeURIComponent(props.houseId)}/bill/paid`, {});
  sending.value = false;
  void loadMe();
  if (res.ok) emit("paid");
  // An API from before the bill answers "Cannot POST …": say it plainly instead.
  else error.value = res.message.startsWith("Cannot POST") ? w.cantMark : res.message;
}
</script>

<template>
  <!-- As the first rent's card: the amount big on the soft paper, what it does to your credit, then Back and Pay. -->
  <section class="pay" aria-labelledby="pay-title">
    <h3 id="pay-title" ref="heading" tabindex="-1" class="sr-only">{{ w.payTitle(fcfa(line.due)) }}</h3>
    <p class="sum" aria-hidden="true"><strong>{{ fcfa(line.due) }}</strong><span>{{ w.stats.yourPart }}</span></p>
    <CreditAfter :price="line.due" />
    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <div class="nav">
      <button type="button" class="second" @click="emit('back')">{{ w.back }}</button>
      <button type="button" class="primary done" :disabled="sending || short > 0" @click="markPaid">{{ sending ? w.marking : w.markPaid }}</button>
    </div>
  </section>
</template>

<style scoped>
/* A sub-screen of the Bill tab, like the first rent's card: one number, what it does, two buttons. */
.pay { display: grid; gap: 16px; }
h3 { outline: none; }
.sum { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); }
.sum strong { font-size: 34px; font-weight: 800; line-height: 40px; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sum span { font-size: 15px; font-weight: 600; color: var(--muted); }
.nav { display: flex; align-items: center; gap: 10px; }
.nav .second { flex: 1 1 0; }
.done { flex: 2 1 0; min-width: 0; }
</style>
