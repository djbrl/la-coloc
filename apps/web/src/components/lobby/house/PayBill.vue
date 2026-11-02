<script setup lang="ts">
// Paying your share of the bill, in the Bill tab, from your credit: what it does to it, and one button. Short of it:
// how much, and how to earn more (POST /api/houses/:id/bill/paid).
import { computed, nextTick, onMounted, ref } from "vue";
import { loadMe, me, postJSON } from "../../../session";
import { shortBy } from "../../credit";
import CreditAfter from "./CreditAfter.vue";
import type { BillLine } from "./exchange";
import Icon from "./Icon.vue";
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
  <section class="pay" aria-labelledby="pay-title">
    <h3 id="pay-title" ref="heading" tabindex="-1">{{ w.payTitle(fcfa(line.due)) }}</h3>
    <CreditAfter :price="line.due" />
    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <div class="nav">
      <button type="button" class="back" @click="emit('back')"><span aria-hidden="true">‹</span> {{ w.back }}</button>
      <button type="button" class="primary done" :disabled="sending || short > 0" @click="markPaid"><Icon name="tick" :size="18" />{{ sending ? w.marking : w.markPaid }}</button>
    </div>
  </section>
</template>

<style scoped>
/* A sub-screen of the Bill tab, like a settings sub-screen: one question, a big button. */
.pay { display: grid; gap: 12px; }
h3 { font-size: 24px; outline: none; }
.nav { display: flex; align-items: center; gap: 8px; }
.back { flex: none; min-height: 60px; padding: 0 16px; background: transparent; box-shadow: var(--quiet-edge); }
.back:hover:not(:disabled) { background: var(--tile); }
.done { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 60px; padding: 0 16px; font-size: 22px; }
</style>
