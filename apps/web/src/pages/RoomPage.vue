<script setup lang="ts">
// Your room: what runs there, how it builds, its secrets, its logs, its history.
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { sendJSON } from "../session";
import type { RoomManage } from "../types";

const props = defineProps<{ id: string; room: string }>();
const data = ref<RoomManage | null>(null);
const error = ref("");
const base = computed(() => `/api/houses/${encodeURIComponent(props.id)}/rooms/${encodeURIComponent(props.room)}`);

const form = reactive({ project: "", projectDescription: "", source: "", branch: "", buildPath: ".", port: "" });
const formMessage = ref("");
const savingSettings = ref(false);
const action = ref<"" | "redeploy" | "restart">("");
const actionMessage = ref("");
const secret = reactive({ name: "", value: "" });
const secretMessage = ref("");
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
  formMessage.value = "";
  const port = form.port.trim() ? Number(form.port) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    formMessage.value = "The port is a number between 1 and 65535.";
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
  formMessage.value = res.ok ? "Saved. It applies from the next deploy." : res.message;
  if (res.ok) await load();
}

async function run(what: "redeploy" | "restart") {
  actionMessage.value = "";
  action.value = what;
  const res = await sendJSON("POST", `${base.value}/${what}`, {});
  action.value = "";
  actionMessage.value = res.ok ? (what === "redeploy" ? "Building… the history below follows along." : "Restarting.") : res.message;
}

async function saveSecret() {
  secretMessage.value = "";
  const name = secret.name.trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(name)) {
    secretMessage.value = "Names are capitals, digits and underscores, like STRIPE_KEY.";
    return;
  }
  if (!secret.value) {
    secretMessage.value = "Enter a value.";
    return;
  }
  const res = await sendJSON("PUT", `${base.value}/secrets/${name}`, { value: secret.value });
  if (!res.ok) {
    secretMessage.value = res.message;
    return;
  }
  secret.name = "";
  secret.value = "";
  secretMessage.value = `${name} saved. It reaches your app on the next deploy.`;
  await load();
}

