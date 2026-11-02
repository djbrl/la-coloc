<script setup lang="ts">
// The first thing someone sees of La Coloc, before they pick a look (and again after the demo restarts, since picking
// a look does too): a window over the city, like the other steps. The name on its band, what you do here in three
// tiles, one key. The quest's last card (tutorial/Welcome.vue) is the arrival; this is only the way in.
import { onMounted, ref } from "vue";
import Icon from "./lobby/house/Icon.vue";
import { welcomeWords as w } from "./words";

const emit = defineEmits<{ next: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <!-- There's nothing behind it to go back to, so Escape stays here. -->
  <dialog ref="dialog" class="step-sign" aria-labelledby="door-title" @cancel.prevent>
    <div class="inner">
      <div class="form">
        <h2 id="door-title">{{ w.doorTitle }}</h2>
        <ul class="tiles">
          <li><Icon name="house" :size="26" />{{ w.doorMoveIn }}</li>
          <li><Icon name="box" :size="26" />{{ w.doorOnline }}</li>
          <li><Icon name="people" :size="26" />{{ w.doorShare }}</li>
        </ul>
        <button type="button" class="primary go" autofocus @click="emit('next')">{{ w.doorGo }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, calc(100vw - 32px)); animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 14px 0; padding: 0; list-style: none; }
.tiles li { display: grid; justify-items: center; align-content: center; gap: 8px; min-height: 96px; padding: 10px 6px; border-radius: var(--r-md); background: var(--tile); font-size: 15px; font-weight: 700; line-height: 1.2; text-align: center; }
.tiles :deep(svg) { color: var(--panel-red); }
.go { width: 100%; }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
