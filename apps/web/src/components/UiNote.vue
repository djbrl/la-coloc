<script lang="ts">
// A message under a form: a quiet confirmation, or an error read out at once.
export type Note = { text: string; error: boolean };
export const quiet = (text: string): Note => ({ text, error: false });
export const loud = (text: string): Note => ({ text, error: true });
</script>

<script setup lang="ts">
defineProps<{ note: Note | null }>();
</script>

<template>
  <!-- The status region stays in the page so screen readers hear what lands in it. -->
  <p class="small note-line" role="status">{{ note && !note.error ? note.text : "" }}</p>
  <p v-if="note?.error" class="small error" role="alert">{{ note.text }}</p>
</template>
