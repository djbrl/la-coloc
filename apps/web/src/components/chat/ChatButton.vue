<script setup lang="ts">
// The chat's key in the top bar, beside the bell: a speech bubble, with the count of unread direct messages in a
// small orange pill. Pressed, it opens (or closes) the chat sheet.
import { computed } from "vue";
import { chatSheet, conversations } from "../../conversations";
import Icon from "../lobby/house/Icon.vue";
import { badge } from "./chat";
import { chatWords as w } from "./words";

const count = computed(() => badge(conversations.unread));
</script>

<template>
  <button type="button" class="ring" :aria-label="w.buttonName(conversations.unread)" :aria-expanded="chatSheet.open" aria-haspopup="dialog" @click="chatSheet.open = !chatSheet.open">
    <Icon name="chat" :size="18" />
    <span v-if="count" class="badge" aria-hidden="true">{{ count }}</span>
  </button>
</template>

<style scoped>
/* The top bar's round-cornered icon key, like the bell and the gear. */
.ring { position: relative; width: 36px; min-height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r-sm); background: none; color: var(--text); box-shadow: inset 0 0 0 1px var(--line); }
.ring:hover:not(:disabled) { background: var(--fill); }
.ring[aria-expanded="true"] { background: var(--fill); }
.badge { position: absolute; top: -4px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-pill); background: var(--accent-fill); color: var(--on-accent); font: 700 11px/18px var(--font); text-align: center; box-shadow: 0 0 0 2px var(--surface); }
</style>
