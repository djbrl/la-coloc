<script setup lang="ts">
// What someone wrote, as text (never HTML): http(s) addresses as links that open in a new tab without telling the site
// where you came from, and "@login" as a highlighted name, yours on the yellow sticker so you see it's you (chat.ts
// `messageParts`). Used by every chat bubble (ChatPanel.vue) and a board post's body.
import { computed } from "vue";
import { messageParts } from "./chat";
import { chatWords as w } from "./words";

const props = defineProps<{ text: string; me?: string | null }>();
const parts = computed(() => messageParts(props.text, props.me ?? null));
</script>

<template><template v-for="(part, i) in parts" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer nofollow ugc">{{ part.text }}</a><span v-else-if="part.me" class="mention me" :title="w.mentionsYou">{{ part.text }}<span class="sr-only"> ({{ w.mentionsYou }})</span></span><span v-else-if="part.mention" class="mention">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></template>

<style scoped>
a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
/* A mention: the name in the handle's blue, in full weight. Yours: on the yellow sticker, in ink. */
.mention { font-weight: 800; color: var(--handle); }
.mention.me { padding: 0 4px; border-radius: 6px; background: var(--sticker); color: var(--ink); box-decoration-break: clone; -webkit-box-decoration-break: clone; }
</style>
