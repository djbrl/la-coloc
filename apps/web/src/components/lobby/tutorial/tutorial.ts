// The tutorial as a plain step machine: which step you're on, what each step lets you do and see, and what moves
// you on to the next one. Nothing here touches the page, three.js or the network, so the tests can drive it with
// plain events. useTutorial.ts wraps it for Vue and talks to the API; LobbyView feeds it what happens in the
// lobby and applies what each step allows; Coach.vue and Welcome.vue show it.
import type { TutorialState } from "../../../types";

// The workshop: the tutorial's one house. The same id as WORKSHOP_ID in lobby/tutorialMap.ts.
export const TUTORIAL_HOUSE = "atelier";

// What the engine reports each time you use a control (Lobby's `onAction`).
export type Action = "walk-up" | "walk-down" | "walk-left" | "walk-right" | "dash" | "turn-left" | "turn-right";
export const WALKS: Action[] = ["walk-up", "walk-left", "walk-down", "walk-right"];

// The steps, in order: walking and E are the only controls it teaches; the rest (dash, the map, the key list,
// turning the view) come later as one-time tips (tips.ts), when they're useful.
export type Step = "welcome" | "walk" | "look" | "go" | "rundown" | "room" | "run" | "github" | "done" | "city";
export const STEPS: Step[] = ["welcome", "walk", "look", "go", "rundown", "room", "run", "github", "done", "city"];

// The pieces of the lobby's screen, besides the city itself: the site's top bar ("chrome"), the city's activity,
// the place button, the round tools, the keys, the minimap, the emotes, and the prompt for what's in reach.
export type Piece = "chrome" | "here" | "place" | "tools" | "keys" | "map" | "emotes" | "prompt";
export const PIECES: Piece[] = ["chrome", "here", "place", "tools", "keys", "map", "emotes", "prompt"];
// Everything but the top bar and the emotes: what the workshop shows once you can walk.
const HUD: Piece[] = ["here", "place", "tools", "keys", "map", "prompt"];

// What the engine lets you do (Lobby's `setControls`).
export interface Controls {
  walk: boolean;
  dash: boolean;
  turn: boolean;
  targets: "all" | "houses";
}
const OFF: Controls = { walk: false, dash: false, turn: false, targets: "houses" };
const WALK: Controls = { walk: true, dash: false, turn: false, targets: "houses" };
const ALL: Controls = { walk: true, dash: true, turn: true, targets: "houses" };
// Outside the tutorial: everything.
export const FREE: Controls = { walk: true, dash: true, turn: true, targets: "all" };

// Each step: the controls it switches on, the pieces on screen, and whether it asks the API for news.
export interface Setup {
  controls: Controls;
  reveal: Piece[];
  poll: boolean;
}
export const SETUP: Record<Step, Setup> = {
  welcome: { controls: OFF, reveal: [], poll: false },
  walk: { controls: WALK, reveal: [], poll: false },
  look: { controls: OFF, reveal: HUD, poll: false },
  go: { controls: ALL, reveal: HUD, poll: false },
  rundown: { controls: ALL, reveal: HUD, poll: false },
  room: { controls: ALL, reveal: HUD, poll: true },
  run: { controls: ALL, reveal: HUD, poll: true },
  github: { controls: ALL, reveal: HUD, poll: true },
  done: { controls: ALL, reveal: HUD, poll: false },
  // The real city, behind a welcome card: nothing moves until you've read it.
  city: { controls: OFF, reveal: PIECES, poll: false },
};

// Everything that can happen, as the lobby, the API or the coach's buttons report it.
export type TutorialEvent =
  | { type: "start" } // "Start" on the welcome card
  | { type: "action"; name: Action } // a control was used
  | { type: "moved" } // you moved (a click or a tap on the ground walks too)
  | { type: "shown" } // the camera came back from showing the workshop
  | { type: "inside"; houseId: string | null } // a house's inside opened (its id) or closed (null)
  | { type: "rundownDone" } // the window's own tour ended
  | { type: "state"; state: TutorialState } // the API's latest word
  | { type: "opened" } // the live room was opened in a new tab
  | { type: "next" } // "Next" on the coach
  | { type: "skipGithub" } // "Skip for now"
  | { type: "city" } // the tutorial was finished or skipped and marked done: the city comes back
  | { type: "end" }; // "Let's go" on the city's welcome

