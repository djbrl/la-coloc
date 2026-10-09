// What a house's server costs, and how the bill is shared. Numbers only; no DOM here, so it's easy to test.

// What the API tells the chef about their server (chef only; null for everyone else). The field is landing in
// `HouseView` from the API side; until then the house inside reads it through this type.
export interface ServerInfo {
  plan: string | null;
  // The agent's key was made: the install command has been shown once, and we're waiting for the agent to call.
  keyMade: boolean;
}

export type PlanId = "small" | "medium" | "large";

export interface Plan {
  id: PlanId;
  // The one word on the tile.
  word: string;
  vcpu: number;
  gb: number;
  // A month, in FCFA. Illustrative until the landlord's real prices are in.
  fcfa: number;
}

export const plans: Plan[] = [
  { id: "small", word: "Small", vcpu: 2, gb: 4, fcfa: 7000 },
  { id: "medium", word: "Medium", vcpu: 4, gb: 8, fcfa: 12000 },
  { id: "large", word: "Large", vcpu: 8, gb: 16, fcfa: 22000 },
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
