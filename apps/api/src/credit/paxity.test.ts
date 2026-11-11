// Buying credit with Paxity: we ask it to charge a number, only its own answer about the transaction counts, and each
// transaction adds credit once. Paxity is played by a table of transactions; every call is kept to check URLs and keys.
import { type Db, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { WELCOME_CREDIT_FCFA } from "../houses/money";
import { seedCity } from "../seed/city";
import { CreditController } from "./credit.controller";
import { CreditService } from "./credit.service";
import { loadPayments } from "./payments";
import { loadPaxityConfig, PAXITY_COUNTRIES, Paxity, paxityPhone, PaxityRefused } from "./paxity";
import { Paydunya } from "./paydunya";
import { settleTopUp } from "./top-up";

let db: Db;
let credit: CreditService;
let awa: string;
let bob: string;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  credit = new CreditService(db);
  const people = await db.select({ id: users.id, login: users.login }).from(users);
  awa = people.find((p) => p.login === "awa")!.id;
  bob = people.find((p) => p.login !== "awa")!.id;
  expect(await db.select().from(users).where(eq(users.id, bob))).toHaveLength(1);
});

const config = { apiKey: "pax_test_abc", orgId: "org_1", baseUrl: "https://api-v2.paxity.io", live: false, factor: 1 };
const SN = PAXITY_COUNTRIES.find((c) => c.code === "SN")!;

type Tx = { state: string; amount_minor: number; currency?: string; user_id?: string };

function fakePaxity(transactions: Record<string, Tx>, made: Record<string, unknown> = {}, createStatus = 201) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const http = (async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (init.method === "POST") {
      if (createStatus >= 400) return Response.json({ code: "invalid-phone", title: "Invalid phone" }, { status: createStatus });
      return Response.json({ id: "txn_new", state: "pending", environment: "test", instructions: "Confirmez dans Wave.", deep_link: "https://pay.wave.com/c/x", ...made }, { status: createStatus });
    }
    const id = url.split("/").pop()!;
    const t = transactions[id];
    if (!t) return Response.json({ code: "not-found" }, { status: 404 });
    return Response.json({ id, state: t.state, amount_minor: t.amount_minor, currency: t.currency ?? "XOF", metadata: t.user_id ? { user_id: t.user_id } : {} });
  }) as unknown as typeof fetch;
  return { paxity: new Paxity(config, http), calls };
}

describe("Paxity's keys", () => {
  it("are needed both, and a live key only runs when allowed", () => {
    expect(loadPaxityConfig({ COLOC_PAXITY_API_KEY: "pax_test_x" })).toBeNull();
    expect(loadPaxityConfig({ COLOC_PAXITY_API_KEY: "pax_test_x", COLOC_PAXITY_ORG_ID: "org" })).toMatchObject({ live: false, factor: 1, baseUrl: "https://api-v2.paxity.io" });
    expect(loadPaxityConfig({ COLOC_PAXITY_API_KEY: "pax_live_x", COLOC_PAXITY_ORG_ID: "org" })).toBeNull();
    expect(loadPaxityConfig({ COLOC_PAXITY_API_KEY: "pax_live_x", COLOC_PAXITY_ORG_ID: "org", COLOC_PAXITY_LIVE: "1" })).toMatchObject({ live: true });
    expect(loadPaxityConfig({ COLOC_PAXITY_API_KEY: "pax_test_x", COLOC_PAXITY_ORG_ID: "org", COLOC_PAXITY_AMOUNT_FACTOR: "100" })).toMatchObject({ factor: 100 });
  });

  it("pick the provider: Paxity when its keys are there, PayDunya otherwise, or the one named", () => {
    const paxity = { COLOC_PAXITY_API_KEY: "pax_test_x", COLOC_PAXITY_ORG_ID: "org" };
    const paydunya = { COLOC_PAYDUNYA_MASTER_KEY: "m", COLOC_PAYDUNYA_PRIVATE_KEY: "p", COLOC_PAYDUNYA_TOKEN: "t" };
    expect(loadPayments({})).toBeNull();
    expect(loadPayments(paydunya)).toBeInstanceOf(Paydunya);
    expect(loadPayments({ ...paydunya, ...paxity })).toBeInstanceOf(Paxity);
    expect(loadPayments({ ...paydunya, ...paxity, COLOC_PAYMENTS: "paydunya" })).toBeInstanceOf(Paydunya);
    expect(loadPayments({ ...paydunya, COLOC_PAYMENTS: "paxity" })).toBeNull();
  });
});

