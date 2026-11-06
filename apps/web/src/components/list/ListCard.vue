<script setup lang="ts">
// A floating card on a list-view page: the same flat surface and big radius as the lobby's panel, set on the page
// instead of over the city. With a `title` it's a section of its own, named by its heading, with the one muted line
// under it that says what it holds (`explain`); without one it's just the card (the house panel sits in one).
defineProps<{ title?: string; explain?: string | null; headingId?: string }>();
</script>

<template>
  <section v-if="title" class="list-card sign" :aria-labelledby="headingId">
    <div class="sign-frame">
      <header class="sign-band">
        <h2 :id="headingId">{{ title }}</h2>
        <p v-if="explain" class="sign-sub">{{ explain }}</p>
      </header>
      <div class="sign-body">
        <slot />
      </div>
    </div>
  </section>
  <div v-else class="list-card bare sign"><div class="sign-frame"><div class="sign-white"><slot /></div></div></div>
</template>

<style scoped>
.list-card { min-width: 0; animation: pop-in 0.22s var(--ease); }
/* No X on these cards: the head's line runs to the right edge. */
.sign-band { padding-right: 20px; }
.sign-body { display: grid; gap: 12px; }
.sign-white { background: var(--surface); border-radius: var(--card-r); overflow: hidden; }
/* The pause menu's entrance: a quick scale up from just under full size. */
@keyframes pop-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
}
@media (prefers-reduced-motion: reduce) {
  .list-card { animation: none; }
}
</style>
