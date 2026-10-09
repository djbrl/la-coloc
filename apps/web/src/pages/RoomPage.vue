<script setup lang="ts">
// Your room: what runs there, how it builds, its secrets, its logs, its history.
// One calm section at a time, picked with a segmented control.
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import UiNote, { loud, quiet, type Note } from "../components/UiNote.vue";
import UiSteps from "../components/UiSteps.vue";
import { sendJSON } from "../session";
import type { RoomManage } from "../types";

const props = defineProps<{ id: string; room: string }>();
const data = ref<RoomManage | null>(null);
const error = ref("");
const status = ref(0);
const base = computed(() => `/api/houses/${encodeURIComponent(props.id)}/rooms/${encodeURIComponent(props.room)}`);

const form = reactive({ project: "", projectDescription: "", source: "", branch: "", buildPath: ".", port: "" });
const formNote = ref<Note | null>(null);
const savingSettings = ref(false);
const action = ref<"" | "redeploy" | "restart">("");
const actionNote = ref<Note | null>(null);
const secret = reactive({ name: "", value: "" });
const secretNote = ref<Note | null>(null);
const logs = ref("");
const logsMessage = ref("");
const logsLoading = ref(false);
const follow = ref(false);
let followTimer: number | undefined;
let source: EventSource | null = null;
let reloadTimer: number | undefined;

async function load() {
  const res = await fetch(`${base.value}/manage`).catch(() => null);
  if (!res?.ok) {
    status.value = res?.status ?? 0;
    error.value = res?.status === 401 ? "Log in to manage your room." : res?.status === 403 ? "This isn't your room." : "This room doesn't exist.";
    return;
  }
  const first = !data.value;
  data.value = await res.json();
  if (first) fillForm();
}

function fillForm() {
  const s = data.value!.settings;
  Object.assign(form, {
    project: s.project ?? "",
    projectDescription: s.projectDescription ?? "",
    source: s.source ?? "",
    branch: s.branch ?? "",
    buildPath: s.buildPath,
    port: s.port ? String(s.port) : "",
  });
}

async function open() {
  source?.close();
  data.value = null;
  error.value = "";
  await load();
  if (!data.value) return;
  fetchLogs();
  // The house's live stream says when anything changes (a deploy step, a crash): refresh, gently.
  source = new EventSource(`/api/houses/${encodeURIComponent(props.id)}/stream`);
  source.addEventListener("house", () => {
    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(load, 300);
  });
}

watch(() => [props.id, props.room], open, { immediate: true });
onBeforeUnmount(() => {
  source?.close();
  clearInterval(followTimer);
  clearTimeout(reloadTimer);
});

async function saveSettings() {
  formNote.value = null;
  const port = form.port.trim() ? Number(form.port) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    formNote.value = loud("The port is a number between 1 and 65535.");
    return;
  }
  savingSettings.value = true;
  const res = await sendJSON("PATCH", `${base.value}/settings`, {
    project: form.project,
    projectDescription: form.projectDescription,
    source: data.value?.github ? undefined : form.source.trim() || null,
    branch: form.branch.trim() || null,
    buildPath: form.buildPath.trim() || ".",
    port,
  });
  savingSettings.value = false;
  formNote.value = res.ok ? quiet("Saved. It applies from the next deploy.") : loud(res.message);
  if (res.ok) await load();
}

async function run(what: "redeploy" | "restart") {
  actionNote.value = null;
  action.value = what;
  const res = await sendJSON("POST", `${base.value}/${what}`, {});
  action.value = "";
  actionNote.value = res.ok ? quiet(what === "redeploy" ? "Building. History follows along." : "Restarting.") : loud(res.message);
}

// Adding a secret, one question at a time: its name, its value, then a last look.
const secretStep = ref(0);
const secretError = ref("");
const savingSecret = ref(false);
const addButton = ref<HTMLButtonElement | null>(null);
const secretName = computed(() => secret.name.trim().toUpperCase());
const replacing = computed(() => !!data.value?.secrets.some((s) => s.name === secretName.value));

function startSecret() {
  secret.name = "";
  secret.value = "";
  secretError.value = "";
  secretNote.value = null;
  secretStep.value = 1;
}

async function endSecret() {
  secretStep.value = 0;
  await nextTick();
  addButton.value?.focus();
}

