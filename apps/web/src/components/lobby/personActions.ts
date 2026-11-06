// What you can do about someone you met in the street (PersonCard.vue), after the Chat key every person has
// (messageAction in chat/chat.ts). Pure, so the rules are tested: it depends on who they are and who you are.
//
// At most two more keys:
// - `see`: they live in a house: see it (its window opens, wherever it is).
// - `offer`, one of:
//   - You live in a house with a free room: invite them to it, even if they live somewhere already (once; then
//     "Invited", which you can take back), to the room you pick when there are several.
//   - You have no house, or yours is full: ask them to share a house, even if one or both of you live somewhere
//     already (once; then "Asked", which you can take back).
//   - Nothing when they live with you already, or when you're logged out.
// An example person (made up so the city isn't empty): the offer shows, disabled, with why. Nothing real happens.
// And their GitHub profile, for a real account only.
import type { CityHouse, Notices } from "../../types";

export type StreetOffer =
  // `rooms`: its free rooms, the first offered unless you pick another.
  | { kind: "invite"; houseId: string; houseName: string; rooms: string[]; example: boolean }
  | { kind: "invited"; inviteId: string }
  | { kind: "share"; example: boolean }
  | { kind: "asked"; inviteId: string };

export interface StreetActions {
  see: { houseId: string; houseName: string } | null;
  offer: StreetOffer | null;
  // Their GitHub profile, for a real account only: a made-up person's login may be a stranger's handle.
  github: string | null;
  example: boolean;
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
  // Your house as the city lists it (for its free rooms), or null when you have none or it isn't listed.
  myHouse: Pick<CityHouse, "id" | "name" | "demo" | "rooms"> | null,
  sent: Notices["sent"],
): StreetActions {
  const example = person.example;
  const github = person.github === true && !example ? `https://github.com/${encodeURIComponent(person.login)}` : null;
  return { see: person.isMe ? null : person.home, offer: offer(), github, example };

  function offer(): StreetOffer | null {
    if (person.isMe || !viewer) return null;
    if (person.home && viewer.houses.some((h) => h.id === person.home!.houseId)) return null;
    if (!example) {
      const invited = sent.find((s) => s.kind === "house_invite" && s.to === person.login);
      if (invited) return { kind: "invited", inviteId: invited.id };
      const asked = sent.find((s) => s.kind === "rent_together" && s.to === person.login);
      if (asked) return { kind: "asked", inviteId: asked.id };
    }
    const house = myHouse && !myHouse.demo && viewer.houses.some((h) => h.id === myHouse.id) ? myHouse : null;
    const rooms = house ? house.rooms.filter((r) => !r.occupant).map((r) => r.name) : [];
    if (house && rooms.length) return { kind: "invite", houseId: house.id, houseName: house.name, rooms, example };
    return { kind: "share", example };
  }
}
