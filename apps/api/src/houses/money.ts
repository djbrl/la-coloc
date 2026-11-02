// The money side of a house: how the bill is paid where the house lives, and the tontine's calendar.
// Text names only, never operator logos (those are trademarks).

// Mobile money (or the usual way to pay) per country, most used first.
export const OPERATORS: Record<string, string[]> = {
  SN: ["Wave", "Orange Money", "Free Money"],
  CI: ["Orange Money", "MTN MoMo", "Moov Money", "Wave"],
  TG: ["T-Money", "Flooz"],
  BJ: ["MTN MoMo", "Moov Money"],
  CM: ["MTN MoMo", "Orange Money"],
  RW: ["MTN MoMo", "Airtel Money"],
  TN: ["D17", "Flouci"],
  // Mobile wallets are less central in Morocco: people pay by card or transfer.
  MA: ["bank card", "bank transfer"],
};

export function operatorsFor(country: string): string[] {
  return OPERATORS[country] ?? [];
}

// Each review done for the house this month knocks this much off your line of the bill (see creditReviews).
export const REVIEW_CREDIT_FCFA = 500;

// The city's fake money: what everyone starts with (the column's default in packages/db says the same), and what a
// project costs the first time it goes online.
export const WELCOME_CREDIT_FCFA = 15_000;
export const PROJECT_COST_FCFA = 1_000;
// So nobody takes too much space on the machine: one server a person, and a few rooms with a project in them.
export const MAX_SERVERS_PER_PERSON = 1;
export const MAX_PROJECTS_PER_PERSON = 3;
// How many rooms one person may rent, across the city. The workshop's doesn't count.
export const MAX_ROOMS_PER_PERSON = 3;
// The workshop, where every newcomer's first room is free. The same id as in the seed (seed/city.ts).
export const WORKSHOP_ID = "atelier";

// "2026-10": the calendar month a date falls in, in UTC (Dakar time is UTC all year).
export function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// When that month starts, at midnight UTC.
export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

// The last moment of that month: when a lease that ended during it stops costing anything.
export function monthEnd(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 1) - 1);
}

// "sacre-coeur", "2026-10" → "COLOC-SACRE-COEUR-2026-10": what a flatmate types in the payment's note.
export function billReference(houseId: string, month: string): string {
  return `COLOC-${houseId.toUpperCase()}-${month}`;
}

// The day the tontine's fortnights are counted from: Monday 21 September 2026, midnight UTC, when the city opened.
// Every house uses the same anchor, so all turns pass on the same Monday, and whose turn it is never depends on
// when someone looked. The first in line (tontine position 0) had the first fortnight, the second has the one from
// 5 October, and so on round the house. The order is the flatmates' tontine positions (memberships.tontinePosition).
export const TONTINE_ANCHOR = Date.UTC(2026, 8, 21);
