<script setup lang="ts">
// The room's Code tab: "Upload a project". Your GitHub repos first, a pasted public link or a Docker Hub image as the
// quiet alternatives. Pick one and it's in: the house's caretaker reads it by itself (POST inspect) and one screen says
// what it found and handled (how it'll run, the port, the settings its env example names, what might get in its way),
// with "Put it online" as the one press left. A read that fails says why and goes back to the choice. A room that
// has code shows its facts first, and a failed build lands straight on what reading it finds now.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Icon from "../lobby/house/Icon.vue";
import RepoPicker from "../RepoPicker.vue";
import UiNote, { loud, type Note } from "../UiNote.vue";
import { sendJSON } from "../../session";
import type { RepoChoice, RoomManage } from "../../types";
import RoomServerOff from "./RoomServerOff.vue";
import { canChangeCode, codeBody, codeRows, imageNameOk, parsePort, readTrouble, type SettingsForm } from "./room";
import { roomWords as w } from "./words";

const props = defineProps<{
  data: RoomManage;
  // The room's API address.
  base: string;
  form: SettingsForm;
  // Puts the form back to what's saved.
  reset: () => void;
  // Asks the API for the room again.
  reload: () => Promise<void>;
  // Sent here to sort out a failed build or upload a project: open on the flow straight away.
  fixing?: boolean;
}>();
const emit = defineEmits<{ run: [what: "redeploy"]; fixed: [] }>();

type Stack = keyof typeof w.stacks;
type Flag = keyof typeof w.flags;
interface Findings {
  branch: string;
  stack: Stack | null;
  port: number | null;
  portFrom: keyof typeof w.portFound | null;
  env: string[];
  flags: Flag[];
  folders: string[];
}
// Where the code being read comes from: your GitHub repo in the room, a link, an image.
type Route = "github" | "repo" | "image";

const IMAGE = "docker://";
const rows = computed(() => codeRows(props.data.settings, props.data.github));
const serverUp = computed(() => props.data.house.agentOnline);
const canChange = computed(() => canChangeCode(props.data));
const hasCode = computed(() => !!props.data.github || !!props.data.settings.source);

const screen = ref<"facts" | "pick" | "reading" | "found">("facts");
const route = ref<Route>("github");
// The field open under the list, if any. With GitHub off it's the way in.
const typing = ref<"" | "repo" | "image">("");
const githubOff = ref(false);
const typed = ref("");
const found = ref<Findings | null>(null);
const note = ref<Note | null>(null);
const portError = ref("");
// What you type for each setting the project expects. Only what's filled in gets saved.
const values = reactive<Record<string, string>>({});
const busy = ref(false);
const startButton = ref<HTMLButtonElement | null>(null);
const field = ref<HTMLInputElement | null>(null);

