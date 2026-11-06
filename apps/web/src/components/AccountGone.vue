<script setup lang="ts">
// After deleting an account (Settings), the landing says it's done, in one line, at the top. `?deleted=github`: GitHub
// couldn't be told to forget La Coloc, so it links to the two GitHub pages where they remove it themselves.
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "./lobby/house/Icon.vue";
import { settingsWords as w } from "./words";

const route = useRoute();
const router = useRouter();
const shown = computed(() => route.query.deleted === "1" || route.query.deleted === "github");
const githubLeft = computed(() => route.query.deleted === "github");

function close() {
  const { deleted: _, ...rest } = route.query;
  void router.replace({ query: rest });
}
</script>

<template>
  <div v-if="shown" class="gone" role="status">
    <p class="line"><Icon name="tick" :size="18" />{{ w.deleted }}</p>
    <p v-if="githubLeft" class="left">
      {{ w.githubLeft }}
      <a href="https://github.com/settings/installations" target="_blank" rel="noopener">{{ w.installations }}</a>
      ·
      <a href="https://github.com/settings/applications" target="_blank" rel="noopener">{{ w.authorizations }}</a>
    </p>
    <button class="x" :aria-label="w.closeNote" @click="close"><span aria-hidden="true">X</span></button>
  </div>
</template>

<style scoped>
/* A flat card at the top of the landing, over the street, until closed. */
.gone {
  position: fixed;
  top: 76px;
  left: 50%;
  translate: -50% 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 12px;
  width: min(440px, calc(100vw - 32px));
  padding: 12px 12px 12px 16px;
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--quiet-edge);
}
.line { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 800; }
.left { grid-column: 1; margin: 0; font-size: 14px; }
.left a { color: var(--accent); font-weight: 700; }
.x { grid-row: 1; grid-column: 2; min-width: 40px; min-height: 40px; padding: 0; background: transparent; color: var(--text); font: 800 15px/1 var(--font); }
</style>
