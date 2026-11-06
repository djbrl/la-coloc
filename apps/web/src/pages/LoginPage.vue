<script setup lang="ts">
// Logging in: GitHub first, the demo beside it. On a dev server, a quiet second step lets you be anyone. Behind it, the
// landing's flat at night (public/landing/street.webp, rendered from our own scene) under a dark veil.
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import UiSteps from "../components/UiSteps.vue";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { loginWords as w } from "../components/list/words";
import { setVisiting } from "../landing";
import { loadMe, postJSON } from "../session";

const route = useRoute();
const router = useRouter();
const config = ref<{ github: boolean; dev: boolean } | null>(null);
const step = ref(1);
const login = ref("");
const message = ref("");
const busy = ref("");

const error = computed(() => (w.errors as Record<string, string>)[String(route.query.error ?? "")] ?? "");

// The core isn't answering, so what this server offers is unknown (not "nothing"): it asks again by itself.
const waiting = ref(false);
async function loadConfig() {
  const res = await fetch("/api/auth/config").catch(() => null);
  waiting.value = !res?.ok && (await wentDown(res));
  if (waiting.value) return;
  config.value = res?.ok ? await res.json() : { github: false, dev: false };
}
onMounted(loadConfig);
useWhenBack(loadConfig);

// GitHub login leaves the page for the API, then GitHub. With the API unreachable (a laptop asleep, a tunnel gone),
// the browser would land on the host's own 404 page: ask first, and show the calm "can't be reached" card instead.
async function withGithub() {
  busy.value = "github";
  const up = await fetch("/api/health", { signal: AbortSignal.timeout(6000) })
    .then((r) => r.ok)
    .catch(() => false);
  busy.value = "";
  if (up) {
    window.location.href = "/api/auth/github";
    return;
  }
  config.value = null;
  waiting.value = true;
}

// The demo: the city, as a visitor.
function tryDemo() {
  setVisiting(true);
  void router.push("/");
}

async function devLogin(as: string) {
  message.value = "";
  if (!as.trim()) {
    message.value = w.enterLogin;
    return;
  }
  busy.value = as.trim();
  const res = await postJSON("/api/auth/dev-login", { login: as.trim() });
  busy.value = "";
  if (!res.ok) {
    message.value = res.message;
    return;
  }
  await loadMe();
  router.push("/");
}
</script>

<template>
  <section class="login">
    <div class="card sign">
      <div class="sign-frame">
        <header class="sign-band title"><h1>La Coloc</h1></header>
        <div class="sign-body body">
          <Waiting v-if="waiting && !config" @retry="loadConfig" />
          <p v-else-if="!config" class="muted center" aria-live="polite">{{ w.oneMoment }}</p>
          <UiSteps v-else :step="step" :total="config.dev ? 2 : 1" center>
            <div v-if="step === 1" class="step">
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <a v-if="config.github" class="button primary main" href="/api/auth/github" :aria-busy="busy === 'github'" @click.prevent="withGithub">
                <svg viewBox="0 0 16 16" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
                {{ w.withGithub }}
              </a>
              <p v-else class="muted">{{ w.noGithub }}</p>
              <button type="button" class="second main" @click="tryDemo">{{ w.tryDemo }}</button>
              <template v-if="config.dev">
                <button v-if="config.github" type="button" class="link" @click="step = 2">{{ w.useDev }} <span aria-hidden="true">›</span></button>
                <button v-else type="button" class="primary main" @click="step = 2">{{ w.useDev }}</button>
              </template>
            </div>

            <form v-else class="step" novalidate @submit.prevent="devLogin(login)">
              <h2 class="who">{{ w.whoToday }}</h2>
              <p class="muted">{{ w.devLede }}</p>
              <div class="quick">
                <button v-for="who in ['jib', 'awa', 'moussa', 'koffi']" :key="who" type="button" :disabled="!!busy" @click="devLogin(who)">
                  {{ busy === who ? "…" : who }}
                </button>
              </div>
              <div class="row">
                <input
                  v-model="login"
                  data-autofocus
                  :placeholder="w.newName"
                  :aria-label="w.loginName"
                  autocapitalize="off"
                  spellcheck="false"
                  :aria-invalid="!!message"
                  @input="message = ''"
                />
                <button class="primary" :disabled="!!busy">{{ w.logIn }}</button>
              </div>
              <p v-if="message" class="error small" role="alert">{{ message }}</p>
              <button type="button" class="link" @click="step = 1; message = ''"><span aria-hidden="true">‹</span> {{ w.back }}</button>
            </form>
          </UiSteps>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The flat at night behind a dark veil, and the white card in the middle of it. */
.login {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 16px;
  background: linear-gradient(var(--scrim), var(--scrim)), #120c1c url("/landing/street.webp") center / cover no-repeat;
}
.card { width: min(500px, 100%); }
/* The name is the whole title here: bigger than a panel's, and its band grows with it. */
.title { height: auto; padding: 10px 16px; }
.title h1 { font-family: var(--brand); font-size: 74px; line-height: 1.08; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
.center { text-align: center; }
.step { display: grid; gap: 10px; justify-items: stretch; text-align: center; width: 100%; }
/* The two ways in: the card's buttons (48, with their lip), across the width. */
.main { width: 100%; }
.main svg { width: 22px; height: 22px; }
.link { justify-self: center; }
.who { font-size: 22px; line-height: 28px; }
.quick { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.quick button { flex: 1 1 88px; }
.row { display: flex; gap: 8px; width: 100%; }
.row input { flex: 1; min-width: 0; }
@media (max-width: 520px) {
  .title h1 { font-size: clamp(36px, 13vw, 74px); }
}
@media (max-width: 420px) {
  .row { flex-direction: column; }
}
</style>
