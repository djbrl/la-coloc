// The quest for Vue: the step machine (tutorial.ts) made reactive, plus everything that talks to the API: where the
// quest stands (asked every two seconds while a step waits on it), taking a room, putting a project online (the
// starter or your GitHub repo), remembering the furthest chapter, and marking the quest done. LobbyView owns one.
import { computed, reactive, ref, watch } from "vue";
import { core, useWhenBack } from "../../../core";
import { loadMe, postJSON, sendJSON } from "../../../session";
import { settings } from "../../../settings";
import type { CityHouse, HouseView, RepoChoices, TutorialState } from "../../../types";
import { BUILDING, CHAPTER_OF, chapterIndex, isLive, SETUP, TUTORIAL_HOUSE, TutorialMachine } from "./tutorial";
import { tutorialWords } from "./words";

// How often the API is asked about the room and GitHub while those steps are on.
const POLL_MS = 2000;

export function useTutorial() {
  // Phones and tablets: the cards talk about tapping, not keys.
  const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  // Reactive, so the cards and the lobby follow every step the machine takes.
  const machine = reactive(new TutorialMachine({ touch })) as TutorialMachine;
  // The workshop as a house view, for its rooms on the map and the "meet the house" cards.
  const view = ref<HouseView | null>(null);
  // The API answered 404: this server doesn't have the quest yet.
  const missing = ref(false);
  const busy = ref(false);
  const error = ref("");
  // The repos you let La Coloc see on GitHub, for chapter 4's picker. Null until asked.
  const choices = ref<RepoChoices | null>(null);
  // The API's first word has arrived (the welcome card waits for it to offer "Continue").
  const loaded = ref(false);
  let timer = 0;
  // The room as last fetched (name and status): when it changes, the house view is fetched again.
  let roomKey = "";
  // The furthest chapter the API has been told about in this run.
  let told = -1;

  const live = computed(() => isLive(machine.state));
  // The core is down: the steps that ask the API wait (the coach says so), and nothing is marked done or skipped.
  const waiting = computed(() => core.state === "down");

  // The workshop, shaped like a house in the city list, so the engine, the cards and the minimap draw it as any
  // other house. Before the API answers it's a plain "L'Atelier" with no rooms.
  const house = computed<CityHouse>(() => {
    const s = machine.state;
    const v = view.value;
    return {
      id: TUTORIAL_HOUSE,
      name: v?.name ?? s?.house.name ?? "L'Atelier",
      city: s?.house.city ?? v?.city ?? "Atelier",
      country: v?.country ?? "",
      tagline: v?.tagline ?? tutorialWords.workshopTagline,
      status: v?.status ?? "live",
      demo: false,
      agentOnline: s?.house.agentOnline ?? v?.agentOnline ?? false,
      monthlyCostFcfa: v?.monthlyCostFcfa ?? null,
      plot: null,
      // Your room shows a crane while your project is fetched, built and started.
      rooms: (v?.rooms ?? []).map((r) => ({ ...r, building: r.name === s?.room?.name && BUILDING.includes(s.room.status) })),
      openChores: 0,
      lateChores: 0,
      knocking: 0,
      reviewsThisMonth: 0,
      tontine: null,
    };
  });

  async function loadView() {
    const res = await fetch(`/api/houses/${TUTORIAL_HOUSE}`).catch(() => null);
    if (res?.ok) view.value = await res.json();
  }

  // Asks the API where the quest stands and tells the machine. A 404 means "not on this server"; any other failure
  // (the core being down included) keeps what we had.
  async function refresh() {
    const res = await fetch("/api/tutorial").catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      missing.value = true;
      loaded.value = true;
      return;
    }
    if (!res.ok) return;
    missing.value = false;
    const next: TutorialState = await res.json();
    machine.send({ type: "state", state: next });
    loaded.value = true;
    if (machine.step === "project" && machine.github !== "none") await loadRepos();
    const key = next.room ? `${next.room.name}:${next.room.status}` : "";
    if (key !== roomKey || !view.value) {
      roomKey = key;
      await loadView();
    }
  }

  // Asked straight from GitHub by the API (at most every 5 seconds), so a lost install event doesn't matter.
  async function loadRepos() {
    const res = await fetch("/api/tutorial/repos").catch(() => null);
    if (res?.ok) choices.value = await res.json();
  }

  // Brings the repo you picked into your room (it replaces any other), then the coach offers to put it online.
  async function pickRepo(id: number) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    const res = await postJSON("/api/tutorial/repo", { id });
    busy.value = false;
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    await refresh();
    await loadRepos();
  }

  // Choosing "My own, from GitHub" (or going back to it) asks for the list right away, not at the next beat.
  watch(
    () => machine.github,
    (stage) => {
      if (machine.step === "project" && stage !== "none") void loadRepos();
    },
  );

  function start() {
    view.value = null;
    missing.value = false;
    loaded.value = false;
    choices.value = null;
    busy.value = false;
    error.value = "";
    roomKey = "";
    told = -1;
    machine.start();
    void refresh();
  }

  function stop() {
    machine.stop();
  }

  // The core is back: ask where the quest stands right away, instead of waiting for the next beat.
  useWhenBack(() => {
    if (machine.active && SETUP[machine.step].poll) void refresh();
  });

  // Only the steps that wait on the API ask it, every two seconds.
  watch(
    () => [machine.active, machine.step] as const,
    ([on, step]) => {
      clearInterval(timer);
      timer = 0;
      error.value = "";
      if (on && SETUP[step].poll) {
        void refresh();
        timer = window.setInterval(() => void refresh(), POLL_MS);
      }
    },
  );

  // Each new chapter reached is remembered on your profile, so "Continue" can bring you back to it. Only forward
  // (the API keeps the furthest anyway); a failure is quiet: it's a convenience, not a step.
  watch(
    () => (machine.active ? CHAPTER_OF[machine.step] : null),
    (chapter) => {
      const at = chapterIndex(chapter);
      if (!chapter || at <= told || at <= chapterIndex(machine.saved)) return;
      told = at;
      void postJSON("/api/tutorial/progress", { chapter });
    },
  );

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

  /**
   * Puts a project online in your room: the ready-made starter, or the repo you linked on GitHub. The launch
   * starts once the API has accepted it; a refusal (the workshop's server is offline, no repo linked yet) is shown
   * as it comes, with "Try again".
   */
  async function deploy(source: "starter" | "github") {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    const res = await postJSON("/api/tutorial/deploy", { source });
    busy.value = false;
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    machine.send({ type: "deploy" });
    await refresh();
  }

  // Finishing and skipping both mark the quest done on your profile (and the old welcome as seen), then bring the
  // city back behind its own welcome. Settings can bring the quest back.
  // While the core is down nothing is marked and the quest stays where it is: the card says why, and you press the
  // button again (a new press only, never a retry behind your back).
  async function finish() {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    const res = await sendJSON("PATCH", "/api/me", { tutorialDone: true });
    if (!res.ok && res.down) {
      error.value = res.message;
      busy.value = false;
      return;
    }
    // Any other refusal: the city comes back all the same, and the quest offers itself again next time.
    await loadMe();
    busy.value = false;
    settings.welcomed = true;
    machine.send({ type: "city" });
  }

  function dispose() {
    clearInterval(timer);
    machine.stop();
  }

  return { machine, house, view, live, missing, waiting, loaded, busy, error, touch, choices, start, stop, finish, takeRoom, deploy, pickRepo, refresh, dispose };
}

export type Tutorial = ReturnType<typeof useTutorial>;