// A room is live, as the API says it.
export const isLive = (s: TutorialState | null) => s?.room?.status === "live";

/**
 * While the sample goes online, what's happening, in the coach's words. The API reports the deployment's own step
 * while the room is being put online ("cloning", "building", "starting"); right after "Put it online" is pressed
 * the room may still say "empty". Empty string: nothing is going on.
 */
export function goingWord(status: string | undefined, pressed: boolean): string {
  if (status === "queued" || status === "cloning" || (pressed && status === "empty")) return "Fetching the code…";
  // "deploying" is what an API without the finer steps says the whole way through.
  if (status === "building" || status === "deploying") return "Building…";
  if (status === "starting") return "Starting…";
  return "";
}

export class TutorialMachine {
  active = false;
  step: Step = "welcome";
  // The live room was opened (run step: putting the sample online), GitHub got linked (github step), or was
  // already when the step began.
  roomOpened = false;
  linked = false;
  linkedBefore = false;
  // The API's latest word, or null before the first.
  state: TutorialState | null = null;

  // A phone or a tablet: the coach talks about tapping, not keys.
  readonly touch: boolean;

  constructor(opts: { touch?: boolean } = {}) {
    this.touch = opts.touch ?? false;
  }

  /** Where you are, counted over the steps between the two welcome cards: 0 at the first, 1 at the last. */
  get progress(): number {
    const inner: Step[] = STEPS.filter((s) => s !== "welcome" && s !== "city");
    const i = inner.indexOf(this.step);
    if (i < 0) return this.step === "city" ? 1 : 0;
    return (i + 1) / inner.length;
  }

  /** From the top: the welcome card, nothing learned. */
  start() {
    this.active = true;
    this.state = null;
    this.enter("welcome");
  }

  stop() {
    this.active = false;
  }

  /** Something happened. Moves on when the current step is done; anything meant for another step is ignored. */
  send(e: TutorialEvent) {
    if (!this.active) return;
    // The API's word is kept whatever the step, since the coach reads the room from it.
    if (e.type === "state") this.state = e.state;
    // Finishing or skipping can happen from any step.
    if (e.type === "city") return this.enter("city");

    switch (this.step) {
      case "welcome":
        if (e.type === "start" || e.type === "next") this.advance();
        return;
      case "walk":
        // Any walk at all: a walk key, or a click or tap on the ground.
        if (e.type === "moved" || (e.type === "action" && WALKS.includes(e.name))) this.advance();
        return;
      case "look":
        if (e.type === "shown") this.advance();
        return;
      case "go":
        if (e.type === "inside" && e.houseId === TUTORIAL_HOUSE) this.advance();
        return;
      case "rundown":
        if (e.type === "rundownDone") this.advance();
        // Closing the window before its tour ends: back out on the street, and the tour starts again next time.
        else if (e.type === "inside" && e.houseId === null) this.enter("go");
        return;
      case "room":
        if (this.state?.room) this.advance();
        return;
      case "run":
        if (e.type === "opened" && isLive(this.state)) this.roomOpened = true;
        else if (e.type === "next" && this.roomOpened) this.advance();
        return;
      case "github":
        if (this.state?.github.linked) this.linked = true;
        if ((e.type === "next" && this.linked) || e.type === "skipGithub") this.advance();
        return;
      case "done":
        return;
      case "city":
        if (e.type === "end") this.stop();
        return;
    }
  }

  private advance() {
    const next = STEPS[STEPS.indexOf(this.step) + 1];
    if (next) this.enter(next);
  }

  // A step starts fresh. Some are already done when they start (a room taken on an earlier try): they move on.
  private enter(step: Step) {
    this.step = step;
    this.roomOpened = false;
    this.linked = this.linkedBefore = false;
    if (step === "room" && this.state?.room) this.advance();
    if (step === "github" && this.state?.github.linked) this.linked = this.linkedBefore = true;
  }
}