describe("a phone number for Paxity", () => {
  it("comes out as +<country><number>, however it was typed", () => {
    expect(paxityPhone(SN, "77 123 45 67")).toBe("+221771234567");
    expect(paxityPhone(SN, "+221 77-123-45-67")).toBe("+221771234567");
    expect(paxityPhone(SN, "00221771234567")).toBe("+221771234567");
  });

  it("is refused when it isn't one, or belongs to another country", () => {
    expect(paxityPhone(SN, "+225 07 12 34 56 78")).toBeNull();
    expect(paxityPhone(SN, "12")).toBeNull();
    expect(paxityPhone(SN, "77 12a 45 67")).toBeNull();
  });
});

describe("buying credit with Paxity", () => {
  it("asks Paxity to charge the number, with the person in metadata and the key in the headers", async () => {
    const { paxity, calls } = fakePaxity({});
    const started = await paxity.start({ amount: 5_000, userId: awa, country: SN, phone: "+221771234567", method: "WAVE", description: "x", callbackUrl: "https://c/notice" });
    expect(started).toMatchObject({ ref: "txn_new", instructions: "Confirmez dans Wave.", deepLink: "https://pay.wave.com/c/x", qrCode: null });
    expect(calls[0].url).toBe("https://api-v2.paxity.io/v2/external/transactions");
    expect(calls[0].headers).toMatchObject({ "X-Api-Key": "pax_test_abc", organizationId: "org_1" });
    expect(calls[0].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(calls[0].body!)).toEqual({
      amount_minor: 5_000,
      currency: "XOF",
      country: "SN",
      method: "WAVE",
      customer: { phone: "+221771234567" },
      description: "x",
      callback_url: "https://c/notice",
      metadata: { user_id: awa, amount_fcfa: "5000" },
    });
  });

  it("never hands the page a link a browser shouldn't open", async () => {
    const { paxity } = fakePaxity({}, { deep_link: "javascript:alert(1)", redirect_url: "wave://pay/1" });
    const started = await paxity.start({ amount: 2_000, userId: awa, country: SN, phone: "+221771234567", method: "WAVE", description: "x", callbackUrl: "c" });
    expect(started.deepLink).toBeNull();
    expect(started.redirectUrl).toBe("wave://pay/1");
  });

  it("tells a refusal from Paxity apart from Paxity not answering", async () => {
    const { paxity } = fakePaxity({}, {}, 422);
    await expect(paxity.start({ amount: 2_000, userId: awa, country: SN, phone: "+221771234567", method: "WAVE", description: "x", callbackUrl: "c" })).rejects.toBeInstanceOf(PaxityRefused);
    const down = new Paxity(config, (async () => new Response("", { status: 502 })) as unknown as typeof fetch);
    await expect(down.start({ amount: 2_000, userId: awa, country: SN, phone: "+221771234567", method: "WAVE", description: "x", callbackUrl: "c" })).rejects.not.toBeInstanceOf(PaxityRefused);
  });

  it("adds the credit once for a successful transaction, however many times we hear about it", async () => {
    const { paxity, calls } = fakePaxity({ txn_paid: { state: "succeeded", amount_minor: 5_000, user_id: awa } });
    expect(await settleTopUp(paxity, credit, "txn_paid")).toEqual({ status: "completed", added: 5_000, userId: awa });
    expect(await settleTopUp(paxity, credit, "txn_paid")).toEqual({ status: "completed", added: 0, userId: awa });
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA + 5_000);
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api-v2.paxity.io/v2/external/transactions/txn_paid" });
  });

  it("adds nothing for a transaction that isn't paid, isn't ours, isn't in francs or isn't an amount on offer", async () => {
    const { paxity } = fakePaxity({
      txn_pending: { state: "pending", amount_minor: 5_000, user_id: awa },
      txn_failed: { state: "failed", amount_minor: 5_000, user_id: awa },
      txn_expired: { state: "expired", amount_minor: 5_000, user_id: awa },
      txn_euros: { state: "succeeded", amount_minor: 5_000, currency: "EUR", user_id: awa },
      txn_odd: { state: "succeeded", amount_minor: 1, user_id: awa },
      txn_nobody: { state: "succeeded", amount_minor: 5_000 },
    });
    for (const ref of ["txn_pending", "txn_failed", "txn_expired", "txn_euros", "txn_odd", "txn_nobody", "txn_unknown", "../../etc"]) {
      expect((await settleTopUp(paxity, credit, ref)).added).toBe(0);
    }
    expect((await settleTopUp(paxity, credit, "txn_expired")).status).toBe("cancelled");
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA);
  });

  it("reads amounts in centimes when Paxity wants them", async () => {
    const http = (async () => Response.json({ id: "txn_c", state: "succeeded", amount_minor: 200_000, currency: "XOF", metadata: { user_id: awa } })) as unknown as typeof fetch;
    const paxity = new Paxity({ ...config, factor: 100 }, http);
    expect((await settleTopUp(paxity, credit, "txn_c")).added).toBe(2_000);
  });
});

