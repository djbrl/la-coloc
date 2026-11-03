// The room panel's small decisions, kept apart from the page so they're easy to test: the sentence that says how
// the room is doing, which verb the big action tile shows, whether a restart makes sense, what the Code tab lists, how a build reads in the history, and the
// exact body the settings PATCH sends. No DOM here.
import { bare, explain } from "../lobby/panel/words";
import type { IconName } from "../lobby/house/icons";
import type { RoomManage, RoomStatus, RoomUsage } from "../../types";
import { roomWords as w } from "./words";
import { seeded } from "../seeded";

type Deployment = RoomManage["deployments"][number];
type Settings = RoomManage["settings"];
type Github = RoomManage["github"];

/** The settings form as the page holds it: every field a string, the way the inputs edit them. */
export interface SettingsForm {
  project: string;
  projectDescription: string;
  source: string;
  branch: string;
  buildPath: string;
  port: string;
}

/** The project's name as the room shows it: its name, else its one line, else "Hello" in the tutorial's workshop
 *  (where the sample is a Hello page), else "Untitled project". */
export function projectTitle(settings: Pick<Settings, "project" | "projectDescription">, tutorial = false): string {
  return settings.project || seeded(settings.projectDescription) || (tutorial ? w.hello : w.untitled);
}

/** True while the room has never been online: no update of it ever went live, and nothing is up or stopped now. */
export function neverOnline(status: RoomStatus, deployments: Pick<Deployment, "kind" | "status">[]): boolean {
  if (status === "live" || status === "down") return false;
  return !deployments.some((d) => d.kind === "prod" && d.status === "live");
}

export interface UpdateTile {
  verb: string;
  hint: string;
  icon: IconName;
}

/** The big action tile that fetches the code and builds it: "Put online" the first time, "Update" after that. */
export function updateTile(status: RoomStatus, deployments: Pick<Deployment, "kind" | "status">[]): UpdateTile {
  return neverOnline(status, deployments)
    ? { verb: w.putOnline, hint: explain.firstOnline, icon: "rocket" }
    : { verb: w.update, hint: explain.update, icon: "spin" };
}

/** A restart switches the running app off and on, so it needs an app that has been online at least once. */
export function canRestart(status: RoomStatus, deployments: Pick<Deployment, "kind" | "status">[]): boolean {
  return status !== "empty" && !neverOnline(status, deployments);
}

/** Memory in use, in MB and as a share of the room's limit (capped at 100). Null when nothing is measured. */
export function memoryUse(usage: RoomUsage | null): { mb: number; pct: number } | null {
  if (!usage?.memoryLimitBytes) return null;
  return { mb: Math.round(usage.memoryBytes / 1048576), pct: Math.min(100, Math.round((usage.memoryBytes / usage.memoryLimitBytes) * 100)) };
}

/** A length of time in plain words: "a few minutes", "5 hours", "3 days". */
export function span(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 10) return w.fewMinutes;
  if (minutes < 60) return w.minutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 48) return w.hours(hours);
  return w.days(Math.round(hours / 24));
}

/** The one line to type to get in. */
export const sshLine = (s: NonNullable<RoomManage["ssh"]>) => `ssh ${s.port === 22 ? "" : `-p ${s.port} `}${s.user}@${s.host}`;

