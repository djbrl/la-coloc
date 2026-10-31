<script setup lang="ts">
// The landing: a brick wall seen from the street, a window with three flatmates behind it, and a red FOR RENT sign
// zip-tied to the pole. The picture and the flatmates' lines follow the visitor's clock (landing.ts). The picture is
// one image rendered from our own scene (public/landing/*.webp, under 100 KB each), so a phone pays nothing for 3D.
//
// Everything on the wall is placed in --u, one unit being 1/1440 of the picture's width: the picture covers the screen
// at any size, and the words stay on the bricks and the bubbles stay over the right flatmate. A phone has no room for
// that: there the window comes first, then the sign on its pole, then the flatmates' lines under it (see the end of
// the styles).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { landingWords as w } from "../components/words";
import { language, setLang } from "../i18n";
import { moodAt, setVisiting, type Mood } from "../landing";
import { lobbyUi } from "../settings";

const router = useRouter();

const mood = ref<Mood>(moodAt(new Date()));
const PICTURES: Record<Mood, string> = { day: "/landing/sign-day.webp", warm: "/landing/sign-warm.webp", blue: "/landing/sign-blue.webp" };
const flatmates = computed(() => {
  const lines = w.lines[mood.value];
  return [
    { name: "Kofi Mensah", handle: "@kofi-reboots", line: lines[0] },
    { name: "Awa Ndiaye", handle: "@awa-ships", line: lines[1] },
    { name: "Moussa Faye", handle: "@moussa-merges", line: lines[2] },
  ];
});

// GitHub's own door, unless this server has no GitHub login set up: then the login page, which offers what there is.
const github = ref(true);
const loginAt = computed(() => (github.value ? "/api/auth/github" : "/login"));

function tryDemo() {
  setVisiting(true);
  void router.replace("/");
}

const CITIES = "Dakar · Lomé · Abidjan · Cotonou · Douala · Kigali · Marrakech · Tunis";

// The landing has its own top line: the site's bar stays away while it's up. The clock is read once a minute.
let clock: number | undefined;
onMounted(async () => {
  lobbyUi.chrome = false;
  clock = window.setInterval(() => (mood.value = moodAt(new Date())), 60_000);
  const res = await fetch("/api/auth/config").catch(() => null);
  if (res?.ok) github.value = (await res.json()).github !== false;
});
onBeforeUnmount(() => {
  lobbyUi.chrome = true;
  clearInterval(clock);
});
</script>

