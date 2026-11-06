<script setup lang="ts">
// The room's history, folded under its logs: one row per build, newest first. What was built (an update of a branch,
// or a preview of a pull request), how it went, and when. A failure shows the first line of what went wrong. Each row
// has its one symbol: went online, failed, or the quiet dot for anything under way or cancelled.
import ListRow from "../lobby/panel/ListRow.vue";
import type { RoomManage } from "../../types";
import RoomMark from "./RoomMark.vue";
import { buildFailed, deploymentStep, deploymentTitle, firstLine } from "./room";
import { roomWords as w } from "./words";

defineProps<{ deployments: RoomManage["deployments"]; github: RoomManage["github"]; when: (iso: string) => string }>();

const mark = (tone: "live" | "warn" | "danger") => (tone === "live" ? "ok" : tone === "danger" ? "fail" : "none");
</script>

<template>
  <ul v-if="deployments.length" class="row-list">
    <ListRow v-for="d in deployments" :key="d.id" :title="deploymentTitle(d)">
      <template #lead><RoomMark :kind="mark(deploymentStep(d.status, d.detail).tone)" /></template>
      <span class="sub">
        <span>{{ deploymentStep(d.status, d.detail).word }}</span>
        <template v-if="d.prNumber && github">
          · {{ w.fromPr }}
          <a :href="`${github.url}/pull/${d.prNumber}`" target="_blank" rel="noopener">#{{ d.prNumber }}<span class="sr-only">{{ w.newTab }}</span></a>
        </template>
        <template v-if="buildFailed(d) && firstLine(d.detail)"> · {{ firstLine(d.detail) }}</template>
      </span>
      <template #meta><time :datetime="d.createdAt">{{ when(d.createdAt) }}</time></template>
    </ListRow>
  </ul>
  <p v-else class="empty">{{ w.nothingBuilt }}</p>
</template>

<style scoped>
/* In its fold the symbol needs no 40px column of its own. */
.row-list :deep(.lead) { min-width: 22px; }
.row-list :deep(.meta) { font-weight: 600; color: var(--muted); }
.empty { font: 600 14px/1.4 var(--font); color: var(--muted); }
</style>
