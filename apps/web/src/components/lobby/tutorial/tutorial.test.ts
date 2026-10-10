// The tutorial's step machine, driven with plain events: the order of the steps, and what each one waits for.
import { describe, expect, it } from "vitest";
import type { TutorialState } from "../../../types";
import { nextTip, type Tip, tipParts } from "./tips";
import { type Action, goingWord, SETUP, STEPS, TUTORIAL_HOUSE, TutorialMachine } from "./tutorial";

// What GET /api/tutorial says, with a room (or not) and GitHub linked (or not).
function state(room: { status: string } | null, linked = false): TutorialState {
  return {
    house: { id: TUTORIAL_HOUSE, name: "L'Atelier", city: "Atelier", agentOnline: true },
    room: room ? { name: "tuto-jib", status: room.status, url: "http://tuto-jib.coloc.localhost:8000" } : null,
    sample: { repo: "sample", path: "." },
    github: { installUrl: "https://github.com/apps/la-coloc-dev/installations/new", linked },
    done: false,
  };
}

const act = (m: TutorialMachine, ...names: Action[]) => names.forEach((name) => m.send({ type: "action", name }));

// Plays the tutorial up to (not through) a step, the shortest way.
function playTo(m: TutorialMachine, until: string) {
  const moves: Record<string, () => void> = {
    welcome: () => m.send({ type: "start" }),
    walk: () => act(m, "walk-up"),
    look: () => m.send({ type: "shown" }),
    go: () => m.send({ type: "inside", houseId: TUTORIAL_HOUSE }),
    rundown: () => m.send({ type: "rundownDone" }),
    room: () => m.send({ type: "state", state: state({ status: "empty" }) }),
    run: () => (m.send({ type: "state", state: state({ status: "live" }) }), m.send({ type: "opened" }), m.send({ type: "next" })),
    github: () => m.send({ type: "skipGithub" }),
    // "Into the city": marked done, then the city.
    done: () => m.send({ type: "city" }),
  };
  while (m.step !== until) moves[m.step]();
}

describe("the tutorial", () => {
  it("goes through every step in order, from the welcome to the city", () => {
    const m = new TutorialMachine();
    m.start();
    const seen = [m.step];
    for (const step of STEPS.slice(1)) {
      playTo(m, step);
      seen.push(m.step);
    }
    expect(seen).toEqual(STEPS);
    m.send({ type: "end" });
    expect(m.active).toBe(false);
  });

  it("teaches walking and E, nothing else: any walk moves on", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "start" });
    expect(m.step).toBe("walk");
    // A dash or a turn isn't a walk.
    act(m, "dash", "turn-left");
    expect(m.step).toBe("walk");
    act(m, "walk-left");
    expect(m.step).toBe("look");
    expect(STEPS).not.toContain("dash");
    expect(STEPS).not.toContain("map");
  });

  it("counts a click or a tap on the ground as walking", () => {
    const m = new TutorialMachine({ touch: true });
    m.start();
    m.send({ type: "start" });
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
    expect(m.step).toBe("welcome");
  });

  it("goes back out on the street when the window closes during its rundown", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "rundown");
    m.send({ type: "inside", houseId: null });
    expect(m.step).toBe("go");
  });

  it("moves on from the run step only once the live room was opened", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "run");
    m.send({ type: "opened" });
    m.send({ type: "next" });
    expect(m.step).toBe("run");
    m.send({ type: "state", state: state({ status: "live" }) });
    m.send({ type: "opened" });
    expect(m.roomOpened).toBe(true);
    m.send({ type: "next" });
    expect(m.step).toBe("github");
  });

  it("says well done when GitHub gets linked, and skips the room step when a room exists", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "state", state: state({ status: "live" }) });
    playTo(m, "rundown");
    m.send({ type: "rundownDone" });
    // A room from an earlier try: straight to running it.
    expect(m.step).toBe("run");
    m.send({ type: "opened" });
    m.send({ type: "next" });
    expect(m.step).toBe("github");
    m.send({ type: "next" });
    expect(m.step).toBe("github");
    m.send({ type: "state", state: state({ status: "live" }, true) });
    expect(m.linked).toBe(true);
    expect(m.linkedBefore).toBe(false);
    m.send({ type: "next" });
    expect(m.step).toBe("done");
  });

  it("skips to the city from anywhere", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "go");
    m.send({ type: "city" });
    expect(m.step).toBe("city");
  });

  it("starts with nothing on screen and ends with everything", () => {
    expect(SETUP.welcome.reveal).toEqual([]);
    expect(SETUP.welcome.controls.walk).toBe(false);
    expect(SETUP.walk.reveal).toEqual([]);
    expect(SETUP.look.reveal).not.toContain("chrome");
    expect(SETUP.look.reveal).not.toContain("emotes");
    expect(SETUP.city.reveal).toContain("chrome");
    expect(SETUP.city.reveal).toContain("emotes");
    expect(STEPS.filter((s) => SETUP[s].poll)).toEqual(["room", "run", "github"]);
  });
});

describe("putting the sample online, in words", () => {
  it("follows the deployment: fetching, building, starting", () => {
    expect(goingWord("empty", false)).toBe("");
    expect(goingWord("empty", true)).toBe("Fetching the code…");
    expect(goingWord("queued", true)).toBe("Fetching the code…");
    expect(goingWord("cloning", true)).toBe("Fetching the code…");
    expect(goingWord("building", true)).toBe("Building…");
    expect(goingWord("deploying", true)).toBe("Building…");
    expect(goingWord("starting", true)).toBe("Starting…");
    expect(goingWord("live", true)).toBe("");
    expect(goingWord("failed", true)).toBe("");
    expect(goingWord(undefined, false)).toBe("");
  });
});

describe("the one-time tips", () => {
  it("says how to walk on arrival, and the dash after a long walk", () => {
    expect(nextTip("arrived", [], false)).toBe("walk");
    expect(nextTip("arrived", ["walk"], false)).toBeNull();
    expect(nextTip("walking", [], false)).toBe("dash");
    expect(nextTip("walking", ["dash"], false)).toBeNull();
  });

  it("brings the others one quiet moment at a time, in order, each once", () => {
    const seen: Tip[] = [];
    const order: (Tip | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const tip = nextTip("idle", seen, false);
      order.push(tip);
      if (tip) seen.push(tip);
    }
    expect(order).toEqual(["turn", "map", "pick", "keys", null]);
  });

  it("skips what a touch screen has no keys for", () => {
    expect(nextTip("idle", ["turn", "map"], true)).toBeNull();
    expect(nextTip("walking", [], true)).toBe("dash");
  });

  it("cuts a tip into words and key caps", () => {
    expect(tipParts("Tap {Shift} to dash.")).toEqual([
      { key: false, text: "Tap " },
      { key: true, text: "Shift" },
      { key: false, text: " to dash." },
    ]);
  });
});
