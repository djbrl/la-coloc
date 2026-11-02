// The quest's step machine, driven with plain events: the order of the steps and chapters, what each one waits for,
// the stamps, picking up where you left it, and the launch's stages. Then the walkthrough and the share helpers.
import { describe, expect, it } from "vitest";
import type { TutorialState } from "../../../types";
import { opensAnywhere, qrPath, whatsappLink } from "./share";
import { keyParts, TOUR_TEXT } from "./tour";
import { type Action, CHAPTER_OF, CHAPTERS, HOUSE_CARDS, resumeStep, SETUP, stageOf, STEPS, TUTORIAL_HOUSE, TutorialMachine } from "./tutorial";

// What GET /api/tutorial says: a room (or not), GitHub linked (or not), the furthest chapter reached.
function state(room: { status: string } | null, opts: { linked?: boolean; chapter?: string | null } = {}): TutorialState {
  return {
    house: { id: TUTORIAL_HOUSE, name: "L'Atelier", city: "Dakar", agentOnline: true },
    room: room ? { name: "jib", status: room.status, url: room.status === "live" ? "http://jib.atelier.coloc.localhost:8000" : null } : null,
    sample: { repo: "sample", path: "." },
    github: { installUrl: "https://github.com/apps/la-coloc-dev/installations/new", linked: !!opts.linked, repo: opts.linked ? "jib/portfolio" : null },
    done: false,
    chapter: opts.chapter ?? null,
  };
}

const act = (m: TutorialMachine, ...names: Action[]) => names.forEach((name) => m.send({ type: "action", name }));
const said = (m: TutorialMachine, status: string | null, opts: { linked?: boolean; chapter?: string | null } = {}) =>
  m.send({ type: "state", state: state(status ? { status } : null, opts) });

// Plays the quest up to (not through) a step, the shortest way.
function playTo(m: TutorialMachine, until: string) {
  const moves: Record<string, () => void> = {
    welcome: () => m.send({ type: "start" }),
    intro: () => m.tourCards.forEach(() => m.send({ type: "next" })),
    walk: () => act(m, "walk-up"),
    look: () => m.send({ type: "shown" }),
    go: () => m.send({ type: "inside", houseId: TUTORIAL_HOUSE }),
    room: () => said(m, "empty"),
    keys: () => m.send({ type: "next" }),
    project: () => m.send({ type: "deploy" }),
    launch: () => {
      said(m, "building");
      said(m, "live");
      m.send({ type: "next" });
    },
    open: () => m.send({ type: "opened" }),
    share: () => m.send({ type: "shared" }),
    house: () => HOUSE_CARDS.forEach(() => m.send({ type: "next" })),
    // "Into the city": marked done, then the city.
    home: () => m.send({ type: "city" }),
    city: () => m.send({ type: "end" }),
  };
  while (m.step !== until) moves[m.step]();
}

