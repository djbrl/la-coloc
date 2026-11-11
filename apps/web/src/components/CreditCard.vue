<script setup lang="ts">
// Your credit, from the coin on the city's screen: what you have, what earns more, and (folded) where it went lately.
// Its head says plainly that this is a demo and the money isn't real. A native <dialog>, like the other steps: it traps
// focus and closes on Escape. When payments are set up on the server, "Add credit" (right under the ways to earn)
// unfolds a row of amounts. With PayDunya, its page takes the payment and you come back here with the credit added
// (`added`). With Paxity, an amount asks for a mobile money number and an operator, then the card waits while you
// approve the payment on your phone, asking the API every few seconds. Once it's paid, a tick in a rounded square says
// so, then the card comes back with its balance counting up to the new amount.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { language } from "../i18n";
import { type Refusal, refusalText } from "../refusals";
import { me } from "../session";
import { fcfa } from "./lobby/house/server";
import Icon from "./lobby/house/Icon.vue";
import { opensAnywhere, qrPath } from "./lobby/tutorial/share";
import { creditWords as w } from "./words";

defineProps<{ added?: boolean }>();
const emit = defineEmits<{ close: [] }>();

interface CreditDetails {
  credit: number;
  entries: { amount: number; reason: keyof typeof w.reasons; at: string }[];
  welcome: number;
  review: number;
  arena: number;
  topUp: { amounts: number[]; test: boolean; provider: string; phone: { code: string; prefix: string; methods: string[] }[] | null } | null;
}

// What Paxity asks the payer to do, from the API (credit.controller.ts, `pending`).
interface Pending {
  ref: string;
  method: string;
  instructions: string | null;
  deepLink: string | null;
  redirectUrl: string | null;
  qrCode: string | null;
  expiresAt: string | null;
}

// Operators by Paxity's names: brand names, the same in both languages.
const OPERATORS: Record<string, string> = { WAVE: "Wave", ORANGE_MONEY: "Orange Money", FREE_MONEY: "Free Money", MTN_MOMO: "MTN MoMo", MOOV_MONEY: "Moov Money" };
const operator = (m: string) => OPERATORS[m] ?? m;

const dialog = ref<HTMLDialogElement | null>(null);
const details = ref<CreditDetails | null>(null);
const LAST = 5;

// The latest movements, and the credit you started with when there's room for it: it has no row of its own.
const rows = computed(() => {
  const d = details.value;
  if (!d) return [];
  const moved = d.entries.map((e) => ({ amount: e.amount, reason: e.reason as keyof typeof w.reasons }));
  return moved.length < LAST ? [...moved, { amount: d.welcome, reason: "welcome" as const }] : moved;
});
const signed = (n: number) => `${n > 0 ? "+" : "−"}${fcfa(Math.abs(n))}`;
// The balance as a big number, its unit beside it in small.
const digits = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// What most people don't need first stays folded: the history, and the amounts to buy.
const historyOpen = ref(false);
const buyOpen = ref(false);

// Buying credit. With PayDunya the API makes an invoice and the whole page goes to PayDunya to pay it. With Paxity an
// amount first opens the number and the operator (`chosen`), and paying starts a request the card then waits on.
const buying = ref(false);
const error = ref("");
const chosen = ref<number | null>(null);
const country = ref("SN");
const phone = ref("");
const method = ref("");
const pending = ref<Pending | null>(null);

