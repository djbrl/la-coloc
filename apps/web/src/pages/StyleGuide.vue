<script setup lang="ts">
// The style guide: every shared piece of the interface, in day and in night side by side, with made-up data so it
// needs no API. Only in development builds (main.ts adds the /styleguide route only when import.meta.env.DEV), so
// the words here are for the team and are not translated. Each half sits in a "tone-day" or "tone-night" box,
// which sets that theme's tokens (style.css) whatever the page's own theme is.
import { reactive, ref } from "vue";
import HouseCard from "../components/lobby/HouseCard.vue";
import Icon from "../components/lobby/house/Icon.vue";
import { icons, type IconName } from "../components/lobby/house/icons";
import KeyLegend from "../components/lobby/KeyLegend.vue";
import ListRow from "../components/lobby/panel/ListRow.vue";
import Panel from "../components/lobby/panel/Panel.vue";
import PanelHead from "../components/lobby/panel/PanelHead.vue";
import PanelTabs, { type Tab } from "../components/lobby/panel/PanelTabs.vue";
import StatusDot from "../components/lobby/panel/StatusDot.vue";
import StatusPill from "../components/lobby/panel/StatusPill.vue";
import type { State } from "../components/lobby/panel/words";
import Coach from "../components/lobby/tutorial/Coach.vue";
import { TutorialMachine } from "../components/lobby/tutorial/tutorial";
import Welcome from "../components/lobby/tutorial/Welcome.vue";
import Avatar from "../components/Avatar.vue";
import LoadingScreen from "../components/LoadingScreen.vue";
import type { CityHouse, Person } from "../types";

const tones = ["day", "night"] as const;

const swatches = [
  "--bg", "--surface", "--tile", "--fill", "--fill-hover", "--line", "--line-strong", "--text", "--muted",
  "--accent", "--accent-fill", "--accent-lip", "--accent-soft", "--live", "--warn", "--danger", "--free",
];

const states: State[] = [
  { tone: "live", word: "Online" },
  { tone: "warn", word: "Putting it online" },
  { tone: "danger", word: "Down" },
  { tone: "free", word: "Free" },
  { tone: "neutral", word: "Off" },
];

// One switch state per theme, so flipping one shows the motion without the other moving.
const switches = reactive({ day: [true, false], night: [true, false] });
const segments = reactive({ day: "day", night: "night" });
const tab = reactive({ day: "rooms", night: "rooms" });
const legend = reactive({ day: true, night: false });

const awa: Person = { login: "awa", name: "Awa Ndiaye", avatarUrl: null };
const kofi: Person = { login: "kofi", name: "Kofi Mensah", avatarUrl: null };
const tabs: Tab[] = [
  { key: "rooms", icon: "door", word: "Rooms" },
  { key: "channel", icon: "chat", word: "Channel", badge: 3 },
  { key: "chores", icon: "check", word: "Chores", badge: 1, alert: true },
  { key: "bill", icon: "bill", word: "Bill" },
];

const house: CityHouse = {
  id: "sacre-coeur",
  name: "Sacré-Cœur",
  city: "Dakar",
  country: "Senegal",
  tagline: "Three devs and a shared VPS.",
  status: "live",
  demo: true,
  agentOnline: true,
  monthlyCostFcfa: 12000,
  plot: null,
  rooms: [
    { name: "awa", status: "live", url: "https://awa.sacre-coeur.coloc.dev", project: "ndaje", projectDescription: null, ad: null, occupant: awa, building: false },
    { name: "kofi", status: "deploying", url: null, project: "kente-api", projectDescription: null, ad: null, occupant: kofi, building: true },
    { name: "room-3", status: "empty", url: null, project: null, projectDescription: null, ad: null, occupant: null, building: false },
  ],
  openChores: 2,
  lateChores: 0,
  knocking: 1,
  reviewsThisMonth: 7,
  tontine: null,
};

// Two coaches: the walk step (its keys as caps) and a project just put online (its address in the monospace).
function coachAt(step: "walk" | "run"): TutorialMachine {
  const m = new TutorialMachine();
  m.active = true;
  m.step = step;
  if (step === "run") m.state = { house: { id: "atelier", name: "L'Atelier", city: "Dakar", agentOnline: true }, room: { name: "awa", status: "live", url: "https://awa.atelier.coloc.dev" }, sample: { repo: "", path: "" }, github: { installUrl: null, linked: false }, done: false };
  return m;
}
const coaches = { walk: coachAt("walk"), run: coachAt("run") };
const noop = () => {};
const iconNames = Object.keys(icons) as IconName[];
const pressed = ref("");
</script>

