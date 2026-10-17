import { afterEach, describe, expect, it } from "vitest";
import { language } from "../../i18n";
import type { ArenaView, Badge } from "../../types";
import { arenaStage, badgeWords, checkPrUrl, cloneCommand, countdown, folderUrl, medal, prProblemText, repoName, submissionState, toDisplay } from "./arena";

afterEach(() => {
  language.lang = "en";
});

const NOW = Date.parse("2026-10-17T10:00:00Z");
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

const awa = { login: "awa", name: "Awa Diop", avatarUrl: null };
const eagle: Badge = { key: "eagle-eye", title: { en: "Eagle eye", fr: "Œil de lynx" }, place: 1, city: "Dakar", week: "2026-10-05" };

function view(over: Partial<ArenaView> = {}): ArenaView {
  return {
    city: "Dakar",
    challenge: {
      id: "c1",
      slug: "bug-bounty",
      kind: "bounty",
      title: { en: "Bug bounty week", fr: "Semaine de la chasse aux bugs" },
      summary: { en: "Find a security bug.", fr: "Trouvez une faille." },
      rules: { en: ["Be kind."], fr: ["Soyez sympa."] },
      repo: "https://github.com/Djbrl/la-coloc",
      path: "challenges/bug-bounty",
      startsAt: "2026-10-12T00:00:00Z",
      endsAt: "2026-10-19T00:00:00Z",
      prizeFcfa: 25000,
      award: { key: "eagle-eye", title: eagle.title },
      points: [{ label: "arena:high", points: 50 }],
    },
    entrants: 7,
    joined: false,
    mine: [],
    leaderboard: [],
    champion: { person: awa, badge: eagle },
    ...over,
  };
}

describe("the countdown", () => {
  it("says days and hours, then hours and minutes, then minutes and seconds", () => {
    expect(countdown(at(2 * 86400 + 4 * 3600 + 59), NOW)).toBe("2d 4h");
    expect(countdown(at(3 * 3600 + 12 * 60 + 30), NOW)).toBe("3h 12m");
    expect(countdown(at(12 * 60 + 5), NOW)).toBe("12m 05s");
    expect(countdown(at(45), NOW)).toBe("45s");
  });

  it("says it's over at the end and after", () => {
    expect(countdown(at(0), NOW)).toBe("Ended");
    expect(countdown(at(-60), NOW)).toBe("Ended");
    expect(countdown("not a date", NOW)).toBe("Ended");
  });

  it("writes French units with no-break spaces", () => {
    language.lang = "fr";
    expect(countdown(at(2 * 86400 + 4 * 3600), NOW)).toBe("2 j 4 h");
    expect(countdown(at(3 * 3600 + 12 * 60), NOW)).toBe("3 h 12 min");
    expect(countdown(at(65), NOW)).toBe("1 min 05 s");
    expect(countdown(at(-1), NOW)).toBe("Terminé");
  });
});

describe("the stadium's screen", () => {
  it("shows the challenge in English", () => {
    expect(toDisplay(view(), "en")).toEqual({ title: "Bug bounty week", kind: "bounty", endsAt: "2026-10-19T00:00:00Z", champion: "Awa Diop", entrants: 7 });
  });

  it("shows it in French", () => {
    expect(toDisplay(view(), "fr").title).toBe("Semaine de la chasse aux bugs");
  });

  it("follows the chosen language by default, and names a champion without a name by login", () => {
    language.lang = "fr";
    const d = toDisplay(view({ champion: { person: { login: "kofi", name: null, avatarUrl: null }, badge: eagle }, entrants: 0 }));
    expect(d.title).toBe("Semaine de la chasse aux bugs");
    expect(d.champion).toBe("kofi");
    expect(d.entrants).toBe(0);
  });

  it("has no champion in a city's first week", () => {
    expect(toDisplay(view({ champion: null })).champion).toBeNull();
  });
});

describe("a badge", () => {
  it("is gold, silver or bronze by place", () => {
    expect(medal(1)).toBe("gold");
    expect(medal(2)).toBe("silver");
    expect(medal(3)).toBe("bronze");
  });

  it("says its title, and its whole story to a reader", () => {
    expect(badgeWords(eagle)).toEqual({ text: "Eagle eye", name: "Eagle eye, 1st place, Dakar, week of 5 October", medal: "gold" });
    const podium: Badge = { ...eagle, key: "podium", title: { en: "Podium · Eagle eye", fr: "Podium · Œil de lynx" }, place: 3 };
    expect(badgeWords(podium).medal).toBe("bronze");
  });

  it("speaks French", () => {
    language.lang = "fr";
    expect(badgeWords(eagle)).toEqual({ text: "Œil de lynx", name: "Œil de lynx, 1re place, Dakar, semaine du 5 octobre", medal: "gold" });
    expect(badgeWords({ ...eagle, place: 2 }).name).toContain("2e place");
  });
});

