// The room panel's small decisions, kept apart from the page so they're easy to test: the sentence that says how
// the room is doing, which verb the big action tile shows, whether a restart makes sense, what the Code tab lists, how a build reads in the history, and the
// exact body the settings PATCH sends. No DOM here.
import { bare, explain } from "../lobby/panel/words";
import type { IconName } from "../lobby/house/icons";
import type { RoomManage, RoomStatus, RoomUsage } from "../../types";
import { roomWords as w } from "./words";

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
  return settings.project || settings.projectDescription || (tutorial ? w.hello : w.untitled);
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

/** What the Code tab lists: where the code comes from, which branch, which folder, which port. */
export function codeRows(settings: Pick<Settings, "source" | "branch" | "buildPath" | "port">, github: Github): CodeRow[] {
  const repo: CodeRow = github
    ? { term: "GitHub", value: github.fullName, href: github.url }
    : settings.source
      ? { term: w.repo, value: bare(settings.source).replace(/\.git$/, ""), href: settings.source }
      : { term: w.repo, value: w.notSetYet, unset: true };
  return [
    repo,
    settings.branch ? { term: w.branch, value: settings.branch } : { term: w.branch, value: github ? w.defaultBranch : "main", unset: true },
    { term: w.folder, value: settings.buildPath && settings.buildPath !== "." ? settings.buildPath : w.repoRoot, unset: !settings.buildPath || settings.buildPath === "." },
    settings.port ? { term: w.port, value: String(settings.port) } : { term: w.port, value: w.notSet, unset: true },
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

/** The PATCH {base}/settings body. With GitHub linked the repo comes from the app, so `source` isn't sent. */
export function settingsBody(form: SettingsForm, githubLinked: boolean, port: number | null) {
  return {
    project: form.project,
    projectDescription: form.projectDescription,
    source: githubLinked ? undefined : form.source.trim() || null,
    branch: form.branch.trim() || null,
    buildPath: form.buildPath.trim() || ".",
    port,
  };
}

/** A secret's name the way the app reads it: trimmed and in capitals. */
export const secretName = (typed: string) => typed.trim().toUpperCase();
/** Capitals, digits and underscores, not starting with a digit, at most 64 long. */
export const secretNameOk = (name: string) => /^[A-Z_][A-Z0-9_]{0,63}$/.test(name);

/** A build in the history: "Update of main", "Preview of fix-login". */
export const deploymentTitle = (d: Pick<Deployment, "kind" | "ref">) => (d.kind === "preview" ? w.previewOf(d.ref) : w.updateOf(d.ref));

// Each step's colour and icon; its word is read from the dictionary when asked, so it follows the language.
type Step = keyof typeof w.steps;
const STEP: Record<Step, { tone: "live" | "warn" | "danger"; icon: IconName }> = {
  queued: { tone: "warn", icon: "clock" },
  cloning: { tone: "warn", icon: "spin" },
  building: { tone: "warn", icon: "spin" },
  starting: { tone: "warn", icon: "spin" },
  live: { tone: "live", icon: "tick" },
  failed: { tone: "danger", icon: "warn" },
};

/** How a build's status reads in the history, with its colour and icon. Unknown steps read as building. */
export const deploymentStep = (status: string): { word: string; tone: "live" | "warn" | "danger"; icon: IconName } =>
  Object.hasOwn(STEP, status)
    ? { word: w.steps[status as Step], ...STEP[status as Step] }
    : { word: status || w.steps.building, tone: "warn", icon: "spin" };

/** The first line of a failure's detail: the part that says what went wrong. */
export const firstLine = (detail: string | null) => detail?.split("\n").find((l) => l.trim())?.trim() ?? "";
