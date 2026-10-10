<script setup lang="ts">
// The room's History tab: one row per build, newest first. What was built (an update of a branch, or a preview
// of a pull request), how it went, and when. A failure shows the first line of what went wrong.
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import type { RoomManage } from "../../types";
import { deploymentStep, deploymentTitle, firstLine } from "./room";

defineProps<{ deployments: RoomManage["deployments"]; github: RoomManage["github"]; when: (iso: string) => string }>();
</script>

<template>
  <ul v-if="deployments.length" class="row-list">
    <ListRow v-for="d in deployments" :key="d.id" :title="deploymentTitle(d)">
      <template #lead>
        <span class="mark" :class="deploymentStep(d.status).tone"><Icon :name="deploymentStep(d.status).icon" :size="18" /></span>
      </template>
      <span class="sub">
        <span :class="`word-${deploymentStep(d.status).tone}`">{{ deploymentStep(d.status).word }}</span>
        <template v-if="d.prNumber && github">
          · from
          <a :href="`${github.url}/pull/${d.prNumber}`" target="_blank" rel="noopener">#{{ d.prNumber }}<span class="sr-only"> (opens in a new tab)</span></a>
        </template>
        <template v-if="d.status === 'failed' && firstLine(d.detail)"> · {{ firstLine(d.detail) }}</template>
      </span>
      <template #meta><time :datetime="d.createdAt">{{ when(d.createdAt) }}</time></template>
    </ListRow>
  </ul>
  <p v-else class="empty">Nothing built yet. Put it online from the Overview, and every build lands here.</p>
</template>

<style scoped>
.mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--fill); color: var(--muted); }
.mark.live { background: var(--live-soft); color: var(--live); }
.mark.warn { background: var(--warn-soft); color: var(--warn); }
.mark.danger { background: var(--danger-soft); color: var(--danger); }
.empty { padding: 18px 16px; border-radius: 16px; background: var(--tile); font-size: 14px; color: var(--muted); }
</style>
