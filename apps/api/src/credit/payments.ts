// Who takes the money when someone buys credit. Two kinds:
// - a "page" provider (PayDunya) sends the person to its own checkout page and brings them back;
// - a "phone" provider (Paxity) charges a mobile-money number: the person approves it in their operator's app while
//   the credit window waits.
// Either way only the provider's own answer about a payment counts (`confirm`), never what arrives at our door, and
// each payment adds credit once (`ledgerKey`, the credit entry's unique key).
// Which one runs: COLOC_PAYMENTS=paydunya|paxity, or, when it's unset, Paxity if its keys are there, else PayDunya.
import { loadPaxityConfig, Paxity } from "./paxity";
import { loadPaydunyaConfig, Paydunya } from "./paydunya";

/** What the provider itself says about one payment. `userId` comes from data we attached when we made it. */
export interface Payment {
  status: "pending" | "completed" | "failed" | "cancelled";
  amount: number;
  userId: string | null;
}

export interface PaymentProvider {
  readonly kind: "page" | "phone";
  /** Shown to people: "Add 5 000 FCFA with Paxity". */
  readonly name: string;
  readonly live: boolean;
  /** What the provider says about this payment, or null when it doesn't know it (not ours, or made up). */
  confirm(ref: string): Promise<Payment | null>;
  /** The credit entry's key for this payment, so hearing about it twice adds nothing the second time. */
  ledgerKey(ref: string): string;
}

/** The provider this server uses, from the environment, or null when none is set up: then buying isn't offered. */
export function loadPayments(env = process.env): PaymentProvider | null {
  const paxity = loadPaxityConfig(env);
  const paydunya = loadPaydunyaConfig(env);
  const wanted = env.COLOC_PAYMENTS?.trim().toLowerCase();
  if (wanted === "paxity") return paxity ? new Paxity(paxity) : null;
  if (wanted === "paydunya") return paydunya ? new Paydunya(paydunya) : null;
  if (paxity) return new Paxity(paxity);
  return paydunya ? new Paydunya(paydunya) : null;
}
