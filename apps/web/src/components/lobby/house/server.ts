// What a house's server costs, and how the bill is shared. Numbers only; no DOM here, so it's easy to test.

// What the API tells the chef about their server (chef only; null for everyone else). The field is landing in
// `HouseView` from the API side; until then the house inside reads it through this type.
export interface ServerInfo {
  plan: string | null;
  // The server's key was made. Paid for too: the server is on its way. Not paid for: a house left half-way by the old
  // way in, pasting a command. It pays like any other, and that replaces the key (RentServer.vue).
  keyMade: boolean;
}

export type PlanId = "small" | "medium" | "large";

export interface Plan {
  // Also names the size: its one word on the tile is rentWords.plans[id] (joinWords.ts), in the current language.
  id: PlanId;
  vcpu: number;
  gb: number;
  // A month, in FCFA. Illustrative until the landlord's real prices are in.
  fcfa: number;
}

export const plans: Plan[] = [
  { id: "small", vcpu: 2, gb: 4, fcfa: 7000 },
  { id: "medium", vcpu: 4, gb: 8, fcfa: 12000 },
  { id: "large", vcpu: 8, gb: 16, fcfa: 22000 },
];

// "12 000 FCFA": thousands split by a non-breaking space, the French way, so the amount never wraps.
export function fcfa(amount: number): string {
  const digits = Math.round(amount).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// The month's cost shared evenly between `people`, rounded to the nearest 100 FCFA. The real bill splits by
// measured usage at month end; this is the estimate shown until then.
export function evenSplit(monthlyCost: number, people: number): number {
  return Math.round(monthlyCost / Math.max(1, people) / 100) * 100;
}

// How people pay when the API doesn't say.
export const OPERATORS = ["Wave", "Orange Money", "Free Money"];

// What the house's server costs a month. The workshop has no real bill, so it shows what a medium server costs: even
// the first house you walk into should remind you this is money.
export function houseCost(house: { monthlyCostFcfa: number | null; tutorial?: boolean }): number | null {
  return house.monthlyCostFcfa ?? (house.tutorial ? plans[1].fcfa : null);
}

type RentHouse = { monthlyCostFcfa: number | null; tutorial?: boolean; rooms: { occupant: { login: string } | null }[]; bill?: { lines: { login: string; due: number }[] } | null };

// What a room pays a month. Its occupant's line on this month's bill if the viewer can see the bill (reviews already
// taken off), shared between the rooms they rent, otherwise the server's cost split evenly. A free room says what
// someone moving in would pay. Null with no cost yet.
export function rentOf(house: RentHouse, room: { occupant: { login: string } | null }): number | null {
  const billed = room.occupant && house.bill?.lines.find((l) => l.login === room.occupant!.login);
  if (billed) return Math.round(billed.due / Math.max(1, house.rooms.filter((r) => r.occupant?.login === room.occupant!.login).length));
  const cost = houseCost(house);
  if (!cost) return null;
  const lived = house.rooms.filter((r) => r.occupant).length;
  return evenSplit(cost, room.occupant ? lived : lived + 1);
}

// What someone pays a month, whichever rooms they rent: their line on the bill, or the estimate for their rooms. It
// also holds for someone whose last lease has ended: no room, still on the bill. Null with nothing to say.
export function rentOfPerson(house: RentHouse, login: string): number | null {
  const billed = house.bill?.lines.find((l) => l.login === login);
  if (billed) return billed.due;
  const theirs = house.rooms.filter((r) => r.occupant?.login === login);
  const each = theirs.length ? rentOf(house, theirs[0]) : null;
  return each === null ? null : each * theirs.length;
}

// What a tenant pays now, and what they'd pay with someone in one more room: why a free room is good news. Null when
// there's no cost yet, they rent nothing here, or one more person wouldn't lower it.
export function rentWithOneMore(house: RentHouse, login: string): { now: number; then: number } | null {
  const cost = houseCost(house);
  const now = rentOfPerson(house, login);
  const theirs = house.rooms.filter((r) => r.occupant?.login === login).length;
  if (!cost || !now || !theirs) return null;
  const then = evenSplit(cost, house.rooms.filter((r) => r.occupant).length + 1) * theirs;
  return then < now ? { now, then } : null;
}
