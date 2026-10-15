<script setup lang="ts">
// One lived-in room at work, as a row on a house's page in the list view: who lives there and what they build,
// its state (a dot on the face, and in words) and how much of the room's memory and CPU it's using right now, the reviews its flatmate has given and
// got (flatmates only: reviews aren't a public score), and, for the chef, the way into that room to manage it. The house panel above already lists the rooms with
// their one action each (Visit, Open, Knock); this row is about the server's load.
import { computed } from "vue";
import Avatar from "./Avatar.vue";
import Icon from "./lobby/house/Icon.vue";
import ListRow from "./lobby/panel/ListRow.vue";
import StatusDot from "./lobby/panel/StatusDot.vue";
import { roomState } from "./lobby/panel/words";
import { type WorkRow, workLine } from "./list/house";

const props = defineProps<{ houseId: string; row: WorkRow; mine?: boolean; member?: boolean }>();

const person = computed(() => props.row.room.occupant!);
const name = computed(() => person.value.name ?? person.value.login);
const title = computed(() => (props.row.room.project ? `${name.value} · ${props.row.room.project}` : name.value));
</script>

<template>
  <ListRow :title="title" :mine="mine">
    <template #lead>
      <span class="face">
        <Avatar :person="person" :size="40" decorative />
        <StatusDot class="on-face" :state="roomState(row.room)" />
      </span>
    </template>
    <span class="use">
      <span
        v-if="row.memory"
        class="meter gauge"
        role="img"
        :aria-label="`Using ${row.memory.pct}% of its memory`"
      ><span class="fill" :class="{ high: row.memory.pct >= 80 }" :style="{ width: row.memory.pct + '%' }" /></span>
      <span class="sub">{{ workLine(row) }}</span>
    </span>
    <template v-if="member && (row.given || row.received)" #meta>
      <span
        class="reviews"
        :title="`${row.given} reviews given, ${row.received} received`"
        :aria-label="`${row.given} reviews given, ${row.received} received`"
      ><Icon name="check" :size="14" />{{ row.given }}/{{ row.received }}</span>
    </template>
    <template v-if="row.manage" #end>
      <RouterLink :to="`/houses/${houseId}/rooms/${row.room.name}`" class="button manage" :aria-label="`Manage ${name}'s room as the chef`">
        <Icon name="key" :size="16" />Manage
      </RouterLink>
    </template>
  </ListRow>
</template>

<style scoped>
/* A face with its state's dot on the lower right, as on the house panel's rows. */
.face { position: relative; display: inline-grid; }
.on-face { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; box-shadow: 0 0 0 2px var(--tile); }
.use { display: flex; align-items: center; gap: 8px; min-width: 0; }
.gauge { flex: none; width: 56px; }
.use .sub { min-width: 0; }
.reviews { display: inline-flex; align-items: center; gap: 3px; }
.manage { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; }
</style>
