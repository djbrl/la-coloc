<script setup lang="ts">
// The arena's leaderboard: last week's champion on top with the title they won, then this week's top ten as dense
// rows (place, face, name, the title they wear, points, pull requests), yours lit like a pinned entry.
import type { ArenaView } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import { medal } from "./arena";
import BadgeChip from "./BadgeChip.vue";
import { arenaWords as w } from "./words";

defineProps<{ view: ArenaView; me: string | null }>();

const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
</script>

<template>
  <div class="board">
    <ul v-if="view.champion" class="rows">
      <ListRow :title="nameOf(view.champion.person)" class="champion">
        <template #lead>
          <span class="face" role="img" :aria-label="w.championName(nameOf(view.champion.person))">
            <Avatar :person="view.champion.person" :size="36" decorative />
            <span class="crown" aria-hidden="true"><Icon name="crown" :size="12" /></span>
          </span>
        </template>
        <span class="sub"><BadgeChip :badge="view.champion.badge" /></span>
      </ListRow>
    </ul>

    <ol v-if="view.leaderboard.length" class="rows" :aria-label="w.boardName">
      <ListRow
        v-for="(r, i) in view.leaderboard"
        :key="r.person.login"
        :title="r.person.login === me ? `${nameOf(r.person)} · ${w.you}` : nameOf(r.person)"
        :mine="r.person.login === me"
      >
        <template #lead>
          <span class="face">
            <Avatar :person="r.person" :size="32" decorative />
            <span class="place" :class="i < 3 ? medal(i + 1) : null" role="img" :aria-label="w.placeName(i + 1)">{{ i + 1 }}</span>
          </span>
        </template>
        <span v-if="r.person.badge" class="sub"><BadgeChip :badge="r.person.badge" /></span>
        <span v-else-if="r.person.login !== nameOf(r.person)" class="sub handle">@{{ r.person.login }}</span>
        <template #meta>
          <span class="pts">{{ w.points(r.points) }}</span>
          <span role="img" :aria-label="w.prsName(r.prs)">{{ w.prs(r.prs) }}</span>
        </template>
      </ListRow>
    </ol>
    <p v-else class="nobody">
      <Icon name="trophy" :size="22" />
      <span>{{ w.nobody }}</span>
    </p>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: 10px; }
.rows { flex: none; display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.champion { background: color-mix(in srgb, #f2c14e 16%, var(--surface)); }
.face { position: relative; display: grid; place-items: center; }
.crown { position: absolute; top: -6px; right: -6px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--warn-soft); color: var(--warn); box-shadow: 0 0 0 2px var(--surface); }
.place {
  position: absolute;
  right: -6px;
  bottom: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--r-pill);
  background: var(--fill);
  color: var(--text);
  box-shadow: 0 0 0 2px var(--surface);
  font: 700 10.5px/18px var(--mono);
  text-align: center;
}
.place.gold { background: #f2c14e; color: #3d2a00; }
.place.silver { background: #c9d1db; color: #1f2933; }
.place.bronze { background: #e3a275; color: #3b1f0b; }
.sub { display: flex; min-width: 0; padding-top: 2px; }
.handle { font: 500 12.5px/1.45 var(--mono); color: var(--muted); }
.pts { color: var(--text); font-weight: 600; }
.nobody { margin: auto; display: grid; justify-items: center; gap: 10px; max-width: 320px; padding: 24px 0; color: var(--muted); text-align: center; font-size: 14px; line-height: 1.4; }
</style>
