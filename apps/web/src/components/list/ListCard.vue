<script setup lang="ts">
// A floating card on a list-view page: the same flat surface and big radius as the lobby's panel, set on the page
// instead of over the city. With a `title` it's a section of its own, named by its heading, with the one muted line
// under it that says what it holds (`explain`); without one it's just the card (the house panel sits in one).
defineProps<{ title?: string; explain?: string | null; headingId?: string }>();
</script>

<template>
  <section v-if="title" class="list-card" :aria-labelledby="headingId">
    <header class="head">
      <h2 :id="headingId" class="title">{{ title }}</h2>
      <p v-if="explain" class="explain">{{ explain }}</p>
    </header>
    <slot />
  </section>
  <div v-else class="list-card bare"><slot /></div>
</template>

<style scoped>
.list-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 20px var(--gutter) 22px;
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--lift), 0 0 0 1px var(--hairline);
  animation: pop-in 0.22s var(--ease);
}
.list-card.bare { display: block; padding: 0; }
.head { display: grid; gap: 4px; }
.title { font-size: 20px; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em; }
.explain { font-size: 13px; line-height: 1.3; color: var(--muted); }
/* The pause menu's entrance: a quick scale up from just under full size. */
@keyframes pop-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
}
@media (prefers-reduced-motion: reduce) {
  .list-card { animation: none; }
}
@media (max-width: 480px) {
  .list-card { border-radius: var(--r-xl); }
}
</style>
