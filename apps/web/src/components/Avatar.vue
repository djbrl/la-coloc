<script setup lang="ts">
import { computed } from "vue";
import type { Person } from "../types";

const props = withDefaults(defineProps<{ person: Person; size?: number }>(), { size: 28 });
const initials = computed(() => (props.person.name ?? props.person.login).slice(0, 2).toUpperCase());
</script>

<template>
  <img
    v-if="person.avatarUrl"
    class="avatar"
    :src="person.avatarUrl"
    :alt="person.name ?? person.login"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span v-else class="avatar initials" :title="person.name ?? person.login" :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.4) + 'px' }">
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar { border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; object-fit: cover; }
.initials { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
</style>
