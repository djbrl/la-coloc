<script setup lang="ts">
// The chat's key in the top bar, beside the bell: a speech bubble, with the count of unread direct messages in a
// small yellow chip. With none waiting but something new in the city's room or board (cityNews.ts), a small yellow
// dot instead. Pressed, it opens (or closes) the chat sheet.
import { computed } from "vue";
import { cityNews } from "../../cityNews";
import { chatSheet, conversations } from "../../conversations";
import Icon from "../lobby/house/Icon.vue";
import { badge, buttonDot, shownNews } from "./chat";
import { chatWords as w } from "./words";

const count = computed(() => badge(conversations.unread));
const dot = computed(() => buttonDot(conversations.unread, shownNews(cityNews, chatSheet)));
</script>

<template>
  <button
    type="button"
    class="ring"
    data-tour="chat"
    :aria-label="dot ? w.buttonNews : w.buttonName(conversations.unread)"
    :aria-expanded="chatSheet.open"
    aria-haspopup="dialog"
    @click="chatSheet.open = !chatSheet.open"
  >
    <Icon name="chat" />
    <span v-if="count" class="badge" aria-hidden="true">{{ count }}</span>
    <span v-else-if="dot" class="dot" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the bell and the gear. The count, in yellow: something waits. */
.badge { position: absolute; top: 5px; right: 5px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--sticker); color: var(--ink); font: 800 14px/22px var(--font); text-align: center; }
/* Only the city moved: the bell's "new" dot, quieter than a count. */
.dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--sticker); box-shadow: 0 0 0 1px var(--ink); }
</style>
