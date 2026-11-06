<script setup lang="ts">
// The chat's key in the top bar, beside the bell: a speech bubble, with a small dot when a direct message is unread
// or something is new in the city's room or board (cityNews.ts). How many is in the key's hidden name, never on a
// chip (carte blanche). Pressed, it opens (or closes) the chat sheet.
import { computed } from "vue";
import { cityNews } from "../../cityNews";
import { chatSheet, conversations } from "../../conversations";
import Icon from "../lobby/house/Icon.vue";
import { buttonDot, shownNews } from "./chat";
import { chatWords as w } from "./words";

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
    <span v-if="conversations.unread > 0 || dot" class="dot" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the bell and the gear. Something waits: a small white dot in the
   key's corner, white because the key is the sign's red. */
.dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--on-panel); box-shadow: 0 0 0 2px var(--panel-red); }
</style>