describe("the quest", () => {
  it("goes through every step in order, from the welcome to the city", () => {
    const m = new TutorialMachine();
    m.start();
    const seen = [m.step];
    for (const step of STEPS.slice(1)) {
      playTo(m, step);
      seen.push(m.step);
    }
    expect(seen).toEqual(STEPS);
    m.send({ type: "skip" });
    expect(m.active).toBe(false);
  });

  it("has eight chapters, each with at least one step, in order", () => {
    expect(CHAPTERS).toHaveLength(8);
    const order = STEPS.map((s) => CHAPTER_OF[s]).filter((c) => c !== null);
    expect([...new Set(order)]).toEqual(CHAPTERS);
  });

  it("stamps each chapter as you leave it, and all eight on Well done", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "look");
    expect(m.stamps).toEqual(["arrive"]);
    playTo(m, "keys");
    expect(m.stamps).toEqual(["arrive", "find"]);
    playTo(m, "share");
    expect(m.stamps).toEqual(["arrive", "find", "keys", "project", "launch", "open"]);
    playTo(m, "home");
    expect(m.stamps).toEqual(CHAPTERS);
  });

  it("teaches walking: any walk moves on, a dash or a turn doesn't", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "walk");
    act(m, "dash", "turn-left");
    expect(m.step).toBe("walk");
    act(m, "walk-left");
    expect(m.step).toBe("look");
  });

  it("counts a click or a tap on the ground as walking", () => {
    const m = new TutorialMachine({ touch: true });
    m.start();
    playTo(m, "walk");
    m.send({ type: "moved" });
    expect(m.step).toBe("look");
    m.send({ type: "shown" });
    expect(m.step).toBe("go");
  });

  it("ignores events meant for other steps", () => {
    const m = new TutorialMachine();
    m.start();
    act(m, "walk-up", "walk-left", "walk-down", "walk-right");
    m.send({ type: "inside", houseId: TUTORIAL_HOUSE });
    m.send({ type: "opened" });
    expect(m.step).toBe("welcome");
  });

  it("puts the beacon at the door only while you look for the house", () => {
    expect(STEPS.filter((s) => SETUP[s].beacon)).toEqual(["look", "go"]);
  });

  it("goes back out on the street when the window closes before the room is taken", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "room");
    m.send({ type: "inside", houseId: "sacre-coeur" });
    expect(m.step).toBe("room");
    m.send({ type: "inside", houseId: null });
    expect(m.step).toBe("go");
  });

  it("hands over the keys as soon as the API says the room is yours", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "room");
    said(m, null);
    expect(m.step).toBe("room");
    said(m, "empty");
    expect(m.step).toBe("keys");
    m.send({ type: "next" });
    expect(m.step).toBe("project");
  });

  it("skips finding the house when a room from an earlier try is already yours", () => {
    const m = new TutorialMachine();
    m.start();
    said(m, "empty");
    playTo(m, "look");
    m.send({ type: "shown" });
    expect(m.step).toBe("keys");
  });

  describe("bringing a project", () => {
    it("waits for GitHub after the install page opened, and says when the repo is linked", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "project");
      expect(m.github).toBe("none");
      m.send({ type: "github" });
      expect(m.github).toBe("waiting");
      said(m, "empty");
      expect(m.github).toBe("waiting");
      said(m, "empty", { linked: true });
      expect(m.github).toBe("linked");
      expect(m.step).toBe("project");
    });

    it("goes back to the choice without guilt", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "project");
      m.send({ type: "github" });
      m.send({ type: "back" });
      expect(m.github).toBe("none");
    });

    it("starts the launch once a deploy is accepted", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "project");
      m.send({ type: "deploy" });
      expect(m.step).toBe("launch");
      expect(m.pressed).toBe(true);
    });
  });

  describe("a launch that stopped", () => {
    it("goes back to picking a project, and forgets that on the next step", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "launch");
      m.send({ type: "back" });
      expect(m.step).toBe("project");
      expect(m.repick).toBe(true);
      m.send({ type: "deploy" });
      expect(m.step).toBe("launch");
      expect(m.repick).toBe(false);
    });
  });

  describe("the launch", () => {
    it("celebrates when it goes live, then moves on to the address", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "launch");
      m.send({ type: "next" });
      expect(m.step).toBe("launch");
      said(m, "cloning");
      said(m, "building");
      expect(m.launched).toBe(false);
      said(m, "live");
      expect(m.launched).toBe(true);
      m.send({ type: "next" });
      expect(m.step).toBe("open");
    });

    it("doesn't take the old version's 'live' for the new one", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "project");
      // Already live (the starter), now launching a repo over it.
      said(m, "live");
      m.send({ type: "deploy" });
      said(m, "live");
      expect(m.launched).toBe(false);
      said(m, "building");
      said(m, "live");
      expect(m.launched).toBe(true);
    });

    it("stays on a failed build, and a retry starts the show over", () => {
      const m = new TutorialMachine();
      m.start();
      playTo(m, "launch");
      said(m, "building");
      said(m, "failed");
      expect(m.step).toBe("launch");
      expect(m.launched).toBe(false);
      m.send({ type: "deploy" });
      expect(m.pressed).toBe(true);
      said(m, "building");
      said(m, "live");
      expect(m.launched).toBe(true);
    });
  });

  it("moves on from the address only once the live room was opened", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "open");
    m.send({ type: "next" });
    expect(m.step).toBe("open");
    m.send({ type: "opened" });
    expect(m.step).toBe("share");
  });

  it("moves on from sharing when it's shared, or later", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "share");
    m.send({ type: "skip" });
    expect(m.step).toBe("house");
  });

  it("shows the house one card at a time, then Well done", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "house");
    expect(m.card).toBe(0);
    m.send({ type: "next" });
    expect(m.card).toBe(1);
    m.send({ type: "next" });
    expect(m.card).toBe(2);
    m.send({ type: "next" });
    expect(m.step).toBe("home");
  });

  it("leaves for the city from anywhere", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "go");
    m.send({ type: "city" });
    expect(m.step).toBe("city");
  });

  it("starts with nothing on screen and ends with everything", () => {
    expect(SETUP.welcome.reveal).toEqual([]);
    expect(SETUP.welcome.controls.walk).toBe(false);
    expect(SETUP.walk.reveal).toEqual(["keys"]);
    expect(SETUP.look.reveal).toEqual(["quest", "keys"]);
    expect(SETUP.go.reveal).toContain("map");
    expect(SETUP.go.reveal).not.toContain("chrome");
    expect(SETUP.keys.controls.walk).toBe(false);
    expect(SETUP.city.reveal).toContain("chrome");
    expect(SETUP.city.reveal).toContain("map");
    expect(SETUP.city.reveal).not.toContain("quest");
    // "open" only waits for a click: the launch already saw the page live.
    expect(STEPS.filter((s) => SETUP[s].poll)).toEqual(["room", "project", "launch"]);
  });

  describe("picking up where you left it", () => {
    it("offers to continue only past the first chapter", () => {
      const m = new TutorialMachine();
      m.start();
      expect(m.canResume).toBe(false);
      said(m, null, { chapter: "arrive" });
      expect(m.canResume).toBe(false);
      said(m, null, { chapter: "find" });
      expect(m.canResume).toBe(true);
      said(m, null, { chapter: "not-a-chapter" });
      expect(m.canResume).toBe(false);
    });

    it("jumps to the chapter reached, with the earlier ones stamped", () => {
      const m = new TutorialMachine();
      m.start();
      said(m, "live", { chapter: "share" });
      m.send({ type: "start", resume: true });
      expect(m.step).toBe("share");
      expect(m.stamps).toEqual(["arrive", "find", "keys", "project", "launch", "open"]);
    });

    it("starts a chapter over from what it needs when that's gone", () => {
      expect(resumeStep("share", state(null))).toBe("go");
      expect(resumeStep("share", state({ status: "failed" }))).toBe("project");
      expect(resumeStep("launch", state({ status: "building" }))).toBe("launch");
      expect(resumeStep("launch", state({ status: "live" }))).toBe("open");
      expect(resumeStep("keys", state({ status: "empty" }))).toBe("keys");
      expect(resumeStep("find", state(null))).toBe("go");
      expect(resumeStep(null, null)).toBe("walk");
    });

    it("starts from the street when asked, whatever was reached", () => {
      const m = new TutorialMachine();
      m.start();
      said(m, "live", { chapter: "share" });
      m.send({ type: "start" });
      expect(m.step).toBe("intro");
    });
  });
});