async function deleteSecret(name: string) {
  const res = await sendJSON("DELETE", `${base.value}/secrets/${name}`);
  secretMessage.value = res.ok ? `${name} removed. Redeploy for your app to stop seeing it.` : res.message;
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

const memory = computed(() => {
  const u = data.value?.room.usage;
  if (!u?.memoryLimitBytes) return null;
  return { mb: Math.round(u.memoryBytes / 1048576), pct: Math.min(100, Math.round((u.memoryBytes / u.memoryLimitBytes) * 100)) };
});
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pill = (status: string) => (status === "live" ? "live" : status === "failed" ? "failed" : "deploying");
</script>

<template>
  <p v-if="error" class="error">{{ error }} <RouterLink :to="`/houses/${id}`">Back to the house</RouterLink></p>
  <template v-else-if="data">
    <RouterLink :to="`/houses/${id}`" class="back">← {{ data.house.name }}</RouterLink>

    <section class="head">
      <div>
        <h1>{{ data.settings.project || data.room.name }}</h1>
        <p class="muted">
          Room <strong>{{ data.room.name }}</strong> · {{ data.room.limits.memoryMb }} MB · {{ data.room.limits.cpus }} CPU
          <template v-if="data.as === 'chef'"> · you're the chef</template>
        </p>
        <div class="tags">
          <span class="pill" :class="data.room.status === 'empty' ? '' : pill(data.room.status)">{{ data.room.status }}</span>
          <a v-if="data.room.url && data.room.status !== 'empty'" :href="data.room.url" target="_blank" rel="noopener">{{ data.room.url.replace(/^https?:\/\//, "") }} ↗</a>
          <a v-if="data.room.previewUrl" :href="data.room.previewUrl" target="_blank" rel="noopener" class="preview">preview ↗</a>
        </div>
      </div>
      <div class="actions">
        <button class="primary" :disabled="action !== '' || !data.house.agentOnline" @click="run('redeploy')">{{ action === "redeploy" ? "Starting…" : "Redeploy" }}</button>
        <button :disabled="action !== '' || !data.house.agentOnline || data.room.status === 'empty'" @click="run('restart')">Restart</button>
        <p v-if="!data.house.agentOnline" class="muted small">The house's server is offline.</p>
        <p v-if="actionMessage" class="small" role="status">{{ actionMessage }}</p>
      </div>
    </section>

    <div v-if="memory" class="meter" :title="`${memory.mb} MB of ${data.room.limits.memoryMb} MB`">
      <div class="fill" :class="{ high: memory.pct >= 80 }" :style="{ width: memory.pct + '%' }" />
    </div>

    <div class="grid">
      <div class="col">
        <section class="card">
          <h2>Project</h2>
          <label>Name<input v-model="form.project" maxlength="60" placeholder="Ndaje" /></label>
          <label>What it does<input v-model="form.projectDescription" maxlength="200" placeholder="A small shop that takes Wave payments." /></label>
          <p class="muted small">Shown on the house page and in the city.</p>

          <h2>Build</h2>
          <p v-if="data.github" class="linked">
            Code from <a :href="data.github.url" target="_blank" rel="noopener">{{ data.github.fullName }}</a> through the GitHub App. Merges deploy on their own
            <template v-if="data.house.strictReviews"> once a flatmate approves</template>.
          </p>
          <label v-else>Repo<input v-model="form.source" placeholder="https://github.com/you/your-app.git" /></label>
          <div class="row">
            <label>Branch<input v-model="form.branch" :placeholder="data.github ? 'the repo default' : 'main'" /></label>
            <label>Folder<input v-model="form.buildPath" placeholder="." /></label>
            <label class="port">Port<input v-model="form.port" inputmode="numeric" placeholder="3000" /></label>
          </div>
          <p class="muted small">The folder holds your Dockerfile. The port is where your app listens; it also gets it as <code>PORT</code>.</p>
          <button :disabled="savingSettings" @click="saveSettings">{{ savingSettings ? "Saving…" : "Save" }}</button>
          <p v-if="formMessage" class="small" role="status">{{ formMessage }}</p>
        </section>

        <section class="card">
          <h2>Secrets</h2>
          <p class="muted small">API keys and passwords your app needs, as environment variables. Encrypted on our side and never shown again: you can replace or remove them.</p>
          <p v-if="!data.secretsEnabled" class="error small">Secrets are off on this server.</p>
          <ul v-if="data.secrets.length" class="secrets">
            <li v-for="s in data.secrets" :key="s.name">
              <code>{{ s.name }}</code><span class="muted small">set {{ when(s.updatedAt) }}</span>
              <button class="link" :aria-label="`Remove ${s.name}`" @click="deleteSecret(s.name)">Remove</button>
            </li>
          </ul>
          <form class="row" @submit.prevent="saveSecret">
            <label>Name<input v-model="secret.name" placeholder="WAVE_API_KEY" autocomplete="off" @input="secretMessage = ''" /></label>
            <label>Value<input v-model="secret.value" type="password" autocomplete="new-password" @input="secretMessage = ''" /></label>
            <button :disabled="!data.secretsEnabled">Save secret</button>
          </form>
          <p v-if="secretMessage" class="small" role="status">{{ secretMessage }}</p>
        </section>
      </div>

      <div class="col">
        <section class="card">
          <div class="title-row">
            <h2>Logs</h2>
            <label class="follow"><input v-model="follow" type="checkbox" /> follow</label>
            <button class="link" :disabled="logsLoading" @click="fetchLogs">{{ logsLoading ? "Reading…" : "Refresh" }}</button>
          </div>
          <p v-if="logsMessage" class="error small">{{ logsMessage }}</p>
          <pre class="logs" tabindex="0">{{ logs || "Nothing printed yet." }}</pre>
        </section>

        <section class="card">
          <h2>Deploys</h2>
          <p v-if="!data.deployments.length" class="muted small">Nothing deployed yet.</p>
          <ul class="history">
            <li v-for="d in data.deployments" :key="d.id">
              <span class="pill" :class="pill(d.status)">{{ d.status }}</span>
              <span>{{ d.kind === "preview" ? "preview" : "deploy" }} of <code>{{ d.ref }}</code></span>
              <a v-if="d.prNumber && data.github" :href="`${data.github.url}/pull/${d.prNumber}`" target="_blank" rel="noopener">#{{ d.prNumber }}</a>
              <span class="muted small when">{{ when(d.createdAt) }}</span>
              <p v-if="d.status === 'failed' && d.detail" class="why">{{ d.detail.split("\n")[0] }}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </template>
  <p v-else class="muted">Unlocking the door…</p>
</template>

<style scoped>
.error { color: var(--danger); }
.back { display: inline-block; margin-bottom: 12px; font-size: 14px; text-decoration: none; }
.head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.head p { margin: 4px 0 0; }
.tags { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; font-size: 14px; }
.actions { display: grid; gap: 6px; align-content: start; justify-items: end; }
.actions > button { min-width: 120px; }
.meter { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin-bottom: 20px; }
.fill { height: 100%; background: var(--live); transition: width 0.4s; }
.fill.high { background: var(--warn); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.col { display: grid; gap: 16px; align-content: start; min-width: 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: grid; gap: 10px; min-width: 0; }
.card h2 { margin: 6px 0 0; }
.card h2:first-child { margin-top: 0; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
.row { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
.row label { flex: 1 1 120px; }
.row .port { flex: 0 1 90px; }
.small { font-size: 13px; margin: 0; }
.linked { margin: 0; font-size: 14px; }
code { font-family: ui-monospace, monospace; font-size: 13px; }
.secrets { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.secrets li { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--border); }
.secrets li button { margin-left: auto; }
.link { border: none; background: none; padding: 0; color: var(--accent); }
.title-row { display: flex; align-items: center; gap: 12px; }
.title-row h2 { margin: 0; margin-right: auto; }
.follow { display: flex; flex-direction: row; align-items: center; gap: 4px; }
.follow input { width: auto; }
.logs { margin: 0; max-height: 340px; overflow: auto; padding: 10px 12px; border-radius: 8px; background: #141311; color: #e7e2d9; font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; }
.history { list-style: none; padding: 0; margin: 0; display: grid; gap: 2px; font-size: 14px; }
.history li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid var(--border); }
.history .when { margin-left: auto; }
.why { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--danger); }
.preview { color: var(--warn); }
</style>