function secretNext() {
  secretError.value = "";
  if (secretStep.value === 1 && !/^[A-Z_][A-Z0-9_]{0,63}$/.test(secretName.value)) {
    secretError.value = "Names are capitals, digits and underscores, like STRIPE_KEY.";
    return;
  }
  if (secretStep.value === 2 && !secret.value) {
    secretError.value = "Enter a value.";
    return;
  }
  secretStep.value++;
}

function secretBack() {
  secretError.value = "";
  secretStep.value--;
}

async function saveSecret() {
  secretError.value = "";
  const name = secretName.value;
  savingSecret.value = true;
  const res = await sendJSON("PUT", `${base.value}/secrets/${name}`, { value: secret.value });
  savingSecret.value = false;
  if (!res.ok) {
    secretError.value = res.message;
    return;
  }
  secret.name = "";
  secret.value = "";
  secretNote.value = quiet(`${name} saved. It reaches your app on the next deploy.`);
  await load();
  await endSecret();
}

// Removing asks once more, in the row itself.
const confirming = ref<string | null>(null);
async function deleteSecret(name: string) {
  confirming.value = null;
  const res = await sendJSON("DELETE", `${base.value}/secrets/${name}`);
  secretNote.value = res.ok ? quiet(`${name} removed. Redeploy for your app to stop seeing it.`) : loud(res.message);
  await load();
}

async function fetchLogs() {
  logsLoading.value = true;
  logsMessage.value = "";
  const res = await fetch(`${base.value}/logs?lines=300`).catch(() => null);
  logsLoading.value = false;
  if (!res?.ok) {
    logsMessage.value = (await res?.json().catch(() => null))?.message ?? "Couldn't read the logs.";
    return;
  }
  logs.value = (await res.json()).text;
}

watch(follow, (on) => {
  clearInterval(followTimer);
  if (on) followTimer = window.setInterval(fetchLogs, 4000);
});

// The segmented control: a tab list, moved through with the arrow keys.
const tabs = [
  { id: "overview", name: "Overview" },
  { id: "build", name: "Build" },
  { id: "secrets", name: "Secrets" },
  { id: "logs", name: "Logs" },
  { id: "history", name: "History" },
] as const;
type Tab = (typeof tabs)[number]["id"];
const tab = ref<Tab>("overview");
// Plain array: filled by the template, only read on key presses.
const tabEls: HTMLButtonElement[] = [];

function onTabKey(e: KeyboardEvent, i: number) {
  const last = tabs.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  tab.value = tabs[to].id;
  tabEls[to]?.focus();
}

