<script setup lang="ts">
// The friends key in the top bar, beside the chat's: two people, with the count of requests waiting for you in a
// small yellow chip. Pressed, it opens (or closes) the friends list (FriendsSheet.vue). Logged in only.
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { friends, friendsSheet, loadFriends } from "../../friends";
import { notices } from "../../notices";
import { me } from "../../session";
import Icon from "../lobby/house/Icon.vue";
import { friendWords as w } from "../list/words";
import { waiting } from "./friends";
import FriendsSheet from "./FriendsSheet.vue";

const count = computed(() => waiting(friends.requests.length));

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
    <span v-if="count" class="badge" aria-hidden="true">{{ count }}</span>
  </button>
  <FriendsSheet />
</template>

<style scoped>
/* The key itself is drawn by the bar (App.vue), like the chat's and the bell. The count, in yellow: someone waits. */
.badge { position: absolute; top: 5px; right: 5px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--sticker); color: var(--ink); font: 800 14px/22px var(--font); text-align: center; }
</style>
