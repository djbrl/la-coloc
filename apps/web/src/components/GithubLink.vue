<script setup lang="ts">
// A person's GitHub profile, as a small round icon link (a new tab), wherever a person is shown on a page: only for
// someone who logged in with GitHub, whose login is then their real handle. Nothing for anyone else (a seeded
// example person's login could be a stranger's handle on GitHub).
import type { Person } from "../types";
import Icon from "./lobby/house/Icon.vue";
import { houseWords as w } from "./lobby/house/words";

defineProps<{ person: Pick<Person, "login" | "github"> }>();
</script>

<template>
  <a
    v-if="person.github"
    class="gh"
    :href="`https://github.com/${encodeURIComponent(person.login)}`"
    target="_blank"
    rel="noopener"
    :aria-label="w.person.githubName(person.login)"
    :title="w.person.githubName(person.login)"
  >
    <Icon name="profile" :size="16" />
  </a>
</template>

<style scoped>
.gh { flex: none; width: 34px; height: 34px; display: inline-grid; place-items: center; border-radius: var(--r-pill); background: var(--fill); color: var(--text); }
.gh:hover { background: var(--fill-hover); text-decoration: none; }
</style>
