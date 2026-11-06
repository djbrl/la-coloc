// The Arena's rules, on a real in-memory database with GitHub played by a fake: which challenge a city gets each
// week and when it's made, the podium and its titles, what a pull request must be to count, GitHub's webhooks,
// titles next to names, the arena's chat room, and the brake on sending.
import "reflect-metadata";
import { arenaAwards, arenaChallenges, arenaSubmissions, type Db, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthController } from "../auth/auth.controller";
import type { AuthService } from "../auth/auth.service";
import { MembershipsService } from "../auth/memberships.service";
import { ChatService } from "../chat/chat.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { NotificationsService } from "../notifications/notifications.service";
import { seedCity } from "../seed/city";
import { ArenaController } from "./arena.controller";
import { ArenaService, judgedLabel, SUBMISSIONS } from "./arena.service";
import { CATALOGUE } from "./catalogue";
import { arenaRepo, parsePrUrl, scoreOf } from "./scoring";
import { cityIndex, entryFor, isoDate, weekStartOf } from "./weeks";

let db: Db;
let chat: ChatService;
let arena: ArenaService;
let controller: ArenaController;
let me: AuthController;
let now: Date;
let changes: string[];
let as: string | null;
let githubDown: boolean | number;
let asked: number;
const ids: Record<string, string> = {};
const prs = new Map<number, object>();

// Wednesday of the week starting Monday 12 October 2026.
const WEDNESDAY = new Date("2026-10-14T12:00:00Z");
const NEXT_WEEK = new Date("2026-10-21T12:00:00Z");
const REPO = "https://github.com/Djbrl/la-coloc-arena";

/** A pull request as GitHub's API (and its webhooks) describe it. */
function pr(n: number, o: { by?: string; id?: number; merged?: boolean; closed?: boolean; created?: string; labels?: string[]; mergedAt?: string } = {}) {
  const merged = o.merged ?? false;
  return {
    number: n,
    title: `Fix number ${n}`,
    html_url: `${REPO}/pull/${n}`,
    state: merged || o.closed ? "closed" : "open",
    merged,
    merged_at: merged ? (o.mergedAt ?? "2026-10-14T10:00:00Z") : null,
    created_at: o.created ?? "2026-10-13T09:00:00Z",
    user: { login: o.by ?? "fatou", id: o.id ?? 101 },
    // As the judges label an accepted entry, unless a test says otherwise: an entry, or a low-severity fix.
    labels: (o.labels ?? ["arena:entry", "arena:low"]).map((name) => ({ name })),
  };
}

async function newcomer(login: string, githubId: number) {
  const [u] = await db.insert(users).values({ login, name: login[0].toUpperCase() + login.slice(1), githubId }).returning();
  ids[login] = u.id;
}

const user = async (login: string) => (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) }))!;

async function refusal(p: Promise<unknown>): Promise<{ status: number; code: unknown } | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (!(e instanceof HttpException)) throw e;
    const body = e.getResponse() as { code?: unknown };
    return { status: e.getStatus(), code: body.code };
  }
}

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  const houses = new HousesService(db);
  const doorbell = new DoorbellService(db, houses);
  const notifications = new NotificationsService(db, houses, doorbell, { devLogin: false });
  chat = new ChatService(db, houses, notifications);
  arena = new ArenaService(db, chat, null);
  now = WEDNESDAY;
  arena.clock = () => now;
  githubDown = false;
  asked = 0;
  prs.clear();
  arena.fetch = async (url) => {
    asked++;
    if (githubDown === true) throw new Error("ECONNRESET");
    if (typeof githubDown === "number") return new Response("{}", { status: githubDown });
    const n = Number(/\/pulls\/(\d+)$/.exec(String(url))?.[1]);
    const found = String(url).startsWith("https://api.github.com/repos/djbrl/la-coloc-arena/") ? prs.get(n) : undefined;
    return found ? new Response(JSON.stringify(found), { status: 200 }) : new Response("{}", { status: 404 });
  };
  changes = [];
  chat.changes.subscribe((c) => changes.push(`${c.city}:${c.what}`));
  as = null;
  const auth = { userFromRequest: async () => (as ? await user(as) : null) } as unknown as AuthService;
  controller = new ArenaController(arena, auth);
  me = new AuthController(auth, new MembershipsService(db));
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 101);
  await newcomer("sam", 102);
  await newcomer("lena", 103);
  await newcomer("omar-gh", 104);
});

const req = { headers: {} };

