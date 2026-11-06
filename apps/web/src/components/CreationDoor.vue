<script setup lang="ts">
// The first thing someone sees of La Coloc, before they pick a look (and again after the demo restarts, since picking
// a look does too): a window over the city, like the other steps (carte blanche). The name and one line in its head,
// what you do here in three rows, one key. The quest's last card (tutorial/Welcome.vue) is the arrival; this is only the way in.
import { onMounted, ref } from "vue";
import Icon from "./lobby/house/Icon.vue";
import { welcomeWords as w } from "./words";

const emit = defineEmits<{ next: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <!-- There's nothing behind it to go back to, so Escape stays here. -->
  <dialog ref="dialog" class="sign door" aria-labelledby="door-title" @cancel.prevent>
    <div class="sign-frame">
      <header class="sign-band">
        <span class="chip"><Icon name="house" :size="22" /></span>
        <h2 id="door-title">{{ w.doorTitle }}</h2>
        <p class="sign-sub">{{ w.doorSub }}</p>
      </header>
      <div class="sign-body body">
        <ul class="what">
          <li><Icon name="key" :size="20" />{{ w.doorMoveIn }}</li>
          <li><Icon name="box" :size="20" />{{ w.doorOnline }}</li>
          <li><Icon name="people" :size="20" />{{ w.doorShare }}</li>
        </ul>
        <button type="button" class="primary go" autofocus @click="emit('next')">{{ w.doorGo }}<kbd aria-hidden="true">↵</kbd></button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, calc(100vw - 32px)); padding: 0; border: 0; background: none; color: var(--text); overflow: visible; animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.body { display: grid; gap: 16px; }
/* What you do here: three plain lines with an icon, things to read rather than press. */
.what { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.what li { display: flex; align-items: center; gap: 12px; min-height: 30px; font-size: 15px; font-weight: 800; line-height: 20px; }
.what :deep(svg) { color: var(--muted); }
.go { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
