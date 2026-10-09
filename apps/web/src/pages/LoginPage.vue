<script setup lang="ts">
// Logging in: GitHub first. On a dev server, a quiet second step lets you be anyone.
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import UiSteps from "../components/UiSteps.vue";
import { loadMe, postJSON } from "../session";

const route = useRoute();
const router = useRouter();
const config = ref<{ github: boolean; dev: boolean } | null>(null);
const step = ref(1);
const login = ref("");
const message = ref("");
const busy = ref("");

const errors: Record<string, string> = {
  state: "That login link expired or came from somewhere else. Try again.",
  github: "GitHub didn't let us in. Try again.",
};
const error = computed(() => errors[String(route.query.error ?? "")] ?? "");

onMounted(async () => {
  const res = await fetch("/api/auth/config").catch(() => null);
  config.value = res?.ok ? await res.json() : { github: false, dev: false };
});

async function devLogin(as: string) {
  message.value = "";
  if (!as.trim()) {
    message.value = "Enter a login first.";
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
    <div class="wrap narrow">
      <p v-if="!config" class="muted center" aria-live="polite">One moment…</p>
      <UiSteps v-else :step="step" :total="config.dev ? 2 : 1" center>
        <div v-if="step === 1" class="step">
          <h1>Move into the city.</h1>
          <p class="lede muted">Your GitHub account is your key. Houses see what you've built before they let you in.</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <a v-if="config.github" class="button primary" href="/api/auth/github">Log in with GitHub</a>
          <p v-else class="muted">GitHub login isn't set up on this server yet.</p>
          <template v-if="config.dev">
            <button v-if="config.github" class="link" @click="step = 2">Use a development login <span aria-hidden="true">›</span></button>
            <button v-else class="primary" @click="step = 2">Use a development login</button>
          </template>
        </div>

        <form v-else class="step" novalidate @submit.prevent="devLogin(login)">
          <h1>Who are you today?</h1>
          <p class="lede muted">Only on a dev server. Be anyone from the seeded city, or someone new.</p>
          <div class="quick">
            <button v-for="who in ['jib', 'awa', 'moussa', 'koffi']" :key="who" type="button" :disabled="!!busy" @click="devLogin(who)">
              {{ busy === who ? "…" : who }}
            </button>
          </div>
          <div class="row">
            <input
              v-model="login"
              data-autofocus
              placeholder="Or a new name, like fatou"
              aria-label="Login name"
              autocapitalize="off"
              spellcheck="false"
              :aria-invalid="!!message"
              @input="message = ''"
            />
            <button class="primary" :disabled="!!busy">Log in</button>
          </div>
          <p v-if="message" class="error small" role="alert">{{ message }}</p>
          <button type="button" class="link" @click="step = 1; message = ''"><span aria-hidden="true">‹</span> Back</button>
        </form>
      </UiSteps>
    </div>
  </section>
</template>

<style scoped>
.login { padding-top: 12vh; min-height: calc(100vh - 48px); }
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
}
</style>
