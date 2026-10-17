// The arena's small rules, pure so they are tested (arena.test.ts): the countdown's compact words, what the stadium's
// big screen shows (ArenaDisplay, for the 3D lobby), a badge's words and colour, the pull request address a player
// pastes, the clone command, and what the panel offers this viewer (log in, join, or send a pull request).
import { language, type Lang, locale } from "../../i18n";
import type { ArenaKind, ArenaView, Badge, Person, Text } from "../../types";
import type { IconName } from "../lobby/house/icons";
import type { State } from "../lobby/panel/words";
import { arenaWords as w } from "./words";

/** What the stadium's big screen shows (docs/arena.md), already in the chosen language. The 3D lobby draws it. */
export interface ArenaDisplay {
  title: string;
  kind: ArenaKind;
  endsAt: string;
  champion: string | null;
  entrants: number;
}

/** A text the API wrote in both languages, in the one chosen now (or `lang`). */
export const say = (text: Text, lang: Lang = language.lang) => (lang === "fr" ? text.fr : text.en);

const nameOf = (p: Pick<Person, "name" | "login">) => p.name ?? p.login;

/** The arena view as the big screen needs it, in `lang`. */
export function toDisplay(view: ArenaView, lang: Lang = language.lang): ArenaDisplay {
  return {
    title: say(view.challenge.title, lang),
    kind: view.challenge.kind,
    endsAt: view.challenge.endsAt,
    champion: view.champion ? nameOf(view.champion.person) : null,
    entrants: view.entrants,
  };
}

/** Time left until `endsAt`, compact, in the language chosen now: "2d 4h", "3h 12m", "12m 05s", "45s", "Ended". */
export function countdown(endsAt: string, now: number = Date.now()): string {
  const left = Math.floor((new Date(endsAt).getTime() - now) / 1000);
  if (!(left > 0)) return w.ended;
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return w.days(d, h);
  if (h > 0) return w.hours(h, m);
  if (m > 0) return w.minutes(m, String(s).padStart(2, "0"));
  return w.seconds(s);
}

/** Is the week over? */
export const ended = (endsAt: string, now: number = Date.now()) => new Date(endsAt).getTime() <= now;

// ---- Badges ----

export type Medal = "gold" | "silver" | "bronze";

/** A badge's colour by its place. */
export const medal = (place: number): Medal => (place === 1 ? "gold" : place === 2 ? "silver" : "bronze");

/** "13 Oct" / "13 octobre": the Monday a badge's week started. */
export function weekName(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString(locale(), { day: "numeric", month: "long", timeZone: "UTC" });
}

/** What a badge chip says and what a reader hears: its title, and "Eagle eye, 1st place, Dakar, week of 12 October". */
export function badgeWords(badge: Badge): { text: string; name: string; medal: Medal } {
  const text = say(badge.title);
  return { text, name: w.badgeName(text, w.place(badge.place), badge.city, weekName(badge.week)), medal: medal(badge.place) };
}

// ---- The challenge ----

/** Each kind's icon and colour (a CSS custom property from the site's tokens). */
export const KINDS: Record<ArenaKind, { icon: IconName; tone: "danger" | "accent" | "live" }> = {
  bounty: { icon: "bug", tone: "danger" },
  hackathon: { icon: "rocket", tone: "accent" },
  challenge: { icon: "code", tone: "live" },
};

/** "https://github.com/Djbrl/la-coloc" → "Djbrl/la-coloc"; anything else as it is. */
export function repoName(repo: string): string {
  const m = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s#?]+?)(?:\.git)?\/?$/i.exec(repo.trim());
  return m ? m[1] : repo;
}

/** The one command that gets you to the challenge's folder: clone the repo, then step into the folder. */
export function cloneCommand(repo: string, path: string): string {
  const dir = repoName(repo).split("/").pop() ?? "repo";
  const folder = path.replace(/^\/+|\/+$/g, "");
  return folder ? `git clone ${repo} && cd ${dir}/${folder}` : `git clone ${repo} && cd ${dir}`;
}

/** The challenge's folder on GitHub (on the default branch, whatever it's called). */
export function folderUrl(repo: string, path: string): string {
  const folder = path.replace(/^\/+|\/+$/g, "");
  const base = repo.replace(/\.git$/, "").replace(/\/+$/, "");
  return folder ? `${base}/tree/HEAD/${folder}` : base;
}

// ---- Sending a pull request ----

export type PrProblem = "empty" | "notPull" | "wrongRepo";

const PULL_RE = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)(?:[/?#].*)?$/;

/**
 * What's wrong with a pasted address, before it's sent: nothing (null), nothing pasted, not a pull request on
 * github.com ("https://github.com/owner/repo/pull/12", with or without "/files" after it), or one on another repo than
 * the challenge's. The API checks the rest (yours, opened this week).
 */
export function checkPrUrl(url: string, repo?: string): PrProblem | null {
  const raw = url.trim();
  if (!raw) return "empty";
  const m = PULL_RE.exec(raw);
  if (!m || m[3] === "0") return "notPull";
  if (repo) {
    const want = repoName(repo).toLowerCase();
    if (want.includes("/") && `${m[1]}/${m[2]}`.toLowerCase() !== want) return "wrongRepo";
  }
  return null;
}

/** The problem in words, in the language chosen now. */
export function prProblemText(problem: PrProblem, repo: string): string {
  return problem === "empty" ? w.empty : problem === "notPull" ? w.notPull : w.wrongRepo(repoName(repo));
}

// ---- What the panel offers ----

/** The challenge tab's next step: log in, join, or (once in) send a pull request. Over: nothing more to do. */
export type ArenaStage = "login" | "join" | "joined" | "over";

export function arenaStage(view: Pick<ArenaView, "joined" | "challenge">, viewer: { login: string } | null, now: number = Date.now()): ArenaStage {
  if (ended(view.challenge.endsAt, now)) return "over";
  if (!viewer) return "login";
  return view.joined ? "joined" : "join";
}

/** The submission's state as a panel state (words and tone, as StatusPill draws it). */
export function submissionState(state: "open" | "merged" | "closed"): State {
  return { word: w.states[state], tone: state === "merged" ? "live" : state === "open" ? "warn" : "neutral" };
}
