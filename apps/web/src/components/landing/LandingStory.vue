<script setup lang="ts">
// Below the street, the landing tells La Coloc as a film (mockup L on the design canvas): big pictures of the city and
// its people taken in the game, one title and one sentence a screen, and the app's windows turned into simple cards
// (a floor plan of faces, a repo going online, a share of the rent). The chat is five frames of the same street,
// crossfading as the bubbles appear. The pictures are in public/landing/story; the words follow the language.
import { num } from "../../i18n";
import { storyWords as w } from "./words";

defineProps<{ loginAt: string }>();

const PICTURES = "/landing/story";
const FLATMATES = [
  { name: "Moussa", face: `${PICTURES}/face-moussa.webp` },
  { name: "Awa", face: `${PICTURES}/face-awa.webp` },
  { name: "Jib", face: `${PICTURES}/face-jib.webp` },
];
const CITIES = ["Dakar", "Kigali", "Marrakech", "Tunis"];
const GITHUB =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z";
</script>

<template>
  <!-- Focusable from script only: the key on the road sends focus here, so Tab carries on down the story. -->
  <main id="how" class="story" tabindex="-1">
    <!-- The city, full width, the words over its foot. -->
    <section class="shot" aria-labelledby="story-square">
      <img :src="`${PICTURES}/square.webp`" :alt="w.square.alt" loading="lazy" width="1800" height="1125" />
      <div class="over">
        <h2 id="story-square" class="huge">{{ w.square.title }}</h2>
        <p>{{ w.square.line }}</p>
      </div>
    </section>

    <!-- People talking: the same street five times, each frame with one more bubble. -->
    <section class="duo" aria-labelledby="story-talk">
      <div class="film" role="img" :aria-label="w.talk.alt">
        <img v-for="n in 5" :key="n" :class="`f${n - 1}`" :src="`${PICTURES}/talk-${n - 1}.webp`" alt="" loading="lazy" width="1200" height="900" />
      </div>
      <div>
        <h2 id="story-talk">{{ w.talk.title }}</h2>
        <p>{{ w.talk.line }}</p>
      </div>
    </section>

    <!-- A room: the house's four rooms as faces, the free one waiting for you, and what each room gets. -->
    <section class="light centred" aria-labelledby="story-room">
      <h2 id="story-room">{{ w.room.title }}</h2>
      <p class="under">{{ w.room.line }}</p>
      <div class="plan" role="img" :aria-label="w.room.alt">
        <div v-for="f in FLATMATES" :key="f.name" class="cell"><img class="face" :src="f.face" alt="" width="104" height="104" loading="lazy" /><b>{{ f.name }}</b></div>
        <div class="cell free"><span class="face empty pulse">?</span><b>{{ w.room.you }}</b></div>
      </div>
      <ul class="chips">
        <li>{{ w.room.memory }}</li>
        <li>{{ num(0.5) }} vCPU</li>
        <li>SSH</li>
        <li>HTTPS</li>
      </ul>
    </section>

    <!-- A repo going online: the repo, three dots, the green "online". -->
    <section class="centred" aria-labelledby="story-push">
      <h2 id="story-push">{{ w.push.title }}</h2>
      <p class="under">{{ w.push.line }}</p>
      <div class="push" role="img" :aria-label="w.push.alt">
        <span class="repo"><svg viewBox="0 0 16 16" width="26" height="26" aria-hidden="true"><path fill="currentColor" :d="GITHUB" /></svg>awa_sow/wari-pay</span>
        <span class="dots" aria-hidden="true"><i /><i /><i /></span>
        <span class="online">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          {{ w.push.online }}
        </span>
      </div>
    </section>

    <!-- The rent: a share card with the four faces, the amount, and the two ways to top up. -->
    <section class="duo red" aria-labelledby="story-rent">
      <div>
        <h2 id="story-rent">{{ w.rent.title }}</h2>
        <p>{{ w.rent.line }}</p>
      </div>
      <div class="share" role="img" :aria-label="w.rent.alt">
        <div class="faces">
          <img v-for="f in FLATMATES" :key="f.name" class="face" :src="f.face" alt="" width="56" height="56" loading="lazy" />
          <span class="face empty" />
        </div>
        <div class="amount">{{ num(3000) }} <span>FCFA</span></div>
        <div class="ways"><span class="wave">Wave</span><span class="orange">Orange Money</span></div>
        <span class="per-review">{{ w.rent.perReview }}</span>
      </div>
    </section>

    <!-- The Arena, full width like the city. -->
    <section class="shot" aria-labelledby="story-arena">
      <img :src="`${PICTURES}/arena.webp`" :alt="w.arena.alt" loading="lazy" width="1800" height="1125" />
      <div class="over">
        <h2 id="story-arena" class="huge">{{ w.arena.title }}</h2>
        <p>{{ w.arena.line }}</p>
      </div>
    </section>

    <!-- Four cities, side by side. -->
    <section class="cities" aria-labelledby="story-cities">
      <h2 id="story-cities">{{ w.cities.title }}</h2>
      <p class="under">{{ w.cities.line }}</p>
      <div class="four">
        <img v-for="c in CITIES" :key="c" :src="`${PICTURES}/city-${c.toLowerCase()}.webp`" :alt="c" loading="lazy" width="1200" height="630" />
      </div>
    </section>

    <!-- The last call: three faces and the free room, and the one button. -->
    <section class="end" aria-labelledby="story-end">
      <div class="faces big" aria-hidden="true">
        <img v-for="f in FLATMATES" :key="f.name" class="face" :src="f.face" alt="" width="76" height="76" loading="lazy" />
        <span class="face empty pulse" />
      </div>
      <h2 id="story-end">{{ w.end.title }}</h2>
      <p>{{ w.end.line }}</p>
      <a class="move-in" :href="loginAt"><svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path fill="currentColor" :d="GITHUB" /></svg>{{ w.end.moveIn }}</a>
    </section>

    <footer class="story-foot">
      <span>{{ w.hosted }}</span>
      <a href="https://github.com/Djbrl/la-coloc" rel="noopener" target="_blank">GitHub</a>
    </footer>
  </main>
