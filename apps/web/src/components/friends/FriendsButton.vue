<script setup lang="ts">
// The friends key in the top bar, beside the chat's: two people, with a small dot when a request waits for you (how
// many is in the key's hidden name, never on a chip). Pressed, it opens (or closes) the friends list (FriendsSheet.vue). Logged in only.
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { friends, friendsSheet, loadFriends } from "../../friends";
import { notices } from "../../notices";
import { me } from "../../session";
import Icon from "../lobby/house/Icon.vue";
import { friendWords as w } from "../list/words";
import FriendsSheet from "./FriendsSheet.vue";

const waits = computed(() => friends.requests.length > 0);

// Logged in or out, and whenever the bell changes (a request came in, or was answered): fetch again. The lobby's
// "friends" nudge covers statuses; coming back to the tab covers the rest.
watch(
  () => me.value?.login,
  () => void loadFriends(),
  { immediate: true },
);
watch(
  () => notices.items,
  () => void loadFriends(),
);
const onVisible = () => document.visibilityState === "visible" && void loadFriends();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisible);
  friendsSheet.open = false;
});
</script>

<template>
  <button type="button" class="ring" data-tour="friends" :aria-label="w.buttonName(friends.requests.length)" :aria-expanded="friendsSheet.open" aria-haspopup="dialog" @click="friendsSheet.open = !friendsSheet.open">
    <Icon name="people" />
    <span v-if="waits" class="dot" aria-hidden="true" />
  </button>
  <FriendsSheet />
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the chat's and the bell. Someone waits: a small white dot in the
   key's corner, white because the key is the sign's red. */
.dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--on-panel); box-shadow: 0 0 0 2px var(--panel-red); }
</style>
