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

// "2026-10": the calendar month a date falls in, in UTC (Dakar time is UTC all year).
export function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// When that month starts, at midnight UTC.
export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
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
