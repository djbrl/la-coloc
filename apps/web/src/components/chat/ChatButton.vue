<script setup lang="ts">
// The chat's key in the top bar, beside the bell: a speech bubble, with the count of unread direct messages in a
// small yellow chip. Pressed, it opens (or closes) the chat sheet.
import { computed } from "vue";
import { chatSheet, conversations } from "../../conversations";
import Icon from "../lobby/house/Icon.vue";
import { badge } from "./chat";
import { chatWords as w } from "./words";

const count = computed(() => badge(conversations.unread));
</script>

<template>
  <button type="button" class="ring" :aria-label="w.buttonName(conversations.unread)" :aria-expanded="chatSheet.open" aria-haspopup="dialog" @click="chatSheet.open = !chatSheet.open">
    <Icon name="chat" />
    <span v-if="count" class="badge" aria-hidden="true">{{ count }}</span>
  </button>
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the bell and the gear. The count, in yellow: something waits. */
.badge { position: absolute; top: 5px; right: 5px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--sticker); color: var(--ink); font: 800 14px/22px var(--font); text-align: center; }
</style>
