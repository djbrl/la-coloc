<script setup lang="ts">
// The city's Dashboard, the lobby's no-3D twin (Settings, "Show the city as"): one screen, no page scrolling on a
// computer. A welcome along the top (hello, the city you're looking at, its numbers, and the red key back to 3D); on
// the left a sidebar with your friends and how present they are, the cities, and your conversations; on the right
// the city's rooms: yours first, then the free rooms to rent, the houses with space, or all of them, each row with
// its one main action. On a phone it's one column that scrolls: the welcome, the rooms, then the sidebar.
// Everything comes from what the page already has (the city's houses, /api/me, the friends list and the
// conversations the top bar loads): no endpoint of its own. A click anywhere on it closes the window open over it.
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { conversations, openChat } from "../../conversations";
import { friends, friendsSheet } from "../../friends";
import { windows } from "../../oneWindow";
import { me } from "../../session";
import { settings } from "../../settings";
import type { CityHouse, Person } from "../../types";
import Avatar from "../Avatar.vue";
import { sortFriends, statusLine } from "../friends/friends";
import KnockSteps from "../KnockSteps.vue";
import Icon from "../lobby/house/Icon.vue";
import { fcfa } from "../lobby/house/server";
import ListRow from "../lobby/panel/ListRow.vue";
import StatusDot from "../lobby/panel/StatusDot.vue";
import { roomState } from "../lobby/panel/words";
import Choice, { type Option } from "./Choice.vue";
import { keeps } from "./city";
import CityRow from "./CityRow.vue";
import { citiesOf, type FreeRoom, firstName, freeRoomsIn, housesWithSpace, myRooms, roomMatches, startCity } from "./dashboard";
import { dashWords as w } from "./dashWords";

const props = defineProps<{ houses: CityHouse[] | null }>();
const route = useRoute();
const router = useRouter();

const all = computed(() => props.houses ?? []);
// The city on screen: the address bar's, else yours (dashboard.ts). Changing it writes the address, so the 3D view
// opens on the same city.
const city = ref(startCity(String(route.query.city ?? ""), all.value, me.value));
// The city list came after the page (or you logged in meanwhile): until you pick one, the start follows.
let picked = !!route.query.city;
watch([all, me], () => {
  if (!picked) city.value = startCity(null, all.value, me.value);
});
function pick(name: string) {
  picked = true;
  city.value = name;
  void router.replace({ query: { ...route.query, city: name } });
}

const cities = computed(() => citiesOf(all.value));
const here = computed(() => all.value.filter((h) => h.city === city.value));
const freeHere = computed(() => freeRoomsIn(all.value, city.value, me.value));
const spaceHere = computed(() => housesWithSpace(all.value, city.value, me.value));
const mine = computed(() => myRooms(all.value, me.value));
const myHouses = computed(() => me.value?.houses.map((h) => h.id) ?? []);

// The content's three lists, on one rail; it starts on the free rooms when there are any.
type Show = "free" | "space" | "all";
const show = ref<Show>("free");
const search = ref("");
const options = computed<Option[]>(() => [
  { key: "free", icon: "door", word: w.show.free },
  { key: "space", icon: "house", word: w.show.space },
  { key: "all", icon: "globe", word: w.show.all },
]);
const rooms = computed(() => freeHere.value.filter((r) => roomMatches(r, search.value)));
const shownHouses = computed(() => (show.value === "space" ? spaceHere.value : here.value).filter((h) => keeps(h, "all", search.value)));
const empty = computed(() => {
  if (search.value.trim()) return w.noMatch;
  return show.value === "free" ? w.noFree : show.value === "space" ? w.noSpace : w.noHouse;
});
const nothing = computed(() => (show.value === "free" ? !rooms.value.length : !shownHouses.value.length));

// The sidebar: your friends, the most present first (a few: the friends key has them all), and your conversations.
const FRIENDS = 5;
const CHATS = 4;
const myFriends = computed(() => sortFriends(friends.friends).slice(0, FRIENDS));
const online = computed(() => friends.friends.filter((f) => f.status !== "offline").length);
const chats = computed(() => conversations.items.slice(0, CHATS));
const nameOf = (p: Person) => p.name ?? p.login;

// Knocking on a free room: its steps, here (KnockSteps opens your knock's thread once it's sent).
const knocking = ref<FreeRoom | null>(null);

