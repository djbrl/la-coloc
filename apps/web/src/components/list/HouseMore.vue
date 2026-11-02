<script setup lang="ts">
// The rest of a house's page in the list view, under the house panel: what the lobby's panel leaves out because
// it must fit a sheet, as floating cards of rows. Who's at the door and how the vote stands, the rooms at work
// (and the chef's way into any of them), the builds, and a few facts about the house.
import { computed } from "vue";
import { locale } from "../../i18n";
import type { HouseView } from "../../types";
import Avatar from "../Avatar.vue";
import GithubLink from "../GithubLink.vue";
import { myRooms } from "../lobby/house/crew";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import RoomCard from "../RoomCard.vue";
import { deploymentStep, deploymentTitle, firstLine } from "../room/room";
import { houseFacts, roomLabel, tallyLine, workRows } from "./house";
import ListCard from "./ListCard.vue";
import { listWords as said } from "./words";

const props = defineProps<{ house: HouseView }>();

const viewer = computed(() => props.house.viewer);
const member = computed(() => !!viewer.value?.member);
const knocks = computed(() => (member.value ? (props.house.doorbell ?? []) : []));
const work = computed(() => workRows(props.house, viewer.value));
const builds = computed(() => props.house.deployments ?? []);
const facts = computed(() => houseFacts(props.house));

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
const when = (iso: string) => new Date(iso).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <!-- Someone knocked: the one thing flatmates should act on first. -->
  <ListCard v-if="knocks.length" :title="said.atTheDoor" heading-id="door-title" :explain="said.door">
    <ul class="plain lines">
      <ListRow v-for="d in knocks" :key="d.id" :title="said.knockTitle(nameOf(d.applicant), d.room)" :sub="said.knockedAt(when(d.createdAt))" open>
        <template #lead><Avatar :person="d.applicant" :size="40" decorative /></template>
        <template #meta>
          <span class="tally" :aria-label="said.votesSoFar(tallyLine(d.tally))"><Icon name="check" :size="14" />{{ tallyLine(d.tally) }}</span>
        </template>
        <template #end>
          <GithubLink :person="d.applicant" />
          <RouterLink :to="`/applications/${d.id}`" class="button primary act" :aria-label="said.answerName(nameOf(d.applicant))">
            <Icon name="thread" :size="16" />{{ said.answer }}
          </RouterLink>
        </template>
      </ListRow>
    </ul>
  </ListCard>

  <ListCard v-if="work.length" :title="said.atWork" heading-id="work-title" :explain="said.work">
    <ul class="plain lines">
      <RoomCard v-for="w in work" :key="w.room.name" :house-id="house.id" :row="w" :mine="myRooms(viewer).includes(w.room.name)" :member="member" />
    </ul>
  </ListCard>

  <ListCard v-if="member" :title="said.buildsTitle" heading-id="builds-title" :explain="said.builds">
    <ul v-if="builds.length" class="plain lines">
      <ListRow v-for="d in builds" :key="d.id" :title="`${roomLabel(house, d.room)} · ${deploymentTitle(d)}`">
        <template #lead>
          <span class="mark" :class="deploymentStep(d.status).tone"><Icon :name="deploymentStep(d.status).icon" :size="18" /></span>
        </template>
        <span class="sub">
          <span :class="`word-${deploymentStep(d.status).tone}`">{{ deploymentStep(d.status).word }}</span>
          <template v-if="d.status === 'failed' && firstLine(d.detail)"> · {{ firstLine(d.detail) }}</template>
        </span>
        <template #meta><time :datetime="d.updatedAt">{{ when(d.updatedAt) }}</time></template>
      </ListRow>
    </ul>
    <p v-else class="none">{{ said.nothingBuilt }}</p>
  </ListCard>

  <ListCard :title="said.aboutTitle" heading-id="about-title" :explain="said.about">
    <ul class="plain lines">
      <ListRow v-for="f in facts" :key="f.key" :title="f.title" :sub="f.sub" :class="{ mono: f.key === 'address' }">
        <template #lead><span class="mark"><Icon :name="f.icon" :size="18" /></span></template>
      </ListRow>
    </ul>
  </ListCard>
</template>

<style scoped>
.plain { list-style: none; margin: 0; padding: 0; }
/* The same tight rows as the house panel's. */
.lines { display: grid; gap: 4px; align-content: start; line-height: 1.3; }
.none { padding: 14px 16px; border-radius: var(--r-md); background: var(--tile); font-size: 14px; color: var(--muted); }
.tally { display: inline-flex; align-items: center; gap: 4px; color: var(--text); font-weight: 600; }
/* Buttons and links in a row carry an icon beside their word. */
.act { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; }
/* An icon where a face would be: a rounded square, coloured by how a build went. */
.mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-sm); background: var(--fill); color: var(--muted); }
.mark.live { background: var(--live-soft); color: var(--live); }
.mark.warn { background: var(--warn-soft); color: var(--warn); }
.mark.danger { background: var(--danger-soft); color: var(--danger); }
.mono :deep(.title) { font-family: var(--num); font-size: 14px; }
</style>
