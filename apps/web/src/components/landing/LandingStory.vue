<script setup lang="ts">
// Below the street, the landing becomes a product page (mockup F on the design canvas, "façon Mistral"): bands of colour
// take the night to day, then squared paper. What a room is, how the rent falls, how a repo goes online, what a room
// gets, the neighbours, the mobile money, and a last call to move in. Bands take the day back to night at the end.
// The drawings are plain markup, not pictures, so they follow the language.
import { storyWords as w } from "./words";
import PixelHouse from "./PixelHouse.vue";

defineProps<{ loginAt: string }>();
const emit = defineEmits<{ demo: [] }>();

const RENT = ["12 000", "6 000", "4 000", "3 000"];
const DAWN = ["#2a2138", "#4a2747", "#7a2b45", "#b3202c", "#e0532a", "#f08c2e", "#f6b733", "#fbd45c", "#fdeeb8"];
const GITHUB =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z";
</script>

<template>
  <div id="how" class="story">
    <div class="bands" aria-hidden="true"><span v-for="c in DAWN" :key="c" :style="{ background: c }" /></div>

    <div class="paper">
      <section class="intro wrap">
        <i class="block b1" aria-hidden="true" /><i class="block b2" aria-hidden="true" /><i class="block b3" aria-hidden="true" /><i class="block b4" aria-hidden="true" />
        <div class="intro-lead">
          <h2 class="big">{{ w.title }} <PixelHouse :lit="3" :size="44" class="mark" /></h2>
          <div class="links">
            <button type="button" class="link" @click="emit('demo')">{{ w.demo }} <span class="chev" aria-hidden="true">›</span></button>
            <a class="link" :href="loginAt">{{ w.moveIn }} <span class="chev" aria-hidden="true">›</span></a>
          </div>
        </div>
        <ul class="points">
          <li v-for="p in w.points" :key="p.title">
            <h3>{{ p.title }}</h3>
            <p><span class="arrow" aria-hidden="true">→</span>{{ p.line }}</p>
          </li>
        </ul>
      </section>

      <section class="wrap rent">
        <header class="centred">
          <h2>{{ w.rent.title }}</h2>
          <p>{{ w.rent.line }}</p>
        </header>
        <ol class="houses">
          <li v-for="(price, i) in RENT" :key="price" :class="{ full: i === 3 }">
            <PixelHouse :lit="i + 1" :name="w.rent.house(i + 1)" />
            <strong class="price num">{{ price }}</strong>
            <span class="tag">{{ w.rent.tags[i] }}</span>
          </li>
        </ol>
        <p class="unit">{{ w.rent.unit }}</p>
      </section>

      <section class="wrap pipe">
        <header class="centred">
          <h2>{{ w.pipe.title }}</h2>
          <p>{{ w.pipe.line }}</p>
        </header>
        <div class="diagram">
          <svg class="wires" viewBox="0 0 1100 520" preserveAspectRatio="none" aria-hidden="true">
            <path d="M340 130H470V230H500M600 330V400M700 230H760V130" />
            <circle cx="340" cy="130" r="5" /><circle cx="500" cy="230" r="5" /><circle cx="700" cy="230" r="5" /><circle cx="760" cy="130" r="5" /><circle cx="600" cy="400" r="5" />
          </svg>
          <pre class="term repo"><span class="dim">{{ w.pipe.repo }}</span>
<span class="sun">$</span> git push origin main
<span class="dim">To github.com/…/tontine-app</span>
  a41c2e0..9b7f113  main</pre>
          <div class="node"><PixelHouse :lit="1" :size="64" :name="w.pipe.roomName" /></div>
          <pre class="term ssh"><span class="dim">{{ w.pipe.room }}</span>