<template>
  <div class="guide">
    <header class="intro wrap">
      <h1>Style guide</h1>
      <p class="muted">Every shared piece, day on the left, night on the right. Development builds only. Tokens live in <code>src/style.css</code>.</p>
    </header>

    <div class="halves">
      <section v-for="t in tones" :key="t" :class="`tone-${t} half`" :aria-label="`${t} theme`">
        <p class="tone-name mono">{{ t === "day" ? "/ day" : "/ night" }}</p>

        <h2 class="sec">Type</h2>
        <div class="stack">
          <p class="d1">Sacré-Cœur</p>
          <p class="d2">Put it online</p>
          <h3>A house in Dakar</h3>
          <p>Each house is one server, shared by the developers who live in it.</p>
          <p class="muted small">Muted, 14px: the line under a title.</p>
          <p><span class="mono">awa.sacre-coeur.coloc.dev</span> · <span class="mono">512 MB</span> · <span class="mono num">12 000 FCFA</span> · <span class="mono">a1b2c3d</span></p>
        </div>

        <h2 class="sec">Colours</h2>
        <ul class="swatches">
          <li v-for="s in swatches" :key="s"><span class="chip" :style="{ background: `var(${s})` }" /><span class="mono">{{ s.slice(2) }}</span></li>
        </ul>

        <h2 class="sec">Buttons</h2>
        <div class="row">
          <button class="primary" @click="pressed = t">Put it online</button>
          <button>Restart</button>
          <button class="link">Skip the tutorial</button>
          <button class="primary" disabled>Busy</button>
        </div>
        <div class="row">
          <a class="button primary" href="#" @click.prevent>Log in with GitHub</a>
          <a class="button" href="#" @click.prevent>Visit <Icon name="external" :size="16" /></a>
          <button class="primary" aria-label="Go in (E)">Go in <kbd>E</kbd></button>
        </div>

        <h2 class="sec">Keys</h2>
        <div class="row">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>E</kbd><kbd>Shift</kbd><kbd>?</kbd><kbd>Esc</kbd>
        </div>
        <div class="row">
          <KeyLegend :open="legend[t]" @toggle="legend[t] = !legend[t]" @keys="noop" />
        </div>

        <h2 class="sec">Switches and choices</h2>
        <div class="row">
          <button v-for="(on, i) in switches[t]" :key="i" class="toggle" role="switch" :aria-checked="on" :aria-label="`Switch ${i + 1}`" @click="switches[t][i] = !on"><span class="knob" aria-hidden="true" /></button>
          <div class="segmented" role="radiogroup" aria-label="Looks like">
            <button v-for="v in ['auto', 'day', 'night']" :key="v" role="radio" :aria-checked="segments[t] === v" :class="{ on: segments[t] === v }" @click="segments[t] = v">{{ v }}</button>
          </div>
        </div>

        <h2 class="sec">Status</h2>
        <div class="row">
          <span v-for="s in states" :key="s.tone" class="said"><StatusDot :state="s" /> {{ s.word }}</span>
        </div>
        <div class="row">
          <StatusPill v-for="s in states" :key="s.tone" :state="s" />
        </div>
        <div class="row meters">
          <div class="meter"><div class="fill" style="width: 34%" /></div>
          <div class="meter"><div class="fill high" style="width: 86%" /></div>
        </div>

        <h2 class="sec">Toast and flags</h2>
        <p class="toast"><span class="said">Awa's project is online.</span> <span class="muted">Sacré-Cœur, Dakar</span></p>
        <div class="scene">
          <span class="lobby-label house">Sacré-Cœur</span>
          <span class="lobby-label you">@jib</span>
          <span class="lobby-label">Awa Ndiaye<span class="home" style="background: #f2b134; color: #1a1206">SC</span></span>
          <span class="lobby-label small">Kofi</span>
        </div>

        <h2 class="sec">Icons</h2>
        <ul class="icons">
          <li v-for="n in iconNames" :key="n" :title="n"><Icon :name="n" :size="20" /></li>
        </ul>

        <h2 class="sec">Card (a house from the street)</h2>
        <HouseCard :house="house" :others="new Set(['awa'])" :near="false" />

        <h2 class="sec">Panel (a house inside)</h2>
        <div class="panel-box">
          <Panel explain="Each row is a room: one person's project, running on this house's server.">
            <template #head>
              <PanelHead :title="house.name" :state="states[0]" line="Dakar · 3 rooms, 1 free" />
            </template>
            <template #tabs>
              <PanelTabs v-model="tab[t]" :tabs="tabs" :label="`Parts of the house (${t})`" />
            </template>
            <ul class="plain lines">
              <ListRow title="Awa Ndiaye" sub="ndaje · awa.sacre-coeur.coloc.dev" mine>
                <template #lead><Avatar :person="awa" :size="40" decorative /></template>
                <template #meta>512 MB</template>
                <template #end><button class="primary"><Icon name="door" :size="16" />Open</button></template>
              </ListRow>
              <ListRow title="Kofi Mensah" sub="kente-api · putting it online">
                <template #lead><Avatar :person="kofi" :size="40" decorative /></template>
                <template #meta><StatusDot :state="states[1]" />38%</template>
                <template #end><a class="button" href="#" @click.prevent>Visit<Icon name="external" :size="16" /></a></template>
              </ListRow>
              <ListRow title="A free room" sub="256 MB of memory and 0.5 CPU, for one project." open>
                <template #lead><span class="door"><Icon name="door" :size="20" /></span></template>
                <template #end><button><Icon name="knock" :size="16" />Knock</button></template>
              </ListRow>
            </ul>
            <template #foot>
              <button class="primary go"><Icon name="rocket" :size="20" />Put it online</button>
            </template>
          </Panel>
        </div>

        <h2 class="sec">Coach</h2>
        <div class="stack">
          <Coach :machine="coaches.walk" :missing="false" :busy="false" error="" :ran="false" />
          <Coach :machine="coaches.run" :missing="false" :busy="false" error="" :ran="true" />
        </div>

        <h2 class="sec">Welcome</h2>
        <div class="stage welcome-box">
          <Welcome step="welcome" :busy="false" />
        </div>

        <h2 class="sec">Loading screen</h2>
        <div class="stage loading-box">
          <LoadingScreen :progress="0.62" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.guide { padding-bottom: 64px; }
