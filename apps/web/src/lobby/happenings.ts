// What the street shows for each of a house's happenings (`Lobby.happening`, from the city's `recent` list): a pure
// choice, made from what's there right now, so it can be tested without three.js. life.ts plays the plan.
//   review: an envelope from the reviewer to the author, then a coin over the reviewer (the review took money off
//           their rent). Either of them not at the house: the envelope goes from the door up to the roof instead.
//   crash:  the room's window flashes red, a dark puff from the roof, a sound. The other windows stay as they were:
//           one room going down doesn't take its neighbours with it.
//   live:   the fireworks (`celebrate`).
import type { CityHappening } from "../types";

export type Plan =
  | { kind: "envelope"; from: string; to: string }
  | { kind: "envelope-to-roof" }
  // `window`: the room's place among the house's windows, or -1 when the house has no room by that name (the puff
  // and the sound still come).
  | { kind: "crash"; window: number }
  | { kind: "celebrate" };

/**
 * The plan for a happening at a house. `here(login)`: whether that person's figure stands at the house right now;
 * `rooms`: the house's room names, in window order.
 */
export function planFor(h: CityHappening, here: (login: string) => boolean, rooms: string[]): Plan | null {
  switch (h.kind) {
    case "review":
      // A review of your own work isn't one; nor is a review with nobody named.
      if (!h.from || !h.to || h.from === h.to) return { kind: "envelope-to-roof" };
      return here(h.from) && here(h.to) ? { kind: "envelope", from: h.from, to: h.to } : { kind: "envelope-to-roof" };
    case "crash":
      return { kind: "crash", window: rooms.indexOf(h.room) };
    case "live":
      return { kind: "celebrate" };
    default:
      // A kind this page doesn't know yet (a newer API): nothing.
      return null;
  }
}