// Any press on the dashboard closes the window open over it (one at a time, oneWindow.ts). It doesn't stop the press:
// a button pressed here still does what it says.
function pressed() {
  if (!windows.held()) windows.closeAll();
}
</script>

<template>
  <div class="dash" @pointerdown.capture="pressed">
    <!-- The welcome: you, the city, its numbers, and the way back to 3D. -->
    <header class="hello">
      <span class="me">
        <Avatar v-if="me" :person="me" :size="56" decorative />
        <span v-else class="icon-tile"><Icon name="house" :size="26" /></span>
      </span>
      <div class="hello-words">
        <h1>{{ me ? w.hello(firstName(me)) : w.helloVisitor }}</h1>
        <p class="numbers">
          <span class="city-name"><Icon name="pin" :size="16" />{{ city }}</span>
          <span class="stat" role="img" :aria-label="w.houses(here.length)"><Icon name="house" :size="16" />{{ here.length }}</span>
          <span class="stat" role="img" :aria-label="w.freeRooms(freeHere.length)"><Icon name="door" :size="16" />{{ freeHere.length }}</span>
          <span v-if="me && friends.friends.length" class="stat" role="img" :aria-label="w.friendsOnline(online)"><Icon name="people" :size="16" />{{ online }}</span>
        </p>
      </div>
      <button type="button" class="primary walk" :aria-label="w.walkName" :title="w.walkName" @click="settings.view = 'lobby'">
        <Icon name="map" :size="20" /><span>{{ w.walk }}</span>
      </button>
    </header>

    <div class="body">
      <!-- The rooms: yours, then what the rail says. -->
      <section class="content sign" aria-labelledby="dash-city">
        <div class="sign-frame">
          <header class="sign-band">
            <span class="icon-tile"><Icon name="door" :size="22" /></span>
            <h2 id="dash-city">{{ city }}</h2>
            <p class="sign-sub">{{ w.houses(here.length) }} · {{ w.freeRooms(freeHere.length) }}</p>
          </header>
          <div class="sign-body inner">
            <div v-if="mine.length" class="my-rooms">
              <h3 class="label">{{ w.yourRooms(mine.length) }}</h3>
              <ul class="rows">
                <ListRow
                  v-for="r in mine"
                  :key="`${r.houseId}/${r.room}`"
                  :title="r.project ?? w.roomIn(r.room, r.houseName)"
                  :sub="r.project ? w.roomIn(r.room, r.houseName) : r.city"
                  mine
                >
                  <template #lead><span class="tile"><Icon name="key" :size="20" /></span></template>
                  <template #meta><StatusDot :state="roomState({ status: r.status, occupant: me }, 'live', r.demo)" /></template>
                  <template #end>
                    <RouterLink :to="`/houses/${r.houseId}/rooms/${encodeURIComponent(r.room)}`" class="button" :aria-label="w.openName(r.room, r.houseName)">{{ w.open }}</RouterLink>
                  </template>
                </ListRow>
              </ul>
            </div>

            <div class="controls" role="search" :aria-label="w.searchName">
              <Choice :model-value="show" :options="options" :label="w.whichRooms" class="rail" @update:model-value="(k) => (show = k as Show)" />
              <input v-model="search" type="search" :placeholder="w.search" :aria-label="w.searchName" />
            </div>

            <div class="list">
              <p v-if="!houses" class="soft none">{{ w.opening }}</p>
              <p v-else-if="nothing" class="soft none">{{ empty }}</p>
              <ul v-else-if="show === 'free'" class="rows" :aria-label="w.show.free">
                <ListRow
                  v-for="r in rooms"
                  :key="`${r.house.id}/${r.room.name}`"
                  :title="w.roomIn(r.room.name, r.house.name)"
                  :sub="r.room.ad ?? r.house.tagline ?? w.lookingFor"
                  open
                >
                  <template #lead><span class="tile"><Icon name="door" :size="20" /></span></template>
                  <template #meta><span v-if="r.rent" class="rent">{{ w.rent(fcfa(r.rent)) }}</span></template>
                  <template #end>
                    <button v-if="r.action.kind === 'knock'" type="button" :aria-label="w.knockName(r.room.name, r.house.name)" @click="knocking = r">
                      <Icon name="knock" :size="16" />{{ w.knock }}
                    </button>
                    <RouterLink v-else-if="r.action.kind === 'knocked'" :to="`/applications/${r.action.id}`" class="button">{{ w.yourKnock }}</RouterLink>
                    <RouterLink v-else-if="r.action.kind === 'login'" to="/login" class="button" :aria-label="w.logInToKnock">{{ w.knock }}</RouterLink>
                    <RouterLink v-else :to="`/houses/${r.house.id}`" class="button" :aria-label="w.seeName(r.house.name)">{{ w.see }}</RouterLink>
                  </template>
                </ListRow>
              </ul>
              <ul v-else class="rows" :aria-label="show === 'space' ? w.show.space : w.show.all">
                <CityRow v-for="h in shownHouses" :key="h.id" :house="h" :mine="myHouses.includes(h.id)" />
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- The sidebar: friends, cities, chat. -->
      <aside class="side sign">
        <div class="sign-frame">
          <div class="sign-body side-inner">
            <section class="group" aria-labelledby="dash-friends">
              <div class="group-head">
                <h3 id="dash-friends" class="label">{{ w.friends }}</h3>
                <button v-if="me" type="button" class="key" :aria-label="w.allFriends" :title="w.allFriends" @click="friendsSheet.open = true"><Icon name="people" :size="18" /></button>
              </div>
              <p v-if="!me" class="soft small">{{ w.logInLine }}</p>
              <p v-else-if="!myFriends.length" class="soft small">
                {{ w.noFriends }} <button type="button" class="link" @click="friendsSheet.open = true">{{ w.addFriends }}</button>
              </p>
              <ul v-else class="rows">
                <ListRow v-for="f in myFriends" :key="f.login" :title="nameOf(f)" :sub="statusLine(f)" class="person" :class="f.status">
                  <template #lead>
                    <span class="face"><Avatar :person="f" :size="36" decorative /><span class="dot" :class="f.status" aria-hidden="true" /></span>
                  </template>
                  <template #end>
                    <button type="button" class="key stretch" :aria-label="w.messageName(nameOf(f))" :title="w.messageName(nameOf(f))" @click="openChat('dm', { with: f.login })">
                      <Icon name="chat" :size="18" />
                    </button>
                  </template>
                </ListRow>
              </ul>
            </section>

            <section class="group" aria-labelledby="dash-cities">
              <h3 id="dash-cities" class="label">{{ w.cities }}</h3>
              <div class="cities">
                <button
                  v-for="c in cities"
                  :key="c.name"
                  type="button"
                  class="city"
                  :aria-current="c.name === city ? 'location' : undefined"
                  :aria-label="w.cityName(c.name, c.houses, c.free)"
                  @click="pick(c.name)"
                >
                  <span class="city-word">{{ c.name }}</span>
                  <span class="count"><Icon name="house" :size="13" />{{ c.houses }}</span>
                </button>
              </div>
            </section>

            <section class="group" aria-labelledby="dash-chat">
              <div class="group-head">
                <h3 id="dash-chat" class="label">{{ w.chat }}</h3>
                <button type="button" class="key" :aria-label="w.allChat" :title="w.allChat" @click="openChat('dm')"><Icon name="chat" :size="18" /></button>
              </div>
              <p v-if="!me" class="soft small"><RouterLink to="/login">{{ w.logIn }}</RouterLink></p>
              <p v-else-if="!chats.length" class="soft small">{{ w.noChat }}</p>
              <ul v-else class="rows">
                <ListRow v-for="c in chats" :key="c.with.login" :title="nameOf(c.with)" :sub="(c.last.mine ? w.you : '') + c.last.body" class="person">
                  <template #lead><Avatar :person="c.with" :size="36" decorative /></template>
                  <template #end>
                    <span v-if="c.unread" class="unread" role="img" :aria-label="w.unread(c.unread)" />
                    <button type="button" class="key stretch" :aria-label="w.messageName(nameOf(c.with))" :title="w.messageName(nameOf(c.with))" @click="openChat('dm', { with: c.with.login })">
                      <Icon name="chat" :size="18" />
                    </button>
                  </template>
                </ListRow>
              </ul>
            </section>
          </div>
        </div>
      </aside>
    </div>

    <KnockSteps v-if="knocking" :house-id="knocking.house.id" :house-name="knocking.house.name" :room="knocking.room" @close="knocking = null" />
  </div>