/** The last lines of a log, for the Logs tile: blank ones don't count. */
export function logTail(text: string, count = 3): string[] {
  return text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

/** What's online, for the Code tile: its branch, and how long ago it went up. Null when nothing has been online. */
export function liveVersion(deployments: Pick<Deployment, "kind" | "status" | "ref" | "updatedAt">[], now = Date.now()): { branch: string; ago: string } | null {
  const up = deployments.find((d) => d.kind === "prod" && d.status === "live");
  return up ? { branch: refWord(up.ref), ago: w.tile.updated(span(now - new Date(up.updatedAt).getTime())) } : null;
}

/** "half a CPU", "1 CPU", "2 CPUs": a room's share of the processor. */
export const cpuShare = (cpus: number) => w.cpuShare(cpus);

/** The Overview's one sentence about how the room is doing: its state and since when, then what it uses of its
 *  share, or what that share is when nothing is measured. "Online for 3 days, using 9 of its 256 MB and almost no
 *  CPU." / "Never built yet. It has 256 MB of memory and half a CPU of its own." */
export function roomSentence(room: Pick<RoomManage["room"], "status" | "limits" | "usage">, deployments: Deployment[], now = Date.now()): string {
  const prod = deployments.filter((d) => d.kind === "prod");
  const ago = (iso: string) => span(now - new Date(iso).getTime());
  const last = prod[0] ?? deployments[0];
  let state: string;
  if (room.status === "live") {
    const up = prod.find((d) => d.status === "live");
    state = up ? w.onlineFor(ago(up.updatedAt)) : w.online;
  } else if (room.status === "deploying") state = w.buildingNow;
  else if (room.status === "down") state = w.stopped;
  else if (room.status === "failed") state = last ? w.failedAgo(ago(last.updatedAt)) : w.failed;
  else state = last ? w.notOnlineYet : w.neverBuilt;

  const memory = memoryUse(room.usage);
  if (room.usage && memory && (room.status === "live" || room.status === "deploying")) {
    const cpu = room.usage.cpuPercent < 1 ? w.almostNoCpu : w.cpuPercent(Math.round(room.usage.cpuPercent));
    return w.using(state, memory.mb, room.limits.memoryMb, cpu);
  }
  return w.has(state, room.limits.memoryMb, cpuShare(room.limits.cpus));
}

export interface CodeRow {
  term: string;
  value: string;
  // A link to follow (the repo).
  href?: string;
  // Nothing set: the value says what happens instead, drawn muted.
  unset?: boolean;
}

// The port a room gets when none is set: the caretaker uses the one the Dockerfile EXPOSEs, else this one
// (resolvePort in apps/agent/src/room-spec.ts), and passes it to the app as PORT.
export const DEFAULT_PORT = 3000;

/**
 * What the Code tab lists: where the code comes from, which branch, which folder, which port. A `file://` source is
 * the tutorial's starter page on the host machine: it's called that, never shown as a path on someone's laptop.
 */
export function codeRows(settings: Pick<Settings, "source" | "branch" | "buildPath" | "port">, github: Github): CodeRow[] {
  const repo: CodeRow = github
    ? { term: "GitHub", value: github.fullName, href: github.url }
    : settings.source?.startsWith("file:")
      ? { term: w.repo, value: w.starterPage }
      : settings.source?.startsWith("docker://")
        ? { term: w.image, value: settings.source.slice("docker://".length) }
      : settings.source
        ? { term: w.repo, value: bare(settings.source).replace(/\.git$/, ""), href: settings.source }
        : { term: w.repo, value: w.notSetYet, unset: true };
  return [
    repo,
    settings.branch ? { term: w.branch, value: settings.branch } : { term: w.branch, value: github ? w.defaultBranch : "main", unset: true },
    { term: w.folder, value: settings.buildPath && settings.buildPath !== "." ? settings.buildPath : w.repoRoot, unset: !settings.buildPath || settings.buildPath === "." },
    settings.port ? { term: w.port, value: String(settings.port) } : { term: w.port, value: w.defaultPort(DEFAULT_PORT), unset: true },
  ];
}

/** The same rows for a form being edited, before it's saved. */
export function draftRows(form: SettingsForm, github: Github): CodeRow[] {
  const port = parsePort(form.port);
  return codeRows(
    {
      source: form.source.trim() || null,
      branch: form.branch.trim() || null,
      buildPath: form.buildPath.trim() || ".",
      port: port.ok ? port.port : null,
    },
    github,
  );
}

/** A port typed as text: empty means none; otherwise a whole number from 1 to 65535. */
export function parsePort(text: string): { ok: true; port: number | null } | { ok: false } {
  if (!text.trim()) return { ok: true, port: null };
  const port = Number(text);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? { ok: true, port } : { ok: false };
}

/** Where the code comes from, as PATCH {base}/settings takes it. With GitHub linked the repo comes from the app, so `source` isn't sent. */
export function codeBody(form: SettingsForm, githubLinked: boolean, port: number | null) {
  return {
    // "file://" stands for the quest's starter page, whose folder the server keeps to itself: leave it as it is.
    source: githubLinked || form.source.trim() === "file://" ? undefined : form.source.trim() || null,
    branch: form.branch.trim() || null,
    buildPath: form.buildPath.trim() || ".",
    port,
  };
}

/** The whole PATCH {base}/settings body: the project's name and line too. */
export function settingsBody(form: SettingsForm, githubLinked: boolean, port: number | null) {
  return { project: form.project, projectDescription: form.projectDescription, ...codeBody(form, githubLinked, port) };
}

/** Where the code comes from is the flatmate's and their teammates' to say; a chef only for a room nobody lives in. */
export const canChangeCode = (data: Pick<RoomManage, "as"> & { room: Pick<RoomManage["room"], "occupant"> }) => data.as !== "chef" || !data.room.occupant;

/** A Docker image's name, the way the API takes it: `nginx:alpine`, `you/app:1.0`. */
export const imageNameOk = (name: string) => /^[a-z0-9][a-z0-9._\-/:@]{0,250}$/.test(name) && !name.includes("://");

/** What people paste for an image, as Docker wants it. A Docker Hub page's address or a `docker pull` line becomes `you/app:1.0`. */
export function imageRef(typed: string): string {
  const text = typed.trim().replace(/^(docker:\/\/|docker\s+pull\s+|https?:\/\/)/, "").replace(/[?#].*$/, "");
  const page = text.replace(/^(www\.)?hub\.docker\.com\//, "");
  if (page === text) return text;
  const tagged = page.match(/^layers\/([^/]+\/[^/]+)\/([^/]+)/);
  if (tagged) return `${tagged[1]}:${tagged[2]}`;
  return page.match(/^_\/([^/]+)/)?.[1] ?? page.match(/^(?:r|repository\/docker)\/([^/]+\/[^/]+)/)?.[1] ?? text;
}

/** A secret's name the way the app reads it: trimmed and in capitals. */
export const secretName = (typed: string) => typed.trim().toUpperCase();
/** Capitals, digits and underscores, not starting with a digit, at most 64 long. */
export const secretNameOk = (name: string) => /^[A-Z_][A-Z0-9_]{0,63}$/.test(name);

/** A build's branch; "default" is how the API records a room that didn't name one. */
export const refWord = (ref: string) => (ref === "default" ? w.defaultBranchShort.toLowerCase() : ref);

/** A build in the history: "Update of main", "Preview of fix-login". */
export const deploymentTitle = (d: Pick<Deployment, "kind" | "ref">) => (d.kind === "preview" ? w.previewOf(refWord(d.ref)) : w.updateOf(refWord(d.ref)));

// Each step's colour and icon; its word is read from the dictionary when asked, so it follows the language.
type Step = keyof typeof w.steps;
const STEP: Record<Step, { tone: "live" | "warn" | "danger"; icon: IconName }> = {
  cancelled: { tone: "warn", icon: "back" },
  queued: { tone: "warn", icon: "clock" },
  cloning: { tone: "warn", icon: "spin" },
  building: { tone: "warn", icon: "spin" },
  starting: { tone: "warn", icon: "spin" },
  live: { tone: "live", icon: "tick" },
  failed: { tone: "danger", icon: "warn" },
};

/** How a build's status reads in the history, with its colour and icon. Unknown steps read as building, and a build
 *  someone cancelled doesn't read as a failure. */
export function deploymentStep(status: string, detail?: string | null): { word: string; tone: "live" | "warn" | "danger"; icon: IconName } {
  const step = status === "failed" && buildTrouble(detail) === "cancelled" ? "cancelled" : status;
  return Object.hasOwn(STEP, step)
    ? { word: w.steps[step as Step], ...STEP[step as Step] }
    : { word: step || w.steps.building, tone: "warn", icon: "spin" };
}

/** The first line of a failure's detail: the part that says what went wrong. */
export const firstLine = (detail: string | null) => detail?.split("\n").find((l) => l.trim())?.trim() ?? "";

export type BuildTrouble = keyof typeof w.trouble;

/** What went wrong with a build, read from what the caretaker said (deploy.ts, recipe.ts), so the room can say what to do. */
export function buildTrouble(detail: string | null | undefined): BuildTrouble {
  const d = detail ?? "";
  if (/^build cancelled/i.test(d)) return "cancelled";
  if (/restarted during this build/i.test(d)) return "lost";
  if (/no matching manifest|does not provide the specified platform/i.test(d)) return "imagePlatform";
  if (/pull access denied|manifest unknown|not found: manifest|no such image|invalid reference format|not an image name/i.test(d)) return "imageMissing";
  if (/made no website/i.test(d)) return "noSite";
  if (/couldn't tell how to run|Cannot locate specified Dockerfile/i.test(d)) return "noRecipe";
  if (/git clone failed|Repository not found|could not read/i.test(d)) return "fetch";
  if (/out of memory|OOM|code:? 137/i.test(d)) return "memory";
  if (/crashed and restarted|exited with code|did not become healthy|health check failed/i.test(d)) return "crash";
  if (/build failed/i.test(d)) return "build";
  return "other";
}

/** A build that ended badly and needs saying so. Someone cancelling it isn't that: the room just goes back to where it was. */
export const buildFailed = (d: Pick<Deployment, "status" | "detail"> | undefined) => d?.status === "failed" && buildTrouble(d.detail) !== "cancelled";

export type ReadTrouble = keyof typeof w.readTrouble;

/** Why a project couldn't be read, in plain words, from what the caretaker said (git's own sentences). Null: the API's sentence already says it. */
export function readTrouble(message: string): ReadTrouble | null {
  if (/remote branch .* not found/i.test(message)) return "branch";
  if (/git clone failed|repository not found|could not read/i.test(message)) return "repo";
  if (/didn't answer in time|still reading/i.test(message)) return "slow";
  return null;
}
