<script setup lang="ts">
// Logging in: GitHub first. On a dev server, a quiet second step lets you be anyone. Behind it, the city itself: a
// still of the 3D lobby by day (public/login-city.webp, ~100 KB, rendered from our own scene), under a flat card
// that keeps the words readable in either theme. A still rather than a live render: a phone pays nothing for it.
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import UiSteps from "../components/UiSteps.vue";
import Waiting from "../components/Waiting.vue";
import { useWhenBack, wentDown } from "../core";
import { loginWords as w } from "../components/list/words";
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
  <section class="band login">
    <div class="wrap narrow card">
      <Waiting v-if="waiting && !config" @retry="loadConfig" />
      <p v-else-if="!config" class="muted center" aria-live="polite">{{ w.oneMoment }}</p>
      <UiSteps v-else :step="step" :total="config.dev ? 2 : 1" center>
        <div v-if="step === 1" class="step">
          <h1>{{ w.moveIn }}</h1>
          <p class="lede muted">{{ w.lede }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <a v-if="config.github" class="button primary" href="/api/auth/github">{{ w.withGithub }}</a>
          <p v-else class="muted">{{ w.noGithub }}</p>
          <template v-if="config.dev">
            <button v-if="config.github" class="link" @click="step = 2">{{ w.useDev }} <span aria-hidden="true">›</span></button>
            <button v-else class="primary" @click="step = 2">{{ w.useDev }}</button>
          </template>
        </div>

        <form v-else class="step" novalidate @submit.prevent="devLogin(login)">
          <h1>{{ w.whoToday }}</h1>
          <p class="lede muted">{{ w.devLede }}</p>
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
  </section>
</template>

<style scoped>
.login {
  padding: 12vh 16px 32px;
  min-height: calc(100vh - 48px);
  background: var(--bg) url("/login-city.webp") center / cover no-repeat;
}
/* A flat floating card over the city, like the lobby's: no glass, no blur. */
.card { max-width: 560px; padding: 40px 32px 32px; border-radius: var(--r-xl); background: var(--surface); box-shadow: var(--shadow); }
.center { text-align: center; }
.step { display: grid; gap: 20px; justify-items: center; text-align: center; width: 100%; }
.lede { max-width: 520px; }
.button.primary { min-height: 48px; padding: 0 28px; margin-top: 8px; }
.quick { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.quick button { min-width: 88px; }
.row { display: flex; gap: 10px; width: 100%; max-width: 440px; }
.row input { flex: 1; min-width: 0; }
@media (max-width: 420px) {
  .row { flex-direction: column; }
  .login { padding-top: 8vh; }
  .card { padding: 28px 20px 24px; }
}
</style>
