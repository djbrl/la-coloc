<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Avatar from "../components/Avatar.vue";
import ChatPanel from "../components/ChatPanel.vue";
import FridgeDoor from "../components/FridgeDoor.vue";
import type { Place } from "../components/lobby/place";
import RoomCard from "../components/RoomCard.vue";
import type { HouseView } from "../types";

// `embedded`: shown inside the lobby's sheet, which has its own Back and Close. The page then drops its top
// padding and its link to the city, tells the sheet its name (`label`), and asks it to open places (`open`).
const props = defineProps<{ id: string; embedded?: boolean }>();
const emit = defineEmits<{ open: [place: Place]; label: [text: string] }>();
const house = ref<HouseView | null>(null);
const error = ref("");
let source: EventSource | null = null;

async function open(id: string) {
  source?.close();
  house.value = null;
  error.value = "";
  const res = await fetch(`/api/houses/${encodeURIComponent(id)}`).catch(() => null);
  if (!res?.ok) {
    error.value = res?.status === 404 ? "This house doesn't exist." : "Couldn't reach the API.";
    return;
  }
  house.value = await res.json();
  // The API pushes the whole house view whenever something changes.
  source = new EventSource(`/api/houses/${encodeURIComponent(id)}/stream`);
  source.addEventListener("house", (e) => (house.value = JSON.parse((e as MessageEvent).data)));
}

watch(() => props.id, open, { immediate: true });
watch(
  () => house.value?.name,
  (name) => name && emit("label", `Inside ${name}`),
);
onBeforeUnmount(() => source?.close());