</template>

<style scoped>
/* Its own colours, as in the mockup: the night's ink, the cream, the house red, the sun yellow for what's free. */
.story { --ink: #17151a; --cream: #f7f5ef; --soft: #c9c5cf; --red: #b3202c; --sun: #ffd21f; --pale-sun: #fff8d6; display: grid; background: var(--ink); color: var(--cream); font-family: var(--font); }
.story:focus { outline: none; }
h2 { margin: 0; font: 400 clamp(36px, 4.2vw, 60px)/1.02 var(--brand); text-transform: none; letter-spacing: 0; color: inherit; }
h2.huge { max-width: 900px; font-size: clamp(40px, 5.8vw, 84px); line-height: 1; }
p { margin: 18px 0 0; max-width: 640px; font-size: clamp(17px, 1.4vw, 20px); line-height: 1.45; color: var(--soft); }
section { padding: 140px 64px; }
img { display: block; }
.face { display: block; border-radius: 50%; object-fit: cover; background: #f1eee6; }
.face.empty { box-sizing: border-box; border: 4px dashed var(--ink); background: var(--pale-sun); }

/* A picture full width, the words on a dark fade at its foot. */
.shot { position: relative; padding: 0; }
.shot img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; }
.shot .over { position: absolute; inset: auto 0 0 0; padding: 160px 64px 56px; background: linear-gradient(transparent, rgba(23, 21, 26, 0.88)); }
.shot h2 { color: #ffffff; }
.shot p { color: #e6e2ea; }

/* Two columns: a picture or a card, and its words. */
.duo { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); gap: 64px; align-items: center; }
.film { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 24px; }
.film img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.film .f1 { animation: f1 10s infinite; }
.film .f2 { animation: f2 10s infinite; }
.film .f3 { animation: f3 10s infinite; }
.film .f4 { animation: f4 10s infinite; }
@keyframes f1 { 0%, 10% { opacity: 0; } 14%, 94% { opacity: 1; } 100% { opacity: 0; } }
@keyframes f2 { 0%, 30% { opacity: 0; } 34%, 94% { opacity: 1; } 100% { opacity: 0; } }
@keyframes f3 { 0%, 50% { opacity: 0; } 54%, 94% { opacity: 1; } 100% { opacity: 0; } }
@keyframes f4 { 0%, 70% { opacity: 0; } 74%, 94% { opacity: 1; } 100% { opacity: 0; } }

/* Centred screens: the title, its line just under, then the card. */
.centred { display: grid; justify-items: center; gap: 48px; text-align: center; }
.centred .under { margin-top: -28px; }
.light { background: var(--cream); color: var(--ink); }
.light p { color: #4a4552; }

/* The house: four rooms in a square, ruled in ink, the free one in yellow. */
.plan { width: min(640px, 100%); display: grid; grid-template-columns: 1fr 1fr; border: 4px solid var(--ink); border-radius: 22px; overflow: hidden; background: #ffffff; }
.cell { padding: 32px; display: grid; justify-items: center; gap: 12px; }
.cell:nth-child(1) { border-right: 4px solid var(--ink); border-bottom: 4px solid var(--ink); }
.cell:nth-child(2) { border-bottom: 4px solid var(--ink); }
.cell:nth-child(3) { border-right: 4px solid var(--ink); }
.cell.free { background: var(--pale-sun); }
.cell .face { width: 104px; height: 104px; }
.cell .empty { display: grid; place-items: center; font: 400 40px var(--brand); }
.cell b { font-size: 20px; }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 0; padding: 0; list-style: none; }
.chips li { padding: 12px 18px; border-radius: 999px; background: var(--ink); color: #ffffff; font: 500 17px var(--code); }

/* The repo going online. */
.push { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 20px; }
.repo, .online { height: 72px; padding: 0 26px; display: flex; align-items: center; gap: 12px; border-radius: 18px; }
.repo { background: #ffffff; color: var(--ink); font: 500 20px var(--code); }
.online { background: #1f8a4c; color: #ffffff; font: 800 20px var(--font); }
.dots i { display: inline-block; width: 10px; height: 10px; margin: 0 4px; border-radius: 50%; background: var(--sun); animation: dot 1.4s infinite; }
.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }

/* The rent, on the house red: a white card with the faces, the share and the ways to top up. */
.red { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: var(--red); color: #ffffff; }
.red p { color: #ffe1e4; }
.share { justify-self: center; width: min(420px, 100%); padding: 32px; box-sizing: border-box; border-radius: 28px; background: #ffffff; color: var(--ink); display: grid; gap: 22px; }
.faces { display: flex; align-items: center; }
.faces .face { width: 56px; height: 56px; border: 3px solid #ffffff; box-sizing: border-box; }
.faces .face + .face { margin-left: -14px; }
.faces .face.empty { border: 3px dashed var(--ink); }
.amount { font: 400 64px/1 var(--brand); }
.amount span { font-size: 22px; }
.ways { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ways span { height: 56px; display: grid; place-items: center; border-radius: 14px; font: 800 18px var(--font); }
.wave { background: #1dc8ff; color: #0b2a3a; }
.orange { background: #ff7900; color: #ffffff; }
.per-review { justify-self: start; padding: 8px 14px; border-radius: 999px; background: var(--sun); font: 800 15px var(--font); }

/* The cities: four portraits in a row. */
.cities { padding-bottom: 120px; }
.four { margin-top: 40px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.four img { width: 100%; height: auto; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 18px; }

/* The last call, on the sun yellow. */
.end { padding: 112px 24px; background: var(--sun); color: var(--ink); display: grid; justify-items: center; gap: 28px; text-align: center; }
.end p { margin-top: -14px; max-width: 720px; color: #3a3420; }
.faces.big .face { width: 76px; height: 76px; border: 4px solid var(--sun); }
.faces.big .face + .face { margin-left: -18px; }
.faces.big .face.empty { border: 4px dashed var(--ink); }
.move-in { height: 56px; padding: 0 24px; display: flex; align-items: center; gap: 10px; border-radius: 14px; background: var(--ink); color: #ffffff; font-weight: 800; font-size: 18px; text-decoration: none; }
.move-in:hover { background: #2c2832; color: #ffffff; text-decoration: none; }
.move-in:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
.pulse { animation: pulse 2.4s infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 210, 31, 0.55); } 50% { box-shadow: 0 0 0 14px rgba(255, 210, 31, 0); } }
.end .pulse { animation-name: pulse-dark; }
@keyframes pulse-dark { 0%, 100% { box-shadow: 0 0 0 0 rgba(23, 21, 26, 0.35); } 50% { box-shadow: 0 0 0 14px rgba(23, 21, 26, 0); } }

.story-foot { min-height: 72px; box-sizing: border-box; padding: 16px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--soft); font: 500 13px var(--code); text-transform: uppercase; }
.story-foot a { color: var(--soft); }
.story-foot a:hover { color: #ffffff; }

/* A phone: one column, less air. */
@media (max-width: 860px) {
  section { padding: 80px 20px; }
  .duo, .red { grid-template-columns: 1fr; gap: 32px; }
  .shot .over { padding: 96px 20px 28px; }
  .shot img { aspect-ratio: 4 / 5; }
  .four { grid-template-columns: 1fr 1fr; }
  .cell { padding: 20px; }
  .cell .face { width: 76px; height: 76px; }
  .amount { font-size: 52px; }
}

@media (prefers-reduced-motion: reduce) {
  .film img, .dots i, .pulse { animation: none !important; }
  /* Still, the chat shows its last bubble but one, so it reads as a conversation. */
  .film .f1, .film .f2, .film .f3 { opacity: 1; }
  .film .f4 { opacity: 0; }
}
</style>