<span class="sun">$</span> ls ~/your-room
project  notes.md
<span class="sun">$</span> tail -f project/app.log</pre>
          <div class="live">
            <i class="dot" aria-hidden="true" />
            <span><strong>{{ w.pipe.online }}</strong><code>tontine-app.medina.coloc</code></span>
          </div>
        </div>
      </section>

      <section class="wrap split specs">
        <div class="lead">
          <h2>{{ w.specs.title }}</h2>
          <p>{{ w.specs.line }}</p>
        </div>
        <ul class="figures">
          <li><strong class="num">256</strong><span class="tag">{{ w.specs.memory }}</span></li>
          <li><strong class="num">0,5</strong><span class="tag">{{ w.specs.cpu }}</span></li>
          <li><strong class="num">÷4</strong><span class="tag">{{ w.specs.split }}</span></li>
        </ul>
      </section>

      <section class="wrap split neighbours">
        <div class="lead">
          <h2>{{ w.neighbours.title }}</h2>
          <p>{{ w.neighbours.line }}</p>
          <ul class="ruled">
            <li v-for="p in w.neighbours.points" :key="p"><span class="arrow" aria-hidden="true">→</span>{{ p }}</li>
          </ul>
        </div>
        <div class="house-life" aria-hidden="true">
          <div class="chat">
            <div class="chat-head"><strong>{{ w.neighbours.channel }}</strong><span>{{ w.neighbours.house }}</span></div>
            <div class="said">
              <p><i style="background: #f6b733" /><span><strong>dev-ndar</strong>{{ w.neighbours.said[0] }}</span></p>
              <p><i style="background: #e0532a" /><span><strong>lome-stack</strong>{{ w.neighbours.said[1] }}</span></p>
            </div>
          </div>
          <div class="board">
            <div v-for="(card, i) in w.neighbours.board" :key="card.what" :class="['card', `c${i}`]"><span class="state">{{ card.state }}</span><strong>{{ card.what }}</strong></div>
          </div>
        </div>
      </section>

      <section class="wrap pay">
        <header class="centred">
          <h2>{{ w.pay.title }}</h2>
          <p>{{ w.pay.line }}</p>
        </header>
        <div class="pay-cards">
          <div class="pay-card">
            <i class="edge" aria-hidden="true" />
            <div class="pay-body">
              <span class="label">{{ w.pay.bill }}</span>
              <p class="say">{{ w.pay.billSays }}</p>
              <ul class="bill num">
                <li v-for="n in 3" :key="n"><span class="tick" aria-hidden="true">✓</span><span class="grow">{{ w.pay.room(n) }}</span><span>3 000</span><span class="sr">{{ w.pay.paid }}</span></li>
                <li class="due"><span class="tick" aria-hidden="true">·</span><span class="grow">{{ w.pay.room(4) }}</span><span>3 000, {{ w.pay.due }}</span></li>
              </ul>
            </div>
          </div>
          <div class="pay-card">
            <i class="edge" aria-hidden="true" />
            <div class="pay-body">
              <span class="label">{{ w.pay.credit }}</span>
              <p class="say">{{ w.pay.creditSays }}</p>
              <div class="amounts num" aria-hidden="true"><span>+2 000</span><span class="on">+5 000</span><span>+10 000</span></div>
              <p class="ways"><span><span class="arrow" aria-hidden="true">→</span>Wave</span><span><span class="arrow" aria-hidden="true">→</span>Orange Money</span><span class="via">{{ w.pay.via }}</span></p>
            </div>
          </div>
        </div>
      </section>

      <section class="wrap end">
        <h2 class="big">{{ w.end.title }}</h2>
        <div class="links">
          <a class="link" :href="loginAt"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" :d="GITHUB" /></svg>{{ w.end.moveIn }} <span class="chev" aria-hidden="true">›</span></a>
          <button type="button" class="link" @click="emit('demo')">{{ w.demo }} <span class="chev" aria-hidden="true">›</span></button>
        </div>
        <PixelHouse :lit="3" free :size="72" />
      </section>
    </div>

    <div class="bands" aria-hidden="true"><span v-for="c in [...DAWN].reverse()" :key="c" :style="{ background: c }" /></div>
  </div>
</template>