describe("weeks", () => {
  it("start on Monday 00:00 UTC", () => {
    expect(isoDate(weekStartOf(new Date("2026-10-12T00:00:00Z")))).toBe("2026-10-12");
    expect(isoDate(weekStartOf(new Date("2026-10-18T23:59:59Z")))).toBe("2026-10-12");
    expect(isoDate(weekStartOf(new Date("2026-10-19T00:00:00Z")))).toBe("2026-10-19");
    expect(isoDate(weekStartOf(new Date("2026-01-05T08:00:00Z")))).toBe("2026-01-05");
  });

  it("give each city a different challenge in a week, and a new one the next week", () => {
    const monday = weekStartOf(WEDNESDAY);
    const nextMonday = weekStartOf(NEXT_WEEK);
    expect(entryFor("Dakar", monday).slug).not.toBe(entryFor("Marrakech", monday).slug);
    expect(entryFor("Dakar", nextMonday).slug).toBe(entryFor("Marrakech", monday).slug);
    // weekIndex 40 on 12 Oct 2026, Dakar is city 0.
    expect(entryFor("Dakar", monday)).toBe(CATALOGUE[40 % CATALOGUE.length]);
    // A city only a house is in still gets one, the same every time.
    expect(cityIndex("Ouagadougou")).toBe(cityIndex("Ouagadougou"));
    expect(CATALOGUE).toContain(entryFor("Ouagadougou", monday));
  });

  it("have a catalogue of every kind, in both languages", () => {
    expect(new Set(CATALOGUE.map((e) => e.kind))).toEqual(new Set(["bounty", "hackathon", "challenge"]));
    expect(new Set(CATALOGUE.map((e) => e.slug)).size).toBe(CATALOGUE.length);
    for (const e of CATALOGUE) {
      expect(e.title.fr && e.summary.fr && e.award.title.fr).toBeTruthy();
      expect(e.rules.fr.length).toBe(e.rules.en.length);
      // Its folder explains it in this repo.
      expect(existsSync(join(__dirname, "../../../../", e.path, "README.md"))).toBe(true);
    }
  });
});

describe("a city's challenge", () => {
  it("is made the first time anyone looks, once, even when several look at once", async () => {
    expect(await db.select().from(arenaChallenges)).toHaveLength(0);
    const views = await Promise.all([arena.view("Dakar", null), arena.view("Dakar", null), arena.current("Dakar")]);
    const rows = await db.select().from(arenaChallenges);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "Dakar:2026-10-12", city: "Dakar", weekStart: "2026-10-12", slug: entryFor("Dakar", weekStartOf(WEDNESDAY)).slug, repo: REPO, closedAt: null });
    expect(views[0].challenge).toMatchObject({ id: "Dakar:2026-10-12", startsAt: "2026-10-12T00:00:00.000Z", endsAt: "2026-10-19T00:00:00.000Z", repo: REPO });
    expect(views[0]).toMatchObject({ city: "Dakar", entrants: 0, joined: false, mine: [], leaderboard: [], champion: null });
    expect(changes).toContain("Dakar:arena");
  });

  it("says what each place on the podium wins, and whether pull requests are picked up on their own", async () => {
    const view = await arena.view("Dakar", null);
    const entry = CATALOGUE.find((e) => e.slug === view.challenge.slug)!;
    const podium = { key: "podium", title: { en: `Podium · ${entry.title.en}`, fr: `Podium · ${entry.title.fr}` } };
    expect(view.challenge.prizes).toEqual([
      { place: 1, fcfa: entry.prizeFcfa, badge: entry.award },
      { place: 2, fcfa: 0, badge: podium },
      { place: 3, fcfa: 0, badge: podium },
    ]);
    // Without the GitHub App no webhook reaches this server: each pull request is pasted.
    expect(view.autoSubmit).toBe(false);
    expect((await new ArenaService(db, chat, {} as never).view("Dakar", null)).autoSubmit).toBe(true);
  });

  it("is a 404 for a city that doesn't exist", async () => {
    expect(await refusal(arena.view("Atlantis", null))).toEqual({ status: 404, code: "noCity" });
  });

  it("can be joined, once, and counts its entrants", async () => {
    let view = await arena.join("Dakar", ids.fatou);
    view = await arena.join("Dakar", ids.fatou);
    expect(view).toMatchObject({ entrants: 1, joined: true });
    expect(view.leaderboard).toEqual([{ person: expect.objectContaining({ login: "fatou", badge: null }), points: 0, prs: 0 }]);
    expect((await arena.view("Dakar", ids.sam)).joined).toBe(false);
  });
});