describe("the launch's stages", () => {
  it("follows the deployment: fetching, building, starting, live", () => {
    expect(stageOf("empty", false)).toBe(-1);
    expect(stageOf("empty", true)).toBe(0);
    expect(stageOf("queued", true)).toBe(0);
    expect(stageOf("cloning", true)).toBe(0);
    expect(stageOf("building", true)).toBe(1);
    expect(stageOf("deploying", true)).toBe(1);
    expect(stageOf("starting", true)).toBe(2);
    expect(stageOf("live", true)).toBe(3);
    expect(stageOf("live", false)).toBe(-1);
    expect(stageOf("failed", true)).toBe(-1);
  });
});

describe("showing it off", () => {
  it("opens WhatsApp with the message ready", () => {
    expect(whatsappLink("Mon projet : https://jib.atelier.coloc.dev")).toBe("https://wa.me/?text=Mon%20projet%20%3A%20https%3A%2F%2Fjib.atelier.coloc.dev");
  });

  it("draws a QR code as one path with a quiet border", () => {
    const { d, size } = qrPath("https://jib.atelier.coloc.dev", 2);
    // Version 2 or 3 for an address this long: 25 or 29 modules a side, plus the border.
    expect([29, 33]).toContain(size);
    expect(d.startsWith("M2 2h7")).toBe(true);
    expect(d).not.toContain("NaN");
  });
});