</template>

<style scoped>
/* A computer: the whole screen, nothing scrolls but a list that's too long for its card. The top bar's keys float in
   the top right corner (App.vue), so the welcome keeps clear of them. */
.dash {
  height: 100dvh;
  min-height: 520px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  padding: 24px;
}
.hello { display: flex; align-items: center; gap: 14px; min-height: 62px; padding-right: calc(var(--keys-width, 0px) + 16px); min-width: 0; }
.me { flex: none; display: grid; }
.me .icon-tile { width: 56px; height: 56px; border-radius: 16px; }
.hello-words { min-width: 0; display: grid; gap: 4px; }
.hello h1 { margin: 0; font: 800 28px/1.1 var(--display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.numbers { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; color: var(--muted); font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.numbers > span { display: inline-flex; align-items: center; gap: 5px; }
.city-name { color: var(--text); }
.city-name svg { color: var(--accent); }
.walk { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 50px; padding: 0 18px var(--lip); font-size: 17px; }

.body { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; }
.content, .side { min-height: 0; display: flex; flex-direction: column; }
.content > .sign-frame, .side > .sign-frame { flex: 1 1 auto; min-height: 0; }
.inner { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.label { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.my-rooms { flex: none; display: grid; gap: 4px; max-height: 40%; overflow-y: auto; overscroll-behavior: contain; }
.controls { flex: none; display: grid; grid-template-columns: auto minmax(160px, 1fr); gap: 10px; align-items: center; }
.controls input { min-height: 48px; padding: 0 14px; border: 0; border-radius: var(--tile-r); background: var(--sunken); font-size: 15px; font-weight: 700; }
.controls input:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--text); }
.list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 8px; margin: 0 -8px; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; }
.none { margin: 0; padding: 8px 0; font-weight: 700; }
.tile { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--sunken); color: var(--text); }
.rent { font-size: 13px; white-space: nowrap; }

/* The sidebar: three groups on one card, scrolling inside it only if a short screen needs it. */
.side-inner { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; overscroll-behavior: contain; padding-top: 18px; border-radius: var(--card-r); }
.group { display: grid; gap: 4px; }
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; }
.group .small { margin: 0; }
.group :deep(.list-row) { min-height: 48px; gap: 10px; }
.key { display: inline-flex; align-items: center; justify-content: center; width: 36px; min-width: 36px; height: 36px; min-height: 0; padding: 0 0 3px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 -3px 0 var(--quiet-lip); color: var(--text); }
.key:hover:not(:disabled) { background: var(--fill); }
/* A person's whole row opens the conversation; the key is its target. */
.person { position: relative; cursor: pointer; }
.stretch::after { content: ""; position: absolute; inset: 0; }
.face { position: relative; display: block; width: 36px; height: 36px; }
.dot { position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px var(--surface); }
.dot.online { background: var(--live); }
.dot.idle { background: var(--sticker); }
.dot.away { background: var(--muted); }
.dot.offline { background: var(--line); }
.person.offline :deep(.avatar) { opacity: 0.5; }
.unread { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
/* The cities: small tiles that wrap, the one on screen with an ink edge. */
.cities { display: flex; flex-wrap: wrap; gap: 6px; }
.city { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border-radius: 10px; background: var(--tile); color: var(--text); box-shadow: none; font-size: 14px; font-weight: 800; }
.city:hover:not(:disabled) { background: var(--fill); }
.city[aria-current="location"] { background: var(--surface); box-shadow: inset 0 0 0 2px var(--text); }
.count { display: inline-flex; align-items: center; gap: 3px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

/* A narrower computer: the rail's words fit under one another rather than run out. */
@media (max-width: 1100px) {
  .controls { grid-template-columns: minmax(0, 1fr); }
  .body { grid-template-columns: minmax(0, 1fr) 280px; }
}
/* A tablet or a phone: one column that scrolls with the page; the rooms first, the sidebar under them. */
@media (max-width: 760px) {
  .dash { height: auto; min-height: 100dvh; grid-template-rows: none; padding: 68px 12px 24px; }
  .hello { padding-right: 0; }
  .body { grid-template-columns: minmax(0, 1fr); }
  .list, .my-rooms, .side-inner { overflow: visible; max-height: none; }
}
@media (max-width: 520px) {
  .hello h1 { font-size: 22px; }
  .me :deep(.avatar) { width: 44px !important; height: 44px !important; }
  .walk { min-height: 44px; padding: 0 12px var(--lip); }
  /* The rail keeps its icons; each word stays as the choice's name for a screen reader. */
  .rail :deep(.word) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .rail :deep(.option) { flex: 1 1 0; }
}
</style>