describe("sending a pull request", () => {
  it("counts a merged one by its label, and waits on an open one", async () => {
    prs.set(7, pr(7, { merged: true, labels: ["arena:high", "arena:low"] }));
    prs.set(8, pr(8));
    as = "fatou";
    await controller.submit("Dakar", { url: `${REPO}/pull/7` }, req);
    const view = await controller.submit("Dakar", { url: "https://github.com/djbrl/LA-COLOC-ARENA/pull/8/files" }, req);
    expect(view.joined).toBe(true);
    expect(view.mine.map((s) => [s.number, s.state, s.points])).toEqual([
      [7, "merged", scoreOf(view.challenge.slug, view.challenge.kind, { state: "merged", labels: ["arena:high", "arena:low"] }).points],
      [8, "open", 0],
    ]);
    expect(view.leaderboard[0]).toMatchObject({ person: { login: "fatou" }, prs: 2 });
  });

  it("refuses what isn't a pull request of yours to the arena repo, from this week", async () => {
    const fatou = await user("fatou");
    prs.set(1, pr(1, { by: "sam", id: 102 }));
    prs.set(2, pr(2, { created: "2026-10-11T23:00:00Z" }));
    prs.set(3, pr(3));
    expect(await refusal(arena.submit("Dakar", await user("awa"), `${REPO}/pull/3`))).toEqual({ status: 403, code: "arenaGithubNeeded" });
    expect(await refusal(arena.submit("Dakar", fatou, "not a link"))).toEqual({ status: 400, code: "arenaBadUrl" });
    expect(await refusal(arena.submit("Dakar", fatou, "https://github.com/Djbrl/la-coloc-arena/issues/3"))).toEqual({ status: 400, code: "arenaBadUrl" });
    expect(await refusal(arena.submit("Dakar", fatou, "https://github.com/someone/else/pull/3"))).toEqual({ status: 400, code: "arenaWrongRepo" });
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/1`))).toEqual({ status: 403, code: "arenaNotYourPr" });
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/2`))).toEqual({ status: 400, code: "arenaPrTooOld" });
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/99`))).toEqual({ status: 404, code: "arenaPrNotFound" });
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/3`))).toBe("ok");
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/3`))).toEqual({ status: 409, code: "arenaAlreadySubmitted" });
    // Someone else can't send it either: it's in the challenge already.
    expect(await refusal(arena.submit("Dakar", await user("sam"), `${REPO}/pull/3`))).toEqual({ status: 409, code: "arenaAlreadySubmitted" });
    // A refused one leaves nothing behind.
    expect(await db.select().from(arenaSubmissions)).toHaveLength(1);
  });

  it("matches the author by GitHub id first, then by login whatever its case", async () => {
    prs.set(4, pr(4, { by: "FATOU", id: 101 }));
    prs.set(5, pr(5, { by: "fatou", id: 999 }));
    const fatou = await user("fatou");
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/4`))).toBe("ok");
    // Same login, but GitHub says it's another account (the login changed hands).
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/5`))).toEqual({ status: 403, code: "arenaNotYourPr" });
  });

  it("says GitHub is down when it doesn't answer or answers with an error", async () => {
    const fatou = await user("fatou");
    githubDown = true;
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/3`))).toEqual({ status: 503, code: "arenaGithubDown" });
    githubDown = 502;
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/3`))).toEqual({ status: 503, code: "arenaGithubDown" });
    githubDown = 403;
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/3`))).toEqual({ status: 503, code: "arenaGithubDown" });
  });

  it("allows five an hour, then asks to wait, without asking GitHub", async () => {
    const fatou = await user("fatou");
    for (let n = 1; n <= SUBMISSIONS.count; n++) {
      prs.set(n, pr(n));
      expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/${n}`))).toBe("ok");
    }
    prs.set(6, pr(6));
    const before = asked;
    expect(await refusal(arena.submit("Dakar", fatou, `${REPO}/pull/6`))).toEqual({ status: 429, code: "slowDownArena" });
    expect(asked).toBe(before);
    // Someone else still can.
    prs.set(7, pr(7, { by: "sam", id: 102 }));
    expect(await refusal(arena.submit("Dakar", await user("sam"), `${REPO}/pull/7`))).toBe("ok");
  });

  it("can be taken back by its sender only", async () => {
    prs.set(3, pr(3));
    const view = await arena.submit("Dakar", await user("fatou"), `${REPO}/pull/3`);
    const id = view.mine[0].id;
    expect(await refusal(arena.withdraw("Dakar", ids.sam, id))).toEqual({ status: 404, code: "arenaNoSubmission" });
    expect(await refusal(arena.withdraw("Dakar", ids.fatou, "nope"))).toEqual({ status: 404, code: "arenaNoSubmission" });
    expect((await arena.withdraw("Dakar", ids.fatou, id)).mine).toEqual([]);
  });

  it("is asked about again when its sender looks, at most every five minutes", async () => {
    prs.set(3, pr(3));
    await arena.submit("Dakar", await user("fatou"), `${REPO}/pull/3`);
    prs.set(3, pr(3, { merged: true }));
    const before = asked;
    expect((await arena.view("Dakar", ids.fatou)).mine[0].state).toBe("open");
    expect(asked).toBe(before);
    now = new Date(WEDNESDAY.getTime() + 6 * 60_000);
    expect((await arena.view("Dakar", ids.fatou)).mine[0]).toMatchObject({ state: "merged" });
    expect((await arena.view("Dakar", ids.fatou)).mine[0].points).toBeGreaterThan(0);
  });
});

describe("the podium", () => {
  // Last week in Dakar: fatou 50 (scored Monday and Tuesday), sam 50 (scored Wednesday), lena 10, omar-gh joined with nothing.
  async function lastWeek() {
    now = WEDNESDAY;
    const c = await arena.current("Dakar");
    const scored = (login: string, n: number, points: number, at: string) =>
      db.insert(arenaSubmissions).values({ challengeId: c.id, userId: ids[login], url: `${REPO}/pull/${n}`, repo: "djbrl/la-coloc", number: n, state: "merged", points, scoredAt: new Date(at) });
    for (const login of ["sam", "fatou", "lena", "omar-gh"]) await arena.join("Dakar", ids[login]);
    await scored("sam", 1, 50, "2026-10-14T09:00:00Z");
    await scored("fatou", 2, 25, "2026-10-12T09:00:00Z");
    await scored("fatou", 3, 25, "2026-10-13T09:00:00Z");
    await scored("lena", 4, 10, "2026-10-15T09:00:00Z");
    await db.insert(arenaSubmissions).values({ challengeId: c.id, userId: ids["omar-gh"], url: `${REPO}/pull/5`, repo: "djbrl/la-coloc", number: 5, state: "closed", points: 0 });
    now = NEXT_WEEK;
    return c;
  }

  it("is awarded when the next week is made: a tie goes to the earlier last points, nobody on 0", async () => {
    const c = await lastWeek();
    const view = await arena.view("Dakar", null);
    expect(view.challenge.id).toBe("Dakar:2026-10-19");
    const [closed] = await db.select().from(arenaChallenges).where(eq(arenaChallenges.id, c.id));
    expect(closed.closedAt).not.toBeNull();
    const awards = await db.select().from(arenaAwards).orderBy(arenaAwards.place);
    const entry = CATALOGUE.find((e) => e.slug === c.slug)!;
    expect(awards.map((a) => [a.place, a.userId, a.key, a.titleEn, a.titleFr, a.city, a.week])).toEqual([
      [1, ids.fatou, entry.award.key, entry.award.title.en, entry.award.title.fr, "Dakar", "2026-10-12"],
      [2, ids.sam, "podium", `Podium · ${entry.title.en}`, `Podium · ${entry.title.fr}`, "Dakar", "2026-10-12"],
      [3, ids.lena, "podium", `Podium · ${entry.title.en}`, `Podium · ${entry.title.fr}`, "Dakar", "2026-10-12"],
    ]);
    expect(view.champion).toEqual({
      person: expect.objectContaining({ login: "fatou" }),
      badge: { key: entry.award.key, title: entry.award.title, place: 1, city: "Dakar", week: "2026-10-12" },
    });
    // The new title goes on, and shows wherever their name does.
    expect(view.champion!.person.badge).toEqual(view.champion!.badge);
    expect((await user("sam")).badge).toMatchObject({ place: 2, key: "podium" });
    expect((await user("omar-gh")).badge).toBeNull();
  });

  it("awards exactly the prizes the arena showed during the week", async () => {
    const c = await lastWeek();
    now = WEDNESDAY;
    const shown = (await arena.view("Dakar", null)).challenge.prizes;
    now = NEXT_WEEK;
    await arena.view("Dakar", null);
    const awards = await db.select().from(arenaAwards).where(eq(arenaAwards.challengeId, c.id)).orderBy(arenaAwards.place);
    expect(awards.map((a) => ({ place: a.place, badge: { key: a.key, title: { en: a.titleEn, fr: a.titleFr } } }))).toEqual(shown.map(({ place, badge }) => ({ place, badge })));
    expect(shown[0].fcfa).toBe(c.prizeFcfa);
  });

  it("is awarded once, however many ask at once", async () => {
    const c = await lastWeek();
    const results = await Promise.all([arena.closeAndAward(c.id), arena.closeAndAward(c.id)]);
    expect(results[0].length + results[1].length).toBe(3);
    expect(await arena.closeAndAward(c.id)).toEqual([]);
    expect(await db.select().from(arenaAwards)).toHaveLength(3);
    // 1st place's prize came to their credit, once; the rest of the podium keeps their badge.
    expect((await user("fatou")).credit).toBe(15_000 + c.prizeFcfa);
    expect((await user("sam")).credit).toBe(15_000);
  });

  it("gives nothing when nobody scored", async () => {
    now = WEDNESDAY;
    await arena.join("Dakar", ids.fatou);
    now = NEXT_WEEK;
    const view = await arena.view("Dakar", null);
    expect(view.champion).toBeNull();
    expect(await db.select().from(arenaAwards)).toEqual([]);
    expect((await db.select().from(arenaChallenges).where(eq(arenaChallenges.id, "Dakar:2026-10-12")))[0].closedAt).not.toBeNull();
  });

  it("closes weeks nobody looked at since, and only the city's own", async () => {
    await lastWeek();
    now = new Date("2026-11-04T12:00:00Z");
    await arena.view("Marrakech", null);
    expect(await db.select().from(arenaAwards)).toHaveLength(0);
    const view = await arena.view("Dakar", null);
    expect(await db.select().from(arenaAwards)).toHaveLength(3);
    // The champion is last week's: nobody played then.
    expect(view.champion).toBeNull();
  });
});

describe("GitHub's webhooks", () => {
  const event = (action: string, pull: object, repo = "Djbrl/la-coloc-arena") => ({ action, repository: { id: 1, full_name: repo }, pull_request: pull }) as never;

  it("update a pull request's state, title and points", async () => {
    prs.set(3, pr(3));
    const view = await arena.submit("Dakar", await user("fatou"), `${REPO}/pull/3`);
    changes = [];
    const merged = { ...pr(3, { merged: true, labels: ["arena:entry", "arena:critical"] }), title: "Fix the login check" };
    expect(await arena.handle("pull_request", event("closed", merged))).toMatch(/^arena: #3 updated 1/);
    const [s] = await db.select().from(arenaSubmissions);
    expect(s).toMatchObject({ state: "merged", title: "Fix the login check", points: scoreOf(view.challenge.slug, view.challenge.kind, { state: "merged", labels: ["arena:entry", "arena:critical"] }).points });
    expect(s.scoredAt).toEqual(new Date("2026-10-14T10:00:00Z"));
    expect(changes).toEqual(["Dakar:arena"]);
  });

  it("send a new pull request for its author in the one arena they joined this week", async () => {
    await arena.join("Dakar", ids.fatou);
    // One arena a week: a second city is refused, so one pull request can't win every podium.
    expect(await refusal(arena.join("Tunis", ids.fatou))).toEqual({ status: 409, code: "arenaOtherCity" });
    await arena.join("Lomé", ids.sam);
    expect(await arena.handle("pull_request", event("opened", pr(11)))).toBe("arena: #11 updated 0, added 1");
    const rows = await db.select().from(arenaSubmissions);
    expect(rows.map((r) => r.challengeId)).toEqual(["Dakar:2026-10-12"]);
    expect(rows.every((r) => r.userId === ids.fatou && r.state === "open")).toBe(true);
    // Labelled later: updated, nothing added twice.
    expect(await arena.handle("pull_request", event("labeled", pr(11, { labels: ["arena:low"] })))).toBe("arena: #11 updated 1, added 0");
  });

  it("read a grade from a judge's comment and put it on as a label", async () => {
    const calls: unknown[][] = [];
    const github = { relabel: async (...a: unknown[]) => void calls.push(a) };
    const judged = new ArenaService(db, chat, github as never);
    (judged as unknown as { judges: Set<string> }).judges = new Set(["djbrl"]);
    const comment = (body: string, by = "Djbrl", extra: object = {}) =>
      ({
        action: "created",
        installation: { id: 7 },
        repository: { id: 1, full_name: "Djbrl/la-coloc-arena" },
        issue: { number: 2, pull_request: {}, labels: [{ name: "arena:low" }, { name: "bug" }] },
        comment: { body, user: { login: by, id: 1 } },
        ...extra,
      }) as never;
    expect(await judged.handle("issue_comment", comment("LGTM arena:critical"))).toBe("arena: #2 labelled arena:critical by Djbrl");
    // The old grade comes off; labels that aren't grades stay.
    expect(calls).toEqual([[7, "Djbrl/la-coloc-arena", 2, "arena:critical", ["arena:low"]]]);
    // Not a judge, no grade in it, an issue rather than a pull request, another repo: nothing happens.
    expect(await judged.handle("issue_comment", comment("arena:critical", "slater1994"))).toBe("ignored");
    expect(await judged.handle("issue_comment", comment("LGTM"))).toBe("ignored");
    expect(await judged.handle("issue_comment", comment("arena:high", "Djbrl", { issue: { number: 3 } }))).toBe("ignored");
    expect(await judged.handle("issue_comment", comment("arena:high", "Djbrl", { repository: { id: 2, full_name: "someone/else" } }))).toBe("ignored");
    expect(await judged.handle("issue_comment", comment("arena:high", "Djbrl", { action: "deleted" }))).toBe("ignored");
    expect(calls).toHaveLength(1);
  });

  it("find the grade in a comment, the last one if there are several", () => {
    expect(judgedLabel("LGTM arena:critical")).toBe("arena:critical");
    expect(judgedLabel("Arena:HIGH, nice")).toBe("arena:high");
    expect(judgedLabel("arena:low... actually arena:medium")).toBe("arena:medium");
    expect(judgedLabel("arena:criticality")).toBeNull();
    expect(judgedLabel("not-arena:low")).toBeNull();
    expect(judgedLabel("arena: critical")).toBeNull();
  });

  it("is closed to its judges, who merge and label its pull requests", async () => {
    const judged = new ArenaService(db, chat, null);
    (judged as unknown as { judges: Set<string> }).judges = new Set(["fatou"]);
    judged.clock = arena.clock;
    expect(await refusal(judged.join("Dakar", ids.fatou))).toEqual({ status: 403, code: "arenaJudge" });
  });

  it("ignore other repos, other events, strangers, and pull requests from before the week", async () => {
    await arena.join("Dakar", ids.fatou);
    expect(await arena.handle("pull_request", event("opened", pr(12), "someone/else"))).toBe("ignored");
    expect(await arena.handle("issues", event("opened", pr(12)))).toBe("ignored");
    expect(await arena.handle("pull_request", event("opened", pr(12, { by: "nobody", id: 555 })))).toBe("ignored");
    expect(await arena.handle("pull_request", event("opened", pr(12, { created: "2026-10-10T00:00:00Z" })))).toBe("ignored");
    expect(await arena.handle("pull_request", event("opened", { number: "nope" }))).toBe("ignored");
    expect(await db.select().from(arenaSubmissions)).toEqual([]);
  });

  it("leave the points of a closed week as they were awarded", async () => {
    now = new Date("2026-10-07T12:00:00Z");
    prs.set(3, pr(3, { created: "2026-10-06T00:00:00Z" }));
    await arena.submit("Dakar", await user("fatou"), `${REPO}/pull/3`);
    now = NEXT_WEEK;
    await arena.view("Dakar", null);
    await arena.handle("pull_request", event("closed", pr(3, { merged: true, created: "2026-10-06T00:00:00Z" })));
    const [s] = await db.select().from(arenaSubmissions);
    expect(s).toMatchObject({ state: "merged", points: 0 });
  });
});

describe("titles", () => {
  async function win() {
    now = WEDNESDAY;
    const c = await arena.current("Dakar");
    await arena.join("Dakar", ids.fatou);
    await db.insert(arenaSubmissions).values({ challengeId: c.id, userId: ids.fatou, url: `${REPO}/pull/1`, repo: "djbrl/la-coloc", number: 1, state: "merged", points: 20, scoredAt: now });
    now = NEXT_WEEK;
    await arena.view("Dakar", null);
    return (await db.select().from(arenaAwards))[0];
  }

  it("show next to a name in chat, and in /api/me with all of yours", async () => {
    const award = await win();
    await arena.say("Dakar", ids.fatou, "Merci !");
    const { messages } = await arena.messages("Dakar", null);
    expect(messages[0].author).toEqual(expect.objectContaining({ login: "fatou", badge: expect.objectContaining({ key: award.key, place: 1 }) }));
    as = "fatou";
    const mine = (await me.me(req)).user!;
    expect(mine.badge).toMatchObject({ key: award.key, city: "Dakar", week: "2026-10-12" });
    expect(mine.badges).toEqual([{ id: award.id, ...mine.badge! }]);
    as = "sam";
    expect((await me.me(req)).user).toMatchObject({ badge: null, badges: [] });
  });

  it("can be taken off and put back on, but only your own", async () => {
    const award = await win();
    as = "fatou";
    expect(await controller.wear({ id: null }, req)).toEqual({ badge: null });
    expect((await user("fatou")).badge).toBeNull();
    expect((await controller.wear({ id: award.id }, req)).badge).toMatchObject({ key: award.key });
    expect((await user("fatou")).wornAwardId).toBe(award.id);
    as = "sam";
    expect(await refusal(controller.wear({ id: award.id }, req))).toEqual({ status: 404, code: "arenaNoAward" });
    as = null;
    expect(await refusal(controller.wear({ id: null }, req))).toEqual({ status: 401, code: "logInFirst" });
  });

  it("go when the award goes", async () => {
    await win();
    await db.delete(arenaAwards);
    expect((await user("fatou")).wornAwardId).toBeNull();
  });
});

describe("the arena's chat room", () => {
  it("is the city's own, readable by anyone, written by people logged in, and pings the stream", async () => {
    as = "fatou";
    await controller.say("Dakar", { body: "Qui fait le bug bounty ?" }, req);
    // A message only nudges the room: the challenge and the leaderboard aren't fetched again for it.
    expect(changes).toContain("Dakar:arenaChat");
    expect((await controller.messages("Dakar", req)).messages.map((m) => m.body)).toEqual(["Qui fait le bug bounty ?"]);
    expect((await chat.cityChat("Dakar", null)).messages).toEqual([]);
    expect((await arena.messages("Tunis", null)).messages).toEqual([]);
    as = null;
    expect(await refusal(controller.say("Dakar", { body: "salut" }, req))).toEqual({ status: 401, code: "logInFirst" });
    expect(await refusal(arena.say("Atlantis", ids.fatou, "salut"))).toEqual({ status: 404, code: "noCity" });
  });

  it("hides what people you blocked said, and keeps the city room's length and brake", async () => {
    await arena.say("Dakar", ids.sam, "Bonjour l'arène");
    await chat.block(ids.fatou, "sam");
    expect((await arena.messages("Dakar", ids.fatou)).messages).toEqual([]);
    expect((await arena.messages("Dakar", ids.lena)).messages).toHaveLength(1);
    expect(await refusal(arena.say("Dakar", ids.fatou, "x".repeat(1001)))).toEqual({ status: 400, code: "tooLong" });
    expect(await refusal(arena.say("Dakar", ids.fatou, "   "))).toEqual({ status: 400, code: "writeSomething" });
    for (let i = 0; i < 5; i++) await arena.say("Dakar", ids.lena, `message ${i}`);
    expect(await refusal(arena.say("Dakar", ids.lena, "un de trop"))).toEqual({ status: 429, code: "slowDownMessages" });
  });

  it("can be reported like the city's", async () => {
    const { id } = await arena.say("Dakar", ids.sam, "Spam");
    await chat.report(ids.fatou, { kind: "message", id });
    expect((await chat.reports())[0]).toMatchObject({ channel: "arena:Dakar", author: "sam" });
  });
});

describe("addresses", () => {
  it("read the arena repo from the environment, and pull request links", () => {
    expect(arenaRepo({})).toEqual({ url: REPO, fullName: "djbrl/la-coloc-arena" });
    expect(arenaRepo({ COLOC_ARENA_REPO: "Coloc-Arena/Challenges.git" })).toEqual({ url: "https://github.com/Coloc-Arena/Challenges", fullName: "coloc-arena/challenges" });
    expect(parsePrUrl(" https://github.com/Djbrl/la-coloc/pull/42#discussion ")).toEqual({ repo: "djbrl/la-coloc", number: 42 });
    expect(parsePrUrl("https://gitlab.com/Djbrl/la-coloc/pull/42")).toBeNull();
    expect(parsePrUrl("javascript:alert(1)")).toBeNull();
  });

  it("score only merged pull requests the judges labelled: bounties by their best label, the rest as entries", () => {
    expect(scoreOf("bug-bounty", "bounty", { state: "merged", labels: ["arena:medium", "arena:critical"] })).toEqual({ points: 100, label: "arena:critical" });
    // An ordinary contribution to the repo, merged but not labelled for the arena, isn't an entry.
    expect(scoreOf("bug-bounty", "bounty", { state: "merged", labels: ["good first issue"] })).toEqual({ points: 0, label: null });
    expect(scoreOf("bug-bounty", "bounty", { state: "open", labels: ["arena:high"] })).toEqual({ points: 0, label: null });
    expect(scoreOf("offline-hackathon", "hackathon", { state: "merged", labels: ["arena:high"] })).toEqual({ points: 0, label: null });
    expect(scoreOf("offline-hackathon", "hackathon", { state: "merged", labels: ["arena:entry"] })).toEqual({ points: 30, label: "arena:entry" });
    expect(scoreOf("test-pilot", "challenge", { state: "merged", labels: [] })).toEqual({ points: 0, label: null });
    expect(scoreOf("test-pilot", "challenge", { state: "closed", labels: ["arena:entry"] })).toEqual({ points: 0, label: null });
  });
});

describe("the edges of a week", () => {
  it("asks GitHub once more before closing, so a Sunday merge counts and a Monday one doesn't", async () => {
    as = "fatou";
    prs.set(3, pr(3));
    prs.set(4, pr(4));
    await controller.submit("Dakar", { url: `${REPO}/pull/3` }, req);
    await controller.submit("Dakar", { url: `${REPO}/pull/4` }, req);
    // Merged on Sunday evening and on Monday morning; no webhook told us about either.
    prs.set(3, pr(3, { merged: true, mergedAt: "2026-10-18T22:00:00Z" }));
    prs.set(4, pr(4, { merged: true, mergedAt: "2026-10-19T08:00:00Z" }));
    now = NEXT_WEEK;
    await arena.current("Dakar");
    const subs = await db.select().from(arenaSubmissions);
    expect(Object.fromEntries(subs.map((s) => [s.number, s.points]))).toEqual({ 3: 20, 4: 0 });
    expect((await db.select().from(arenaAwards)).map((a) => a.place)).toEqual([1]);
  });

  it("says when the challenge's folder doesn't open for anyone (a private repo, or not pushed)", async () => {
    expect((await controller.view("Dakar", req)).challenge.open).toBe(false);
    const before = arena.fetch;
    arena.fetch = async (url, init) => (String(url).includes("/contents/") ? new Response("[]", { status: 200 }) : before(url, init));
    // Remembered for ten minutes: a fresh service asks again.
    const fresh = new ArenaService(db, chat, null);
    fresh.clock = arena.clock;
    fresh.fetch = arena.fetch;
    expect((await fresh.view("Dakar", null)).challenge.open).toBe(true);
  });
});

describe("a title picked by hand", () => {
  async function winTwoWeeks(chooseNoneBetween: boolean) {
    as = "fatou";
    prs.set(3, pr(3, { merged: true }));
    await controller.submit("Dakar", { url: `${REPO}/pull/3` }, req);
    now = NEXT_WEEK;
    await arena.current("Dakar");
    const first = await user("fatou");
    expect(first.badge?.place).toBe(1);
    if (chooseNoneBetween) await arena.wearBadge(first.id, null);
    // A second win, the week after.
    prs.set(30, pr(30, { merged: true, created: "2026-10-20T09:00:00Z", mergedAt: "2026-10-20T10:00:00Z" }));
    await controller.submit("Dakar", { url: `${REPO}/pull/30` }, req);
    now = new Date("2026-10-28T12:00:00Z");
    await arena.current("Dakar");
    return user("fatou");
  }

  it("is replaced by a new win when they wore their latest", async () => {
    const u = await winTwoWeeks(false);
    expect(u.badge?.week).toBe("2026-10-19");
  });

  it("stays when they had chosen none since", async () => {
    const u = await winTwoWeeks(true);
    expect(u.badge).toBeNull();
  });
});

describe("a moved arena repo", () => {
  it("is followed by the week still open, and not by weeks already played", async () => {
    await arena.current("Dakar");
    await db.update(arenaChallenges).set({ repo: "https://github.com/Djbrl/la-coloc" });
    await db.insert(arenaChallenges).values({ id: "Dakar:2026-10-05", city: "Dakar", weekStart: "2026-10-05", startsAt: new Date("2026-10-05"), endsAt: new Date("2026-10-12"), slug: "bug-bounty", kind: "bounty", repo: "https://github.com/Djbrl/la-coloc", path: "challenges/bug-bounty", prizeFcfa: 25_000, closedAt: new Date("2026-10-12") });
    const fresh = new ArenaService(db, chat, null);
    fresh.clock = arena.clock;
    fresh.fetch = arena.fetch;
    expect((await fresh.view("Dakar", null)).challenge.repo).toBe(REPO);
    const [old] = await db.select().from(arenaChallenges).where(eq(arenaChallenges.id, "Dakar:2026-10-05"));
    expect(old.repo).toBe("https://github.com/Djbrl/la-coloc");
  });
});
