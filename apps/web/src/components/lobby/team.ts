// Teaming up: flatmates of one house working together on one room's project. A teammate can update, restart and set
// up the room like its occupant, and keeps their own room; the occupant still pays its share. Nobody from another
// house: for them the person card keeps "Invite to my house". Plain functions, so the rules the cards follow are
// tested: whether a flatmate's card offers to team up, and which way round; and how a room's people are written.
import type { Notices, Person } from "../../types";

// At most this many teammates on one room, its occupant not counted (the API holds the same rule: TEAM_MAX).
export const TEAM_MAX = 3;

// A room as both the city's list and the house view describe it: who lives there, and who teamed up on it.
interface TeamRoom {
  name: string;
  occupant: Person | null;
  team?: Person[];
  project?: string | null;
}

export type TeamUp =
  // You're on one project together already (theirs or yours).
  | { kind: "together" }
  // A request is waiting for an answer (you asked to join theirs, or asked them into yours): it can be taken back.
  | { kind: "waiting"; requestId: string }
  // The two ways round: join their project (their room's name), or bring them into yours (your room's name). Null
  // where it can't be done (no room, or its team is full).
  | { kind: "offer"; join: string | null; bring: string | null }
  | null;

const onTeam = (room: TeamRoom | undefined, login: string) => !!room?.team?.some((p) => p.login === login);
const hasSpace = (room: TeamRoom | undefined) => !!room && (room.team?.length ?? 0) < TEAM_MAX;

/**
 * What a flatmate's card offers about teaming up. Null when it isn't for them: it's you, a made-up person, an example
 * house, or someone who doesn't live in your house.
 */
export function teamUp(
  person: { login: string; example: boolean },
  viewer: { login: string } | null,
  // The house you share, as the city or the house view lists it, and your own (first) room in it. Either of you may
  // rent several rooms: you're together if you're on any of them, and an offer is for the first one with a project.
  house: { demo: boolean; rooms: TeamRoom[] } | null,
  myRoom: string | null,
  sent: Notices["sent"],
): TeamUp {
  if (!viewer || !house || house.demo || person.example || person.login === viewer.login) return null;
  const theirs = house.rooms.filter((r) => r.occupant?.login === person.login);
  const mine = myRoom ? house.rooms.filter((r) => r.occupant?.login === viewer.login) : [];
  // Both must live here: you in a room of this house, they in another one.
  if (!theirs.length || !mine.length) return null;
  if (theirs.some((r) => onTeam(r, viewer.login)) || mine.some((r) => onTeam(r, person.login))) return { kind: "together" };
  const waiting = sent.find((s) => (s.kind === "team_invite" || s.kind === "team_ask") && s.to === person.login);
  if (waiting) return { kind: "waiting", requestId: waiting.id };
  const offer = (rooms: TeamRoom[]) => (rooms.find((r) => hasSpace(r) && r.project) ?? rooms.find(hasSpace))?.name ?? null;
  const join = offer(theirs);
  const bring = offer(mine);
  return join || bring ? { kind: "offer", join, bring } : null;
}

/** "Awa", from "Awa Ndiaye", else the login. */
export const firstName = (p: { name: string | null; login: string }) => p.name?.trim().split(/\s+/)[0] || p.login;

/** A room's people, occupant first: "Awa", "Awa + Moussa", "Awa + Moussa + 2". */
export function teamNames(occupant: Person, team: Person[] = []): string {
  if (!team.length) return occupant.name ?? occupant.login;
  const names = [occupant, ...team].map(firstName);
  return names.length <= 3 ? names.join(" + ") : `${names.slice(0, 2).join(" + ")} + ${names.length - 2}`;
}

/** Whether `login` may take `teammate` off the room's team: its occupant may remove anyone, a teammate only leaves. */
export function canRemove(login: string | null, room: TeamRoom, teammate: string): boolean {
  if (!login || !room.team?.some((p) => p.login === teammate)) return false;
  return room.occupant?.login === login || login === teammate;
}