describe("the walkthrough", () => {
  const through = (m: TutorialMachine) => m.tourCards.forEach(() => m.send({ type: "next" }));

  it("stops everything at the start of the quest and shows the controls one card at a time", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "start" });
    expect(m.step).toBe("intro");
    expect(SETUP.intro.controls).toMatchObject({ walk: false, dash: false, turn: false });
    expect(SETUP.intro.reveal).toEqual(["keys"]);
    expect(m.tourCards).toEqual(["help", "walk", "dash", "use"]);
    m.send({ type: "next" });
    expect(m.card).toBe(1);
    act(m, "walk-left");
    expect(m.step).toBe("intro");
    through(m);
    expect(m.step).toBe("walk");
  });

  it("leaves with Escape, from any card", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "start" });
    m.send({ type: "next" });
    m.send({ type: "skip" });
    expect(m.step).toBe("walk");
  });

  it("shows what's new in the city after its welcome, then lets you go", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "city");
    m.send({ type: "end" });
    expect(m.step).toBe("tour");
    expect(m.chapter).toBeNull();
    expect(SETUP.tour.controls).toMatchObject({ walk: false, dash: false, turn: false });
    expect(m.tourCards).toEqual(["search", "map", "pick", "chat", "bell", "settings"]);
    through(m);
    expect(m.active).toBe(false);
  });

  it("gives someone who skipped the quest the controls too, in the city", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "city" });
    m.send({ type: "end" });
    expect(m.tourCards).toEqual(["help", "walk", "dash", "use", "search", "map", "pick", "chat", "bell", "settings"]);
    m.send({ type: "skip" });
    expect(m.active).toBe(false);
  });

  it("never shows one twice", () => {
    const seen = new Set<string>();
    const tours = { seen: (name: string) => seen.has(name), see: (name: string) => void seen.add(name) };
    const first = new TutorialMachine({ tours });
    first.start();
    playTo(first, "tour");
    first.send({ type: "skip" });

    const again = new TutorialMachine({ tours });
    again.start();
    again.send({ type: "start" });
    expect(again.step).toBe("walk");
    again.send({ type: "city" });
    again.send({ type: "end" });
    expect(again.active).toBe(false);
  });

  it("skips what a touch screen has no keys for", () => {
    const m = new TutorialMachine({ touch: true });
    m.start();
    m.send({ type: "start" });
    expect(m.tourCards).toEqual(["walk", "dash", "use"]);
    m.send({ type: "skip" });
    m.send({ type: "city" });
    m.send({ type: "end" });
    expect(m.tourCards).toEqual(["search", "map", "chat", "bell", "settings"]);
  });

  it("has words for every card, on both kinds of screen", () => {
    for (const [name, card] of Object.entries(TOUR_TEXT)) {
      expect(card.title, name).toBeTruthy();
      expect(card.keys, name).toBeTruthy();
      if (name !== "help" && name !== "pick") expect(card.touch, name).toBeTruthy();
    }
  });

  it("cuts its words into plain text and key caps", () => {
    expect(keyParts("Tap {Shift} to dash.")).toEqual([
      { key: false, text: "Tap " },
      { key: true, text: "Shift" },
      { key: false, text: " to dash." },
    ]);
  });
});

describe("where an address opens", () => {
  it("knows a laptop's demo address opens nowhere else, and a real one opens anywhere", () => {
    expect(opensAnywhere("http://nadia-dev.atelier.coloc.localhost:8000")).toBe(false);
    expect(opensAnywhere("http://localhost:5175")).toBe(false);
    expect(opensAnywhere("http://192.168.1.20:8000")).toBe(false);
    expect(opensAnywhere("https://nadia.sacre-coeur.coloc.dev")).toBe(true);
    expect(opensAnywhere("not a url")).toBe(false);
  });
});
