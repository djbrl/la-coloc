// Buying credit with PayDunya: a few fixed amounts, paid on PayDunya's own page. Whichever way we hear about a payment
// (the person coming back, or PayDunya's notice), we ask PayDunya itself, and add the credit once: the entry's key is
// the invoice's token, so hearing twice adds nothing the second time.
import type { CreditService } from "./credit.service";
import type { Paydunya } from "./paydunya";

export const TOP_UP_AMOUNTS_FCFA = [2_000, 5_000, 10_000];

export const topUpKey = (token: string) => `topup:${token}`;

/**
 * What PayDunya says about this invoice, and whether this call is the one that added the credit. `then`: what to do
 * for the person once it's added (pay any rent they were short of).
 */
export async function settleTopUp(paydunya: Paydunya, credit: CreditService, token: string, then?: (userId: string) => Promise<void>): Promise<{ status: string; added: number }> {
  const invoice = await paydunya.confirm(token);
  if (!invoice) return { status: "unknown", added: 0 };
  if (invoice.status !== "completed" || !invoice.userId || !TOP_UP_AMOUNTS_FCFA.includes(invoice.amount)) return { status: invoice.status, added: 0 };
  const added = await credit.earn(invoice.userId, invoice.amount, "topup", topUpKey(token));
  if (added) await then?.(invoice.userId);
  return { status: invoice.status, added: added ? invoice.amount : 0 };
}