<style scoped>
/* Its own colours: the cream of the paper, the ink, the dawn's orange for arrows and wires. */
.story { --paper: #fbf6e9; --rule: #e3d8be; --ink: #1d1a17; --ink-2: #4a443d; --ink-3: #6b6255; --orange: #e0532a; --sun: #fbd45c; --pale: #fdf0c2; background: #2a2138; color: var(--ink); font-family: var(--font); font-weight: 400; }
.bands { display: grid; }
.bands span { height: 26px; }
.paper { background-color: var(--paper); background-image: linear-gradient(#f1e8d2 1px, transparent 1px), linear-gradient(90deg, #f1e8d2 1px, transparent 1px); background-size: 48px 48px; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 96px 24px; }
h2, h3 { font-family: var(--font); font-weight: 500; text-transform: none; letter-spacing: -0.02em; color: var(--ink); }
h2 { font-size: clamp(32px, 4.2vw, 48px); line-height: 1.06; }
h2.big { font-size: clamp(38px, 5vw, 60px); line-height: 1.04; letter-spacing: -0.025em; }
p { font-size: 18px; line-height: 1.5; color: var(--ink-2); }
.num { font-variant-numeric: tabular-nums; }
.arrow { flex: none; color: var(--orange); font-weight: 800; }
.centred { display: grid; justify-items: center; gap: 12px; max-width: 680px; margin: 0 auto 48px; text-align: center; }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 56px; align-items: center; }
.lead { display: grid; gap: 18px; max-width: 480px; }
ul, ol { margin: 0; padding: 0; list-style: none; }
.tag { padding: 5px 10px; background: var(--ink); color: var(--paper); font-size: 14px; font-weight: 600; line-height: 1.2; }

/* Links that read as text, underlined, with the orange chevron. */
.links { display: flex; flex-wrap: wrap; gap: 24px; }
.link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 0 2px; border: 0; border-bottom: 1px solid var(--ink); border-radius: 0; background: transparent; color: var(--ink); font: 500 17px/1.2 var(--font); text-transform: none; box-shadow: none; cursor: pointer; }
.link:hover:not(:disabled) { background: transparent; color: var(--orange); text-decoration: none; }
.link:focus-visible { outline: 3px solid var(--orange); outline-offset: 3px; }
.chev { color: var(--orange); }

/* What La Coloc is, against four selling points; a few pale blocks behind, like pixels on the paper. */
.intro { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 56px; align-items: center; min-height: 560px; }
.intro-lead { position: relative; display: grid; gap: 24px; }
.mark { vertical-align: -4px; }
.block { position: absolute; display: block; width: 48px; height: 48px; background: var(--pale); }
.b1 { left: 0; top: 48px; height: 96px; }
.b2 { left: 192px; top: 96px; background: #fbe39a; }
.b3 { left: 96px; bottom: 48px; width: 96px; }
.b4 { left: 240px; bottom: 96px; background: var(--sun); }
.points li { display: grid; gap: 10px; padding: 22px 0; border-top: 1px solid var(--rule); }
.points li:last-child { border-bottom: 1px solid var(--rule); }
.points h3 { font-size: 26px; line-height: 1.15; }
.points p { display: flex; gap: 14px; font-size: 16px; line-height: 1.45; }

/* The rent falling: the same house four times, one more window lit each time. */
.houses { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.houses li { display: grid; justify-items: center; gap: 16px; padding: 24px; background: var(--pale); }
.houses li.full { background: var(--sun); }
.price { font-size: 44px; font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
.unit { margin-top: 16px; text-align: center; font-size: 15px; }

/* From the repo to the address: boxes joined by wires, like a wiring plan. */
.diagram { position: relative; height: 520px; max-width: 1100px; margin: 0 auto; }
.wires { position: absolute; inset: 0; width: 100%; height: 100%; }
.wires path { fill: none; stroke: var(--orange); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.wires circle { fill: var(--paper); stroke: var(--orange); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.term { position: absolute; top: 40px; width: 31%; margin: 0; padding: 16px 18px; background: var(--ink); color: #e9e2d4; font: 500 13px/1.8 var(--code); white-space: pre-wrap; overflow-wrap: anywhere; }
.repo { left: 0; }
.ssh { right: 0; }
.dim { color: #8c8478; }
.sun { color: var(--sun); }
.node { position: absolute; left: 45.5%; top: 130px; width: 9%; aspect-ratio: 1; display: grid; place-items: center; background: #fdeeb8; border: 2px solid var(--ink); }
.live { position: absolute; left: 34%; top: 400px; width: 32%; display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #ffffff; border: 1px solid var(--rule); }
.live .dot { flex: none; width: 10px; height: 10px; background: #2f9e5b; }
.live span { display: grid; gap: 2px; min-width: 0; }
.live strong { font-weight: 600; font-size: 16px; }
.live code { color: var(--ink-2); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The figures, each with its black label. */
.figures { display: grid; gap: 10px; }
.figures li { display: flex; align-items: center; gap: 16px; padding: 18px 24px; background: #ffffff; border: 1px solid var(--rule); }
.figures strong { font-size: clamp(52px, 6vw, 72px); font-weight: 500; line-height: 1; letter-spacing: -0.03em; }

/* The neighbours: the house's channel, then three cards from its reviews. */
.ruled li { display: flex; gap: 14px; padding: 14px 0; border-top: 1px solid var(--rule); font-size: 17px; }
.ruled li:last-child { border-bottom: 1px solid var(--rule); }
.house-life { display: grid; gap: 12px; }
.chat { background: #ffffff; border: 1px solid var(--rule); }
.chat-head { display: flex; justify-content: space-between; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--rule); font-size: 14px; color: var(--ink-3); }
.chat-head strong { color: var(--ink); font-weight: 600; }
.said { display: grid; gap: 14px; padding: 16px 18px; }
.said p { display: flex; gap: 12px; font-size: 16px; line-height: 1.4; }
.said i { flex: none; width: 28px; height: 28px; }
.said strong { display: block; color: var(--ink); font-weight: 600; }
.board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.card { display: grid; gap: 6px; align-content: start; padding: 14px; background: var(--pale); }
.card strong { font-weight: 600; font-size: 16px; line-height: 1.25; }
.state { font: 500 12px/1.3 var(--code); text-transform: uppercase; color: var(--ink-3); }
.c1 { background: var(--sun); }
.c1 .state { color: #5a4a1a; }
.c2 { background: var(--ink); color: var(--paper); }
.c2 .state { color: var(--sun); }

/* The money: two cards with an edge in the dawn's colours. */
.pay-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 16px; }
.pay-card { display: grid; grid-template-columns: 6px 1fr; background: var(--pale); }
.edge { display: block; background: linear-gradient(var(--sun) 0 20%, #f6b733 20% 40%, #f08c2e 40% 60%, var(--orange) 60% 80%, #b3202c 80%); }
.pay-body { display: grid; gap: 18px; align-content: start; padding: 24px 28px; }
.label { font-size: 14px; color: var(--ink-3); }
.pay-body .say { color: var(--ink); font-size: 24px; font-weight: 500; line-height: 1.25; }
.bill li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #ead9a5; font-size: 17px; }
.bill .grow { flex: 1 1 auto; }
.bill .tick { font-weight: 800; }
.bill .due { color: #b3202c; font-weight: 600; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.amounts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.amounts span { display: grid; place-items: center; height: 48px; border: 1px solid var(--ink); font-size: 16px; font-weight: 500; }
.amounts .on { background: var(--ink); color: var(--paper); }
.ways { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 15px; color: var(--ink); }
.ways > span { display: flex; gap: 10px; }
.ways .via { color: var(--ink-3); }

.end { display: grid; justify-items: center; gap: 28px; text-align: center; }
.end .links { justify-content: center; }

/* A phone: the wiring plan becomes a column of boxes, without wires. */
@media (max-width: 760px) {
  .wrap { padding: 64px 16px; }
  .intro { min-height: 0; }
  .block { display: none; }
  .diagram { height: auto; display: grid; gap: 12px; }
  .wires { display: none; }
  .term, .node, .live { position: static; width: auto; }
  .node { width: 96px; justify-self: center; }
  .houses { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .houses li { padding: 16px; }
  .houses svg { width: 88px; height: 88px; }
  .price { font-size: 32px; }
  .board { grid-template-columns: 1fr; }
}
</style>
