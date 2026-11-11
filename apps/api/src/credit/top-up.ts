// Buying credit: a few fixed amounts, paid through the server's payment provider (payments.ts: PayDunya's page or a
// Paxity mobile-money request). Whichever way we hear about a payment (the person coming back, the page asking while
// it waits, or the provider's notice), we ask the provider itself, and add the credit once: the entry's key comes from
// the payment's own reference, so hearing twice adds nothing the second time.
import type { CreditService } from "./credit.service";
import type { PaymentProvider } from "./payments";

export const TOP_UP_AMOUNTS_FCFA = [2_000, 5_000, 10_000];

/**
 * What the provider says about this payment, whose it is, and whether this call is the one that added the credit.
 * `then`: what to do for the person once it's added (pay any rent they were short of).
 */
export async function settleTopUp(
  provider: PaymentProvider,
  credit: CreditService,
  ref: string,
  then?: (userId: string) => Promise<void>,
): Promise<{ status: string; added: number; userId: string | null }> {
  const payment = await provider.confirm(ref);
  if (!payment) return { status: "unknown", added: 0, userId: null };
  const { status, userId } = payment;
  if (status !== "completed" || !userId || !TOP_UP_AMOUNTS_FCFA.includes(payment.amount)) return { status, added: 0, userId };
  const added = await credit.earn(userId, payment.amount, "topup", provider.ledgerKey(ref));
  if (added) await then?.(userId);
  return { status, added: added ? payment.amount : 0, userId };
}
