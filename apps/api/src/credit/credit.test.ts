// The city's fake money: what stops it being spent twice, earned twice or overdrawn, and what a project costs.
import { randomUUID } from "node:crypto";
import { creditEntries, type Db, deployments, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { BUILD_LOST, HousesService } from "../houses/houses.service";
import { PROJECT_COST_FCFA, WELCOME_CREDIT_FCFA } from "../houses/money";
import { RoomDeployer } from "../rooms/room-deployer";
import { seedCity } from "../seed/city";
import { CreditService } from "./credit.service";

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

const refusal = (e: unknown) => (e as { getResponse: () => { code: string; need?: number; max?: number } }).getResponse();

describe("someone's credit", () => {
  it("starts at the welcome amount, the same in the database and in the code", async () => {
    const [made] = await db.insert(users).values({ login: "newcomer" }).returning({ id: users.id });
    expect(await credit.balance(made.id)).toBe(WELCOME_CREDIT_FCFA);
  });

  it("is spent, and says how much is missing when it isn't enough, leaving nothing behind", async () => {
    expect(await credit.spend(awa, 12_000, "server", "a")).toBe(true);
    expect(await credit.balance(awa)).toBe(3_000);
    const no = await credit.spend(awa, 7_000, "server", "b").catch((e) => e);
    expect(refusal(no)).toMatchObject({ code: "no_credit", need: 4_000 });
    expect(await credit.balance(awa)).toBe(3_000);
    expect(await credit.paid("b")).toBe(false);
  });

  it("can't be overdrawn by two payments at once", async () => {
    const results = await Promise.allSettled([credit.spend(awa, 10_000, "server", "a"), credit.spend(awa, 10_000, "server", "b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await credit.balance(awa)).toBe(5_000);
  });

  it("pays and takes once per key, however many times it's asked", async () => {
    expect(await credit.earn(awa, 500, "review", "review:1")).toBe(true);
    expect(await credit.earn(awa, 500, "review", "review:1")).toBe(false);
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA + 500);
    expect(await credit.spend(awa, 1_000, "rent", "bill:1")).toBe(true);
    expect(await credit.spend(awa, 1_000, "rent", "bill:1")).toBe(false);
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA - 500);
  });

  it("gives a refund once, and the key can pay again after it", async () => {
    await credit.spend(awa, 7_000, "server", "a");
    await credit.refund(awa, "a");
    await credit.refund(awa, "a");
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA);
    expect(await credit.spend(awa, 7_000, "server", "a")).toBe(true);
  });

  it("never goes below zero for something that already happened", async () => {
    await db.update(users).set({ credit: 300 }).where(eq(users.id, awa));
    await credit.charge(awa, PROJECT_COST_FCFA, "project", "a");
    expect(await credit.balance(awa)).toBe(0);
  });

  it("shows the latest movements, newest first", async () => {
    await db.insert(creditEntries).values([
      { userId: awa, amount: 500, reason: "review", key: "old", at: new Date("2026-10-01") },
      { userId: awa, amount: -7_000, reason: "server", key: "new", at: new Date("2026-10-02") },
    ]);
    expect((await credit.view(awa)).entries.map((e) => e.reason)).toEqual(["server", "review"]);
  });
});

describe("a project", () => {
  let houses: HousesService;
  let deployer: RoomDeployer;
  const live = async (houseId: string, room: string) => {
    const d = await houses.createDeployment(houseId, room, "prod", "https://x/y.git", "main");
    await houses.recordDeployStatus(houseId, { type: "deploy_status", deployId: d.id, room, status: "live", url: `http://${room}.x` });
  };
  // Awa's room, as someone who has never put anything online there.
  const fresh = async () => (await db.update(rooms).set({ url: null, status: "empty", lastDeployId: null }).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.occupantId, awa))).returning())[0];

  beforeEach(() => {
    houses = new HousesService(db);
    deployer = new RoomDeployer(db, houses, {} as AgentRegistry, null, null);
  });

  it("costs its occupant once, the first time it goes online, and not again on a redeploy", async () => {
    const room = await fresh();
    await live("sacre-coeur", room.name);
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA - PROJECT_COST_FCFA);
    await live("sacre-coeur", room.name);
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA - PROJECT_COST_FCFA);
  });

  it("costs nothing when the build fails", async () => {
    const room = await fresh();
    const d = await houses.createDeployment("sacre-coeur", room.name, "prod", "https://x/y.git", "main");
    await houses.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: room.name, status: "failed", detail: "no" });
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA);
  });

  it("stops after a few real builds, but a build that never got going or was lost to a restart doesn't count", async () => {
    const room = await fresh();
    const build = (status: "failed" | "live", detail: string | null, took: number) => {
      const createdAt = new Date(Date.now() - 60_000);
      return { id: randomUUID(), houseId: "sacre-coeur", room: room.name, kind: "prod" as const, repo: "docker://x/y", ref: "default", status, detail, requestedBy: awa, createdAt, updatedAt: new Date(createdAt.getTime() + took) };
    };
    await db.insert(deployments).values(Array.from({ length: 6 }, () => build("failed", "invalid reference format", 200)));
    await db.insert(deployments).values(Array.from({ length: 6 }, () => build("failed", BUILD_LOST, 45_000)));
    await expect(deployer.brake(room, "prod", awa)).resolves.toBeUndefined();
    await db.insert(deployments).values(Array.from({ length: 5 }, () => build("failed", "a step failed", 45_000)));
    expect(refusal(await deployer.brake(room, "prod", awa).catch((e) => e))).toMatchObject({ code: "slowDownDeploys" });
  });

  it("is free in the workshop", async () => {
    await db.insert(rooms).values({ houseId: "atelier", name: "awa-home", occupantId: awa, memoryMb: 256, cpus: 0.5, status: "empty" });
    await live("atelier", "awa-home");
    expect(await credit.balance(awa)).toBe(WELCOME_CREDIT_FCFA);
    await db.update(users).set({ credit: 0 }).where(eq(users.id, awa));
    const [room] = await db.select().from(rooms).where(eq(rooms.name, "awa-home"));
    await db.update(rooms).set({ url: null }).where(eq(rooms.id, room.id));
    await expect(deployer.brake({ ...room, url: null }, "prod", awa)).resolves.toBeUndefined();
  });

  it("is refused up front when it can't be paid for, but not once it has been", async () => {
    const room = await fresh();
    await db.update(users).set({ credit: 999 }).where(eq(users.id, awa));
    expect(refusal(await deployer.brake(room, "prod", awa).catch((e) => e))).toMatchObject({ code: "no_credit", need: 1 });
    // Previews don't start a project.
    await expect(deployer.brake(room, "preview", awa)).resolves.toBeUndefined();

    await db.update(users).set({ credit: 1_000 }).where(eq(users.id, awa));
    await live("sacre-coeur", room.name);
    await db.delete(deployments);
    await expect(deployer.brake(await fresh(), "prod", awa)).resolves.toBeUndefined();
  });

  it("stops at three a person, and a room that already has one can always build again", async () => {
    const room = await fresh();
    for (const name of ["one", "two", "three"]) {
      await db.insert(rooms).values({ houseId: "sacre-coeur", name, occupantId: awa, memoryMb: 256, cpus: 0.5, status: "live", lastDeployId: "d" });
    }
    expect(refusal(await deployer.brake(room, "prod", awa).catch((e) => e))).toMatchObject({ code: "project_limit", max: 3 });
    const [one] = await db.select().from(rooms).where(eq(rooms.name, "one"));
    await db.update(rooms).set({ status: "empty" }).where(eq(rooms.name, "three"));
    await expect(deployer.brake(one, "prod", awa)).resolves.toBeUndefined();
    await expect(deployer.brake(room, "prod", awa)).resolves.toBeUndefined();
  });
});
