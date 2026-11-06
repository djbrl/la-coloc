<script setup lang="ts">
// The arena's leaderboard: last week's winner in one tile on top (their face, their name, the title they won), then
// this week's top ten as dense rows (place, face, name, the title they wear, points, pull requests), yours lit like a
// pinned entry. Nobody scored yet: one quiet line where the rows will be.
import { computed } from "vue";
import type { ArenaView } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import { badgeWords } from "./arena";
import BadgeChip from "./BadgeChip.vue";
import { arenaWords as w } from "./words";

const props = defineProps<{ view: ArenaView; me: string | null }>();

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
// The winner's title in plain words beside "Last week's winner"; its full story (place, city, week) on hover.
const won = computed(() => (props.view.champion ? badgeWords(props.view.champion.badge) : null));
</script>

<template>
  <div class="board">
    <div v-if="view.champion && won" class="champion" role="group" :aria-label="w.championName(nameOf(view.champion.person))">
      <Avatar :person="view.champion.person" :size="40" decorative />
      <span class="text">
        <span class="name">{{ nameOf(view.champion.person) }}</span>
        <span class="sub" :title="won.name">{{ w.lastWinner }} · {{ won.text }}</span>
      </span>
      <Icon name="trophy" :size="20" class="cup" />
    </div>

    <ol v-if="view.leaderboard.length" class="lines" :aria-label="w.boardName">
      <ListRow
        v-for="(r, i) in view.leaderboard"
        :key="r.person.login"
        :title="r.person.login === me ? `${nameOf(r.person)} · ${w.you}` : nameOf(r.person)"
        :mine="r.person.login === me"
      >
        <template #lead>
          <span class="face">
            <Avatar :person="r.person" :size="40" decorative />
            <span class="place" role="img" :aria-label="w.placeName(i + 1)">{{ i + 1 }}</span>
          </span>
        </template>
        <span v-if="r.person.badge" class="sub"><BadgeChip :badge="r.person.badge" /></span>
        <!-- A real account's handle; a made-up person (no GitHub) goes by their name alone (lobby/handle.ts). -->
        <span v-else-if="r.person.login !== nameOf(r.person) && r.person.github !== false" class="sub">@{{ r.person.login }}</span>
        <template #meta>
          <span class="pts">{{ w.points(r.points) }}</span>
          <span class="prs" role="img" :aria-label="w.prsName(r.prs)">{{ w.prs(r.prs) }}</span>
        </template>
      </ListRow>
    </ol>
    <div v-else class="nobody">
      <Icon name="trophy" :size="26" />
      <p class="said">{{ w.nobody }}</p>
      <p>{{ w.nobodyLine }}</p>
    </div>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: 6px; }
/* Last week's winner: one row on a grey tile, the trophy at its end in the text's colour. */
.champion { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--tile-r); background: var(--tile); }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.name { font-size: 15px; font-weight: 800; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.champion .sub { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cup { flex: none; color: var(--text); }
.lines { flex: none; display: grid; margin: 0; padding: 0; list-style: none; }
.face { position: relative; display: grid; place-items: center; }
/* The place, a small white number on the face's corner: the same for everyone, the number says it. */
.place {
  position: absolute;
  right: -6px;
  bottom: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 0 0 2px var(--tile);
  font: 800 12px/20px var(--font);
  text-align: center;
}
.lines .sub { display: flex; min-width: 0; padding-top: 2px; }
.pts { color: var(--text); font-size: 15px; font-weight: 800; }
.prs { color: var(--muted); font-weight: 600; }
/* Nobody scored yet: a quiet trophy and two short lines, in the middle of the space. */
.nobody { margin: auto; display: grid; justify-items: center; gap: 6px; max-width: 320px; padding: 28px 0 20px; color: var(--muted); text-align: center; font-size: 13px; font-weight: 600; line-height: 18px; }
.nobody p { margin: 0; }
.nobody .said { color: var(--text); font-size: 15px; font-weight: 800; line-height: 20px; }
</style>
