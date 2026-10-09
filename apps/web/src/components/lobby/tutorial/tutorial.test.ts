// The tutorial's step machine, driven with plain events: the order of the steps, and what each one waits for.
import { describe, expect, it } from "vitest";
import type { TutorialState } from "../../../types";
import { type Action, SETUP, STEPS, TUTORIAL_HOUSE, TutorialMachine } from "./tutorial";

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
    walk: () => act(m, "walk-up", "walk-left", "walk-down", "walk-right"),
    dash: () => act(m, "dash"),
    map: () => (m.send({ type: "map", open: true }), m.send({ type: "map", open: false })),
    keys: () => (m.send({ type: "keys", open: true }), m.send({ type: "keys", open: false })),
    look: () => m.send({ type: "shown" }),
    turn: () => act(m, "turn-left", "turn-right"),
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

  it("waits for all four directions before the dash", () => {
    const m = new TutorialMachine();
    m.start();
    m.send({ type: "start" });
    expect(m.step).toBe("walk");
    act(m, "walk-up", "walk-up", "walk-left", "walk-down");
    // The same direction twice counts once, and a dash or a turn isn't a direction.
    act(m, "dash", "turn-left");
    expect(m.step).toBe("walk");
    expect(m.walked).toEqual(["walk-up", "walk-left", "walk-down"]);
    act(m, "walk-right");
    expect(m.step).toBe("dash");
  });

  it("counts any walk on a touch screen, and skips the dash and the keys", () => {
    const m = new TutorialMachine({ touch: true });
    m.start();
    m.send({ type: "start" });
    m.send({ type: "moved" });
    expect(m.step).toBe("map");
    m.send({ type: "next" });
    expect(m.step).toBe("look");
  });

  it("ignores events meant for other steps", () => {
    const m = new TutorialMachine();
    m.start();
    act(m, "walk-up", "walk-left", "walk-down", "walk-right");
    m.send({ type: "inside", houseId: TUTORIAL_HOUSE });
    expect(m.step).toBe("welcome");
  });

  it("needs the map opened, then closed", () => {
    const m = new TutorialMachine();
    m.start();
    playTo(m, "map");
    m.send({ type: "map", open: false });
    expect(m.step).toBe("map");
    m.send({ type: "map", open: true });
    expect(m.mapOpen).toBe(true);
    m.send({ type: "map", open: false });
    expect(m.step).toBe("keys");
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
    playTo(m, "turn");
    m.send({ type: "city" });
    expect(m.step).toBe("city");
  });

  it("starts with nothing on screen and ends with everything", () => {
    expect(SETUP.welcome.reveal).toEqual([]);
    expect(SETUP.welcome.controls.walk).toBe(false);
    expect(SETUP.map.reveal).toEqual(["map"]);
    expect(SETUP.look.reveal).not.toContain("chrome");
    expect(SETUP.look.reveal).not.toContain("emotes");
    expect(SETUP.city.reveal).toContain("chrome");
    expect(SETUP.city.reveal).toContain("emotes");
    expect(STEPS.filter((s) => SETUP[s].poll)).toEqual(["room", "run", "github"]);
  });
});
