// Topping up credit through Paxity (paxity.io): mobile money in FCFA across West and Central Africa. Unlike PayDunya
// there's no checkout page of ours to leave for: we ask Paxity to charge a phone number, it answers with what the payer
// should do (approve in Wave, dial a code, scan a QR code), and the credit window waits while they do it.
// As with PayDunya, only Paxity's own answer about a transaction counts (GET /v2/external/transactions/{id}), never
// what reaches our notice route. Test mode with a `pax_test_` key; a `pax_live_` key is refused unless
// COLOC_PAXITY_LIVE=1. Docs: https://paxity.io/api-reference/v2 (in the site, there's no separate docs host).
import { randomUUID } from "node:crypto";
import type { Payment, PaymentProvider } from "./payments";

/** The countries and ways to pay we offer, by Paxity's method names. Paxity's own list is per country and per account. */
export const PAXITY_COUNTRIES = [
  { code: "SN", prefix: "221", currency: "XOF", methods: ["WAVE", "ORANGE_MONEY", "FREE_MONEY"] },
  { code: "CI", prefix: "225", currency: "XOF", methods: ["WAVE", "ORANGE_MONEY", "MTN_MOMO", "MOOV_MONEY"] },
  { code: "ML", prefix: "223", currency: "XOF", methods: ["ORANGE_MONEY", "MOOV_MONEY"] },
  { code: "BF", prefix: "226", currency: "XOF", methods: ["ORANGE_MONEY", "MOOV_MONEY"] },
  { code: "TG", prefix: "228", currency: "XOF", methods: ["MOOV_MONEY"] },
  { code: "BJ", prefix: "229", currency: "XOF", methods: ["MTN_MOMO", "MOOV_MONEY"] },
  { code: "CM", prefix: "237", currency: "XAF", methods: ["MTN_MOMO", "ORANGE_MONEY"] },
] as const;

export type PaxityCountry = (typeof PAXITY_COUNTRIES)[number];
export type PaxityMethod = PaxityCountry["methods"][number];

export interface PaxityConfig {
  apiKey: string;
  orgId: string;
  baseUrl: string;
  live: boolean;
  /** Minor units per franc in `amount_minor`: 1, as Paxity's test API takes francs (checked 11 Nov 2026). 100 would be centimes. */
  factor: number;
}

/** The keys from the environment, or null when they aren't all there, or when a live key isn't explicitly allowed. */
export function loadPaxityConfig(env = process.env): PaxityConfig | null {
  const apiKey = env.COLOC_PAXITY_API_KEY?.trim();
  const orgId = env.COLOC_PAXITY_ORG_ID?.trim();
  if (!apiKey || !orgId) return null;
  const live = apiKey.startsWith("pax_live_");
  if (live && env.COLOC_PAXITY_LIVE !== "1") return null;
  const factor = Number(env.COLOC_PAXITY_AMOUNT_FACTOR ?? 1);
  return {
    apiKey,
    orgId,
    baseUrl: (env.COLOC_PAXITY_URL?.trim() || "https://api-v2.paxity.io").replace(/\/+$/, ""),
    live,
    factor: factor === 100 ? 100 : 1,
  };
}

/** A phone number in the form Paxity wants (+221771234567), from a country and what the person typed. Null if it can't be one. */
export function paxityPhone(country: PaxityCountry, typed: string): string | null {
  let digits = typed.replace(/[\s.()-]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith(`+${country.prefix}`)) return null;
    digits = digits.slice(country.prefix.length + 1);
  } else if (digits.startsWith(`00${country.prefix}`)) {
    digits = digits.slice(country.prefix.length + 2);
  }
  return /^\d{7,10}$/.test(digits) ? `+${country.prefix}${digits}` : null;
}

/** What the payer is asked to do once Paxity has the transaction. Every field but `ref` may be missing. */
export interface PaxityStarted {
  ref: string;
  instructions: string | null;
  deepLink: string | null;
  redirectUrl: string | null;
  qrCode: string | null;
  expiresAt: string | null;
}

/** Paxity said no to the request itself (a bad number, a method it doesn't offer there), as opposed to not answering. */
export class PaxityRefused extends Error {}

