<script setup lang="ts">
import { useRouter } from "vue-router";
import Avatar from "./components/Avatar.vue";
import { logout, me, meLoaded } from "./session";

const router = useRouter();

async function leave() {
  await logout();
  router.push("/");
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="logo">La Coloc</RouterLink>
    <nav v-if="meLoaded" class="nav">
      <template v-if="me">
        <RouterLink v-for="h in me.houses" :key="h.id" :to="`/houses/${h.id}`">{{ h.name }}</RouterLink>
        <span class="me"><Avatar :person="me" :size="24" /> {{ me.login }}</span>
        <button class="link" @click="leave">Log out</button>
      </template>
      <RouterLink v-else to="/login">Log in</RouterLink>
    </nav>
  </header>
  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.logo { font-weight: 700; color: var(--text); text-decoration: none; }
.nav { display: flex; align-items: center; gap: 14px; font-size: 14px; flex-wrap: wrap; }
.nav a { text-decoration: none; }
.me { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.link { border: none; background: none; padding: 0; color: var(--accent); }
</style>
