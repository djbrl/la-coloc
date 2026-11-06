<script setup lang="ts">
// Renting the house's server, one step at a time: pick a size, pay the first month from your credit (fake money), and
// the server comes by itself (apps/api/src/houses/landlord.ts). A native <dialog>, like the knock and rent-a-plot steps: it traps focus and closes on Escape.
// It reads like a game's menu: a short bold title per step, big tiles to pick from, chunky buttons with one main one.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { downWords, wentDown } from "../../../core";
import { refusalText } from "../../../refusals";
import { loadMe, me } from "../../../session";
import { shortBy } from "../../credit";
import { joinWords, rentWords as w } from "../../joinWords";
import UiSteps from "../../UiSteps.vue";
import { explain } from "../panel/words";
import CreditAfter from "./CreditAfter.vue";
import Icon from "./Icon.vue";
import { fcfa, type PlanId, plans } from "./server";

const props = defineProps<{
  houseId: string;
  // The house stream says the server is up: the parent passes it down so step 3 can finish itself.
  live: boolean;
  // Paid for already, and on its way: start at the last step.
  resume?: boolean;
  // A key was made but nothing paid: a house left half-way by the old way in, where a command with the key in it was
  // shown on screen. It opens on the pay step, and paying replaces that key, so the one that was shown stops working.
  keyMade?: boolean;
  // The size picked back then.
  plan?: PlanId | null;
}>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const step = ref(props.resume ? 3 : props.keyMade ? 2 : 1);
const plan = ref<PlanId>(props.plan ?? "medium");
const error = ref("");
const renew = ref(!!props.keyMade);
const sending = ref(false);
// What it costs, whether you can pay, whether a server is coming by itself, and whether you've one already.
const price = computed(() => plans.find((p) => p.id === plan.value)!.fcfa);
const short = computed(() => shortBy(me.value?.credit, price.value));
const paid = ref(false);
const noneFree = ref(false);
// One server a person: the house you already run it in, as the API names it.
const runs = ref<{ id: string; name: string } | null>(null);
// Long enough to read "Paying…": a real payment takes longer than this one.
const PAYING_MS = 1100;

