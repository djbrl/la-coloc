<script setup lang="ts">
import { computed } from "vue";
import type { Person } from "../types";

// decorative: the name is already written next to the face, so screen readers skip the picture.
const props = withDefaults(defineProps<{ person: Person; size?: number; decorative?: boolean }>(), { size: 28, decorative: false });
const initials = computed(() => (props.person.name ?? props.person.login).slice(0, 2).toUpperCase());
const name = computed(() => props.person.name ?? props.person.login);
</script>

<template>
  <img
    v-if="person.avatarUrl"
    class="avatar"
    :src="person.avatarUrl"
    :alt="decorative ? '' : name"
    :aria-hidden="decorative || undefined"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span
    v-else
    class="avatar initials"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : name"
    :aria-hidden="decorative || undefined"
    :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.4) + 'px' }"
  >
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar { border-radius: var(--r-md); flex: none; display: inline-flex; align-items: center; justify-content: center; object-fit: cover; }
.initials { background: var(--fill); color: var(--text); font-weight: 800; }
</style>