const countries = computed(() => details.value?.topUp?.phone ?? []);
const here = computed(() => countries.value.find((c) => c.code === country.value) ?? countries.value[0]);
const regionName = (code: string) => {
  try {
    return new Intl.DisplayNames([language.lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};
// A QR code as Paxity sends it: a link to an image, an image already, or the image's base64 alone.
const qrSrc = computed(() => {
  const q = pending.value?.qrCode?.trim();
  if (!q) return null;
  if (/^(https:\/\/|data:image\/)/.test(q)) return q;
  return /^[A-Za-z0-9+/=\s]+$/.test(q) && q.length > 100 ? `data:image/png;base64,${q.replace(/\s/g, "")}` : null;
});
const appLink = computed(() => pending.value?.deepLink ?? pending.value?.redirectUrl ?? null);
// No QR code from Paxity (its test mode sends none): we draw one of the link instead, for a computer, where a phone can
// scan it. In test mode it opens Paxity's sandbox page on the phone, to pick the outcome; the card here follows.
const onPhone = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
// Low correction and a wide code: Paxity's sandbox links are long, and a dense code is hard to read off a screen.
const linkQr = computed(() => (!qrSrc.value && !onPhone && appLink.value?.startsWith("https://") && opensAnywhere(appLink.value) ? qrPath(appLink.value, 4, "L") : null));
// No code to scan (on a phone, or Paxity sent neither): a key that opens the operator's app or page instead.
const showQr = computed(() => Boolean(qrSrc.value || linkQr.value));

// Paid: the tick holds the card for a moment (`paid`), then the balance counts up from where it was (`shown`).
const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const paid = ref<number | null>(null);
const shown = ref<number | null>(null);
let paidTimer: ReturnType<typeof setTimeout> | null = null;
let frame = 0;
function countUp(from: number) {
  const to = me.value?.credit ?? from;
  if (calm || to <= from) {
    shown.value = null;
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    shown.value = from + (to - from) * (1 - (1 - t) ** 3);
    frame = t < 1 ? requestAnimationFrame(step) : 0;
    if (t >= 1) shown.value = null;
  };
  frame = requestAnimationFrame(step);
}
async function celebrate(amount: number) {
  const before = me.value?.credit ?? 0;
  shown.value = before;
  paid.value = amount;
  await Promise.all([load(), new Promise((r) => (paidTimer = setTimeout(r, calm ? 1200 : 2000)))]);
  paid.value = null;
  countUp(before);
}

function pickCountry(code: string) {
  country.value = code;
  const methods = countries.value.find((c) => c.code === code)?.methods ?? [];
  if (!methods.includes(method.value)) method.value = methods[0] ?? "";
}

async function topUp(amount: number) {
  if (buying.value) return;
  error.value = "";
  if (details.value?.topUp?.phone) {
    chosen.value = amount;
    pickCountry(here.value?.code ?? "SN");
    return;
  }
  buying.value = true;
  try {
    const res = await fetch("/api/credit/top-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.url === "string") {
      window.location.assign(data.url);
      return;
    }
    error.value = data ? refusalText(data as Refusal) : w.tryAgain;
  } catch {
    error.value = w.tryAgain;
  }
  buying.value = false;
}

async function pay() {
  if (buying.value || chosen.value === null) return;
  buying.value = true;
  error.value = "";
  try {
    const body = { amount: chosen.value, country: country.value, phone: phone.value, method: method.value };
    const res = await fetch("/api/credit/top-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.pending?.ref === "string") {
      pending.value = data.pending as Pending;
      wait();
    } else {
      error.value = data ? refusalText(data as Refusal) : w.tryAgain;
    }
  } catch {
    error.value = w.tryAgain;
  }
  buying.value = false;
}

// Waiting on Paxity: ask every three seconds, skip a turn while the last answer is out, give up after the request's own
// end (or ten minutes).
let timer: ReturnType<typeof setInterval> | null = null;
let asking = false;
function stopWaiting() {
  if (timer) clearInterval(timer);
  timer = null;
}
function wait() {
  stopWaiting();
  const until = Math.min(Date.parse(pending.value?.expiresAt ?? "") || Infinity, Date.now() + 10 * 60_000);
  timer = setInterval(async () => {
    const p = pending.value;
    if (!p) return stopWaiting();
    if (Date.now() > until) {
      stopWaiting();
      pending.value = null;
      error.value = w.payExpired;
      return;
    }
    if (asking) return;
    asking = true;
    try {
      const res = await fetch(`/api/credit/top-up/check?ref=${encodeURIComponent(p.ref)}`);
      const data = res.ok ? await res.json() : null;
      if (pending.value?.ref !== p.ref) return;
      if (data?.status === "completed") {
        stopWaiting();
        const amount = chosen.value ?? 0;
        pending.value = null;
        chosen.value = null;
        buyOpen.value = false;
        await celebrate(amount);
      } else if (data?.status === "failed" || data?.status === "cancelled") {
        stopWaiting();
        pending.value = null;
        error.value = w.payFailed;
      }
    } catch {
      // Nobody answered this time: ask again on the next turn.
    } finally {
      asking = false;
    }
  }, 3_000);
}
function cancel() {
  stopWaiting();
  pending.value = null;
}
onBeforeUnmount(() => {
  stopWaiting();
  if (paidTimer) clearTimeout(paidTimer);
  cancelAnimationFrame(frame);
});

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}

async function load() {
  try {
    const res = await fetch("/api/credit");
    if (!res.ok) return;
    details.value = await res.json();
    if (me.value && details.value) me.value.credit = details.value.credit;
  } catch {
    // Nobody answered: the balance you already know stays on screen.
  }
}

onMounted(() => {
  dialog.value?.showModal();
  void load();
});
</script>

<template>
  <dialog ref="dialog" class="step-sign" :aria-label="w.title" @close="emit('close')" @click="onClick">
    <div class="inner">
      <header class="sign-band">
        <span class="chip"><Icon name="coin" :size="22" /></span>
        <h2>{{ w.title }}</h2>
        <p class="sign-sub">{{ w.fake }}</p>
        <button type="button" class="sign-x" :aria-label="w.close" @click="dialog?.close()"><span aria-hidden="true">X</span></button>
      </header>
      <!-- Paid: a tick drawn in a rounded square and one line, before the card comes back. -->
      <div v-if="paid !== null" class="body paid" role="status">
        <svg class="tick" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
          <rect class="tick-box" x="4" y="4" width="88" height="88" rx="26" />
          <path class="tick-mark" d="M29 49l13 13 25-27" pathLength="1" />
        </svg>
        <h3>{{ w.paidHead }}</h3>
        <p class="tiny">{{ w.paidLine(fcfa(paid)) }}</p>
      </div>
      <div v-else class="body">
        <p class="stat"><strong class="num" :class="{ rising: shown !== null }">{{ digits(shown ?? me?.credit ?? 0) }}</strong><span class="unit">{{ w.unit }}</span></p>
        <p v-if="added" class="tiny done" role="status">{{ w.topUpAdded }}</p>
        <template v-if="details">
          <section class="earn">
            <h3 class="label">{{ w.earnHead }}</h3>
            <ul>
              <li><Icon name="check" :size="20" /><span>{{ w.review }}</span><b>+{{ fcfa(details.review) }}</b></li>
              <li><Icon name="trophy" :size="20" /><span>{{ w.arena }}</span><b>{{ w.upTo(fcfa(details.arena)) }}</b></li>
            </ul>
          </section>
          <!-- Adding credit: one grey key, which opens the amounts. With PayDunya an amount goes to its page to pay; with
               Paxity it asks for a number and an operator, then waits while you approve it on your phone. -->
          <div v-if="details.topUp" class="top-up">
            <button v-if="!buyOpen" type="button" class="second wide add" :aria-expanded="false" @click="buyOpen = true"><Icon name="plus" :size="18" />{{ w.topUp }}</button>
            <template v-else-if="pending">
              <!-- One line, the code, and (in test mode) a note that it's a sandbox. Paxity's own text is for
                   developers in test mode; live, it may say what to dial, so it shows when there's no code. -->
              <template v-if="showQr">
                <p class="scan-head">{{ w.scanToPay }}</p>
                <figure class="qr">
                  <img v-if="qrSrc" :src="qrSrc" alt="" width="232" height="232" />
                  <svg v-else-if="linkQr" :viewBox="`0 0 ${linkQr.size} ${linkQr.size}`" width="232" height="232" shape-rendering="crispEdges" aria-hidden="true"><path :d="linkQr.d" fill="#000" /></svg>
                </figure>
              </template>
              <template v-else>
                <p class="scan-head">{{ w.approve(operator(pending.method)) }}</p>
                <p v-if="pending.instructions && !details.topUp.test" class="tiny">{{ pending.instructions }}</p>
                <a v-if="appLink" class="button primary wide" :href="appLink" target="_blank" rel="noopener noreferrer">{{ w.openApp(operator(pending.method)) }}</a>
              </template>
              <p v-if="details.topUp.test" class="tiny sandbox">{{ w.sandbox }}</p>
              <button type="button" class="link" @click="cancel">{{ w.cancel }}</button>
            </template>
            <form v-else-if="chosen !== null && details.topUp.phone" class="pay" @submit.prevent="pay">
              <h3 class="label">{{ w.payHead(fcfa(chosen)) }}</h3>
              <div class="number">
                <label class="field country">
                  <span class="tiny">{{ w.country }}</span>
                  <select :value="country" @change="pickCountry(($event.target as HTMLSelectElement).value)">
                    <option v-for="c in countries" :key="c.code" :value="c.code">{{ regionName(c.code) }} +{{ c.prefix }}</option>
                  </select>
                </label>
                <label class="field">
                  <span class="tiny">{{ w.phone }}</span>
                  <input v-model="phone" type="tel" inputmode="tel" autocomplete="tel-national" required :placeholder="here?.code === 'SN' ? '77 123 45 67' : ''" />
                </label>
              </div>
              <fieldset class="operators">
                <legend class="tiny">{{ w.payWith }}</legend>
                <button v-for="m in here?.methods ?? []" :key="m" type="button" class="second" :aria-pressed="method === m" @click="method = m">{{ operator(m) }}</button>
              </fieldset>
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <button type="submit" class="primary wide" :disabled="buying || !phone.trim() || !method">{{ w.pay(fcfa(chosen)) }}</button>
              <button type="button" class="link" @click="chosen = null; error = ''">{{ w.back }}</button>
              <p v-if="details.topUp.test" class="tiny">{{ w.topUpTest(details.topUp.provider) }}</p>
            </form>
            <template v-else>
              <h3 class="label">{{ w.pickAmount }}</h3>
              <div class="amounts">
                <button v-for="a in details.topUp.amounts" :key="a" type="button" class="second" :disabled="buying" :aria-label="w.topUpName(fcfa(a), details.topUp.provider)" @click="topUp(a)">+{{ fcfa(a) }}</button>
              </div>
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <p v-else-if="details.topUp.test" class="tiny">{{ w.topUpTest(details.topUp.provider) }}</p>
            </template>
          </div>
          <!-- Where it went: folded, its count beside its name. -->
          <div class="fold">
            <button type="button" class="fold-head" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
              <span class="fold-name">{{ w.history }}</span>
              <span class="fold-meta">{{ w.moves(rows.length) }}</span>
              <svg :class="{ up: historyOpen }" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <ul v-if="historyOpen" class="moved">
              <li v-for="(r, i) in rows" :key="i">
                <span class="status-mark" :class="r.amount > 0 ? 'ok' : 'none'" aria-hidden="true"><Icon v-if="r.amount > 0" name="tick" :size="12" /></span>
                <span>{{ w.reasons[r.reason] }}</span><b>{{ signed(r.amount) }}</b>
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.body { display: grid; gap: 16px; padding: 4px 20px 20px; }
/* The balance: a big number on a soft tile, its unit beside it. */
.stat { display: flex; align-items: baseline; gap: 8px; margin: 0; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); }
.stat strong { font: 800 34px/40px var(--display); white-space: nowrap; }
.unit { font-size: 15px; font-weight: 800; color: var(--muted); }
.tiny { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.done { color: var(--live); font-weight: 800; }
ul { display: grid; margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 12px; min-height: 44px; font-size: 15px; font-weight: 800; }
li > span:not(.status-mark) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li b { font: 800 14px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Ways to earn: the icon in the red, what you'd get in the green. */
.earn { display: grid; gap: 2px; }
.earn svg { flex: none; color: var(--accent); }
.earn b { color: var(--live); }
/* The folded history: a row you open, on a soft tile. */
.fold { border-radius: var(--tile-r); background: var(--tile); }
.fold-head { width: 100%; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: var(--tile-r); background: transparent; box-shadow: none; color: var(--text); font: 800 15px/1.2 var(--font); text-align: left; }
.fold-head:hover:not(:disabled) { background: transparent; }
.fold-name { flex: 1 1 auto; }
.fold-meta { font-size: 13px; font-weight: 600; color: var(--muted); }
.fold-head svg { flex: none; color: var(--muted); transition: rotate var(--dur-fast) var(--ease); }
.fold-head svg.up { rotate: 180deg; }
.moved { padding: 0 14px 10px; }
.moved li { min-height: 34px; gap: 10px; font-size: 14px; font-weight: 600; }
.top-up { display: grid; gap: 8px; }
.wide { width: 100%; }
.add { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.amounts { display: flex; gap: 8px; }
.amounts button { flex: 1 1 0; min-width: 0; padding: 0 8px var(--lip); font: 800 15px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.error { margin: 0; font-size: 14px; color: var(--danger); }
/* Paying by mobile money: the country and the number side by side, the operators as keys you press. */
.pay { display: grid; gap: 10px; }
.number { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 8px; }
.field { display: grid; gap: 4px; min-width: 0; }
.field select, .field input { width: 100%; min-width: 0; }
.operators { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
.operators legend { padding: 0 0 4px; }
.operators button { flex: 1 1 auto; }
.operators button[aria-pressed="true"] { color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }
.top-up .link { justify-self: center; }
a.button.wide { display: flex; justify-content: center; text-decoration: none; }
.scan-head { margin: 0; font-size: 16px; font-weight: 800; text-align: center; }
.qr { display: grid; justify-items: center; margin: 0; }
.qr img, .qr svg { border-radius: 12px; background: #fff; padding: 8px; }
.sandbox { text-align: center; }
/* Paid: the square pops in, then its tick draws itself. */
.paid { justify-items: center; gap: 6px; padding: 28px 20px 36px; text-align: center; }
.paid h3 { margin: 10px 0 0; font: 800 22px/1.2 var(--display); }
.tick { overflow: visible; }
.tick-box { fill: var(--live); transform-origin: 48px 48px; animation: tick-pop 420ms var(--ease-pop) both; }
.tick-mark { fill: none; stroke: #fff; stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: tick-draw 380ms 300ms ease-out forwards; }
@keyframes tick-pop {
  from { transform: scale(0.4); opacity: 0; }
}
@keyframes tick-draw {
  to { stroke-dashoffset: 0; }
}
/* The balance while it counts up: green, then back to its colour. */
.num { transition: color var(--dur-slow) var(--ease); }
.num.rising { color: var(--live); font-variant-numeric: tabular-nums; }
/* On a phone the card is too narrow for both: the country goes above the number, so its name isn't cut. */
@media (max-width: 480px) {
  .number { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
  .tick-box { animation: none; }
  .tick-mark { animation: none; stroke-dashoffset: 0; }
}
</style>