const occupied = computed(() => house.value?.rooms.filter((r) => r.occupant).length ?? 0);
const perPerson = computed(() => {
  const h = house.value;
  if (!h?.monthlyCostFcfa) return null;
  // An estimate: the real bill splits by usage at month end.
  return Math.round(h.monthlyCostFcfa / Math.max(1, h.rooms.length) / 100) * 100;
});
const fcfa = (n: number) => n.toLocaleString("fr-FR") + " FCFA";
const due = (iso: string) => {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  return hours <= 0 ? "late" : hours < 1 ? "due within the hour" : `due in ${hours}h`;
};
const reviews = computed(() => house.value?.ledger.reduce((n, l) => n + l.given, 0) ?? 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;
const deployDot = (status: string) => (status === "live" ? "live" : status === "failed" ? "failed" : "deploying");
</script>

<template>
  <div class="house-page" :class="{ embedded }">
    <div v-if="error" class="wrap band">
      <h1>{{ error }}</h1>
      <p class="lede muted">Maybe it moved, or the link is off by a letter.</p>
      <RouterLink v-if="!embedded" to="/" class="more">Back to the city <span aria-hidden="true">›</span></RouterLink>
    </div>

    <template v-else-if="house">
      <!-- Who the house is, in a few plain sentences. -->
      <section class="band hero">
        <div class="wrap">
          <RouterLink v-if="!embedded" to="/" class="back"><span aria-hidden="true">‹</span> The city</RouterLink>
          <h1>{{ house.name }}</h1>
          <p class="lede muted">{{ house.city }}<template v-if="house.tagline">. {{ house.tagline }}</template></p>

          <div v-if="house.members.length" class="faces">
            <Avatar v-for="m in house.members" :key="m.login" :person="m" :size="40" />
          </div>

          <p class="state" aria-live="polite">
            <template v-if="house.status === 'making'"><span class="dot making" aria-hidden="true" />In the making. The server isn't rented yet.</template>
            <template v-else-if="house.agentOnline"><span class="dot live" aria-hidden="true" />The server is online.</template>
            <template v-else><span class="dot danger" aria-hidden="true" />The server is offline right now.</template>
            <template v-if="house.viewer?.member"> You live here.</template>
          </p>

          <p class="facts muted">
            <template v-if="house.chef">{{ nameOf(house.chef) }} is the chef. </template>
            {{ occupied }} of {{ house.rooms.length }} rooms are taken<template v-if="perPerson">, and rent comes to about {{ fcfa(perPerson) }} a month each</template>.
            Flatmates have exchanged {{ plural(reviews, "review", "reviews") }}.
            <template v-if="house.rules.strictReviews">Reviews are strict here: nothing deploys until a flatmate approves. </template>
            Rooms live at <span class="mono">*.{{ house.domain }}</span>.
            <template v-if="house.demo"> This is a sample house, so the city isn't empty.</template>
          </p>
        </div>
      </section>

      <!-- Someone knocked: the one thing flatmates should act on first. -->
      <section v-if="house.viewer?.member && house.doorbell?.length" class="band alt tight" aria-labelledby="doorbell-title">
        <div class="wrap">
          <div class="band-head">
            <h2 id="doorbell-title">Someone's at the door.</h2>
            <p class="muted">Read their note, ask them something, then vote.</p>
          </div>
          <ul class="rows">
            <li v-for="d in house.doorbell" :key="d.id">
              <Avatar :person="d.applicant" :size="36" decorative />
              <span class="grow">
                <strong>{{ nameOf(d.applicant) }}</strong> knocked on room {{ d.room }}.
                <span class="muted">{{ d.tally.yes }} of {{ d.tally.needed }} yes votes so far.</span>
              </span>
              <RouterLink :to="`/applications/${d.id}`" class="more end" :aria-label="`Answer ${nameOf(d.applicant)}`">
                Answer <span aria-hidden="true">›</span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </section>

      <!-- Floor plan placeholder: Jib's illustrated floor plan goes here, rooms driven by the same data. -->
      <section class="band" aria-labelledby="rooms-title">
        <div class="wrap">
          <div class="band-head">
            <h2 id="rooms-title">The rooms.</h2>
            <p class="muted">Each flatmate's app runs in its own room, with its own memory and CPU.</p>
          </div>
          <div class="floor">
            <RoomCard
              v-for="room in house.rooms"
              :key="room.name"
              :house-id="house.id"
              :house-status="house.status"
              :house-demo="house.demo"
              :room="room"
              :agent-online="house.agentOnline"
              :viewer="house.viewer"
              :chef-login="house.chef?.login ?? null"
              :ledger="house.ledger.find((l) => l.login === room.occupant?.login)"
              :embedded="embedded"
              @open="(place) => emit('open', place)"
            />
          </div>
        </div>
      </section>

      <template v-if="house.viewer?.member">
        <section class="band alt" aria-labelledby="chores-title">
          <div class="wrap">
            <div class="band-head">
              <h2 id="chores-title">Chores.</h2>
              <p class="muted">Reviews waiting on the house. Every pull request gets a flatmate, in turn.</p>
            </div>
            <p v-if="!house.chores?.length" class="muted">No reviews waiting right now.</p>
            <ul v-else class="rows">
              <li v-for="c in house.chores" :key="c.id">
                <Avatar :person="c.assignee" :size="32" decorative />
                <span class="grow">
                  <strong>{{ c.assignee.login === house.viewer.login ? "You" : nameOf(c.assignee) }}</strong>
                  {{ c.assignee.login === house.viewer.login ? "review" : "reviews" }}
                  <a :href="c.prUrl" target="_blank" rel="noopener">{{ c.repo }}#{{ c.prNumber }}</a>,
                  <span class="muted">{{ c.prTitle }}</span>
                </span>
                <span class="end small" :class="c.late ? 'word-danger' : 'word-warn'">{{ due(c.dueAt) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="band" aria-labelledby="living-title">
          <div class="wrap living">
            <div class="band-head">
              <h2 id="living-title">The living room.</h2>
              <p class="muted">One chat for the whole house.</p>
            </div>
            <ChatPanel :messages="house.channel ?? []" :post-url="`/api/houses/${house.id}/messages`" :me="house.viewer.login" />
          </div>
        </section>

        <section class="band alt" aria-label="House activity">
          <div class="wrap lower">
            <FridgeDoor :notes="house.notes ?? []" />
            <div class="deploys">
              <h2>Recent deploys.</h2>
              <p class="muted intro">What went out, and whether it stuck.</p>
              <p v-if="!house.deployments?.length" class="muted">Nothing deployed yet.</p>
              <ul v-else class="rows">
                <li v-for="d in house.deployments" :key="d.id">
                  <span class="grow">
                    <span class="dot" :class="deployDot(d.status)" aria-hidden="true" /><strong>{{ d.room }}</strong>
                    {{ d.kind === "preview" ? "previewed" : "deployed" }} <code>{{ d.ref }}</code>
                    <span class="muted">, {{ d.status }}</span>
                    <span v-if="d.status === 'failed' && d.detail" class="why">{{ d.detail.split("\n")[0] }}</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </template>
      <section v-else class="band alt tight">
        <p class="wrap muted">The living room, the fridge door and the deploy history are for flatmates.</p>
      </section>
    </template>

    <p v-else class="wrap band muted" aria-live="polite">Opening the door…</p>
  </div>
</template>

<style scoped>
.hero { padding-top: 48px; text-align: center; }
/* In the lobby's sheet the bar above does the spacing. */
.embedded .band { padding-top: 40px; padding-bottom: 40px; }
.embedded .hero { padding-top: 8px; }
.hero .wrap { display: grid; gap: 16px; justify-items: center; }
.hero .wrap > :not(.back) { max-width: 680px; }
.back { justify-self: start; }
.faces { display: flex; justify-content: center; flex-wrap: wrap; margin: 8px 0; }
.faces > * { margin-left: -6px; box-shadow: 0 0 0 3px var(--bg); }
.faces > *:first-child { margin-left: 0; }
.state { font-size: 17px; }
.facts { max-width: 600px; }
.mono { font-family: var(--mono); font-size: 0.9em; overflow-wrap: anywhere; }
.floor { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.living > * { max-width: 680px; }
.grow { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; }
.lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 48px 64px; }
.deploys { display: grid; gap: 8px; align-content: start; min-width: 0; }
.deploys .intro { margin-bottom: 16px; }
.deploys li { font-size: 15px; }
.why { display: block; margin-top: 2px; font-size: 14px; color: var(--danger); }
@media (max-width: 400px) {
  .floor { grid-template-columns: minmax(0, 1fr); }
  .lower { grid-template-columns: minmax(0, 1fr); }
}
</style>