const REF = /^[\w-]{1,80}$/;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
// Only links we can hand to a browser: an app's own scheme (wave://) is fine, javascript: isn't.
const link = (v: unknown) => {
  const s = text(v);
  return s && /^(https:\/\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(s) && !/^(javascript|data|vbscript|file):/i.test(s) ? s : null;
};

// Paxity's states as its test API sends them: "pending", then "succeeded" or a failure. Read in any case.
function status(state: unknown): Payment["status"] {
  const s = String(state ?? "").toUpperCase();
  if (["SUCCESS", "SUCCEEDED", "COMPLETED", "PAID"].includes(s)) return "completed";
  if (["FAILED", "REJECTED", "ERROR", "DECLINED"].includes(s)) return "failed";
  if (["CANCELLED", "CANCELED", "EXPIRED"].includes(s)) return "cancelled";
  return "pending";
}

export class Paxity implements PaymentProvider {
  readonly kind = "phone";
  readonly name = "Paxity";

  constructor(
    private readonly config: PaxityConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  get live(): boolean {
    return this.config.live;
  }

  ledgerKey(ref: string): string {
    return `topup:paxity:${ref}`;
  }

  /** Ask Paxity to charge this number. The person is in `metadata`, which Paxity gives back as it was. */
  async start(input: { amount: number; userId: string; country: PaxityCountry; phone: string; method: PaxityMethod; description: string; callbackUrl: string }): Promise<PaxityStarted> {
    const body = {
      amount_minor: input.amount * this.config.factor,
      currency: input.country.currency,
      country: input.country.code,
      method: input.method,
      customer: { phone: input.phone },
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: { user_id: input.userId, amount_fcfa: String(input.amount) },
    };
    const res = await this.call("v2/external/transactions", {
      method: "POST",
      body: JSON.stringify(body),
      // A new key per attempt: a retry of this same request can't charge twice.
      headers: { "Idempotency-Key": randomUUID(), "Paxity-Request-Id": `coloc-${randomUUID()}` },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status >= 400 && res.status < 500) throw new PaxityRefused(String(data.detail ?? data.title ?? data.code ?? res.status));
    const ref = text(data.id);
    if (!res.ok || !ref || !REF.test(ref)) throw new Error(`Paxity didn't make the transaction (${res.status})`);
    return {
      ref,
      instructions: text(data.instructions),
      deepLink: link(data.deep_link),
      redirectUrl: link(data.redirect_url),
      qrCode: text(data.qr_code),
      expiresAt: text(data.expires_at),
    };
  }

  /** What Paxity itself says about a transaction. Null when it doesn't know it; throws when it doesn't answer. */
  async confirm(ref: string): Promise<Payment | null> {
    if (!REF.test(ref)) return null;
    const res = await this.call(`v2/external/transactions/${ref}`, { method: "GET" });
    if (res.status >= 400 && res.status < 500) return null;
    if (!res.ok) throw new Error(`Paxity didn't answer (${res.status})`);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (text(data.id) !== ref) return null;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const minor = Number(data.amount_minor);
    const currency = String(data.currency ?? "");
    return {
      status: status(data.state),
      // Only francs count: an amount in another currency matches none of the amounts on offer.
      amount: currency === "XOF" || currency === "XAF" ? minor / this.config.factor : Number.NaN,
      userId: text(metadata.user_id),
    };
  }

  /**
   * The transaction a notice is about, wherever the notice puts it. The notice is never trusted beyond that: the
   * caller asks Paxity about the transaction before adding anything.
   */
  refFromNotice(body: unknown): string | null {
    const field = (o: unknown, key: string): unknown => (o && typeof o === "object" ? (o as Record<string, unknown>)[key] : undefined);
    const candidates = [field(body, "id"), field(body, "transaction_id"), field(body, "transactionId"), field(field(body, "data"), "id"), field(field(body, "transaction"), "id")];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && REF.test(candidate)) return candidate;
    }
    return null;
  }

  private call(path: string, init: { method: string; body?: string; headers?: Record<string, string> }): Promise<Response> {
    return this.http(`${this.config.baseUrl}/${path}`, {
      method: init.method,
      body: init.body,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        "X-Api-Key": this.config.apiKey,
        organizationId: this.config.orgId,
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  }
}