<template>
  <div class="landing" :class="mood">
    <nav class="top" :aria-label="w.nav">
      <button type="button" class="key lang" :lang="language.lang === 'fr' ? 'en' : 'fr'" :aria-label="w.otherLanguage" @click="setLang(language.lang === 'fr' ? 'en' : 'fr')">
        {{ language.lang === "fr" ? "EN" : "FR" }}
      </button>
      <button type="button" class="key" @click="tryDemo">{{ w.demo }}</button>
      <a class="key" :href="loginAt">{{ w.logIn }}</a>
    </nav>

    <div class="scene">
      <img class="wall" :src="PICTURES[mood]" :alt="w.picture[mood]" width="2400" height="1500" decoding="async" />
      <h1>LA COLOC</h1>

      <div class="says">
        <div v-for="(f, i) in flatmates" :key="f.handle" class="say" :class="`at-${i}`">
          <div class="who">{{ f.name }}</div>
          <div class="handle">{{ f.handle }}</div>
          <div class="line">{{ f.line }}</div>
        </div>
      </div>

      <div class="post">
        <div class="sign-board">
          <span class="tie top-tie" aria-hidden="true" />
          <span class="tie bottom-tie" aria-hidden="true" />
          <span class="note" role="img" :aria-label="w.freeName"><span class="n" aria-hidden="true">1</span><span class="w" aria-hidden="true">{{ w.free[0] }}<br />{{ w.free[1] }}</span></span>
          <div class="edge">
            <div class="red">
              <h2 :aria-label="w.forRentName"><span class="l1" aria-hidden="true">{{ w.forRent[0] }}</span><span class="l2" aria-hidden="true">{{ w.forRent[1] }}</span></h2>
              <span class="taken" role="img" :aria-label="w.takenName">3/4</span>
              <a class="slot" :href="loginAt" :aria-label="w.moveInName">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
                {{ w.moveIn }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="foot">
      <span>{{ CITIES }}</span>
      <a href="https://github.com/Djbrl/la-coloc" rel="noopener" target="_blank">GitHub</a>
    </footer>
  </div>
</template>

<style scoped>
/* The moods: the colours that sit on each picture, as in the mockups (they aren't the app's tokens: they belong to
   these three pictures). */
.landing {
  --ground: #d8c8b0;
  --title: #fff4df;
  --title-shadow: 7px 7px 0 #8d3f2b;
  --key-bg: #1f4a3f;
  --key-ink: #fff4df;
  --say-bg: #ffffff;
  --say-ink: #1f2a26;
  --say-handle: #1f6b55;
  --foot-ink: #3a2e22;
  --sign-filter: none;
  /* The picture covers the screen, so it's as wide as the screen or as wide as 16:10 at the screen's height. */
  --picture: max(100vw, 160dvh);
  --u: calc(var(--picture) / 1440);
  position: relative;
  height: 100dvh;
  overflow: hidden;
  background: var(--ground);
  font-family: var(--font);
}
.landing.warm { --ground: #120c1c; --title: #f4e3c1; --title-shadow: none; --key-bg: #14233a; --key-ink: #f4e3c1; --say-bg: #fff8e7; --say-ink: #2a1621; --say-handle: #b3401f; --foot-ink: #f4e3c1; --sign-filter: brightness(0.9) sepia(0.12); }
.landing.blue { --ground: #060814; --title: #bfd4ff; --title-shadow: none; --key-bg: #0e1a44; --key-ink: #dce7ff; --say-bg: #0e1638; --say-ink: #e4ecff; --say-handle: #6fc3ff; --foot-ink: #9fb4e8; --sign-filter: brightness(0.68) saturate(0.8); }

/* The scene is exactly the picture, centred on the screen; whatever doesn't fit is cropped equally on both sides. */
.scene { position: absolute; left: 50%; top: 50%; width: var(--picture); height: calc(var(--picture) * 0.625); translate: -50% -50%; }
.wall { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

/* The top line and the foot stay on the screen's own edges, whatever the crop. */
.top { position: absolute; z-index: 2; top: 26px; right: 36px; display: flex; gap: 8px; }
.key { display: flex; align-items: center; justify-content: center; min-height: 46px; height: 46px; padding: 0 18px; border-radius: var(--r-md); background: var(--key-bg); color: var(--key-ink); font: 600 18px/1 var(--font); }
.key:hover:not(:disabled) { background: var(--key-bg); color: var(--key-ink); opacity: 0.85; text-decoration: none; }
.key:focus-visible, .slot:focus-visible, .foot a:focus-visible { outline: 3px solid #ffd21f; outline-offset: 2px; }
.lang { width: 52px; padding: 0; }
.foot { position: absolute; z-index: 2; left: 76px; right: 36px; bottom: 10px; display: flex; justify-content: space-between; gap: 16px; font-size: 15px; font-weight: 600; color: var(--foot-ink); }
.foot a { color: inherit; }

h1 { position: absolute; left: calc(68 * var(--u)); top: calc(122 * var(--u)); margin: 0; font: 800 calc(205 * var(--u)) / 1.06 var(--font); letter-spacing: calc(-5 * var(--u)); white-space: nowrap; color: var(--title); text-shadow: var(--title-shadow); }

/* A flatmate's bubble: pointed at them, placed by its bottom centre. Name, then @handle, then what they say. */
.say { position: absolute; width: calc(200 * var(--u)); padding: calc(9 * var(--u)) calc(12 * var(--u)) calc(10 * var(--u)); translate: -50% -100%; border-radius: calc(12 * var(--u)); background: var(--say-bg); color: var(--say-ink); box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35); font-size: calc(16 * var(--u)); line-height: 1.2; }
.say::after { content: ""; position: absolute; left: 50%; bottom: calc(-8 * var(--u)); margin-left: calc(-8 * var(--u)); border: calc(8 * var(--u)) solid transparent; border-bottom: 0; border-top-color: var(--say-bg); }
.at-0 { left: calc(270 * var(--u)); top: calc(603 * var(--u)); }
.at-1 { left: calc(497 * var(--u)); top: calc(627 * var(--u)); }
.at-2 { left: calc(800 * var(--u)); top: calc(591 * var(--u)); }
.who { font-weight: 800; line-height: 1.15; }
.handle { font-size: calc(13 * var(--u)); color: var(--say-handle); }
.line { margin-top: calc(5 * var(--u)); }

/* The sign on its pole. Its own unit, so the phone layout can size it to the screen and keep every proportion. */
.post { --s: var(--u); position: absolute; left: calc(1070 * var(--u)); top: calc(388 * var(--u)); width: calc(340 * var(--u)); }
.sign-board { position: relative; padding: calc(9 * var(--s)); background: #f7f5ef; rotate: 1.5deg; filter: drop-shadow(0 7px 10px rgba(0, 0, 0, 0.45)) var(--sign-filter); }
.tie { position: absolute; left: 50%; z-index: 1; width: calc(10 * var(--s)); height: calc(30 * var(--s)); margin-left: calc(-5 * var(--s)); border-radius: calc(3 * var(--s)); background: #17151a; }
.top-tie { top: calc(-10 * var(--s)); }
.bottom-tie { bottom: calc(-12 * var(--s)); height: calc(32 * var(--s)); }
.note { position: absolute; right: calc(-20 * var(--s)); top: calc(-16 * var(--s)); z-index: 2; display: flex; align-items: center; gap: calc(7 * var(--s)); padding: calc(6 * var(--s)) calc(13 * var(--s)) calc(7 * var(--s)) calc(11 * var(--s)); rotate: 7deg; background: #ffd21f; color: #17151a; box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35); font-family: "Caveat Brush", cursive; }
.note .n { font-size: calc(64 * var(--s)); line-height: 0.9; }
.note .w { font-size: calc(27 * var(--s)); line-height: 0.92; }
.edge { padding: calc(4 * var(--s)); border: calc(3 * var(--s)) solid #b3202c; border-radius: calc(18 * var(--s)); }
.red { position: relative; padding: calc(4 * var(--s)) calc(10 * var(--s)) calc(10 * var(--s)); border-radius: calc(13 * var(--s)); background: #b3202c; color: #ffffff; text-align: center; }
h2 { margin: 0; font-family: var(--display); }
.l1, .l2 { display: block; }
.l1 { font-size: calc(82 * var(--s)); line-height: 1.08; }
.l2 { margin-top: calc(-6 * var(--s)); font-size: calc(77 * var(--s)); line-height: 1; }
.taken { position: absolute; left: calc(18 * var(--s)); top: calc(30 * var(--s)); rotate: -6deg; font: 400 calc(48 * var(--s)) / 1 "Caveat Brush", cursive; color: #2a0c10; }
.slot { display: flex; align-items: center; justify-content: center; gap: calc(12 * var(--s)); height: calc(72 * var(--s)); margin-top: calc(8 * var(--s)); border-radius: calc(13 * var(--s)); background: #ffffff; color: #17151a; font: 400 calc(27 * var(--s)) / 1 var(--display); transition: background-color var(--dur) var(--ease); }
.slot:hover { background: #ffe9a8; text-decoration: none; }
.slot svg { flex: none; width: calc(34 * var(--s)); height: calc(34 * var(--s)); }

/* A phone, or any screen too tall for the wall to fit beside the sign: the page reads downwards. First the window,
   cropped so it fills the width (it spans x 58 to 1068 of the picture's 1440), with the name on the bricks above it;
   then the sign on its pole, the same picture, moved so that the pole stands in the middle; then the three lines. */
@media (max-width: 760px), (max-aspect-ratio: 5/4) {
  .landing { --u: calc(100vw / 1010); height: auto; min-height: 100dvh; overflow: hidden; }
  .top { top: 16px; left: 16px; right: 16px; justify-content: flex-end; gap: 6px; }
  .key { padding: 0 11px; font-size: 15px; }
  .lang { width: 44px; padding: 0; }
  .scene { position: static; width: auto; height: auto; translate: none; display: flex; flex-direction: column; }
  /* The window's crop: the picture is 1440u wide, drawn from x 58, down to just under the sill at y 838. */
  .scene::before { content: ""; order: -1; display: block; height: calc(838 * var(--u)); }
  .wall { order: -2; position: absolute; left: calc(-58 * var(--u)); top: 0; width: calc(1440 * var(--u)); height: auto; max-width: none; inset-inline-end: auto; bottom: auto; }
  h1 { left: 16px; right: 16px; top: 70px; font-size: calc((100vw - 32px) / 4.72); letter-spacing: -0.024em; }
  /* The wall goes on under the window: the same bricks, with the pole in the middle. The sign is as wide as it can
     be and no wider than on a desktop mockup. */
  .post { --s: calc(min(100vw - 64px, 340px) / 340); order: 1; position: relative; left: auto; top: auto; width: 100%; padding: calc(40 * var(--s)) 16px calc(44 * var(--s)); display: grid; justify-items: center; background: var(--ground) url("/landing/sign-day.webp") calc(50vw - 240vw * 0.861) 0 / 240vw auto no-repeat; }
  .warm .post { background-image: url("/landing/sign-warm.webp"); }
  .blue .post { background-image: url("/landing/sign-blue.webp"); }
  .sign-board { width: calc(340 * var(--s)); }
  .says { order: 2; display: grid; gap: 10px; padding: 16px; }
  .say { position: static; width: auto; padding: 9px 12px 10px; translate: none; border-radius: var(--r-md); font-size: 16px; }
  .say::after { display: none; }
  .handle { font-size: 14px; }
  .line { margin-top: 4px; }
  .foot { position: static; flex-direction: column; gap: 4px; padding: 0 16px 16px; font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .slot { transition: none; }
}
</style>
