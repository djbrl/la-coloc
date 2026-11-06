// The first visit as a quest, "Your first home", in a plain step machine: which step you're on, which chapter it
// belongs to, what each step lets you do and see, and what moves you on. Nothing here touches the page, three.js or
// the network, so the tests drive it with plain events. useTutorial.ts wraps it for Vue and talks to the API;
// LobbyView feeds it what happens in the lobby and applies what each step allows; the quest's cards show it.
//
// The quest is eight chapters, each a screen-sized step or two, and each detected rather than clicked where the
// game can see it: you walked, you went in, you took the room, it went live, you opened it, you shared it.
//   1 arrive   land on the street, the controls one card at a time with everything still, then walk
//   2 find     follow the beacon to a house with a free room, go in, take the room
//   3 keys     the room is yours: keys, your name on the door
//   4 project  bring your project: a ready-made starter in one press, or your own repo from GitHub
//   5 launch   watch it build, as a show: the crane, four plain stages, fireworks
//   6 open     your address, big, one press to open it
//   7 share    copy it, send it on WhatsApp, scan it with your phone
//   8 house    meet the house, one tab at a time: who lives here, its channel, reviews, news, the bill; then "Well done"
// After it the real city, with its welcome and a short walkthrough of what's new on screen.
import type { TutorialState } from "../../../types";

// The workshop: the quest's one house, where every newcomer gets their first room. The same id as WORKSHOP_ID in
// lobby/tutorialMap.ts.
export const TUTORIAL_HOUSE = "atelier";

// What the engine reports each time you use a control (Lobby's `onAction`).
export type Action = "walk-up" | "walk-down" | "walk-left" | "walk-right" | "dash" | "turn-left" | "turn-right";
export const WALKS: Action[] = ["walk-up", "walk-left", "walk-down", "walk-right"];

// The chapters, in order. The API stores the furthest one you reached (POST /api/tutorial/progress), so the quest
// can pick up where you left it.
export type Chapter = "arrive" | "find" | "keys" | "project" | "launch" | "open" | "share" | "house";
export const CHAPTERS: Chapter[] = ["arrive", "find", "keys", "project", "launch", "open", "share", "house"];

// The steps, in order. "welcome" is the first card; "intro" walks through the controls before you may move; "home" is
// the "Well done" moment that closes chapter 8; "city" is the real city, behind its own welcome card, once the quest is
// over; "tour" shows what's new on its screen, then you're free.
export type Step = "welcome" | "intro" | "walk" | "look" | "go" | "room" | "keys" | "project" | "launch" | "open" | "share" | "house" | "home" | "city" | "tour";
export const STEPS: Step[] = ["welcome", "intro", "walk", "look", "go", "room", "keys", "project", "launch", "open", "share", "house", "home", "city", "tour"];

// Which chapter each step is part of. The city's card comes after the quest: no chapter.
export const CHAPTER_OF: Record<Step, Chapter | null> = {
  welcome: "arrive",
  intro: "arrive",
  walk: "arrive",
  look: "find",
  go: "find",
  room: "find",
  keys: "keys",
  project: "project",
  launch: "launch",
  open: "open",
  share: "share",
  house: "house",
  home: "house",
  city: null,
  tour: null,
};

// The pieces of the lobby's screen, besides the city itself: the site's top bar ("chrome"), the city's activity,
// the place button, the round tools, the keys, the minimap, the prompt for what's in reach, and the quest's tracker
// (the slim pill at the top).
export type Piece = "chrome" | "here" | "place" | "tools" | "keys" | "map" | "prompt" | "quest";
export const PIECES: Piece[] = ["chrome", "here", "place", "tools", "keys", "map", "prompt", "quest"];
// What comes on screen as the quest goes: first nothing, then the "?", then the tracker, then the map with the goal's pin and the
// prompt at the door, then the rest of the HUD once you live somewhere.
const TRACKER: Piece[] = ["quest", "keys"];
const FINDING: Piece[] = ["quest", "keys", "place", "map", "prompt"];
const HUD: Piece[] = ["quest", "place", "map", "tools", "keys"];
const CITY: Piece[] = PIECES.filter((p) => p !== "quest");

// What the engine lets you do (Lobby's `setControls`).
export interface Controls {
  walk: boolean;
  dash: boolean;
  turn: boolean;
  targets: "all" | "houses";
}
const OFF: Controls = { walk: false, dash: false, turn: false, targets: "houses" };
const WALK: Controls = { walk: true, dash: false, turn: false, targets: "houses" };
// The walkthrough's cards never hold the keys (Jib, 6 11): you can walk, dash and turn while you read them. Nothing can
// be gone into yet (LobbyView's `picking` waits for the step that sends you to the door).
const TRY: Controls = { walk: true, dash: true, turn: true, targets: "houses" };
const ALL: Controls = { walk: true, dash: true, turn: true, targets: "houses" };
// Outside the quest: everything.
export const FREE: Controls = { walk: true, dash: true, turn: true, targets: "all" };

