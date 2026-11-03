// Buying credit with PayDunya: only what PayDunya's confirm call says counts, and each invoice adds credit once.
import { createHash } from "node:crypto";
import { type Db, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WELCOME_CREDIT_FCFA } from "../houses/money";
import { seedCity } from "../seed/city";
import { CreditService } from "./credit.service";
import { loadPaydunyaConfig, Paydunya } from "./paydunya";
import { settleTopUp } from "./top-up";

let db: Db;
let credit: CreditService;
let awa: string;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  credit = new CreditService(db);
  [{ id: awa }] = await db.select({ id: users.id }).from(users).where(eq(users.login, "awa"));
});

const config = { masterKey: "master", privateKey: "private", token: "tok", live: false };

// PayDunya, played by a table of invoices. Every call is kept, to check the URL and the keys.
function fakePaydunya(invoices: Record<string, { status: string; total_amount: number; user_id?: string }>) {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
  const http = (async (url: string, init: { headers: Record<string, string>; body?: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    if (url.endsWith("checkout-invoice/create")) {
      return Response.json({ response_code: "00", response_text: "https://app.paydunya.com/sandbox-checkout/invoice/test_new", token: "test_new" });
    }
    const token = url.split("/").pop()!;
    const i = invoices[token];
    if (!i) return Response.json({ response_code: "1001", response_text: "Invoice Not Found" });
    return Response.json({ response_code: "00", status: i.status, invoice: { total_amount: i.total_amount }, custom_data: { user_id: i.user_id } });
  }) as unknown as typeof fetch;
  return { paydunya: new Paydunya(config, http), calls };
}

describe("buying credit with PayDunya", () => {
  it("is only offered when all three keys are set, in test mode unless told otherwise", () => {
    expect(loadPaydunyaConfig({ COLOC_PAYDUNYA_MASTER_KEY: "m", COLOC_PAYDUNYA_PRIVATE_KEY: "p" })).toBeNull();
    expect(loadPaydunyaConfig({ COLOC_PAYDUNYA_MASTER_KEY: "m", COLOC_PAYDUNYA_PRIVATE_KEY: "p", COLOC_PAYDUNYA_TOKEN: "t" })).toMatchObject({ live: false });
  });

  it("makes an invoice in the sandbox, with the person in custom_data and the keys in the headers", async () => {
    const { paydunya, calls } = fakePaydunya({});
    const made = await paydunya.createInvoice({ amount: 5_000, userId: awa, description: "x", returnUrl: "r", cancelUrl: "c", callbackUrl: "n" });
    expect(made).toEqual({ token: "test_new", url: "https://app.paydunya.com/sandbox-checkout/invoice/test_new" });
    expect(calls[0].url).toBe("https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create");
    expect(calls[0].headers).toMatchObject({ "PAYDUNYA-MASTER-KEY": "master", "PAYDUNYA-PRIVATE-KEY": "private", "PAYDUNYA-TOKEN": "tok" });
    expect(JSON.parse(calls[0].body!)).toMatchObject({ invoice: { total_amount: 5_000 }, custom_data: { user_id: awa } });
  });

  it("adds the credit once for a completed invoice, however many times we hear about it", async () => {
    const { paydunya } = fakePaydunya({ test_paid: { status: "completed", total_amount: 5_000, user_id: awa } });
    expect(await settleTopUp(paydunya, credit, "test_paid")).toEqual({ status: "completed", added: 5_000 });
    expect(await settleTopUp(paydunya, credit, "test_paid")).toEqual({ status: "completed", added: 0 });
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA + 5_000);
  });

  it("adds nothing for an invoice that isn't paid, isn't ours, or isn't one of the amounts on offer", async () => {
    const { paydunya } = fakePaydunya({
      test_pending: { status: "pending", total_amount: 5_000, user_id: awa },
      test_cancelled: { status: "cancelled", total_amount: 5_000, user_id: awa },
      test_odd: { status: "completed", total_amount: 1, user_id: awa },
      test_nobody: { status: "completed", total_amount: 5_000 },
    });
    for (const token of ["test_pending", "test_cancelled", "test_odd", "test_nobody", "test_unknown", "../../etc"]) {
      expect((await settleTopUp(paydunya, credit, token)).added).toBe(0);
    }
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA);
  });

  it("recognises PayDunya's notice by the SHA-512 of the master key, and nothing else", () => {
    const { paydunya } = fakePaydunya({});
    expect(paydunya.signedByPaydunya(createHash("sha512").update("master").digest("hex"))).toBe(true);
    expect(paydunya.signedByPaydunya(createHash("sha512").update("other").digest("hex"))).toBe(false);
    expect(paydunya.signedByPaydunya(undefined)).toBe(false);
  });
});
