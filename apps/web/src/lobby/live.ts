// The live state of a house, as the world draws it: one window per room (lit, free, down, dark), whether a build is
// running, whether its caretaker is online, and how many knocks and reviews wait there. Read from the city stream's
// `CityHouse`. Pure: no three.js.
import type { CityHouse } from "../types";

// What a room's window shows.
//   lit:  someone lives there and their project is online (warm).
//   free: nobody lives there: blue, with a small "for rent" placard.
//   down: the project is down or its last build failed (a red flicker).
//   dark: someone lives there but nothing runs yet (shutters closed).
export type WindowState = "lit" | "free" | "down" | "dark";

type Room = CityHouse["rooms"][number];

export function windowState(room: Room): WindowState {
  if (!room.occupant) return "free";
  if (room.status === "down" || room.status === "failed") return "down";
  if (room.status === "live") return "lit";
  return "dark";
}

export interface LiveHouse {
  windows: WindowState[];
  // A deploy is running for at least one room: the crane and the scaffold are up.
  building: boolean;
  // A power cut (délestage): a real house whose caretaker is offline goes dark. Example houses have no caretaker at
  // all, so they never do (otherwise eight houses out of nine would always be dark).
  powerCut: boolean;
  knocking: number;
  openChores: number;
  lateChores: number;
}

export function liveState(house: CityHouse): LiveHouse {
  return {
    windows: house.rooms.map(windowState),
    // A room with a deploy running (a first one, or a redeploy of a live room).
    building: house.rooms.some((r) => r.building || r.status === "deploying"),
    powerCut: !house.demo && !house.agentOnline,
    knocking: house.knocking,
    openChores: house.openChores,
    lateChores: house.lateChores,
  };
}

/** A short key for a house's live state: when it's unchanged, nothing needs redrawing. */
export function liveKey(s: LiveHouse): string {
  return `${s.windows.join(",")}|${s.building}|${s.powerCut}|${s.knocking}|${s.openChores}|${s.lateChores}`;
}