const saved = computed(() => new Set(props.data.secrets.map((s) => s.name)));
const noPort = computed(() => found.value?.stack === "static" || found.value?.stack === "php");
const canRun = computed(() => !!found.value?.stack);
// What's being read, as the found screen names it.
const named = computed(() => (route.value === "github" ? props.data.github?.fullName : typed.value.trim().replace(/^https:\/\//, "").replace(/\.git$/, "")) || null);

const sourceTyped = () => {
  const text = typed.value.trim();
  return text && route.value === "image" ? `${IMAGE}${text.replace(/^docker:\/\//, "")}` : text;
};

// The choice, with what the room has now open if it's a link or an image.
function choose() {
  const source = props.data.github ? "" : (props.data.settings.source ?? "");
  const own = source.startsWith("file:") ? "" : source;
  typing.value = own.startsWith(IMAGE) ? "image" : own ? "repo" : githubOff.value ? "repo" : "";
  typed.value = own.replace(IMAGE, "");
  found.value = null;
  screen.value = "pick";
}

function open(to: "repo" | "image") {
  note.value = null;
  // With GitHub off the list isn't there to go back to, so a field stays open.
  if (typing.value === to && !githubOff.value) typing.value = "";
  else if (typing.value !== to) {
    typing.value = to;
    typed.value = "";
  }
}
watch(typing, async (to) => {
  if (!to) return;
  await nextTick();
  field.value?.focus();
});

function githubIsOff() {
  githubOff.value = true;
  if (!typing.value) typing.value = "repo";
}

async function backToFacts() {
  props.reset();
  note.value = null;
  screen.value = "facts";
  await nextTick();
  startButton.value?.focus();
}

// Picking a repo brings it in straight away, then it's read.
async function pickRepo(repo: RepoChoice) {
  note.value = null;
  screen.value = "reading";
  const res = await sendJSON("POST", `${props.base}/import`, { id: repo.id });
  if (!res.ok) {
    note.value = loud(res.message);
    screen.value = "pick";
    return;
  }
  // The API started the new repo clean (its branch, folder and port): the form follows.
  await props.reload();
  props.reset();
  route.value = "github";
  void read();
}

// A pasted link or an image's one button. A different one starts clean too.
function importTyped() {
  note.value = null;
  if (!typed.value.trim() || !typing.value) return;
  route.value = typing.value;
  if (route.value === "image" && !imageNameOk(sourceTyped().slice(IMAGE.length))) {
    note.value = loud(w.badImage);
    return;
  }
  if (sourceTyped() !== props.data.settings.source) Object.assign(props.form, { branch: "", buildPath: ".", port: "" });
  void read();
}

// The caretaker reads the project. It takes a clone, so it can take a while.
async function read() {
  note.value = null;
  found.value = null;
  screen.value = "reading";
  const res = await sendJSON<Findings>("POST", `${props.base}/inspect`, {
    ...(route.value === "github" ? {} : { source: sourceTyped() || undefined }),
    ...(route.value !== "image" && props.form.branch.trim() ? { branch: props.form.branch.trim() } : {}),
    ...(route.value !== "image" && props.form.buildPath.trim() ? { path: props.form.buildPath.trim() } : {}),
  });
  if (!res.ok) {
    const why = readTrouble(res.message);
    note.value = loud(why ? w.readTrouble[why] : res.message || w.readFailed);
    // Back to the choice, with what you typed still there.
    typing.value = route.value === "github" ? "" : route.value;
    screen.value = "pick";
    return;
  }
  found.value = res.data;
  // What it found fills what you haven't said.
  if (res.data.port && !props.form.port.trim()) props.form.port = String(res.data.port);
  screen.value = "found";
}

function useFolder(folder: string) {
  props.form.buildPath = folder;
  void read();
}

// Saves what was read and what you filled in, then the build starts (and its log opens, on the Overview).
async function putOnline() {
  portError.value = "";
  const port = parsePort(props.form.port);
  if (!port.ok) {
    portError.value = w.portRange;
    return;
  }
  note.value = null;
  busy.value = true;
  if (route.value !== "github" && typed.value.trim()) props.form.source = sourceTyped();
  const res = await sendJSON("PATCH", `${props.base}/settings`, codeBody(props.form, route.value === "github", port.port));
  if (!res.ok) {
    note.value = loud(res.message);
    busy.value = false;
    return;
  }
  for (const name of found.value?.env ?? []) {
    const value = values[name]?.trim();
    if (!value) continue;
    const put = await sendJSON("PUT", `${props.base}/secrets/${encodeURIComponent(name)}`, { value });
    if (!put.ok) {
      note.value = loud(put.message);
      busy.value = false;
      return;
    }
  }
  await props.reload();
  props.reset();
  busy.value = false;
  screen.value = "facts";
  emit("run", "redeploy");
}

onMounted(() => {
  // Being sent here counts once: coming back to the tab later shows the facts.
  const sent = props.fixing;
  emit("fixed");
  if (!serverUp.value || !canChange.value) return;
  if (sent && hasCode.value) {
    // A failed build: what reading the room's code finds now, with the choice one press away.
    const source = props.data.settings.source ?? "";
    route.value = props.data.github ? "github" : source.startsWith(IMAGE) ? "image" : "repo";
    typed.value = source.startsWith("file:") ? "" : source.replace(IMAGE, "");
    void read();
  } else if (sent || !hasCode.value) choose();
});
// Leaving the tab mid-flow drops what was typed, so it can't ride along with the next save.
onBeforeUnmount(() => {
  if (screen.value !== "facts") props.reset();
});
</script>

<template>
  <div class="code">
    <RoomServerOff v-if="!serverUp" :data="data" />

    <template v-if="!serverUp || !canChange || screen === 'facts'">
      <dl v-if="hasCode || !canChange" class="facts">
        <div v-for="r in rows" :key="r.term" class="fact">
          <dt>{{ r.term }}</dt>
          <dd :class="{ unset: r.unset }">
            <a v-if="r.href" :href="r.href" target="_blank" rel="noopener" class="mono">{{ r.value }}<span class="sr-only">{{ w.newTab }}</span></a>
            <span v-else :class="{ mono: !r.unset }">{{ r.value }}</span>
          </dd>
        </div>
      </dl>
      <div v-if="serverUp && canChange" class="bar">
        <button ref="startButton" type="button" class="chunk" @click="choose">
          <Icon name="code" :size="16" /> {{ hasCode ? w.changeProject : w.uploadProject }}
        </button>
      </div>
    </template>

    <!-- The choice: your repos first, the two others quietly under them. -->
    <div v-else-if="screen === 'pick'" class="setup">
      <h3>{{ w.uploadProject }}</h3>
      <UiNote :note="note" />
      <RepoPicker v-show="!typing" :selected="data.github?.fullName" @pick="pickRepo" @off="githubIsOff" />
      <form v-if="typing" class="typed" novalidate @submit.prevent="importTyped">
        <label>
          <span class="head">{{ typing === "repo" ? w.repoLink : w.imageOnHub }}</span>
          <input
            ref="field"
            v-model="typed"
            type="text"
            inputmode="url"
            :placeholder="typing === 'repo' ? 'https://github.com/you/your-app' : w.imagePlaceholder"
            autocapitalize="off"
            spellcheck="false"
          />
        </label>
        <button class="primary next" :disabled="!typed.trim()">{{ w.importIt }}</button>
      </form>
      <div class="others">
        <button type="button" class="chunk small" :class="{ on: typing === 'repo' }" :aria-pressed="typing === 'repo'" @click="open('repo')">{{ w.pasteLink }}</button>
        <button type="button" class="chunk small" :class="{ on: typing === 'image' }" :aria-pressed="typing === 'image'" @click="open('image')">{{ w.useImage }}</button>
      </div>
      <div v-if="hasCode" class="nav">
        <button type="button" class="chunk" @click="backToFacts"><span aria-hidden="true">‹</span> {{ w.back }}</button>
      </div>
    </div>

    <div v-else-if="screen === 'reading'" class="reading" role="status">
      <p>{{ w.readingProject }}</p>
      <p class="dots" aria-hidden="true"><span /><span /><span /></p>
    </div>

    <!-- What reading it found and handled, and the one press left. -->
    <div v-else class="setup">
      <p v-if="named" class="repo mono">{{ named }}</p>
      <section v-if="found" class="found" :aria-label="w.foundTitle">
        <dl class="facts">
          <div class="fact" :class="{ bad: !canRun }">
            <dt>{{ w.runsAs }}</dt>
            <dd>{{ found.stack ? w.stacks[found.stack] : w.unknownStack }}</dd>
          </div>
          <div v-if="canRun" class="fact">
            <dt>{{ w.port }}</dt>
            <dd v-if="noPort" class="unset">{{ w.portNotNeeded }}</dd>
            <dd v-else class="port">
              <span class="from">{{ found.portFrom ? w.portFound[found.portFrom] : w.portGuess }}</span>
              <input v-model="form.port" inputmode="numeric" placeholder="3000" :aria-label="w.port" :aria-invalid="!!portError" @input="portError = ''" />
            </dd>
          </div>
        </dl>
        <p v-if="portError" class="error small" role="alert">{{ portError }}</p>
        <p v-if="found.stack === 'image'" class="said">{{ w.imageNote }}</p>
        <p v-for="f in found.flags" :key="f" class="flag"><Icon name="warn" :size="16" /><span>{{ w.flags[f] }}</span></p>
        <div v-if="found.folders.length" class="folders">
          <button v-for="f in found.folders" :key="f" type="button" class="chunk small" @click="useFolder(f)">{{ w.useFolder(f) }}</button>
        </div>
        <template v-if="found.env.length">
          <p class="head">{{ w.settingsTitle }}</p>
          <ul class="settings">
            <li v-for="name in found.env" :key="name">
              <span class="name mono">{{ name }}</span>
              <span v-if="saved.has(name)" class="set"><Icon name="tick" :size="14" />{{ w.settingSet }}</span>
              <input v-else-if="data.secretsEnabled" v-model="values[name]" type="password" autocomplete="off" :aria-label="w.settingValue(name)" />
            </li>
          </ul>
        </template>
        <details v-if="route !== 'image'" class="options">
          <summary>{{ w.options }}</summary>
          <div class="pair">
            <input v-model="form.branch" :placeholder="w.defaultBranchShort" :aria-label="w.branch" autocapitalize="off" spellcheck="false" />
            <input v-model="form.buildPath" :placeholder="w.folderPlaceholder" :aria-label="w.folderName" autocapitalize="off" spellcheck="false" />
          </div>
          <button type="button" class="chunk small" @click="read">{{ w.readAgain }}</button>
        </details>
      </section>

      <UiNote :note="note" />

      <div class="nav">
        <button type="button" class="chunk" @click="choose">{{ w.otherProject }}</button>
        <button type="button" class="primary next" :disabled="busy || !canRun" @click="putOnline">{{ busy ? w.saving : w.putItOnline }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code { display: grid; gap: 10px; align-content: start; min-height: 0; }
.facts { display: grid; gap: 6px; margin: 0; }
.fact { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 46px; padding: 0 14px; border-radius: var(--r-md); background: var(--tile); }
.fact.bad { background: var(--danger-soft); }
dt { flex: none; font-size: 14px; font-weight: 600; color: var(--muted); }
dd { margin: 0; min-width: 0; font-size: 15px; font-weight: 700; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
dd a { color: var(--accent); }
dd.unset { color: var(--muted); font-weight: 400; }
.bar { display: flex; gap: 8px; }

/* One screen at a time, in one column, with its buttons at the bottom. */
.setup { display: grid; gap: 10px; align-content: start; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px; }
h3 { margin: 0; font: 400 22px/1.15 var(--display); }
.typed { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.typed label { flex: 1 1 240px; display: grid; gap: 4px; min-width: 0; }
.others { display: flex; flex-wrap: wrap; gap: 6px; }
.repo { margin: 0; font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* Reading: a plain line and three dots that take turns. */
.reading { display: flex; align-items: center; gap: 12px; min-height: 96px; padding: 0 14px; border-radius: var(--r-md); background: var(--tile); font-size: 17px; font-weight: 700; }
.reading p { margin: 0; }
.dots { display: flex; gap: 6px; }
.dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-fill); animation: dot 1.2s var(--ease) infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot {
  0%, 60%, 100% { opacity: 0.25; transform: none; }
  30% { opacity: 1; transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .dots span { animation: none; }
}

/* Branch and folder wait behind a small disclosure. */
.options { display: grid; gap: 8px; }
.options summary { width: fit-content; min-height: 32px; color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer; }
.options[open] { padding-bottom: 2px; }
.options .pair { margin-bottom: 8px; }

.found { display: grid; gap: 8px; }
.port { display: flex; align-items: center; gap: 10px; overflow: visible; }
.from { color: var(--muted); font-size: 13px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; }
.port input { flex: none; width: 84px; min-height: 36px; padding: 0 8px; font: 700 14px/1 var(--num); text-align: right; }
.said { margin: 0; font-size: 14px; color: var(--muted); }
.flag { display: flex; gap: 8px; margin: 0; padding: 8px 12px; border-radius: var(--r-sm); background: var(--danger-soft); font-size: 14px; line-height: 1.3; }
.flag :deep(svg) { flex: none; margin-top: 1px; }
.folders { display: flex; flex-wrap: wrap; gap: 6px; }
.head { margin: 4px 0 0; font-size: 14px; font-weight: 700; }
.settings { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.settings li { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 42px; padding: 0 6px 0 14px; border-radius: var(--r-md); background: var(--tile); }
.name { min-width: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.settings input { flex: 0 1 45%; min-width: 90px; min-height: 34px; padding: 0 8px; font-size: 14px; }
.set { display: inline-flex; align-items: center; gap: 4px; padding-right: 8px; color: var(--live); font-size: 14px; font-weight: 700; }

.nav { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; background: var(--surface); }
.next { min-height: 46px; padding: 0 16px; white-space: nowrap; }
</style>