.intro { padding-top: 32px; padding-bottom: 24px; display: grid; gap: 8px; }
/* Two halves side by side on a wide screen, one under the other on a narrow one. */
.halves { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); }
.half { min-width: 0; display: grid; gap: 14px; align-content: start; padding: 24px var(--gutter) 48px; background: var(--bg); }
.tone-name { color: var(--accent); font-size: 14px; }
.sec { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 22px; }
.stack { display: grid; gap: 10px; justify-items: start; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
.d1 { font: 800 44px/1 var(--display); letter-spacing: -0.035em; }
.d2 { font: 700 24px/1.1 var(--display); letter-spacing: -0.02em; }
.said { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
.swatches { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.swatches li { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.chip { flex: none; width: 28px; height: 28px; border-radius: var(--r-sm); box-shadow: inset 0 0 0 1px var(--hairline); }
.meters { display: grid; gap: 10px; max-width: 280px; }
.toast { justify-self: start; }
/* A patch of the lobby's evening sky, for the flags. */
.scene { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; padding: 22px 18px 26px; border-radius: var(--r-lg); background: linear-gradient(180deg, #2a2148 0%, #4b3a74 45%, #8a6aa0 100%); }
.scene .lobby-label { position: relative; }
.icons { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; color: var(--muted); }
.icons li { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-sm); box-shadow: inset 0 0 0 1px var(--line); }
/* The panel at the size the lobby's sheet gives it. */
.panel-box { height: 600px; max-width: 600px; display: flex; flex-direction: column; padding-top: 14px; border-radius: var(--r-xl); background: var(--surface); box-shadow: var(--shadow); overflow: hidden; }
.panel-box > :deep(.panel-shape) { flex: 1 1 auto; }
.plain { list-style: none; margin: 0; padding: 0; }
.lines { display: grid; gap: 4px; line-height: 1.3; }
.door { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--border); color: var(--free); }
.go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; font-size: 17px; }
/* Full-screen pieces, shown in a box of their own. */
.stage { position: relative; overflow: hidden; border-radius: var(--r-lg); box-shadow: inset 0 0 0 1px var(--line); background: linear-gradient(180deg, #2a2148 0%, #4b3a74 45%, #8a6aa0 100%); }
.welcome-box { height: 440px; }
.loading-box { height: 420px; }
</style>
