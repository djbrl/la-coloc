// The Arena: a stadium in every city, a challenge there every week, and titles for the winners (docs/arena.md is
// the contract with the web). This holds every rule: which challenge a city has this week, who joined, the pull
// requests sent and what they're worth, the podium, the titles people wear, and the arena's own chat room.
//
// No cron: a city's week is made the first time anyone asks for it, and that's also when the weeks before it are
// closed and awarded. Both are safe to race: the week's row is inserted "on conflict do nothing" (its id is
// "<City>:<weekStart>"), and only the one request that flips a challenge's closed_at awards it.
//
// Points come from GitHub: asked when someone sends a pull request (and again, lazily, when they look at their own
// open ones), and told by GitHub's webhooks for the arena repo (`handle`, called by the GitHub controller).
//
// Live updates: anything that changes what an arena shows pings the city's stream with what: "arena" (the same
// Subject as the city chat, chat.service.ts); the page then fetches the arena again.
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { arenaAwards, arenaChallenges, arenaEntries, arenaSubmissions, type Badge, type Db, users } from "@coloc/db";
import { and, asc, count, eq, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { DB } from "../db/db.module";
import { channelMessages, person } from "../doorbell/queries";
import { GITHUB_CLIENT, type GhEvent } from "../github/chores.service";
import type { GithubAppClient } from "../github/github.client";
import type { MessageView, PersonView } from "../houses/house.types";
import { arenaChannel, CITY_HISTORY } from "../chat/channels";
import { ChatService } from "../chat/chat.service";
import { Limiter } from "../chat/limiter";
import { CreditService } from "../credit/credit.service";
import { awardOf, badgeOf, wear } from "./badges";
import { closeWeek, standings } from "./podium";
import { catalogueEntry, type PointsRow, type Text } from "./catalogue";
import { arenaJudges, type ArenaRepo, arenaRepo, fetchPull, folderIsOpen, GithubDown, isAuthor, parsePrUrl, type PullFacts, readPull, scoreOf } from "./scoring";
import { challengeId, entryFor, isoDate, WEEK_MS, weekStartOf } from "./weeks";

type UserRow = typeof users.$inferSelect;
type ChallengeRow = typeof arenaChallenges.$inferSelect;
type SubmissionRow = typeof arenaSubmissions.$inferSelect;

// Pull requests a person may send in an hour (a brake on asking GitHub, not a rule of the game).
export const SUBMISSIONS = { count: 5, perMs: 3_600_000 };
// The viewer's own open pull requests are asked about again when they look, at most this often.
export const RECHECK_MS = 5 * 60_000;
// How many people the leaderboard shows.
export const LEADERBOARD = 10;
// The labels a judge may write in a comment to grade a pull request (arena/catalogue.ts gives their points).
const JUDGED = /^arena:(low|medium|high|critical|entry)$/;

/** The arena label a judge's comment names, if any ("LGTM arena:critical" → "arena:critical"). The last one wins. */
export function judgedLabel(body: string): string | null {
  const all = [...body.toLowerCase().matchAll(/(?:^|[^\w:-])(arena:(?:low|medium|high|critical|entry))(?![\w-])/g)];
  return all.length ? all[all.length - 1][1] : null;
}

// PR actions that can change what a submission is worth.
const PR_ACTIONS = new Set(["opened", "reopened", "closed", "edited", "labeled", "unlabeled", "synchronize", "ready_for_review"]);

export interface ArenaSubmissionView {
  id: string;
  url: string;
  number: number;
  title: string | null;
  state: "open" | "merged" | "closed";
  points: number;
}

export interface ArenaView {
  city: string;
  challenge: {
    id: string;
    slug: string;
    kind: "bounty" | "hackathon" | "challenge";
    title: Text;
    summary: Text;
    rules: { en: string[]; fr: string[] };
    repo: string;
    path: string;
    startsAt: string;
    endsAt: string;
    prizeFcfa: number;
    // Whether anyone can open the challenge's folder (public repo, folder pushed); null: GitHub couldn't say.
    open: boolean | null;
    award: { key: string; title: Text };
    points: PointsRow[];
  };
  entrants: number;
  joined: boolean;
  mine: ArenaSubmissionView[];
  leaderboard: { person: PersonView; points: number; prs: number }[];
  champion: { person: PersonView; badge: Badge } | null;
}

@Injectable()
export class ArenaService {
  private readonly log = new Logger("arena");
  readonly repo: ArenaRepo = arenaRepo();
  readonly submitBrake = new Limiter(SUBMISSIONS.count, SUBMISSIONS.perMs);
  readonly judges = arenaJudges();
  // Tests move time and answer for GitHub.
  clock = () => new Date();
  fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);
  // "<City>:<weekStart>" of the weeks whose past has already been closed by this process: saves a query per look.
  private settled = new Set<string>();
  // Whether each challenge folder opens for anyone (folderIsOpen), for ten minutes; and pull requests GitHub just
  // described, for two: GitHub's public API allows 60 calls an hour, and the panel is opened often.
  private openFolders = new Map<string, { open: boolean | null; until: number }>();
  private pulls = new Map<string, { facts: PullFacts | null; until: number }>();

  private readonly credit: CreditService;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly chat: ChatService,
    // Null when the GitHub App isn't configured: GitHub's public API is asked instead.
    @Inject(GITHUB_CLIENT) private readonly github: GithubAppClient | null,
  ) {
    this.credit = new CreditService(db);
  }

  // ---- The week ----

  /**
   * The city's challenge this week, made if nobody has asked yet. Before answering, every past week of the city
   * still open is closed and its podium awarded (usually just last week, the first time anyone looks this week).
   */
  async current(city: string): Promise<ChallengeRow> {
    await this.chat.mustBeCity(city);
    const start = weekStartOf(this.clock());
    const week = isoDate(start);
    const id = challengeId(city, week);
    let [row] = await this.db.select().from(arenaChallenges).where(eq(arenaChallenges.id, id));
    if (!row) {
      const entry = entryFor(city, start);
      [row] = await this.db
        .insert(arenaChallenges)
        .values({
          id,
          city,
          weekStart: week,
          startsAt: start,
          endsAt: new Date(start.getTime() + WEEK_MS),
          slug: entry.slug,
          kind: entry.kind,
          repo: this.repo.url,
          path: entry.path,
          prizeFcfa: entry.prizeFcfa,
        })
        .onConflictDoNothing()
        .returning();
      // Someone else made it a moment ago: theirs is the week.
      if (!row) [row] = await this.db.select().from(arenaChallenges).where(eq(arenaChallenges.id, id));
      this.changed(city);
    }
    // The arena repo moved (COLOC_ARENA_REPO, or its default): a week still open follows it, a closed one keeps the
    // repo it was played in.
    if (!row.closedAt && row.repo !== this.repo.url) {
      [row] = await this.db.update(arenaChallenges).set({ repo: this.repo.url }).where(eq(arenaChallenges.id, id)).returning();
      this.changed(city);
    }
    if (!this.settled.has(id)) {
      const past = await this.db
        .select({ id: arenaChallenges.id })
        .from(arenaChallenges)
        .where(and(eq(arenaChallenges.city, city), isNull(arenaChallenges.closedAt), lte(arenaChallenges.endsAt, this.clock())));
      for (const p of past) await this.closeAndAward(p.id);
      this.settled.add(id);
    }
    return row;
  }

  /**
   * Closes a finished challenge and awards its podium: 1st place the challenge's title, 2nd and 3rd a podium badge.
   * Most points first; a tie goes to whoever scored their last points earlier. Nobody with 0 points is awarded.
   * Only the call that closes it awards, so calling it twice (or twice at once) awards once. Returns the awards made.
   */
  async closeAndAward(id: string): Promise<(typeof arenaAwards.$inferSelect)[]> {
    await this.lastLook(id);
    const result = await this.db.transaction(async (tx) => {
      const closed = await closeWeek(tx, id, this.clock());
      // 1st place's prize goes to their credit, with the title.
      const first = closed?.awards.find((a) => a.place === 1);
      if (first && closed!.prizeFcfa > 0) await this.credit.earn(first.userId, closed!.prizeFcfa, "arena", `arena:${first.id}`, tx);
      return closed;
    });
    if (!result) return [];
    this.changed(result.city);
    if (result.awards.length) this.log.log(`${id}: awarded ${result.awards.length} title${result.awards.length === 1 ? "" : "s"}`);
    return result.awards;
  }

  /** Whether the challenge's folder opens for anyone (repo public, folder pushed), remembered for ten minutes. */
  private async folderOpen(repoUrl: string, path: string): Promise<boolean | null> {
    const key = `${repoUrl}#${path}`;
    const known = this.openFolders.get(key);
    if (known && known.until > Date.now()) return known.open;
    const fullName = repoUrl.replace(/^https:\/\/github\.com\//, "");
    const open = await folderIsOpen(fullName, path, this.fetch);
    // Not knowing (GitHub slow, or refusing us) waits as long: asking sooner would only spend the allowance.
    this.openFolders.set(key, { open, until: Date.now() + 600_000 });
    return open;
  }

  // ---- What the arena shows ----

  /** The arena as anyone sees it; with a viewer, also whether they joined and their pull requests. */
  async view(city: string, viewerId: string | null): Promise<ArenaView> {
    const c = await this.current(city);
    if (viewerId) await this.recheckMine(c, viewerId);
    const entry = catalogueEntry(c.slug, c.kind);
    const [{ entrants }] = await this.db.select({ entrants: count() }).from(arenaEntries).where(eq(arenaEntries.challengeId, c.id));
    const joined = viewerId ? (await this.db.select().from(arenaEntries).where(and(eq(arenaEntries.challengeId, c.id), eq(arenaEntries.userId, viewerId)))).length > 0 : false;
    const mine = viewerId
      ? await this.db
          .select()
          .from(arenaSubmissions)
          .where(and(eq(arenaSubmissions.challengeId, c.id), eq(arenaSubmissions.userId, viewerId)))
          .orderBy(asc(arenaSubmissions.createdAt))
      : [];
    const board = await standings(this.db, c.id, LEADERBOARD);
    const lastWeek = challengeId(c.city, isoDate(new Date(c.startsAt.getTime() - WEEK_MS)));
    const [champ] = await this.db
      .select({ award: arenaAwards, user: users })
      .from(arenaAwards)
      .innerJoin(users, eq(users.id, arenaAwards.userId))
      .where(and(eq(arenaAwards.challengeId, lastWeek), eq(arenaAwards.place, 1)));
    return {
      city: c.city,
      challenge: {
        id: c.id,
        slug: c.slug,
        kind: c.kind,
        title: entry.title,
        summary: entry.summary,
        rules: entry.rules,
        repo: c.repo,
        path: c.path,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        prizeFcfa: c.prizeFcfa,
        open: await this.folderOpen(c.repo, c.path),
        award: entry.award,
        points: entry.points,
      },
      entrants,
      joined,
      mine: mine.map(submissionView),
      leaderboard: board.map((s) => ({ person: person(s.user), points: s.points, prs: s.prs })),
      champion: champ ? { person: person(champ.user), badge: badgeOf(champ.award) } : null,
    };
  }

  // ---- Taking part ----

  async join(city: string, userId: string): Promise<ArenaView> {
    const c = await this.current(city);
    await this.enter(c, userId);
    return this.view(city, userId);
  }

  /**
   * Sends a pull request for this week's challenge (joining it if need be). Checked with GitHub: the arena repo,
   * opened by you, after the week started. The same pull request counts once per challenge.
   */
  async submit(city: string, user: UserRow, url: string): Promise<ArenaView> {
    const c = await this.current(city);
    // Without a GitHub account, nothing proves a pull request is yours (dev logins, the seeded people).
    if (user.githubId === null) throw new ForbiddenException({ message: "Log in with GitHub to send pull requests: that's how we know they're yours.", code: "arenaGithubNeeded" });
    const pr = parsePrUrl(url);
    if (!pr) throw new BadRequestException({ message: "Paste the address of a pull request, like https://github.com/owner/repo/pull/12.", code: "arenaBadUrl" });
    if (pr.repo !== this.repo.fullName) throw new BadRequestException({ message: `Send it to the arena's repo, ${this.repo.url}.`, code: "arenaWrongRepo", repo: this.repo.url });
    if (await this.submitted(c.id, pr.repo, pr.number)) throw alreadySubmitted();
    // Checked before GitHub is asked, so the brake protects our GitHub allowance.
    if (!this.submitBrake.take(user.id)) throw new HttpException({ message: "That's a lot of pull requests for one hour. Try again later.", code: "slowDownArena" }, HttpStatus.TOO_MANY_REQUESTS);
    const facts = await this.ask(pr.repo, pr.number);
    if (!facts) throw new NotFoundException({ message: "GitHub has no such pull request. Check the address.", code: "arenaPrNotFound" });
    if (!isAuthor(user, facts)) throw new ForbiddenException({ message: "That pull request was opened by someone else. Send one of yours.", code: "arenaNotYourPr" });
    if (facts.createdAt < c.startsAt) throw new BadRequestException({ message: "That pull request was opened before this week's challenge began. Open a new one.", code: "arenaPrTooOld" });

    await this.enter(c, user.id);
    const score = scoreOf(c.slug, c.kind, facts);
    const [made] = await this.db
      .insert(arenaSubmissions)
      .values({
        challengeId: c.id,
        userId: user.id,
        url: facts.url,
        repo: pr.repo,
        number: pr.number,
        title: facts.title,
        state: facts.state,
        points: score.points,
        label: score.label,
        scoredAt: score.points > 0 ? (facts.mergedAt ?? this.clock()) : null,
        checkedAt: this.clock(),
      })
      .onConflictDoNothing()
      .returning();
    if (!made) throw alreadySubmitted();
    this.changed(city);
    return this.view(city, user.id);
  }

  /** Takes back one of your pull requests from this week's challenge. */
  async withdraw(city: string, userId: string, submissionId: string): Promise<ArenaView> {
    const c = await this.current(city);
    const gone = /^[0-9a-f-]{36}$/i.test(submissionId)
      ? await this.db
          .delete(arenaSubmissions)
          .where(and(eq(arenaSubmissions.id, submissionId), eq(arenaSubmissions.userId, userId), eq(arenaSubmissions.challengeId, c.id)))
          .returning()
      : [];
    if (!gone.length) throw new NotFoundException({ message: "You have no such pull request in this week's challenge.", code: "arenaNoSubmission" });
    this.changed(city);
    return this.view(city, userId);
  }

  // ---- The arena's chat room ----

  /** The arena's room: same rules as the city's (anyone reads; what people you blocked said is left out). */
  async messages(city: string, viewerId: string | null): Promise<{ messages: MessageView[] }> {
    await this.chat.mustBeCity(city);
    return { messages: await channelMessages(this.db, arenaChannel(city), CITY_HISTORY, viewerId) };
  }

  /** Says something in the arena's room: logged in, the same length and the same brake as the city's room. */
  async say(city: string, userId: string, body: string): Promise<{ id: string }> {
    await this.chat.mustBeCity(city);
    const id = await this.chat.write(arenaChannel(city), userId, body);
    // Only the room: the panel's challenge and leaderboard don't need fetching again for a message.
    this.chat.changes.next({ city, what: "arenaChat" });
    return { id };
  }

  // ---- Titles ----

  /** Wears one of your titles, or none (null). */
  async wearBadge(userId: string, awardId: string | null): Promise<{ badge: Badge | null }> {
    if (awardId === null) return { badge: await wear(this.db, userId, null) };
    const award = await awardOf(this.db, userId, awardId);
    if (!award) throw new NotFoundException({ message: "That isn't one of your titles.", code: "arenaNoAward" });
    return { badge: await wear(this.db, userId, award) };
  }

  // ---- GitHub's webhooks ----

  /**
   * A pull_request event on the arena repo: updates the submissions for that pull request (state, title, points
   * while their challenge is open), and sends it for its author in every challenge they joined this week, if they
   * haven't yet. Anything else is "ignored". The controller has already checked GitHub's signature.
   */
  async handle(event: string, payload: GhEvent): Promise<string> {
    if (event === "issue_comment") return this.judgeSays(payload);
    if (event !== "pull_request" || !PR_ACTIONS.has(payload.action ?? "")) return "ignored";
    if (payload.repository?.full_name.toLowerCase() !== this.repo.fullName) return "ignored";
    const facts = payload.pull_request ? readPull(payload.pull_request) : null;
    if (!facts) return "ignored";
    const cities = new Set<string>();

    const existing = await this.db
      .select({ s: arenaSubmissions, c: arenaChallenges })
      .from(arenaSubmissions)
      .innerJoin(arenaChallenges, eq(arenaChallenges.id, arenaSubmissions.challengeId))
      .where(and(eq(arenaSubmissions.repo, this.repo.fullName), eq(arenaSubmissions.number, facts.number)));
    for (const { s, c } of existing) {
      await this.apply(s, c, facts);
      cities.add(c.city);
    }

    let added = 0;
    if (facts.state !== "closed") {
      const author = await this.authorOf(facts);
      const week = isoDate(weekStartOf(this.clock()));
      const joinedThisWeek = author
        ? await this.db
            .select({ c: arenaChallenges })
            .from(arenaEntries)
            .innerJoin(arenaChallenges, eq(arenaChallenges.id, arenaEntries.challengeId))
            .where(and(eq(arenaEntries.userId, author.id), eq(arenaChallenges.weekStart, week), isNull(arenaChallenges.closedAt)))
        : [];
      for (const { c } of joinedThisWeek) {
        if (existing.some((e) => e.c.id === c.id) || facts.createdAt < c.startsAt) continue;
        const score = scoreOf(c.slug, c.kind, facts);
        const [made] = await this.db
          .insert(arenaSubmissions)
          .values({
            challengeId: c.id,
            userId: author!.id,
            url: facts.url,
            repo: this.repo.fullName,
            number: facts.number,
            title: facts.title,
            state: facts.state,
            points: score.points,
            label: score.label,
            scoredAt: score.points > 0 ? (facts.mergedAt ?? this.clock()) : null,
            checkedAt: this.clock(),
          })
          .onConflictDoNothing()
          .returning();
        if (made) {
          added++;
          cities.add(c.city);
        }
      }
    }

    for (const city of cities) this.changed(city);
    if (!existing.length && !added) return "ignored";
    return `arena: #${facts.number} updated ${existing.length}, added ${added}`;
  }

  /**
   * A judge's comment on an arena pull request that names a label ("LGTM arena:critical") puts that label on it, as if
   * they had added it by hand: judges kept writing the grade in a comment and wondering where the points went. The
   * label then comes back as a pull_request.labeled event, which scores it like any other. Other arena labels come
   * off, so a judge can change their mind (the score takes the highest label there is).
   */
  private async judgeSays(payload: GhEvent): Promise<string> {
    if (payload.action !== "created" && payload.action !== "edited") return "ignored";
    if (payload.repository?.full_name.toLowerCase() !== this.repo.fullName || !payload.issue?.pull_request) return "ignored";
    if (!payload.comment || !this.judges.has(payload.comment.user.login.toLowerCase())) return "ignored";
    const label = judgedLabel(payload.comment.body);
    if (!label || !this.github || !payload.installation) return "ignored";
    const others = (payload.issue.labels ?? []).map((l) => l.name).filter((n) => n !== label && JUDGED.test(n));
    await this.github.relabel(payload.installation.id, payload.repository.full_name, payload.issue.number, label, others);
    return `arena: #${payload.issue.number} labelled ${label} by ${payload.comment.user.login}`;
  }

  // ---- Inside ----

  private async enter(c: ChallengeRow, userId: string) {
    const [u] = await this.db.select({ login: users.login }).from(users).where(eq(users.id, userId));
    if (u && this.judges.has(u.login.toLowerCase())) {
      throw new ForbiddenException({ message: "You judge the Arena (you merge and label its pull requests), so you can't take part.", code: "arenaJudge" });
    }
    // One arena a week: a pull request then counts in one city, and nobody collects every podium with it.
    const [elsewhere] = await this.db
      .select({ city: arenaChallenges.city })
      .from(arenaEntries)
      .innerJoin(arenaChallenges, eq(arenaChallenges.id, arenaEntries.challengeId))
      .where(and(eq(arenaEntries.userId, userId), eq(arenaChallenges.weekStart, c.weekStart), ne(arenaChallenges.city, c.city)))
      .limit(1);
    if (elsewhere) {
      throw new ConflictException({ message: `You're in ${elsewhere.city}'s arena this week: one arena a week.`, code: "arenaOtherCity", city: elsewhere.city });
    }
    const [made] = await this.db.insert(arenaEntries).values({ challengeId: c.id, userId }).onConflictDoNothing().returning();
    if (made) this.changed(c.city);
  }

  private async submitted(id: string, repo: string, number: number): Promise<boolean> {
    const [s] = await this.db
      .select({ id: arenaSubmissions.id })
      .from(arenaSubmissions)
      .where(and(eq(arenaSubmissions.challengeId, id), eq(arenaSubmissions.repo, repo), eq(arenaSubmissions.number, number)));
    return !!s;
  }

  /** GitHub's facts about a pull request for a look at the panel: what we asked under two minutes ago, else GitHub. */
  private async pullFresh(repo: string, number: number): Promise<PullFacts | null> {
    const key = `${repo}#${number}`;
    const now = this.clock().getTime();
    const known = this.pulls.get(key);
    if (known && known.until > now) return known.facts;
    const facts = await fetchPull(repo, number, { client: this.github, fetch: this.fetch });
    this.pulls.set(key, { facts, until: now + 120_000 });
    if (this.pulls.size > 2000) for (const [k, v] of this.pulls) if (v.until <= now) this.pulls.delete(k);
    return facts;
  }

  /**
   * Before a week closes, GitHub is asked once more about its pull requests still open (a few dozen at most), so a
   * merge on Sunday evening counts even if no webhook told us. Quietly: GitHub down means we close with what we know.
   */
  private async lastLook(id: string) {
    const [c] = await this.db.select().from(arenaChallenges).where(eq(arenaChallenges.id, id));
    if (!c || c.closedAt) return;
    const open = await this.db
      .select()
      .from(arenaSubmissions)
      .where(and(eq(arenaSubmissions.challengeId, id), eq(arenaSubmissions.state, "open")))
      .limit(30);
    // A few seconds at most: this runs inside the first look at the new week, someone is waiting for the page.
    const until = Date.now() + 6000;
    for (const s of open) {
      if (Date.now() > until) return;
      try {
        const facts = await fetchPull(s.repo, s.number, { client: this.github, fetch: this.fetch });
        if (facts) await this.apply(s, c, facts);
      } catch (e) {
        if (!(e instanceof GithubDown)) throw e;
        return;
      }
    }
  }

  /** GitHub's facts about a pull request, or null if there's none; a 503 with a code when GitHub is down. */
  private async ask(repo: string, number: number): Promise<PullFacts | null> {
    try {
      return await fetchPull(repo, number, { client: this.github, fetch: this.fetch });
    } catch (e) {
      if (!(e instanceof GithubDown)) throw e;
      this.log.warn(`couldn't ask GitHub about ${repo}#${number}: ${e.message}`);
      throw new ServiceUnavailableException({ message: "GitHub isn't answering. Try again in a minute.", code: "arenaGithubDown" });
    }
  }

  /** Writes what GitHub says about a pull request onto a submission. Points only move while its challenge is open. */
  private async apply(s: SubmissionRow, c: ChallengeRow, facts: PullFacts) {
    const open = c.closedAt === null;
    // A merge after the week's end scores nothing, even if we only hear of it while closing the week.
    const late = !!facts.mergedAt && facts.mergedAt.getTime() > c.endsAt.getTime();
    const score = late ? { points: 0, label: null } : scoreOf(c.slug, c.kind, facts);
    await this.db
      .update(arenaSubmissions)
      .set({
        title: facts.title,
        state: facts.state,
        checkedAt: this.clock(),
        // When it scored: when it was merged (GitHub says), else when we first saw it score.
        ...(open ? { points: score.points, label: score.label, scoredAt: score.points > 0 ? (facts.mergedAt ?? s.scoredAt ?? this.clock()) : null } : {}),
      })
      .where(eq(arenaSubmissions.id, s.id));
  }

  /**
   * Asks GitHub again about the viewer's own open pull requests in this week's challenge, if it's been a while.
   * Quietly: if GitHub is down, they see what we knew.
   */
  private async recheckMine(c: ChallengeRow, userId: string) {
    if (c.closedAt) return;
    const stale = await this.db
      .select()
      .from(arenaSubmissions)
      .where(
        and(
          eq(arenaSubmissions.challengeId, c.id),
          eq(arenaSubmissions.userId, userId),
          eq(arenaSubmissions.state, "open"),
          lt(arenaSubmissions.checkedAt, new Date(this.clock().getTime() - RECHECK_MS)),
        ),
      )
      .limit(2);
    let moved = false;
    for (const s of stale) {
      try {
        const facts = await this.pullFresh(s.repo, s.number);
        if (!facts) {
          // GitHub doesn't find it (a private repo, a deleted PR): not asked again for a while either.
          await this.db.update(arenaSubmissions).set({ checkedAt: this.clock() }).where(eq(arenaSubmissions.id, s.id));
          continue;
        }
        await this.apply(s, c, facts);
        moved ||= facts.state !== s.state || facts.title !== s.title;
      } catch (e) {
        if (!(e instanceof GithubDown)) throw e;
        break;
      }
    }
    if (moved) this.changed(c.city);
  }

  // The La Coloc person behind a pull request: by GitHub id, else by login (people who logged in with GitHub only).
  private async authorOf(facts: PullFacts): Promise<UserRow | null> {
    const [u] =
      facts.authorId !== null
        ? await this.db.select().from(users).where(eq(users.githubId, facts.authorId))
        : await this.db
            .select()
            .from(users)
            .where(and(sql`lower(${users.login}) = ${facts.authorLogin.toLowerCase()}`, isNotNull(users.githubId)));
    return u ?? null;
  }

  private changed(city: string) {
    this.chat.changes.next({ city, what: "arena" });
  }
}

function submissionView(s: SubmissionRow): ArenaSubmissionView {
  return { id: s.id, url: s.url, number: s.number, title: s.title, state: s.state, points: s.points };
}

function alreadySubmitted() {
  return new ConflictException({ message: "That pull request is already in this week's challenge.", code: "arenaAlreadySubmitted" });
}