describe("the credit window's Paxity routes", () => {
  const req = {} as HttpRequest;
  const as = (id: string) => ({ userFromRequest: async () => ({ id }), config: { publicUrl: "https://coloc.test" } }) as unknown as AuthService;

  it("offer the countries and operators, and start a payment for a valid number and operator", async () => {
    const { paxity, calls } = fakePaxity({});
    const controller = new CreditController(credit, as(awa), paxity);
    const mine = await controller.mine(req);
    expect(mine.topUp).toMatchObject({ provider: "Paxity", test: true, amounts: [2_000, 5_000, 10_000] });
    expect(mine.topUp?.phone?.find((c) => c.code === "SN")).toEqual({ code: "SN", prefix: "221", methods: ["WAVE", "ORANGE_MONEY", "FREE_MONEY"] });
    const res = await controller.topUp({ amount: 5_000, country: "SN", phone: "77 123 45 67", method: "WAVE" }, req);
    expect(res).toMatchObject({ pending: { ref: "txn_new", method: "WAVE" } });
    expect(JSON.parse(calls[0].body!)).toMatchObject({ callback_url: "https://coloc.test/api/credit/top-up/notice" });
  });

  it("refuse a bad number, an operator the country doesn't have, and too many requests", async () => {
    const { paxity } = fakePaxity({});
    const controller = new CreditController(credit, as(awa), paxity);
    await expect(controller.topUp({ amount: 5_000, country: "SN", phone: "12", method: "WAVE" }, req)).rejects.toMatchObject({ response: { code: "topUpPhone" } });
    await expect(controller.topUp({ amount: 5_000, country: "SN", phone: "771234567", method: "MTN_MOMO" }, req)).rejects.toMatchObject({ response: { code: "topUpMethod" } });
    for (let i = 0; i < 5; i++) await controller.topUp({ amount: 2_000, country: "SN", phone: "771234567", method: "WAVE" }, req);
    await expect(controller.topUp({ amount: 2_000, country: "SN", phone: "771234567", method: "WAVE" }, req)).rejects.toMatchObject({ response: { code: "topUpSlowDown" } });
  });

  it("settle while the window waits, and only tell the person paying", async () => {
    const { paxity } = fakePaxity({ txn_paid: { state: "succeeded", amount_minor: 2_000, user_id: awa } });
    expect(await new CreditController(credit, as(bob), paxity).check("txn_paid", req)).toEqual({ status: "unknown", added: 0 });
    expect(await new CreditController(credit, as(awa), paxity).check("txn_paid", req)).toEqual({ status: "completed", added: 0 });
    // Bob's look settled it for Awa all the same: it's her credit either way.
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA + 2_000);
  });

  it("keep waiting when Paxity doesn't answer", async () => {
    const down = new Paxity(config, (async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    expect(await new CreditController(credit, as(awa), down).check("txn_x", req)).toEqual({ status: "pending", added: 0 });
  });

  it("take Paxity's notice as a hint and ask Paxity before adding anything", async () => {
    const { paxity, calls } = fakePaxity({ txn_paid: { state: "succeeded", amount_minor: 10_000, user_id: awa } });
    const controller = new CreditController(credit, as(awa), paxity);
    await controller.notice({ data: { id: "txn_paid" } } as never);
    await controller.notice({ id: "txn_paid", state: "succeeded" } as never);
    await controller.notice({ id: "txn_unknown", state: "succeeded", amount_minor: 10_000 } as never);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(3);
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA + 10_000);
  });
});
