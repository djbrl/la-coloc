<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loadMe, postJSON } from "../session";

const route = useRoute();
const router = useRouter();
const config = ref<{ github: boolean; dev: boolean } | null>(null);
const login = ref("");
const message = ref("");

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
  const res = await postJSON("/api/auth/dev-login", { login: as.trim() });
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
    <h1>Move into the city</h1>
    <p class="muted">Your GitHub account is your key: houses see what you've built before they let you in.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="config">
      <a v-if="config.github" class="github" href="/api/auth/github">Log in with GitHub</a>
      <p v-else class="muted small">GitHub login isn't set up on this server yet.</p>

      <form v-if="config.dev" class="dev" @submit.prevent="devLogin(login)">
        <h2>Development login</h2>
        <p class="muted small">Only on a dev server. Be anyone from the seeded city, or a new name.</p>
        <div class="quick">
          <button v-for="who in ['jib', 'awa', 'moussa', 'koffi']" :key="who" type="button" @click="devLogin(who)">{{ who }}</button>
        </div>
        <div class="row">
          <input v-model="login" placeholder="fatou" aria-label="Login" @input="message = ''" />
          <button class="primary">Log in</button>
        </div>
        <p v-if="message" class="error small" role="alert">{{ message }}</p>
      </form>
    </template>
  </section>
</template>

<style scoped>
.login { max-width: 420px; margin: 40px auto; display: grid; gap: 12px; }
.login > p { margin: 0; }
.error { color: var(--danger); }
.small { font-size: 13px; margin: 0; }
.github { display: block; text-align: center; padding: 10px 14px; border-radius: 10px; background: var(--text); color: var(--bg); text-decoration: none; font-weight: 600; }
.dev { display: grid; gap: 8px; padding: 14px; border: 1px dashed var(--border); border-radius: 12px; margin-top: 8px; }
.dev h2 { margin: 0; }
.quick { display: flex; gap: 6px; flex-wrap: wrap; }
.row { display: flex; gap: 6px; }
</style>