// Each step: the controls it switches on, the pieces on screen, whether it asks the API for news, and whether the
// beacon stands at the workshop's door (and its pin on the map).
export interface Setup {
  controls: Controls;
  reveal: Piece[];
  poll: boolean;
  beacon: boolean;
}
export const SETUP: Record<Step, Setup> = {
  welcome: { controls: OFF, reveal: [], poll: false, beacon: false },
  intro: { controls: TRY, reveal: ["keys"], poll: false, beacon: false },
  walk: { controls: WALK, reveal: ["keys"], poll: false, beacon: false },
  look: { controls: OFF, reveal: TRACKER, poll: false, beacon: true },
  go: { controls: ALL, reveal: FINDING, poll: false, beacon: true },
  room: { controls: ALL, reveal: FINDING, poll: true, beacon: false },
  keys: { controls: OFF, reveal: HUD, poll: false, beacon: false },
  project: { controls: ALL, reveal: HUD, poll: true, beacon: false },
  launch: { controls: ALL, reveal: HUD, poll: true, beacon: false },
  // Your page is already live (the launch saw it): this step only waits for your click, so it asks the API nothing.
  open: { controls: ALL, reveal: HUD, poll: false, beacon: false },
  share: { controls: ALL, reveal: HUD, poll: false, beacon: false },
  house: { controls: ALL, reveal: HUD, poll: false, beacon: false },
  home: { controls: OFF, reveal: HUD, poll: false, beacon: false },
  // The real city, behind a welcome card: nothing moves until you've read it.
  city: { controls: OFF, reveal: CITY, poll: false, beacon: false },
  tour: { controls: TRY, reveal: CITY, poll: false, beacon: false },
};

// The walkthrough's cards, one thing each, with the keys still yours: the controls at the start of the quest, what's new on
// the city's screen at the end. Someone who skipped the quest never saw the first ones, so they get them in the city.
const INTRO_CARDS = ["help", "walk", "dash", "use"] as const;
const TOUR_CARDS = ["search", "map", "pick", "chat", "bell", "settings"] as const;
export type TourCardName = (typeof INTRO_CARDS)[number] | (typeof TOUR_CARDS)[number];
// A touch screen has no key list and nothing to press for [ and ].
const NO_TOUCH: TourCardName[] = ["help", "pick"];
// The walkthroughs by name: each shows once. The lobby keeps that in the browser (lobby/house/tours.ts).
const INTRO = "walk-intro";
const TOUR = "city-tour";
export interface TourMemory {
  seen(name: string): boolean;
  see(name: string): void;
}

// The cards of chapter 8, one tab of the house's window each, in the tabs' order: who lives here, its channel (where
// the house says hello), reviews and the bill (examples in the workshop, so there's something to look at), the news.
export const HOUSE_CARDS = ["flatmates", "channel", "reviews", "news", "bill"] as const;
export type HouseCard = (typeof HOUSE_CARDS)[number];

// Where your project comes from in chapter 4: nothing chosen yet, GitHub opened in another tab (we wait for the
// link to show up), or a repo linked.
export type GithubStage = "none" | "waiting" | "linked";

// Everything that can happen, as the lobby, the API or the quest's buttons report it.
export type TutorialEvent =
  | { type: "start"; resume?: boolean } // "Start" (or "Continue where I was") on the welcome card
  | { type: "action"; name: Action } // a control was used
  | { type: "moved" } // you moved (a click or a tap on the ground walks too)
  | { type: "shown" } // the camera came back from showing the workshop
  | { type: "inside"; houseId: string | null } // a house's inside opened (its id) or closed (null)
  | { type: "state"; state: TutorialState } // the API's latest word
  | { type: "github" } // "Bring my own from GitHub": the install page opened in a new tab
  | { type: "deploy" } // a deploy was accepted by the API (the starter, a repo, or a retry)
  | { type: "opened" } // the live room was opened in a new tab
  | { type: "shared" } // the link was copied, sent or shared
  | { type: "next" } // the card's main button, where there is one
  | { type: "back" } // a step back within a step (GitHub → the choice, a failed launch → the choice)
  | { type: "skip" } // "Later", without guilt (sharing); Escape in a walkthrough
  | { type: "city" } // the quest was finished or skipped and marked done: the city comes back
  | { type: "end" }; // "Let's go" on the city's welcome

// The steps of putting a room online, as the API reports them while a deploy runs.
export const BUILDING = ["queued", "cloning", "building", "starting", "deploying"];

// A room is live, as the API says it.
export const isLive = (s: TutorialState | null) => s?.room?.status === "live";
const isBuilding = (s: TutorialState | null) => BUILDING.includes(s?.room?.status ?? "");
const hasFailed = (s: TutorialState | null) => s?.room?.status === "failed" || s?.room?.status === "down";

