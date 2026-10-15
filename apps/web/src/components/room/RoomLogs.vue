<script setup lang="ts">
// The room's Logs tab: the box of what the app printed fills the panel, with two small buttons above it. The
// page fetches the lines (and keeps following them across tabs); this only shows them.
import { nextTick, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import { roomWords as w } from "./words";

const props = defineProps<{ text: string; message: string; loading: boolean }>();
const follow = defineModel<boolean>("follow", { required: true });
const emit = defineEmits<{ refresh: [] }>();

// The newest lines are at the bottom. Stay there as they arrive, unless you've scrolled up to read.
const box = ref<HTMLElement | null>(null);
let pinned = true;
const onScroll = () => {
  const el = box.value;
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
};
watch(
  () => props.text,
  async () => {
    if (!pinned) return;
    await nextTick();
    box.value?.scrollTo({ top: box.value.scrollHeight });
  },
  { immediate: true },
);
</script>

<template>
  <div class="logs-tab">
    <div class="bar">
      <button type="button" class="chunk small" :class="{ on: follow }" :aria-pressed="follow" @click="follow = !follow">
        <Icon name="logs" :size="16" /> {{ w.followLive }}
      </button>
      <button type="button" class="chunk small" :disabled="loading" @click="emit('refresh')">
        <Icon name="spin" :size="16" /> {{ loading ? w.reading : w.refresh }}
      </button>
    </div>
    <p v-if="message" class="error small" role="alert">{{ message }}</p>
    <pre ref="box" class="box" tabindex="0" :aria-label="w.logs" @scroll.passive="onScroll">{{ text || w.nothingPrinted }}</pre>
  </div>
</template>

<style scoped>
/* Fills the body's height; only the box scrolls. */
.logs-tab { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.bar { flex: none; display: flex; gap: 8px; }
.box {
  flex: 1 1 auto;
  min-height: 160px;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 16px 18px;
  border-radius: 16px;
  background: var(--code-bg);
  color: var(--code-text);
  font: 12.5px/1.6 var(--mono);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
