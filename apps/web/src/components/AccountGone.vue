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
    <p class="line"><span class="status-mark ok" aria-hidden="true"><Icon name="tick" :size="12" /></span>{{ w.deleted }}</p>
    <p v-if="githubLeft" class="left">
      {{ w.githubLeft }}
      <a href="https://github.com/settings/installations" target="_blank" rel="noopener">{{ w.installations }}</a>
      ·
      <a href="https://github.com/settings/applications" target="_blank" rel="noopener">{{ w.authorizations }}</a>
    </p>
    <button class="x sign-x" :aria-label="w.closeNote" @click="close"><span aria-hidden="true">X</span></button>
  </div>
</template>

<style scoped>
/* A small white card at the top of the landing, over the street, until closed: a tick, the line, the card's X. */
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
  border-radius: var(--card-r);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.line { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 15px; font-weight: 800; }
.left { grid-column: 1; margin: 0; padding-left: 30px; font-size: 13px; font-weight: 600; color: var(--muted); }
.left a { color: var(--accent); font-weight: 800; }
/* The card's X (style.css), in the grid's corner rather than pinned to it. */
.x.sign-x { position: static; grid-row: 1; grid-column: 2; }
</style>
