<script setup lang="ts">
// The chat's key in the top bar, beside the bell: a speech bubble, with a small dot when a direct message is unread.
// How many is in the key's hidden name, never on a chip (carte blanche). Pressed, it opens (or closes) the chat sheet:
// your own conversations. The city's room and its posts are on the city board, in the market square.
import { chatSheet, conversations } from "../../conversations";
import Icon from "../lobby/house/Icon.vue";
import { chatWords as w } from "./words";
</script>

<template>
  <button
    type="button"
    class="ring"
    data-tour="chat"
    :aria-label="w.buttonName(conversations.unread)"
    :aria-expanded="chatSheet.open"
    aria-haspopup="dialog"
    @click="chatSheet.open = !chatSheet.open"
  >
    <Icon name="chat" />
    <span v-if="conversations.unread > 0" class="dot" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the bell and the gear. Something waits: a small white dot in the
   key's corner, white because the key is the sign's red. */
.dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--on-panel); box-shadow: 0 0 0 2px var(--panel-red); }
</style>
