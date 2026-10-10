// The room panel's small decisions, kept apart from the page so they're easy to test: which verb the big action
// tile shows, whether a restart makes sense, what the Code tab lists, how a build reads in the history, and the
// exact body the settings PATCH sends. No DOM here.
import { bare, explain } from "../lobby/panel/words";
import type { IconName } from "../lobby/house/icons";
import type { RoomManage, RoomStatus, RoomUsage } from "../../types";

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
    ? { verb: "Put online", hint: explain.firstOnline, icon: "rocket" }
    : { verb: "Update", hint: explain.update, icon: "spin" };
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

/** The State tile's second line: since when it's been online, when it last built, or that it never has. */
export function stateSince(status: RoomStatus, deployments: Deployment[], when: (iso: string) => string): string {
  const prod = deployments.filter((d) => d.kind === "prod");
  if (status === "live") {
    const up = prod.find((d) => d.status === "live");
    return up ? `since ${when(up.updatedAt)}` : "running now";
  }
  const last = prod[0] ?? deployments[0];
  return last ? `last build ${when(last.updatedAt)}` : "never built";
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
      ? { term: "Repo", value: bare(settings.source).replace(/\.git$/, ""), href: settings.source }
      : { term: "Repo", value: "Not set yet", unset: true };
  return [
    repo,
    settings.branch ? { term: "Branch", value: settings.branch } : { term: "Branch", value: github ? "The default branch" : "main", unset: true },
    { term: "Folder", value: settings.buildPath && settings.buildPath !== "." ? settings.buildPath : "The repo's root", unset: !settings.buildPath || settings.buildPath === "." },
    settings.port ? { term: "Port", value: String(settings.port) } : { term: "Port", value: "Not set", unset: true },
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
export const deploymentTitle = (d: Pick<Deployment, "kind" | "ref">) => `${d.kind === "preview" ? "Preview" : "Update"} of ${d.ref}`;

const STEP: Record<string, { word: string; tone: "live" | "warn" | "danger"; icon: IconName }> = {
  queued: { word: "Waiting its turn", tone: "warn", icon: "clock" },
  cloning: { word: "Fetching the code", tone: "warn", icon: "spin" },
  building: { word: "Building", tone: "warn", icon: "spin" },
  starting: { word: "Starting", tone: "warn", icon: "spin" },
  live: { word: "Went online", tone: "live", icon: "tick" },
  failed: { word: "Failed", tone: "danger", icon: "warn" },
};

/** How a build's status reads in the history, with its colour and icon. Unknown steps read as building. */
export const deploymentStep = (status: string) => STEP[status] ?? { word: status || "Building", tone: "warn" as const, icon: "spin" as IconName };

/** The first line of a failure's detail: the part that says what went wrong. */
export const firstLine = (detail: string | null) => detail?.split("\n").find((l) => l.trim())?.trim() ?? "";