describe("a pull request's address", () => {
  const repo = "https://github.com/Djbrl/la-coloc";

  it("takes a pull request on github.com, with or without a page after it", () => {
    expect(checkPrUrl("https://github.com/Djbrl/la-coloc/pull/12")).toBeNull();
    expect(checkPrUrl("  https://github.com/Djbrl/la-coloc/pull/12/files  ")).toBeNull();
    expect(checkPrUrl("https://github.com/djbrl/LA-COLOC/pull/3#issuecomment-1", repo)).toBeNull();
  });

  it("asks for one when nothing was pasted", () => {
    expect(checkPrUrl("   ")).toBe("empty");
  });

  it("refuses anything that isn't a pull request on github.com", () => {
    for (const url of [
      "github.com/Djbrl/la-coloc/pull/12",
      "http://github.com/Djbrl/la-coloc/pull/12",
      "https://github.com/Djbrl/la-coloc/issues/12",
      "https://github.com/Djbrl/la-coloc/pull/",
      "https://github.com/Djbrl/la-coloc/pull/0",
      "https://gitlab.com/Djbrl/la-coloc/pull/12",
      "https://github.com.evil.example/Djbrl/la-coloc/pull/12",
      "https://github.com/Djbrl/la-coloc/pull/12abc",
      "javascript:alert(1)",
    ])
      expect(checkPrUrl(url), url).toBe("notPull");
  });

  it("refuses one on another repo than the challenge's", () => {
    expect(checkPrUrl("https://github.com/awa/portfolio/pull/2", repo)).toBe("wrongRepo");
    expect(prProblemText("wrongRepo", repo)).toBe("Open it on Djbrl/la-coloc: that's where the challenge lives.");
  });
});

describe("the repo", () => {
  it("is named owner/name, cloned and opened at the challenge's folder", () => {
    expect(repoName("https://github.com/Djbrl/la-coloc")).toBe("Djbrl/la-coloc");
    expect(repoName("https://github.com/Djbrl/la-coloc.git")).toBe("Djbrl/la-coloc");
    expect(cloneCommand("https://github.com/Djbrl/la-coloc", "challenges/bug-bounty")).toBe("git clone https://github.com/Djbrl/la-coloc && cd la-coloc/challenges/bug-bounty");
    expect(cloneCommand("https://github.com/Djbrl/la-coloc", "")).toBe("git clone https://github.com/Djbrl/la-coloc && cd la-coloc");
    // With a GitHub login: their fork, which is what they push to.
    expect(cloneCommand("https://github.com/Djbrl/la-coloc", "challenges/bug-bounty", "fatou")).toBe("git clone https://github.com/fatou/la-coloc && cd la-coloc/challenges/bug-bounty");
    expect(folderUrl("https://github.com/Djbrl/la-coloc/", "/challenges/bug-bounty/")).toBe("https://github.com/Djbrl/la-coloc/tree/HEAD/challenges/bug-bounty");
  });
});

describe("what the challenge tab offers", () => {
  const before = Date.parse("2026-10-15T00:00:00Z");
  it("asks a visitor to log in", () => {
    expect(arenaStage(view(), null, before)).toBe("login");
  });
  it("offers to join to someone who hasn't", () => {
    expect(arenaStage(view(), { login: "fatou" }, before)).toBe("join");
  });
  it("takes pull requests from someone who joined", () => {
    expect(arenaStage(view({ joined: true }), { login: "fatou" }, before)).toBe("joined");
  });
  it("offers nothing once the week is over", () => {
    expect(arenaStage(view({ joined: true }), { login: "fatou" }, Date.parse("2026-10-20T00:00:00Z"))).toBe("over");
  });
  it("says each submission's state", () => {
    expect(submissionState("open")).toEqual({ word: "Waiting", tone: "warn" });
    expect(submissionState("merged")).toEqual({ word: "Merged", tone: "live" });
    language.lang = "fr";
    expect(submissionState("closed")).toEqual({ word: "Fermée", tone: "neutral" });
  });
});

describe("a challenge whose repo nobody can open", () => {
  it("can't be joined: there's nothing to clone", async () => {
    const { arenaStage } = await import("./arena");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const base = { joined: false, challenge: { endsAt: future, open: false } } as never;
    expect(arenaStage(base, { login: "fatou" })).toBe("soon");
    expect(arenaStage({ joined: false, challenge: { endsAt: future, open: null } } as never, { login: "fatou" })).toBe("join");
  });
});
