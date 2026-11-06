<script setup lang="ts">
// The landing: a header, then a brick building at night seen from across the road, a window with three flatmates behind
// it, the city behind that, and a red FOR RENT sign zip-tied to the pole on the sidewalk. The wall is one image rendered
// from our own scene (public/landing/street.webp), up at once and never moving. Once it's there, the room behind the window comes alive on a canvas laid exactly over it (lobby/landingRoom.ts). Whenever that
// can't or shouldn't run, the picture alone is the page.
//
// Everything on the wall is placed in --u, one unit being 1/1440 of the picture's width: the picture covers the screen
// at any size, and the words stay on the bricks and the bubbles stay over the right flatmate. A phone has no room for
// that: there the window comes first, then the sign on its pole, then the flatmates' lines under it (see the end of
// the styles). Below all that, the page scrolls on into what La Coloc sells (components/landing/LandingStory.vue).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { landingWords as w } from "../components/words";
import { language, setLang } from "../i18n";
import { headsOnPicture, setVisiting, windowOnPicture } from "../landing";
import type { LandingRoom } from "../lobby/landingRoom";
import { lobbyUi, settings } from "../settings";
import AccountGone from "../components/AccountGone.vue";
import LandingStory from "../components/landing/LandingStory.vue";
import { storyWords } from "../components/landing/words";

const router = useRouter();

// Which exchange they're on: everyone's line comes from the same one, and they take it in turns.
const talk = ref(0);
const flatmates = computed(() => {
  const line = (i: number) => w.talks[talk.value % w.talks.length][i];
  return [
    { name: "Kofi Mensah", handle: "@kofi-reboots", line: line(0) },
    { name: "Awa Ndiaye", handle: "@awa-ships", line: line(1) },
    { name: "Moussa Faye", handle: "@moussa-merges", line: line(2) },
  ];
});

// The room behind the window, on its canvas. The canvas stays see-through until the room has drawn its first frame.
const canvasHost = ref<HTMLElement | null>(null);
const bubbles = ref<HTMLElement[]>([]);
const live = ref(false);
const entering = ref(false);
const at = windowOnPicture();
const windowPlace = {
  left: `calc((${at.left} - var(--crop)) * var(--u))`,
  top: `calc(${at.top} * var(--u))`,
  width: `calc(${at.width} * var(--u))`,
  height: `calc(${at.height} * var(--u))`,
};
const bubbleAt = headsOnPicture().map((head) => ({ left: `calc(${head.left} * var(--u))`, top: `calc(${head.top} * var(--u))` }));
let room: LandingRoom | null = null;
let opening = 0;
// On a phone the bubbles sit under the sign, not over the flatmates, so they stay where they are.
const bubblesFloat = window.matchMedia("(min-width: 761px) and (min-aspect-ratio: 5/4)");

function closeRoom() {
  opening++;
  room?.dispose();
  room = null;
  live.value = false;
  bubbles.value.forEach((b) => (b.style.transform = ""));
  canvasHost.value?.replaceChildren();
}

