// What you can do about someone you met in the street (PersonCard.vue). Pure, so the rules are tested: it depends on
// who they are and who you are.
//
// - They live in a house: see it (its window opens, wherever it is).
// - They have no house, and you live in one with a free room: invite them to it (once; then "Invited", which you
//   can take back). Your house is full: no invitation, and the card says why.
// - Neither of you has a house: ask them to rent a server together.
// - You're logged out: log in first.
// - An example person (made up so the city isn't empty): the action shows, disabled, with why. Nothing real happens.
// Then always their GitHub profile, for a real account only, and a wave from the city.
import type { CityHouse, Notices } from "../../types";

export type StreetMain =
  | { kind: "see"; houseId: string; houseName: string }
  | { kind: "invite"; houseId: string; houseName: string; example: boolean }
  | { kind: "invited"; inviteId: string }
  | { kind: "full"; houseName: string }
  | { kind: "rent"; example: boolean }
  | { kind: "asked"; inviteId: string }
  | { kind: "login" }
  | null;

export interface StreetActions {
  main: StreetMain;
  // Their GitHub profile, for a real account only: a made-up person's login may be a stranger's handle.
  github: string | null;
  example: boolean;
  wave: boolean;
}

export interface StreetPerson {
  login: string;
  isMe: boolean;
  // A passer-by, a seeded flatmate, someone in an example house, or someone the live line says is an example.
  example: boolean;
  // Logged in with GitHub, as far as we know (undefined: we don't know, so no link).
  github?: boolean;
  // Their house, if they have one (the workshop doesn't count: it isn't on the city).
  home: { houseId: string; houseName: string } | null;
}

export interface StreetViewer {
  login: string;
  houses: { id: string; name: string }[];
}

export function streetActions(
  person: StreetPerson,
  viewer: StreetViewer | null,
  // Your house as the city lists it (for its free rooms), or null when you have none or it isn't loaded yet.
  myHouse: Pick<CityHouse, "id" | "name" | "demo" | "rooms"> | null,
  sent: Notices["sent"],
): StreetActions {
  const example = person.example;
  const github = person.github === true && !example ? `https://github.com/${encodeURIComponent(person.login)}` : null;
  const wave = !!viewer && !person.isMe;
  return { main: main(), github, example, wave };

  function main(): StreetMain {
    if (person.isMe) return null;
    if (person.home) return { kind: "see", houseId: person.home.houseId, houseName: person.home.houseName };
    if (!viewer) return { kind: "login" };
    if (viewer.houses.length) {
      const invited = sent.find((s) => s.kind === "house_invite" && s.to === person.login);
      if (invited && !example) return { kind: "invited", inviteId: invited.id };
      const house = myHouse && viewer.houses.some((h) => h.id === myHouse.id) ? myHouse : null;
      if (!house || house.demo) return null;
      if (!house.rooms.some((r) => !r.occupant)) return { kind: "full", houseName: house.name };
      return { kind: "invite", houseId: house.id, houseName: house.name, example };
    }
    const asked = sent.find((s) => s.kind === "rent_together" && s.to === person.login);
    if (asked && !example) return { kind: "asked", inviteId: asked.id };
    return { kind: "rent", example };
  }
}
