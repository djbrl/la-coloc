// Topping up credit through PayDunya (paydunya.com): mobile money and cards in FCFA, for Senegal, Côte d'Ivoire, Benin,
// Togo, Mali, Burkina Faso and Cameroon. Their hosted checkout does the paying; we only ever trust what their own
// confirm call says about an invoice, never what arrives at our door. Test mode unless COLOC_PAYDUNYA_LIVE=1.
// Docs: https://developers.paydunya.com/doc/FR/http_json
import { createHash } from "node:crypto";
import type { PaymentProvider } from "./payments";

export interface PaydunyaConfig {
  masterKey: string;
  privateKey: string;
  token: string;
  live: boolean;
}

/** The keys from the environment, or null when they aren't all there: then topping up simply isn't offered. */
export function loadPaydunyaConfig(env = process.env): PaydunyaConfig | null {
  const masterKey = env.COLOC_PAYDUNYA_MASTER_KEY;
  const privateKey = env.COLOC_PAYDUNYA_PRIVATE_KEY;
  const token = env.COLOC_PAYDUNYA_TOKEN;
  if (!masterKey || !privateKey || !token) return null;
  return { masterKey, privateKey, token, live: env.COLOC_PAYDUNYA_LIVE === "1" };
}

/** An invoice as PayDunya's confirm call describes it: who it's for comes from custom_data, which we set ourselves. */
export interface Invoice {
  token: string;
  status: "pending" | "cancelled" | "completed" | "failed";
  amount: number;
  userId: string | null;
}

export class Paydunya implements PaymentProvider {
  readonly kind = "page";
  readonly name = "PayDunya";

  constructor(
    private readonly config: PaydunyaConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  get live(): boolean {
    return this.config.live;
  }

  // The key credit entries from PayDunya have always had: the invoice's token.
  ledgerKey(token: string): string {
    return `topup:${token}`;
  }

  /** A checkout page for this amount, for this person. Where they land afterwards gets `?token=` added by PayDunya. */
  async createInvoice(input: { amount: number; userId: string; description: string; returnUrl: string; cancelUrl: string; callbackUrl: string }): Promise<{ token: string; url: string }> {
    const body = {
      invoice: { total_amount: input.amount, description: input.description },
      store: { name: "La Coloc" },
      custom_data: { user_id: input.userId },
      actions: { return_url: input.returnUrl, cancel_url: input.cancelUrl, callback_url: input.callbackUrl },
    };
    const res = await this.call("checkout-invoice/create", { method: "POST", body: JSON.stringify(body) });
    if (res.response_code !== "00" || typeof res.token !== "string" || typeof res.response_text !== "string") {
      throw new Error(`PayDunya refused the invoice: ${String(res.response_text ?? res.response_code)}`);
    }
    return { token: res.token, url: res.response_text };
  }

  /** What PayDunya itself says about an invoice. Null when it doesn't know that token (not ours, or made up). */
  async confirm(token: string): Promise<Invoice | null> {
    if (!/^[\w-]{1,64}$/.test(token)) return null;
    const res = await this.call(`checkout-invoice/confirm/${token}`, { method: "GET" });
    if (res.response_code !== "00") return null;
    const invoice = (res.invoice ?? {}) as { total_amount?: unknown };
    const custom = (res.custom_data ?? {}) as { user_id?: unknown };
    return {
      token,
      status: res.status as Invoice["status"],
      amount: Number(invoice.total_amount),
      userId: typeof custom.user_id === "string" ? custom.user_id : null,
    };
  }

  /**
   * Whether a notice came from PayDunya: its `hash` is the SHA-512 of our master key. That's the same on every notice, so
   * it only filters out noise; the confirm call is what decides.
   */
  signedByPaydunya(hash: unknown): boolean {
    return typeof hash === "string" && hash.toLowerCase() === createHash("sha512").update(this.config.masterKey).digest("hex");
  }

  private async call(path: string, init: { method: string; body?: string }): Promise<Record<string, unknown>> {
    const base = this.config.live ? "https://app.paydunya.com/api/v1/" : "https://app.paydunya.com/sandbox-api/v1/";
    const res = await this.http(base + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": this.config.masterKey,
        "PAYDUNYA-PRIVATE-KEY": this.config.privateKey,
        "PAYDUNYA-TOKEN": this.config.token,
      },
      signal: AbortSignal.timeout(15_000),
    });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }
}