// The launch as a show, in four plain stages: fetching your code → building → starting → live.
export const STAGES = ["fetch", "build", "start", "live"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Which stage a room's status is at (0 to 3), or -1 when nothing is going on. The API reports the deployment's own
 * step while it runs ("cloning", "building", "starting"); an older API says "deploying" the whole way. Right after
 * the press the room may still say "empty" (or "live", for a redeploy): `pressed` counts that as fetching.
 */
export function stageOf(status: string | undefined, pressed: boolean): number {
  if (status === "queued" || status === "cloning") return 0;
  if (status === "building" || status === "deploying") return 1;
  if (status === "starting") return 2;
  if (status === "live") return pressed ? 3 : -1;
  if (pressed && (status === "empty" || status === undefined)) return 0;
  return -1;
}

/**
 * Where "Continue" takes you back to, from the furthest chapter you reached and the room as it is now. A chapter
 * that needs something you don't have any more (a room, a live project) starts from the one that gives it.
 */
export function resumeStep(chapter: Chapter | null, s: TutorialState | null): Step {
  const room = !!s?.room;
  const live = isLive(s);
  switch (chapter) {
    case null:
    case "arrive":
      return "walk";
    case "find":
      return room ? "keys" : "go";
    case "keys":
      return room ? "keys" : "go";
    case "project":
      return room ? "project" : "go";
    case "launch":
      return live ? "open" : isBuilding(s) ? "launch" : room ? "project" : "go";
    case "open":
    case "share":
    case "house":
      if (!room) return "go";
      if (!live) return "project";
      return chapter;
  }
}

/** A chapter's place in the quest, 0 to 7; -1 for none. */
export const chapterIndex = (c: Chapter | null | undefined) => (c ? CHAPTERS.indexOf(c) : -1);

export class TutorialMachine {
  active = false;
  step: Step = "welcome";
  // The API's latest word, or null before the first.
  state: TutorialState | null = null;
  // Chapter 4: where the project comes from.
  github: GithubStage = "none";
  // Chapter 5: a deploy was accepted, and the room was already live when the launch began (a redeploy): its old
  // "live" must not count until a build has been seen. `launched`: it went live; the view celebrates, then "next".
  pressed = false;
  liveAtLaunch = false;
  sawBuild = false;
  launched = false;
  // Chapter 4 again after a launch that stopped: the coach opens on the list of repos.
  repick = false;
  // Chapter 8 and the walkthroughs: which card.
  card = 0;
  // The walkthrough's cards this time.
  tourCards: TourCardName[] = [];
  // Each finished chapter, in order, as it was stamped: the tracker fills in and the view plays the stamp.
  stamps: Chapter[] = [];

  // A phone or a tablet: the cards talk about tapping, not keys.
  readonly touch: boolean;
  private readonly tours: TourMemory;

  constructor(opts: { touch?: boolean; tours?: TourMemory } = {}) {
    this.touch = opts.touch ?? false;
    const seen = new Set<string>();
    this.tours = opts.tours ?? { seen: (name) => seen.has(name), see: (name) => seen.add(name) };
  }

  /** The chapter you're in, or null in the city. */
  get chapter(): Chapter | null {
    return CHAPTER_OF[this.step];
  }

  /** The furthest chapter the API remembers for you (null: none, or an API that doesn't keep it). */
  get saved(): Chapter | null {
    const c = this.state?.chapter;
    return c && (CHAPTERS as string[]).includes(c) ? (c as Chapter) : null;
  }

  /** "Continue where you were" makes sense: you got further than the street last time. */
  get canResume(): boolean {
    return chapterIndex(this.saved) > 0;
  }

  /** From the top: the welcome card, nothing stamped. */
  start() {
    this.active = true;
    this.state = null;
    this.stamps = [];
    this.enter("welcome");
  }

  stop() {
    this.active = false;
  }

  /** Something happened. Moves on when the current step is done; anything meant for another step is ignored. */
  send(e: TutorialEvent): void {
    if (!this.active) return;
    // The API's word is kept whatever the step, since the cards read the room from it.
    if (e.type === "state") this.state = e.state;
    // Finishing or skipping can happen from any step.
    if (e.type === "city") return this.enter("city");

    switch (this.step) {
      case "welcome":
        if (e.type === "start" && e.resume && this.canResume) return this.jump(resumeStep(this.saved, this.state));
        if (e.type === "start" || e.type === "next") this.enter("intro");
        return;
      case "intro":
        if (e.type === "skip" || (e.type === "next" && this.card >= this.tourCards.length - 1)) this.enter("walk");
        else if (e.type === "next") this.card += 1;
        return;
      case "walk":
        // Any walk at all: a walk key, or a click or tap on the ground.
        if (e.type === "moved" || (e.type === "action" && WALKS.includes(e.name))) this.enter("look");
        return;
      case "look":
        if (e.type === "shown") this.enter("go");
        return;
      case "go":
        if (e.type === "inside" && e.houseId === TUTORIAL_HOUSE) this.enter("room");
        return;
      case "room":
        if (this.state?.room) this.enter("keys");
        // Closing the window before taking the room: back out on the street, the beacon comes back.
        else if (e.type === "inside" && e.houseId === null) this.enter("go");
        return;
      case "keys":
        if (e.type === "next") this.enter("project");
        return;
      case "project":
        if (e.type === "github") this.github = this.state?.github.linked ? "linked" : "waiting";
        else if (e.type === "back") this.github = "none";
        else if (e.type === "deploy") this.enter("launch");
        // The link shows up in the API's word once GitHub has told us about the install.
        if (this.github === "waiting" && this.state?.github.linked) this.github = "linked";
        return;
      case "launch":
        if (e.type === "deploy") {
          // A retry: the show starts over.
          this.pressed = true;
          this.sawBuild = false;
          this.launched = false;
          this.liveAtLaunch = isLive(this.state);
        } else if (e.type === "back") {
          // A failed or cancelled launch: back to picking a project, not to the one that just stopped.
          this.enter("project");
          this.repick = true;
          return;
        } else if (e.type === "next" && this.launched) {
          this.enter("open");
          return;
        }
        if (isBuilding(this.state) || hasFailed(this.state)) this.sawBuild = true;
        if (isLive(this.state) && (this.sawBuild || !this.liveAtLaunch)) this.launched = true;
        return;
      case "open":
        if (e.type === "opened" && isLive(this.state)) this.enter("share");
        return;
      case "share":
        if (e.type === "shared" || e.type === "skip") this.enter("house");
        return;
      case "house":
        if (e.type === "next") {
          if (this.card < HOUSE_CARDS.length - 1) this.card += 1;
          else this.enter("home");
        }
        return;
      case "home":
        // "Into the city" marks the quest done first (useTutorial.finish), which sends "city".
        return;
      case "city":
        if (e.type === "end") this.enter("tour");
        return;
      case "tour":
        if (e.type === "skip" || (e.type === "next" && this.card >= this.tourCards.length - 1)) this.stop();
        else if (e.type === "next") this.card += 1;
        return;
    }
  }

  // Jumps to a step from the welcome card ("Continue"): every chapter before it counts as stamped already.
  private jump(step: Step): void {
    const at = chapterIndex(CHAPTER_OF[step]);
    this.stamps = CHAPTERS.slice(0, Math.max(0, at));
    this.enter(step, false);
  }

  // A step starts fresh. Moving into a later chapter stamps the ones you just finished. Some steps are already done
  // when they start (a room taken on an earlier try): they move on.
  private enter(step: Step, stamp = true): void {
    const from = chapterIndex(CHAPTER_OF[this.step]);
    const to = step === "city" ? CHAPTERS.length : chapterIndex(CHAPTER_OF[step]);
    if (stamp && step !== "city") for (let i = Math.max(0, from); i < to; i++) if (!this.stamps.includes(CHAPTERS[i])) this.stamps.push(CHAPTERS[i]);
    // "Well done": the last chapter is stamped too.
    if (step === "home" && !this.stamps.includes("house")) this.stamps.push("house");
    this.step = step;
    this.github = this.state?.github.linked ? "linked" : "none";
    this.pressed = false;
    this.sawBuild = false;
    this.launched = false;
    this.liveAtLaunch = false;
    this.repick = false;
    this.card = 0;
    if (step === "intro" || step === "tour") {
      this.tourCards = this.walkthrough(step);
      this.tours.see(INTRO);
      if (step === "tour") this.tours.see(TOUR);
      // Seen before: straight on.
      if (!this.tourCards.length) {
        if (step === "intro") this.enter("walk", stamp);
        else this.stop();
        return;
      }
    }
    if (step === "go" && this.state?.room) return this.enter("keys", stamp);
    if (step === "room" && this.state?.room) return this.enter("keys", stamp);
    if (step === "launch") {
      this.pressed = true;
      this.liveAtLaunch = isLive(this.state);
      this.sawBuild = isBuilding(this.state);
    }
  }

  // Which cards a walkthrough shows: none if it was seen already; in the city, the controls too if those never showed.
  private walkthrough(step: "intro" | "tour"): TourCardName[] {
    const intro = this.tours.seen(INTRO) ? [] : INTRO_CARDS;
    const cards: readonly TourCardName[] = step === "intro" ? intro : this.tours.seen(TOUR) ? [] : [...intro, ...TOUR_CARDS];
    return cards.filter((c) => !this.touch || !NO_TOUCH.includes(c));
  }
}