async function pay() {
  if (sending.value || short.value) return;
  clearRefusal();
  sending.value = true;
  const [res] = await Promise.all([
    fetch(`/api/houses/${encodeURIComponent(props.houseId)}/server/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan.value, ...(renew.value ? { renew: true } : {}) }),
    }).catch(() => null),
    new Promise((done) => setTimeout(done, PAYING_MS)),
  ]);
  sending.value = false;
  const down = await wentDown(res);
  if (down) {
    error.value = downWords.write;
    return;
  }
  const data = await res?.json().catch(() => ({}));
  if (!res?.ok) {
    // A key turned up since this window opened (another tab): nothing was taken, and paying replaces it.
    if (res?.status === 409 && !data?.code && !renew.value) {
      renew.value = true;
      return pay();
    }
    noneFree.value = data?.code === "no_server";
    runs.value = data?.code === "server_limit" ? (data.house ?? null) : null;
    error.value = noneFree.value ? w.noneFree : runs.value ? w.atLimit(runs.value.name) : typeof data?.message === "string" ? refusalText(data) : joinWords.didntWork;
    // Short after all (spent in another tab): this step shows it from the balance.
    if (data?.code === "no_credit") void loadMe();
    // The pay button has made way for the way out: the focus goes there.
    await nextTick();
    dialog.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return;
  }
  void loadMe();
  paid.value = true;
  step.value = 3;
}

function clearRefusal() {
  error.value = "";
  noneFree.value = false;
  runs.value = null;
}

// It may open on any step: the focus starts where that step wants it.
onMounted(() => {
  dialog.value?.showModal();
  dialog.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
});

// The sizes are one radio group: the arrow keys move the choice, as in any radio group, and the focus follows it.
const planButtons: HTMLButtonElement[] = [];
function onPlanKey(e: KeyboardEvent, i: number) {
  const last = plans.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  plan.value = plans[to].id;
  planButtons[to]?.focus();
}

// Clicks on the dimmed backdrop land on the dialog itself: treat them as Cancel.
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}

// The server called home while we were waiting: move focus to "Server up" so readers hear it too. `post`: the
// heading only exists once Vue has drawn the new state.
watch(
  () => props.live,
  (live) => live && step.value === 3 && dialog.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus(),
  { flush: "post" },
);
</script>

<template>
  <dialog ref="dialog" class="sheet step-sign" :aria-label="w.rentLabel" @close="emit('close')" @click="onClick">
    <div class="inner">
      <button type="button" class="x" :aria-label="step === 3 ? w.laterEsc : joinWords.cancel" @click="dialog?.close()"><span aria-hidden="true">X</span></button>

      <UiSteps :step="step" :total="3">
        <form v-if="step === 1" class="form" novalidate @submit.prevent="step = 2">
          <h2>{{ w.pickTitle }}</h2>
          <p class="muted">{{ explain.bill }}</p>
          <div class="plans" role="radiogroup" :aria-label="w.sizeLabel">
            <button
              v-for="(p, i) in plans"
              :key="p.id"
              :ref="(el) => (planButtons[i] = el as HTMLButtonElement)"
              type="button"
              class="plan"
              role="radio"
              :aria-checked="plan === p.id"
              :tabindex="plan === p.id ? 0 : -1"
              :autofocus="p.id === plan"
              :data-autofocus="p.id === plan ? '' : undefined"
              @click="plan = p.id"
              @keydown="onPlanKey($event, i)"
            >
              <span class="plan-ic"><Icon name="server" :size="20" /></span>
              <span class="size">{{ w.plans[p.id] }}</span>
              <span class="spec">{{ w.spec(p.vcpu, p.gb) }}</span>
              <span class="price" :class="{ dear: shortBy(me?.credit, p.fcfa) > 0 }">{{ fcfa(p.fcfa) }}<span class="per">{{ w.aMonth }}</span></span>
              <span v-if="plan === p.id" class="picked" aria-hidden="true"><Icon name="tick" :size="14" /></span>
            </button>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button class="primary"><Icon name="next" :size="20" />{{ w.rentIt }}</button>
          </div>
        </form>

        <form v-else-if="step === 2" class="form pay" novalidate @submit.prevent="pay">
          <h2>{{ w.payTitle }}</h2>
          <p class="amount"><strong>{{ fcfa(price) }}</strong><span>{{ w.aMonth.trim() }}</span></p>
          <p class="muted">{{ w.spec(plans.find((p) => p.id === plan)!.vcpu, plans.find((p) => p.id === plan)!.gb) }}. {{ w.payWhy }}</p>
          <CreditAfter :price="price" />
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <!-- No way to pay here: the one way out instead. -->
          <div v-if="runs" class="nav">
            <RouterLink :to="`/houses/${runs.id}`" class="button primary" data-autofocus>{{ w.goThere(runs.name) }}</RouterLink>
          </div>
          <div v-else-if="noneFree" class="nav">
            <button type="button" class="primary" data-autofocus @click="dialog?.close()">{{ w.close }}</button>
          </div>
          <div v-else class="nav">
            <button type="button" class="second" :disabled="sending" @click="clearRefusal(); step = 1">{{ joinWords.back }}</button>
            <button class="primary" data-autofocus :disabled="sending || short > 0">{{ sending ? w.paying : w.payIt(fcfa(price)) }}</button>
          </div>
        </form>

        <div v-else class="form wait" aria-live="polite">
          <template v-if="live">
            <h2 autofocus data-autofocus tabindex="-1">{{ w.upTitle }}</h2>
            <span class="ring on" aria-hidden="true"><Icon name="tick" :size="28" /></span>
            <p class="muted">{{ w.upWhy }}</p>
            <div class="nav">
              <button type="button" class="primary" @click="dialog?.close()"><Icon name="tick" :size="20" />{{ w.done }}</button>
            </div>
          </template>
          <template v-else>
            <h2 autofocus data-autofocus tabindex="-1">{{ w.settingUpTitle }}</h2>
            <span class="ring spin" aria-hidden="true" />
            <p class="muted">{{ w.settingUpWhy }}</p>
            <p v-if="paid" class="muted small">{{ w.paidLine(fcfa(price)) }}</p>
            <div class="nav">
              <button type="button" class="primary" @click="dialog?.close()">{{ w.later }}</button>
            </div>
          </template>
        </div>
      </UiSteps>
    </div>
  </dialog>
</template>

<style scoped>
/* A floating card over the dimmed city (style.css's .step-sign gives it the white card and its head), a quick pop. */
.sheet {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sheet[open] { animation: menu-pop var(--dur-slow) var(--ease-pop); }
.sheet::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.form { display: grid; gap: 16px; }
.form > p { font-size: 15px; font-weight: 600; line-height: 21px; }
.error { font-size: 14px; }

/* A size is a tile you pick, like a game's difficulty: the soft paper, and the chosen one white with an ink ring and
   a tick. */
.plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.plan {
  position: relative;
  display: grid;
  gap: 2px;
  justify-items: start;
  min-height: 0;
  padding: 12px 14px;
  border-radius: var(--tile-r);
  background: var(--tile);
  box-shadow: none;
  color: var(--text);
  text-align: left;
  transition: background-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.plan:hover:not(:disabled) { background: var(--fill); }
.plan:active:not(:disabled) { transform: none; }
.plan[aria-checked="true"], .plan[aria-checked="true"]:hover:not(:disabled) { background: var(--surface); box-shadow: inset 0 0 0 2px var(--text); }
.plan-ic { display: grid; place-items: center; width: 32px; height: 32px; margin-bottom: 6px; border-radius: 10px; background: var(--surface); color: var(--muted); }
.plan[aria-checked="true"] .plan-ic { background: var(--tile); color: var(--text); }
.size { font: 800 17px/22px var(--font); }
.spec { font: 600 13px/18px var(--num); color: var(--muted); }
.price { display: grid; margin-top: 4px; font: 800 15px/20px var(--num); font-variant-numeric: tabular-nums; }
/* More than you have: it's still there to pick, and the next step says what to do. */
.price.dear { color: var(--danger); }
.per { display: block; font-size: 13px; font-weight: 600; color: var(--muted); }
.picked { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--text); color: var(--surface); }

/* The first month, as the first rent's card: the amount big on the soft paper, what it does to your credit, two
   buttons. */
.pay { justify-items: stretch; }
.amount { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); }
.amount strong { font-size: 34px; font-weight: 800; line-height: 40px; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
.amount span { font-size: 15px; font-weight: 600; color: var(--muted); }

.small { font-size: 13px !important; }

/* The one button family: 48 high, the main one red and twice as wide, Back in grey. The amount on the main one is
   long: it keeps to the card, however narrow. */
.nav { display: flex; align-items: center; gap: 10px; }
.nav button, .nav a { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; }
.nav .second { flex: 1 1 0; }
.nav .primary { flex: 2 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.wait { justify-items: center; text-align: center; }
/* The title stays the card's head, as on the steps before it. */
.wait h2 { justify-self: stretch; text-align: left; }
.wait .nav { justify-self: stretch; }
.ring { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; }
.ring.on { background: var(--live-soft); color: var(--live); }
/* A calm spinner: a ring with one ink quarter, turning slowly. */
.ring.spin { border: 4px solid var(--fill); border-top-color: var(--text); animation: turn 1.4s linear infinite; }
@keyframes turn {
  to { transform: rotate(360deg); }
}

@media (max-width: 520px) {
  /* A phone: the card becomes a sheet along the bottom edge. */
  .plans { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .plan { grid-template-columns: auto 1fr auto; grid-template-areas: "ic size price" "ic spec price"; align-items: center; column-gap: 12px; padding: 10px 14px; }
  .plan-ic { grid-area: ic; margin: 0; }
  .size { grid-area: size; }
  .spec { grid-area: spec; }
  .price { grid-area: price; margin: 0; padding-right: 26px; text-align: right; }
  .picked { top: 50%; margin-top: -10px; }
}
/* A short window (a landscape phone, a small laptop): tighter, so every step fits without scrolling. */
@media (max-height: 640px) {
    .form { gap: 10px; }
  .nav { margin-top: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] { animation: none; }
  .plan, .nav button { transition: none; }
  .plan:active:not(:disabled) { transform: none; }
  .ring.spin { animation-duration: 4s; }
}
</style>