const memory = computed(() => {
  const u = data.value?.room.usage;
  if (!u?.memoryLimitBytes) return null;
  return { mb: Math.round(u.memoryBytes / 1048576), pct: Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100)) };
});
const roomState = computed(() => {
  const s = data.value?.room.status ?? "empty";
  return { live: "Live", deploying: "Deploying", down: "Down right now", failed: "The last deploy failed", empty: "Nothing deployed yet" }[s];
});
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dot = (status: string) => (status === "live" ? "live" : status === "failed" ? "failed" : status === "empty" ? "" : "deploying");
const bare = (url: string) => url.replace(/^https?:\/\//, "");
</script>

<template>
  <div class="room-page">
    <div v-if="error" class="wrap band">
      <h1>{{ error }}</h1>
      <div class="actions top-gap">
        <RouterLink v-if="status === 401" to="/login" class="more">Log in <span aria-hidden="true">›</span></RouterLink>
        <RouterLink :to="`/houses/${id}`" class="more">Back to the house <span aria-hidden="true">›</span></RouterLink>
      </div>
    </div>

    <template v-else-if="data">
      <section class="band hero">
        <div class="wrap">
          <RouterLink :to="`/houses/${id}`" class="back"><span aria-hidden="true">‹</span> {{ data.house.name }}</RouterLink>
          <h1>{{ data.settings.project || data.room.name }}</h1>
          <p class="lede muted">
            Room {{ data.room.name }} in {{ data.house.name }}, with {{ data.room.limits.memoryMb }} MB and {{ data.room.limits.cpus }} CPU.
            <template v-if="data.as === 'chef'">You're here as the chef.</template>
          </p>
          <p class="state" aria-live="polite">
            <span class="dot" :class="dot(data.room.status)" aria-hidden="true" />{{ roomState }}<template v-if="data.room.url && data.room.status !== 'empty'"> at
              <a :href="data.room.url" target="_blank" rel="noopener">{{ bare(data.room.url) }}<span class="sr-only"> (opens in a new tab)</span></a></template>.
            <template v-if="data.room.previewUrl">
              A preview is up at <a :href="data.room.previewUrl" target="_blank" rel="noopener">{{ bare(data.room.previewUrl) }}<span class="sr-only"> (opens in a new tab)</span></a>.
            </template>
          </p>
          <div class="actions top-gap">
            <button class="primary" :disabled="action !== '' || !data.house.agentOnline" @click="run('redeploy')">
              {{ action === "redeploy" ? "Starting…" : "Redeploy" }}
            </button>
            <button class="link" :disabled="action !== '' || !data.house.agentOnline || data.room.status === 'empty'" @click="run('restart')">
              {{ action === "restart" ? "Restarting…" : "Restart" }}
            </button>
          </div>
          <p v-if="!data.house.agentOnline" class="muted small">The house's server is offline, so nothing can deploy for now.</p>
          <UiNote :note="actionNote" />
        </div>
      </section>

      <div class="wrap">
        <div class="segmented" role="tablist" aria-label="Room sections">
          <button
            v-for="(t, i) in tabs"
            :id="`tab-${t.id}`"
            :key="t.id"
            :ref="(el) => (tabEls[i] = el as HTMLButtonElement)"
            role="tab"
            :aria-selected="tab === t.id"
            :aria-controls="`panel-${t.id}`"
            :tabindex="tab === t.id ? 0 : -1"
            :class="{ on: tab === t.id }"
            @click="tab = t.id"
            @keydown="onTabKey($event, i)"
          >
            {{ t.name }}
          </button>
        </div>
      </div>

      <section class="band panel-band">
        <Transition name="fade" mode="out-in">
          <div :id="`panel-${tab}`" :key="tab" class="wrap panel" role="tabpanel" :aria-labelledby="`tab-${tab}`" tabindex="0">
            <!-- Overview: what it is and how it's doing. -->
            <template v-if="tab === 'overview'">
              <div class="intro">
                <h2>Your project.</h2>
                <p class="muted">Its name and a line about it show on the house page and in the city.</p>
              </div>
              <div v-if="data.room.usage" class="usage">
                <p>
                  Right now it uses {{ data.room.usage.cpuPercent.toFixed(1) }}% CPU<template v-if="memory"> and {{ memory.mb }} MB of its {{ data.room.limits.memoryMb }} MB</template>.
                </p>
                <div v-if="memory" class="meter" role="img" :aria-label="`${memory.pct}% of memory used`">
                  <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
                </div>
              </div>
              <form class="fields" novalidate @submit.prevent="saveSettings">
                <input v-model="form.project" maxlength="60" placeholder="Project name" aria-label="Project name" />
                <input v-model="form.projectDescription" maxlength="200" placeholder="What it does, in one sentence" aria-label="What it does" />
                <div class="actions">
                  <button :disabled="savingSettings">{{ savingSettings ? "Saving…" : "Save" }}</button>
                </div>
                <UiNote :note="formNote" />
              </form>
            </template>

            <!-- Build: where the code comes from and how it starts. -->
            <template v-else-if="tab === 'build'">
              <div class="intro">
                <h2>How it builds.</h2>
                <p v-if="data.github" class="muted">
                  Code comes from <a :href="data.github.url" target="_blank" rel="noopener">{{ data.github.fullName }}</a> through the GitHub App.
                  Merges deploy on their own<template v-if="data.house.strictReviews"> once a flatmate approves</template>.
                </p>
                <p v-else class="muted">Point the room at a Git repo. Each deploy builds it from scratch.</p>
              </div>
              <form class="fields" novalidate @submit.prevent="saveSettings">
                <input
                  v-if="!data.github"
                  v-model="form.source"
                  type="url"
                  inputmode="url"
                  placeholder="https://github.com/you/your-app.git"
                  aria-label="Repo link"
                />
                <p class="madlib">
                  Deploy
                  <input v-model="form.branch" class="inline" :placeholder="data.github ? 'default branch' : 'main'" aria-label="Branch" autocapitalize="off" spellcheck="false" />
                  from the folder
                  <input v-model="form.buildPath" class="inline short" placeholder="." aria-label="Folder with the Dockerfile" autocapitalize="off" spellcheck="false" />
                  and send visitors to
                  <span class="nowrap">port <input v-model="form.port" class="inline short" inputmode="numeric" placeholder="3000" aria-label="Port" />.</span>
                </p>
                <p class="muted small">The folder holds your Dockerfile. Your app also gets the port as <code>PORT</code>.</p>
                <div class="actions">
                  <button :disabled="savingSettings">{{ savingSettings ? "Saving…" : "Save" }}</button>
                </div>
                <UiNote :note="formNote" />
              </form>
            </template>

            <!-- Secrets: listed by name, added one question at a time. -->
            <template v-else-if="tab === 'secrets'">
              <div class="intro">
                <h2>Secrets.</h2>
                <p class="muted">API keys and passwords your app needs, as environment variables. Encrypted on our side and never shown again: you can replace or remove them.</p>
              </div>
              <p v-if="!data.secretsEnabled" class="error">Secrets are off on this server.</p>

              <ul v-if="data.secrets.length" class="rows">
                <li v-for="s in data.secrets" :key="s.name">
                  <code class="secret-name">{{ s.name }}</code>
                  <template v-if="confirming === s.name">
                    <span class="end small">Remove it?</span>
                    <button class="link danger" @click="deleteSecret(s.name)">Remove</button>
                    <button class="link" @click="confirming = null">Keep</button>
                  </template>
                  <template v-else>
                    <span class="muted small">set {{ when(s.updatedAt) }}</span>
                    <button class="link end" :aria-label="`Remove ${s.name}`" @click="confirming = s.name">Remove</button>
                  </template>
                </li>
              </ul>
              <p v-else class="muted">No secrets yet.</p>

              <div v-if="secretStep" class="adding">
                <UiSteps :step="secretStep" :total="3" focus-on-mount>
                  <form v-if="secretStep === 1" class="fields" novalidate @submit.prevent="secretNext">
                    <h3>What's it called?</h3>
                    <p class="muted">The name your app reads it by: capitals, digits and underscores.</p>
                    <input
                      v-model="secret.name"
                      data-autofocus
                      placeholder="WAVE_API_KEY"
                      aria-label="Secret name"
                      autocomplete="off"
                      autocapitalize="characters"
                      spellcheck="false"
                      :aria-invalid="!!secretError"
                      class="caps"
                      @input="secretError = ''"
                    />
                    <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
                    <div class="nav">
                      <button type="button" class="link" @click="endSecret">Cancel</button>
                      <button class="primary">Next</button>
                    </div>
                  </form>

                  <form v-else-if="secretStep === 2" class="fields" novalidate @submit.prevent="secretNext">
                    <h3>Paste its value.</h3>
                    <p class="muted">It's encrypted as soon as you save it, and nobody sees it again, you included.</p>
                    <input
                      v-model="secret.value"
                      data-autofocus
                      type="password"
                      placeholder="Value"
                      :aria-label="`Value of ${secretName}`"
                      autocomplete="new-password"
                      :aria-invalid="!!secretError"
                      @input="secretError = ''"
                    />
                    <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
                    <div class="nav">
                      <button type="button" class="link" @click="secretBack"><span aria-hidden="true">‹</span> Back</button>
                      <button class="primary">Next</button>
                    </div>
                  </form>

                  <form v-else class="fields" @submit.prevent="saveSecret">
                    <h3>Save {{ secretName }}?</h3>
                    <p class="muted">
                      <template v-if="replacing">This replaces the value it has now. </template>Your app sees it from the next deploy.
                    </p>
                    <p v-if="secretError" class="error small" role="alert">{{ secretError }}</p>
                    <div class="nav">
                      <button type="button" class="link" @click="secretBack"><span aria-hidden="true">‹</span> Back</button>
                      <button class="primary" :disabled="savingSecret || !data.secretsEnabled">{{ savingSecret ? "Saving…" : "Save secret" }}</button>
                    </div>
                  </form>
                </UiSteps>
              </div>
              <div v-else class="actions">
                <button ref="addButton" :disabled="!data.secretsEnabled" @click="startSecret">Add a secret</button>
              </div>
              <UiNote :note="secretNote" />
            </template>

            <!-- Logs: what the app printed lately. -->
            <template v-else-if="tab === 'logs'">
              <div class="intro">
                <h2>Logs.</h2>
                <p class="muted">The last 300 lines your app printed.</p>
              </div>
              <div class="actions">
                <button :aria-pressed="follow" @click="follow = !follow">{{ follow ? "Stop following" : "Follow live" }}</button>
                <button class="link" :disabled="logsLoading" @click="fetchLogs">{{ logsLoading ? "Reading…" : "Refresh" }}</button>
              </div>
              <p v-if="logsMessage" class="error small" role="alert">{{ logsMessage }}</p>
              <pre class="logs" tabindex="0" aria-label="Logs">{{ logs || "Nothing printed yet." }}</pre>
            </template>

            <!-- History: every deploy and preview. -->
            <template v-else>
              <div class="intro">
                <h2>Deploys.</h2>
                <p class="muted">Every build of this room, newest first.</p>
              </div>
              <p v-if="!data.deployments.length" class="muted">Nothing deployed yet.</p>
              <ul v-else class="rows history">
                <li v-for="d in data.deployments" :key="d.id">
                  <span class="grow">
                    <span class="dot" :class="dot(d.status)" aria-hidden="true" />{{ d.kind === "preview" ? "Preview" : "Deploy" }} of <code>{{ d.ref }}</code><template
                      v-if="d.prNumber && data.github"
                    >
                      from <a :href="`${data.github.url}/pull/${d.prNumber}`" target="_blank" rel="noopener">#{{ d.prNumber }}</a></template
                    ><span class="muted">, {{ d.status }}</span>
                    <span v-if="d.status === 'failed' && d.detail" class="why">{{ d.detail.split("\n")[0] }}</span>
                  </span>
                  <time class="end muted small" :datetime="d.createdAt">{{ when(d.createdAt) }}</time>
                </li>
              </ul>
            </template>
          </div>
        </Transition>
      </section>
    </template>

    <p v-else class="wrap band muted" aria-live="polite">Unlocking the door…</p>
  </div>
</template>

<style scoped>
.hero { padding-bottom: 40px; }
.hero .wrap { display: grid; gap: 14px; justify-items: start; }

.hero h1 { overflow-wrap: anywhere; }
.lede { max-width: 720px; }
.state a { overflow-wrap: anywhere; }
.top-gap { margin-top: 8px; }

/* The segmented control: a soft track, the chosen segment lifted. */
.segmented { display: flex; gap: 2px; width: max-content; max-width: 100%; padding: 3px; border-radius: 12px; background: var(--fill); overflow-x: auto; scrollbar-width: none; }
.segmented button { min-height: 38px; padding: 0 16px; border-radius: 9px; background: transparent; font-size: 14px; color: var(--text); white-space: nowrap; flex: none; }
.segmented button:hover:not(.on) { background: transparent; color: var(--muted); }
.segmented button.on { background: var(--bg); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); font-weight: 600; }
.segmented button:focus-visible { outline-offset: -2px; }

