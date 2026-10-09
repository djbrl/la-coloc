// The tutorial: six steps from the street to your first live room, in a small workshop of your own ("L'Atelier").
// This is the step machine. LobbyView drives it (it says when you're near the workshop and when its inside
// opens) and draws the house it describes; Coach.vue shows the current step and its one action. Nothing here
// touches three.js, so it reads as plain state and fetches.
import { computed, ref, watch } from "vue";
import { loadMe, postJSON, sendJSON } from "../../../session";
import type { CityHouse, HouseView, TutorialState } from "../../../types";

// The tutorial house and the name of its one-block neighbourhood.
export const TUTORIAL_HOUSE = "atelier";
export const TUTORIAL_CITY = "Atelier";

// The steps, in order. Coach.vue counts its dots from this list.
export type Step = "walk" | "enter" | "room" | "run" | "github" | "done";
export const STEPS: Step[] = ["walk", "enter", "room", "run", "github", "done"];

// How often the coach asks the API about the room and GitHub while those steps are on.
const POLL_MS = 2000;

/** The tutorial's state and actions. `onLeave` runs when it ends (finished or skipped): the lobby rebuilds the city. */
export function createTutorial(onLeave: () => void) {
  const active = ref(false);
  const step = ref<Step>("walk");
  const index = computed(() => STEPS.indexOf(step.value));
  // What the API says about the tutorial, and the workshop as a house view (for its rooms on the map).
  const state = ref<TutorialState | null>(null);
  const view = ref<HouseView | null>(null);
  // The API answered 404: this server doesn't have the tutorial yet.
  const missing = ref(false);
  const busy = ref(false);
  const error = ref("");
  // "Run it" was pressed: from here the sentence follows the room's status.
  const ran = ref(false);
  let timer = 0;
  // The room as last fetched (name and status): when it changes, the house view is fetched again.
  let roomKey = "";

  // The workshop, shaped like a house in the city list, so the engine, the cards and the minimap draw it as any
  // other house. Before the API answers it's a plain "L'Atelier" with no rooms.
  const house = computed<CityHouse>(() => {
    const s = state.value;
    const v = view.value;
    return {
      id: TUTORIAL_HOUSE,
      name: v?.name ?? s?.house.name ?? "L'Atelier",
      city: s?.house.city ?? v?.city ?? TUTORIAL_CITY,
      country: v?.country ?? "",
      tagline: v?.tagline ?? "A workshop to try things in.",
      status: v?.status ?? "live",
      demo: false,
      agentOnline: s?.house.agentOnline ?? v?.agentOnline ?? false,
      monthlyCostFcfa: v?.monthlyCostFcfa ?? null,
      plot: null,
      rooms: v?.rooms ?? [],
    };
  });

  async function loadView() {
    const res = await fetch(`/api/houses/${TUTORIAL_HOUSE}`).catch(() => null);
    if (res?.ok) view.value = await res.json();
  }

  // Asks the API where the tutorial stands. A 404 means "not yet"; any other failure keeps what we had.
  async function refresh() {
    const res = await fetch("/api/tutorial").catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      missing.value = true;
      return;
    }
    if (!res.ok) return;
    missing.value = false;
    const next: TutorialState = await res.json();
    state.value = next;
    const key = next.room ? `${next.room.name}:${next.room.status}` : "";
    if (key !== roomKey || !view.value) {
      roomKey = key;
      await loadView();
    }
  }

  function start() {
    if (active.value) return;
    active.value = true;
    step.value = "walk";
    state.value = null;
    view.value = null;
    missing.value = false;
    error.value = "";
    ran.value = false;
    roomKey = "";
    void refresh();
  }

  function stop() {
    active.value = false;
    clearInterval(timer);
    timer = 0;
  }

  // The API is asked every two seconds during the steps that wait on it (a room, a deploy, GitHub).
  watch([active, step], ([on, s]) => {
    clearInterval(timer);
    timer = 0;
    if (on && (s === "room" || s === "run" || s === "github")) timer = window.setInterval(() => void refresh(), POLL_MS);
  });

  // Steps that finish on their own, as soon as the API says so.
  watch([step, state], () => {
    const s = state.value;
    if (!s) return;
    if (step.value === "room" && s.room) step.value = "run";
    if (step.value === "github" && s.github.linked) step.value = "done";
  });

  // ---- What the lobby reports ----

  /** You're within reach of the workshop. */
  function nearHouse() {
    if (step.value === "walk") step.value = "enter";
  }

  /** The workshop's inside opened over the city. */
  function insideOpened() {
    if (step.value === "walk" || step.value === "enter") step.value = "room";
  }

  // ---- What the coach's buttons do ----

  async function takeRoom() {
    busy.value = true;
    error.value = "";
    const res = await postJSON("/api/tutorial/room", {});
    busy.value = false;
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    await refresh();
  }

  async function deploy() {
    busy.value = true;
    error.value = "";
    const res = await postJSON("/api/tutorial/deploy", {});
    busy.value = false;
    if (!res.ok) {
      // A 409 says the workshop's server is offline; the coach shows the message and "Try again".
      error.value = res.message;
      return;
    }
    ran.value = true;
    await refresh();
  }

  function next() {
    if (step.value === "run") step.value = "github";
  }

  function skipGithub() {
    if (step.value === "github") step.value = "done";
  }

  // Finishing and skipping both mark the tutorial done on your profile, then hand the lobby back the real city.
  // Settings can bring the tutorial back.
  async function finish() {
    busy.value = true;
    await sendJSON("PATCH", "/api/me", { tutorialDone: true });
    await loadMe();
    busy.value = false;
    stop();
    onLeave();
  }

  return { active, step, index, state, house, missing, busy, error, ran, start, stop, nearHouse, insideOpened, takeRoom, deploy, next, skipGithub, finish };
}

export type Tutorial = ReturnType<typeof createTutorial>;
