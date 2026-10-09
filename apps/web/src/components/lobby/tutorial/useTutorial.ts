// The tutorial for Vue: the step machine (tutorial.ts) made reactive, plus everything that talks to the API:
// where the tutorial stands (asked every two seconds while a step waits on it), taking a room, running the
// sample, and marking the tutorial done. LobbyView owns one of these.
import { computed, reactive, ref, watch } from "vue";
import { loadMe, postJSON, sendJSON } from "../../../session";
import { settings } from "../../../settings";
import type { CityHouse, HouseView, TutorialState } from "../../../types";
import { isLive, SETUP, TUTORIAL_HOUSE, TutorialMachine } from "./tutorial";

// How often the API is asked about the room and GitHub while those steps are on.
const POLL_MS = 2000;

export function useTutorial() {
  // Phones and tablets: no keys to learn (see stepsFor).
  const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  // Reactive, so the coach and the lobby follow every step the machine takes.
  const machine = reactive(new TutorialMachine({ touch })) as TutorialMachine;
  // The workshop as a house view, for its rooms on the map.
  const view = ref<HouseView | null>(null);
  // The API answered 404: this server doesn't have the tutorial yet.
  const missing = ref(false);
  const busy = ref(false);
  const error = ref("");
  // "Run it" was pressed: from here the coach's sentence follows the room's status.
  const ran = ref(false);
  let timer = 0;
  // The room as last fetched (name and status): when it changes, the house view is fetched again.
  let roomKey = "";

  const live = computed(() => isLive(machine.state));

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

  // Asks the API where the tutorial stands and tells the machine. A 404 means "not on this server"; any other
  // failure keeps what we had.
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
    machine.send({ type: "state", state: next });
    const key = next.room ? `${next.room.name}:${next.room.status}` : "";
    if (key !== roomKey || !view.value) {
      roomKey = key;
      await loadView();
    }
  }

  function start() {
    view.value = null;
    missing.value = false;
    busy.value = false;
    error.value = "";
    ran.value = false;
    roomKey = "";
    machine.start();
    void refresh();
  }

  function stop() {
    machine.stop();
  }

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
      // A 409 says the workshop's server is offline: the coach shows the message and "Try again".
      error.value = res.message;
      return;
    }
    ran.value = true;
    await refresh();
  }

  // Finishing and skipping both mark the tutorial done on your profile (and the old welcome as seen), then bring
  // the city back behind its own welcome. Settings can bring the tutorial back.
  async function finish() {
    if (busy.value) return;
    busy.value = true;
    try {
      await sendJSON("PATCH", "/api/me", { tutorialDone: true });
      await loadMe();
    } catch {
      // Offline for a moment: the city comes back all the same, and the tutorial offers itself again next time.
    }
    busy.value = false;
    settings.welcomed = true;
    machine.send({ type: "city" });
  }

  function dispose() {
    clearInterval(timer);
    machine.stop();
  }

  return { machine, house, live, missing, busy, error, ran, touch, start, stop, finish, takeRoom, deploy, dispose };
}

export type Tutorial = ReturnType<typeof useTutorial>;