.panel-band { padding-top: 40px; }
.panel { display: grid; gap: 24px; outline: none; }
/* Forms stay a readable width; the logs can use the whole column. */
.panel > :not(.logs) { max-width: 680px; }
.panel:focus-visible { outline: 2px solid var(--accent-fill); outline-offset: 8px; border-radius: 8px; }
.intro { display: grid; gap: 8px; }
.usage { display: grid; gap: 10px; }
.fields { display: grid; gap: 14px; }
.madlib { line-height: 2.8; }
.madlib .inline { display: inline-block; width: 10em; min-height: 44px; padding: 8px 14px; margin: 0 4px; vertical-align: middle; }
.madlib .inline.short { width: 5.5em; }
.nowrap { white-space: nowrap; }
.adding { padding-top: 8px; }
.nav { display: flex; justify-content: space-between; align-items: center; }
.nav .primary { min-width: 120px; }
.caps { text-transform: uppercase; }
.secret-name { font-size: 15px; overflow-wrap: anywhere; }
.logs { margin: 0; max-height: 460px; overflow: auto; padding: 20px 22px; border-radius: 18px; background: var(--code-bg); color: var(--code-text); font: 13px/1.6 var(--mono); white-space: pre-wrap; word-break: break-word; }
.grow { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; }
.why { display: block; margin-top: 2px; font-size: 14px; color: var(--danger); }
.history li { font-size: 15px; }
@media (max-width: 734px) {
  .segmented { width: 100%; }
  .segmented button { flex: 1 0 auto; padding: 0 12px; }
}
</style>