async function openTheRoom() {
  closeRoom();
  const asked = opening;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  // A canvas of its own each time: one that has lost its 3D context can't get another.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvasHost.value?.replaceChildren(canvas);
  try {
    const { openRoom } = await import("../lobby/landingRoom");
    const opened = await openRoom(canvas, {
      onPoke: poke,
      onPoint: giveFloor,
      onHeads(moved) {
        if (!bubblesFloat.matches) return;
        moved.forEach((m, i) => {
          const el = bubbles.value[i];
          if (el) el.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)`;
        });
      },
      onGiveUp: closeRoom,
    });
    if (asked !== opening) return opened.dispose();
    room = opened;
    live.value = true;
  } catch {
    // No WebGL, or the models didn't load: the picture is still the page.
    if (asked === opening) closeRoom();
  }
}

function poke(i: number) {
  talk.value++;
  giveFloor(i);
  room?.poke(i);
}

// They talk one at a time, so the bubbles don't hide the room, and move on to something else once all three have
// spoken. Pointing at someone gives them the floor. On a phone all three lines are on the page, and stay until tapped.
const TURN_MS = 5000;
const speaking = ref(0);
let turns: number | undefined;
function giveFloor(i: number) {
  speaking.value = i;
  clearInterval(turns);
  turns = window.setInterval(() => {
    if (!bubblesFloat.matches) return;
    speaking.value = (speaking.value + 1) % 3;
    if (speaking.value === 0) talk.value++;
  }, TURN_MS);
}

// GitHub's own door, unless this server has no GitHub login set up: then the login page, which offers what there is.
const github = ref(true);
const loginAt = computed(() => (github.value ? "/api/auth/github" : "/login"));

// Trying the demo goes through the window, into the city.
const ENTERING_MS = 650;
function tryDemo() {
  const walkIn = () => {
    setVisiting(true);
    void router.replace("/");
  };
  if (entering.value) return;
  // Scrolled down into the story, the street's zoom would play out of sight: straight in.
  if (calm() || window.scrollY > 0) return walkIn();
  entering.value = true;
  window.setTimeout(walkIn, ENTERING_MS);
}

// The site's "Calmer motion" or the system's.
const calm = () => settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Down the page, below the street: what La Coloc sells (LandingStory). The key on the road scrolls there, and the
// keyboard follows, so Tab carries on down the story instead of back up the street.
function showHow() {
  const how = document.getElementById("how");
  how?.scrollIntoView({ behavior: calm() ? "auto" : "smooth" });
  how?.focus({ preventScroll: true });
}

// The name on the wall, as neon tubes: one line per letter. The last C is on its way out, so it's kept apart to blink;
// while it's off, the sign reads LA COLO.
const NEON_VIEW = "-20 2 615 140";
const NEON_TUBES = "M0 24V120H46 M64 120L95 24L126 120M75 86H115 M233 41A38 48 0 1 0 233 103 M290 24A38 48 0 1 0 290 120A38 48 0 1 0 290 24 M350 24V120H396 M456 24A38 48 0 1 0 456 120A38 48 0 1 0 456 24";
const NEON_BROKEN = "M575 41A38 48 0 1 0 575 103";
const NEON_RAIL = "M-10 72H580";
const NEON_CABLE = "M575 103C582 118 596 118 600 146";

// A few windows in the city that go on and off, each at its own pace, on the picture.
const CITY_WINDOWS = [
  { left: 1148, top: 287, seconds: 23 },
  { left: 1211, top: 249, seconds: 37 },
  { left: 1007, top: 230, seconds: 17 },
  { left: 1242, top: 287, seconds: 29 },
].map((w) => ({ left: `calc(${w.left} * var(--u))`, top: `calc(${w.top} * var(--u))`, animationDuration: `${w.seconds}s` }));

const CITIES = "Dakar · Lomé · Abidjan · Cotonou · Douala · Kigali · Marrakech · Tunis";

// The landing has its own header: the site's bar stays away while it's up.
onMounted(async () => {
  lobbyUi.chrome = false;
  giveFloor(0);
  void openTheRoom();
  const res = await fetch("/api/auth/config").catch(() => null);
  if (res?.ok) github.value = (await res.json()).github !== false;
});
onBeforeUnmount(() => {
  lobbyUi.chrome = true;
  clearInterval(turns);
  closeRoom();
});
</script>

<template>
  <div class="landing" :class="{ entering }">
    <AccountGone />
    <header class="top">
      <span class="brand">La Coloc</span>
      <nav :aria-label="w.nav">
        <button type="button" class="key lang" :lang="language.lang === 'fr' ? 'en' : 'fr'" :aria-label="w.otherLanguage" @click="setLang(language.lang === 'fr' ? 'en' : 'fr')">
          {{ language.lang === "fr" ? "EN" : "FR" }}
        </button>
        <a class="key" :href="loginAt">{{ w.signInShort }}</a>
        <button type="button" class="key main" @click="tryDemo">{{ w.demo }}</button>
      </nav>
    </header>

    <div class="scene">
      <img class="wall" src="/landing/street.webp" :alt="w.picture" width="2400" height="1500" decoding="async" />
      <div ref="canvasHost" class="room" :class="{ live }" :style="windowPlace" />
      <i v-for="(place, i) in CITY_WINDOWS" :key="i" class="city-window" :style="place" aria-hidden="true" />
      <h1 class="neon" aria-label="La Coloc">
        <svg class="glass" :viewBox="NEON_VIEW" aria-hidden="true"><path class="rail" :d="NEON_RAIL" /><path class="cable" :d="NEON_CABLE" /><path :d="NEON_TUBES + NEON_BROKEN" /></svg>
        <svg class="halo" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="NEON_TUBES" /></svg>
        <svg class="glow" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="NEON_TUBES" /></svg>
        <svg class="lit" :viewBox="NEON_VIEW" aria-hidden="true"><path class="tube" :d="NEON_TUBES" /><path class="core" :d="NEON_TUBES" /></svg>
        <div class="broken">
          <svg class="halo" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="NEON_BROKEN" /></svg>
          <svg class="glow" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="NEON_BROKEN" /></svg>
          <svg class="lit" :viewBox="NEON_VIEW" aria-hidden="true"><path class="tube" :d="NEON_BROKEN" /><path class="core" :d="NEON_BROKEN" /></svg>
        </div>
      </h1>

      <div class="says">
        <button v-for="(f, i) in flatmates" :key="f.handle" ref="bubbles" type="button" class="say" :class="{ speaking: speaking === i }" :style="bubbleAt[i]" @click="poke(i)">
          <span class="who">{{ f.name }}</span>
          <span class="handle">{{ f.handle }}</span>
          <span class="line">{{ f.line }}</span>
        </button>
      </div>

      <div class="post">
        <div class="sign-board">
          <span class="tie top-tie" aria-hidden="true" />
          <span class="tie bottom-tie" aria-hidden="true" />
          <div class="edge">
            <div class="red">
              <h2 :aria-label="w.forRentName"><span class="l1" aria-hidden="true">{{ w.forRent[0] }}</span><span class="l2" aria-hidden="true">{{ w.forRent[1] }}</span></h2>
              <span class="taken" role="img" :aria-label="w.takenName">3/4</span>
              <a class="slot" :href="loginAt">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
                {{ w.signIn }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="foot">
      <span>{{ CITIES }}</span>
      <button type="button" class="down" @click="showHow">
        {{ storyWords.down }}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <a href="https://github.com/Djbrl/la-coloc" rel="noopener" target="_blank">GitHub</a>
    </footer>
  </div>
  <LandingStory :login-at="loginAt" @demo="tryDemo" />
</template>

<style scoped>
/* The colours that sit on the picture, as in the mockups (they aren't the app's tokens: they belong to this picture). */
.landing {
  --ground: #120c1c;
  --pave: #30263a;
  --pole: #4a4750;
  --title: #f4e3c1;
  --say-bg: #fff8e7;
  --say-ink: #2a1621;
  --say-handle: #b3401f;
  --sign-filter: brightness(0.9) sepia(0.12);
  --head: 64px;
  /* The picture covers what the header leaves, so it's as wide as the screen or as wide as 16:10 at that height. */
  --picture: max(100vw, calc((100dvh - var(--head)) * 1.6));
  --u: calc(var(--picture) / 1440);
  /* What a phone crops off the picture's left. */
  --crop: 0;
  position: relative;
  height: 100dvh;
  overflow: hidden;
  background: var(--ground);
  font-family: var(--font);
}

/* The header: the sky's own colour at the top of the picture, so the night runs on behind it. */
.top { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; height: var(--head); padding: 0 24px; background: var(--ground); color: var(--title); }
.brand { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; }
.top nav { display: flex; align-items: center; gap: 6px; }
.key { display: flex; align-items: center; justify-content: center; min-height: 42px; height: 42px; padding: 0 14px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--title); font: 600 16px/1 var(--font); white-space: nowrap; }
.key:hover:not(:disabled) { background: #2a2036; color: var(--title); text-decoration: none; }
.key.main { margin-left: 6px; padding: 0 18px; background: var(--title); color: var(--ground); }
.key.main:hover:not(:disabled) { background: #fff4df; color: var(--ground); }
.key:focus-visible, .slot:focus-visible, .foot a:focus-visible { outline: 3px solid #ffd21f; outline-offset: 2px; }
.lang { width: 46px; padding: 0; }

/* The scene is exactly the picture, under the header. What doesn't fit is cropped equally left and right, and mostly
   off the road: the roofline matters more. */
.scene { position: absolute; left: 50%; top: calc(var(--head) + (100dvh - var(--head) - var(--picture) * 0.625) * 0.25); width: var(--picture); height: calc(var(--picture) * 0.625); translate: -50% 0; }
.wall { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* The live room, over the window on the picture. */
.room { position: absolute; opacity: 0; transition: opacity 0.5s var(--ease); }
.room.live { opacity: 1; }
.room :deep(canvas) { display: block; width: 100%; height: 100%; }
/* Through the window: the whole street grows until you're inside. The window's middle is at 41% and 58% of the picture. */
.scene { transform-origin: 41% 58%; }
.entering .scene { scale: 6; opacity: 0; transition: scale 0.65s cubic-bezier(0.6, 0, 0.9, 0.4), opacity 0.25s linear 0.4s; }
.entering .foot { opacity: 0; transition: opacity 0.2s linear; }

/* The foot stays on the screen's own edge, on the road, whatever the crop. */
/* Three columns, so the key in the middle never sits on the cities' line, which wraps instead on a narrower screen. */
.foot { position: absolute; z-index: 2; left: 36px; right: 36px; bottom: 10px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 16px; font-size: 15px; font-weight: 600; color: #f4efe6; }
.foot > a { justify-self: end; }
.foot a { color: inherit; }
/* The way down to the story, in the middle of the road. */
.down { display: flex; align-items: center; gap: 8px; min-height: 48px; height: 48px; padding: 0 18px 0 22px; border: 0; border-radius: 24px; background: var(--say-bg); color: var(--say-ink); font: 800 16px/1 var(--font); white-space: nowrap; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4); }
.down:hover:not(:disabled) { background: #ffffff; color: var(--say-ink); }
.down:focus-visible { outline: 3px solid #ffd21f; outline-offset: 2px; }
.entering .down { opacity: 0; }

.city-window { position: absolute; width: calc(13 * var(--u)); height: calc(18 * var(--u)); margin: calc(-9 * var(--u)) 0 0 calc(-6.5 * var(--u)); background: #ffc773; will-change: opacity; animation: on-and-off 23s steps(1) infinite; }
@keyframes on-and-off {
  0%, 45% { opacity: 0; }
  46%, 100% { opacity: 1; }
}

/* The name, in neon on its rail, knocked crooked: it still hangs from its left end. The tubes are always there, dark glass
   when off, so the name stays readable. Only the last C blinks, as a layer of its own: the browser just changes its
   opacity, with nothing to redraw. Never more than three flashes in a second. */
.neon { position: absolute; left: calc(262 * var(--u)); top: calc(175 * var(--u)); width: calc(640 * var(--u)); aspect-ratio: 615 / 140; margin: 0; rotate: 3.4deg; transform-origin: 0 50%; pointer-events: none; }
.neon svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.glass path { stroke: #4d2c3a; stroke-width: 12; }
.glass .rail { stroke: #140e18; stroke-width: 5; }
.glass .cable { stroke: #0d090f; stroke-width: 2.5; }
/* The light the sign throws on the bricks, then the glow round the tubes. */
.halo { opacity: 0.5; filter: blur(calc(30 * var(--u))); }
.halo path { stroke: #ff2d55; stroke-width: 44; }
.glow { opacity: 0.85; filter: blur(calc(12 * var(--u))); }
.glow path { stroke: #ff2d55; stroke-width: 20; }
.lit .tube { stroke: #ff4a68; stroke-width: 12; }
.lit .core { stroke: #ffe6e6; stroke-width: 4.5; }
.broken { position: absolute; inset: 0; will-change: opacity; animation: dying 8s linear infinite; }
@keyframes dying {
  0%, 61% { opacity: 1; }
  61.5% { opacity: 0.15; }
  62.5%, 64% { opacity: 1; }
  64.5% { opacity: 0.1; }
  65.5%, 67% { opacity: 0.9; }
  67.5%, 85% { opacity: 0; }
  85.5% { opacity: 0.7; }
  86.5%, 88% { opacity: 0.05; }
  88.5%, 100% { opacity: 1; }
}

/* A flatmate's bubble: pointed at them, placed by its bottom centre (headsOnPicture). Name, then @handle, then what they
   say. They talk in turn: the others are there for a screen reader and the keyboard, but not to see. */
.say { position: absolute; display: block; width: 14em; min-height: 0; height: auto; padding: 0.55em 0.75em 0.6em; translate: -50% -100%; border: 0; border-radius: 0.75em; background: var(--say-bg); color: var(--say-ink); box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35); font: 400 max(12px, calc(14 * var(--u))) / 1.2 var(--font); text-align: left; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 0.25s var(--ease); }
.say.speaking, .say:focus-visible { opacity: 1; pointer-events: auto; }
.say:hover:not(:disabled) { background: var(--say-bg); color: var(--say-ink); }
.say:focus-visible { outline: 3px solid #ffd21f; outline-offset: 2px; }
.say::after { content: ""; position: absolute; left: 50%; bottom: -0.5em; margin-left: -0.5em; border: 0.5em solid transparent; border-bottom: 0; border-top-color: var(--say-bg); }
.who, .handle, .line { display: block; }
.who { font-weight: 800; line-height: 1.15; }
.handle { font-size: 0.82em; color: var(--say-handle); }
.line { margin-top: 0.3em; }

/* The sign on its pole. Its own unit, so the phone layout can size it to the screen and keep every proportion. */
.post { --s: calc(0.8 * var(--u)); position: absolute; left: calc(929 * var(--u)); top: calc(395 * var(--u)); width: calc(272 * var(--u)); }
.sign-board { position: relative; padding: calc(9 * var(--s)); background: #f7f5ef; rotate: 1.5deg; filter: drop-shadow(0 7px 10px rgba(0, 0, 0, 0.45)) var(--sign-filter); }
.tie { position: absolute; left: 50%; z-index: 1; width: calc(10 * var(--s)); height: calc(30 * var(--s)); margin-left: calc(-5 * var(--s)); border-radius: calc(3 * var(--s)); background: #17151a; }
.top-tie { top: calc(-10 * var(--s)); }
.bottom-tie { bottom: calc(-12 * var(--s)); height: calc(32 * var(--s)); }
.edge { padding: calc(4 * var(--s)); border: calc(3 * var(--s)) solid #b3202c; border-radius: calc(18 * var(--s)); }
.red { position: relative; padding: calc(4 * var(--s)) calc(10 * var(--s)) calc(10 * var(--s)); border-radius: calc(13 * var(--s)); background: #b3202c; color: #ffffff; text-align: center; }
h2 { margin: 0; font-family: var(--brand); text-transform: uppercase; }
.l1, .l2 { display: block; }
.l1 { font-size: calc(82 * var(--s)); line-height: 1.08; }
.l2 { margin-top: calc(-6 * var(--s)); font-size: calc(77 * var(--s)); line-height: 1; }
.taken { position: absolute; left: calc(6 * var(--s)); top: calc(34 * var(--s)); rotate: -6deg; font: 400 calc(40 * var(--s)) / 1 "Caveat Brush", cursive; color: #2a0c10; }
.slot { display: flex; align-items: center; justify-content: center; gap: calc(12 * var(--s)); height: calc(72 * var(--s)); margin-top: calc(8 * var(--s)); padding: 0 calc(18 * var(--s)); border-radius: calc(13 * var(--s)); background: #ffffff; color: #17151a; font: 600 calc(19 * var(--s)) / 1 var(--font); white-space: nowrap; transition: background-color var(--dur) var(--ease); }
.slot:hover { background: #ffe9a8; text-decoration: none; }
.slot svg { flex: none; width: calc(34 * var(--s)); height: calc(34 * var(--s)); }

/* A phone, or any screen too tall for the street to fit: the page reads downwards. First the building with its name and
   window, which fills the width (it spans x 247 to 931 of the picture's 1440), cut where the building meets the
   ground; then the sign on its pole, on the sidewalk; then the three lines. */
@media (max-width: 760px), (max-aspect-ratio: 5/4) {
  .landing { --u: calc(100vw / 690); --crop: 240; height: auto; min-height: 100dvh; overflow: hidden; }
  .landing { --head: 56px; }
  .top { padding: 0 12px; gap: 6px; }
  .brand { font-size: 16px; }
  .top nav { gap: 2px; }
  .key { min-height: 38px; height: 38px; padding: 0 7px; font-size: 14px; }
  .key.main { margin-left: 3px; padding: 0 10px; }
  .lang { width: 32px; padding: 0; }
  .scene { position: relative; left: auto; top: auto; width: auto; height: auto; translate: none; display: flex; flex-direction: column; transform-origin: 50% calc(590 * var(--u)); }
  .scene::before { content: ""; order: -1; display: block; height: calc(719 * var(--u)); }
  .scene { transform-origin: 50% calc(525 * var(--u)); }
  .wall { order: -2; position: absolute; left: calc(var(--crop) * var(--u) * -1); top: 0; width: calc(1440 * var(--u)); height: auto; max-width: none; inset-inline-end: auto; bottom: auto; }
  .city-window { display: none; }
  .neon { left: 16px; top: calc(145 * var(--u)); width: calc(100vw - 32px); }
  /* The sidewalk goes on under the building, with the pole in the middle. The sign is as wide as it can be and no wider
     than on a desktop. */
  .post { --s: calc(min(100vw - 64px, 340px) / 340); order: 1; position: relative; left: auto; top: auto; width: 100%; padding: calc(40 * var(--s)) 16px calc(44 * var(--s)); display: grid; justify-items: center; background: linear-gradient(to right, transparent calc(50% - 14px), var(--pole) calc(50% - 14px), var(--pole) calc(50% + 14px), transparent calc(50% + 14px)), var(--pave); }
  .sign-board { width: calc(340 * var(--s)); }
  .says { order: 2; display: grid; gap: 10px; padding: 16px; }
  .say { position: static; width: 100%; padding: 9px 12px 10px; translate: none; border-radius: var(--r-md); font-size: 16px; opacity: 1; pointer-events: auto; }
  .say::after { display: none; }
  .foot { position: static; color: var(--title); display: flex; flex-direction: column; gap: 4px; padding: 0 16px 16px; font-size: 14px; }
  .down { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .slot, .room, .say { transition: none; }
  .broken { opacity: 0.2; animation: none; }
  .city-window { animation: none; }
}
</style>
