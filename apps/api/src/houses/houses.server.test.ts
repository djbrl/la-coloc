import "reflect-metadata";
import { billPayments, type Db, houses } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { ConflictException } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import type { AuthService } from "../auth/auth.service";
import { seedCity } from "../seed/city";
import { CityController, HousesController } from "./houses.controller";
import { hashSecret, HousesService } from "./houses.service";
import type { Landlord } from "./landlord";
import { agentUrl, installCommand } from "./server";

let db: Db;
let as: string | null;
let service: HousesService;
let controller: HousesController;
let city: CityController;
let changed: string[];
let hungUp: string[];
let agents: AgentRegistry;
let auth: AuthService;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // Sacré-Cœur is live and already has a key ("s"); jib is its chef and awa a flatmate.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  as = null;
  hungUp = [];
  agents = { isOnline: () => true, send: () => undefined, hangUp: (id: string) => hungUp.push(id) } as unknown as AgentRegistry;
  // Logs the request in as whoever `as` names.
  auth = {
    config: { publicUrl: "https://coloc.dev" },
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
  } as unknown as AuthService;
  service = new HousesService(db);
  changed = [];
  service.changes.subscribe((id) => changed.push(id));
  controller = new HousesController(service, agents, auth);
  city = new CityController(service, auth);
});

const req = { headers: {} };
const rentServer = (id: string, body: unknown) => controller.rentServer(id, body, req);

// jib starts a new house, still in the making and with no key: Médina Lab.
async function newHouse(): Promise<string> {
  as = "jib";
  const { id } = await city.rent({ city: "Dakar", plot: "2.1.0.1", name: "Médina Lab" }, req);
  return id;
}

async function row(id: string) {
  const [h] = await db.select().from(houses).where(eq(houses.id, id));
  return h;
}

describe("renting a house's server", () => {
  it("answers 201 with a one-time key and the command that installs the agent", async () => {
    const id = await newHouse();
    changed = [];
    const res = await rentServer(id, { plan: "medium" });

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, HousesController.prototype.rentServer)).toBe(201);
    expect(res.plan).toBe("medium");
    expect(res.monthlyCostFcfa).toBe(12_000);
    // 32 random bytes in base64url: 43 characters, safe to paste in a shell.
    expect(res.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.command).toContain("https://coloc.dev/install.sh");
    expect(res.command).toContain(`COLOC_HOUSE_ID=${id}`);
    expect(res.command).toContain(`COLOC_AGENT_SECRET=${res.secret}`);
    expect(res.command).toContain("COLOC_API_URL=wss://coloc.dev/agent");
    expect(res.command).toContain("COLOC_HOUSE_DOMAIN=medina-lab.coloc.dev");
    expect(changed).toContain(id);

    // Only the hash is kept.
    const h = await row(id);
    expect(h.agentSecretHash).toBe(hashSecret(res.secret));
    expect(h).toMatchObject({ plan: "medium", monthlyCostFcfa: 12_000, status: "making" });
    expect(await service.verifyAgentSecret(id, res.secret)).toBe(true);
  });

  it("prices each size", async () => {
    const id = await newHouse();
    expect((await rentServer(id, { plan: "small" })).monthlyCostFcfa).toBe(7_000);
    expect((await rentServer(id, { plan: "large", renew: true })).monthlyCostFcfa).toBe(22_000);
  });

  it("asks you to log in first", async () => {
    await expect(rentServer("sacre-coeur", { plan: "small" })).rejects.toThrow("Log in first.");
  });

  it("only lets the chef rent it", async () => {
    as = "awa";
    await expect(rentServer("sacre-coeur", { plan: "small", renew: true })).rejects.toThrow("Only the chef rents the server.");
    expect((await row("sacre-coeur")).agentSecretHash).toBe(hashSecret("s"));
  });

  it("refuses a size that isn't on offer", async () => {
    const id = await newHouse();
    await expect(rentServer(id, { plan: "huge" })).rejects.toThrow("Pick a small, medium or large server.");
  });

  it("keeps an existing key unless asked to replace it", async () => {
    as = "jib";
    await expect(rentServer("sacre-coeur", { plan: "medium" })).rejects.toThrow("This house already has a key. Make a new one to replace it.");
    expect(await service.verifyAgentSecret("sacre-coeur", "s")).toBe(true);
    expect(hungUp).toEqual([]);

    const res = await rentServer("sacre-coeur", { plan: "medium", renew: true });
    expect(await service.verifyAgentSecret("sacre-coeur", "s")).toBe(false);
    expect(await service.verifyAgentSecret("sacre-coeur", res.secret)).toBe(true);
    // The agent still on the line with the old key is cut off.
    expect(hungUp).toEqual(["sacre-coeur"]);
  });

  it("shows the server to the chef and to nobody else", async () => {
    const id = await newHouse();
    expect((await service.view(id, (await user("jib")).id))!.server).toEqual({ plan: null, keyMade: false });
    await rentServer(id, { plan: "small" });
    expect((await service.view(id, (await user("jib")).id))!.server).toEqual({ plan: "small", keyMade: true });

    expect((await service.view("sacre-coeur", (await user("awa")).id))!.server).toBeNull();
    expect((await service.view("sacre-coeur", null))!.server).toBeNull();
  });
});

describe("a house going live", () => {
  it("flips from making to live the first time its agent phones in, and tells live pages", async () => {
    const id = await newHouse();
    changed = [];
    expect(await service.markLive(id)).toBe(true);
    expect((await row(id)).status).toBe("live");
    expect(changed).toEqual([id]);

    // Already live: nothing changes and nobody is pinged.
    expect(await service.markLive(id)).toBe(false);
    expect(await service.markLive("sacre-coeur")).toBe(false);
    expect(changed).toEqual([id]);
  });
});

describe("the install command", () => {
  it("phones in over wss for an https site, and ws for a local one", () => {
    expect(agentUrl("https://coloc.dev")).toBe("wss://coloc.dev/agent");
    expect(agentUrl("http://localhost:5175")).toBe("ws://localhost:5175/agent");
    expect(installCommand("x", "KEY", "http://localhost:5175/", "x.coloc.dev")).toBe(
      "curl -fsSL http://localhost:5175/install.sh | sudo COLOC_HOUSE_ID=x COLOC_AGENT_SECRET=KEY COLOC_API_URL=ws://localhost:5175/agent COLOC_HOUSE_DOMAIN=x.coloc.dev sh",
    );
  });
});

async function user(login: string) {
  return (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) }))!;
}

describe("paying for a house's server", () => {
  const landlord = (room: boolean) => ({ hasRoom: () => room, secretFor: (id: string) => `key-of-${id}`, domainFor: (id: string) => `${id}.here.localhost`, start: (id: string, domain: string) => started.push([id, domain]) }) as unknown as Landlord;
  let started: string[][];
  const pay = (id: string, body: unknown, room = true) => new HousesController(service, agents, auth, landlord(room)).payForServer(id, body, req);

  const creditOf = async (login: string) => (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) }))!.credit;

  beforeEach(async () => {
    started = [];
    // jib is the chef of Sacré-Cœur, which has a server: here it's someone else's, so jib can rent one.
    const awa = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "awa") });
    await db.update(houses).set({ chefId: awa!.id }).where(eq(houses.id, "sacre-coeur"));
  });

  it("takes the first month from the chef's credit, marks it paid and gets the server going, with no command to paste", async () => {
    const id = await newHouse();
    const res = await pay(id, { plan: "medium" });
    expect(await creditOf("jib")).toBe(3_000);

    expect(res).toMatchObject({ plan: "medium", monthlyCostFcfa: 12_000, simulated: true });
    expect(res).not.toHaveProperty("secret");
    expect(res).not.toHaveProperty("command");
    // Its rooms' addresses have to work on the machine that hosts them.
    expect((await row(id)).domain).toBe(`${id}.here.localhost`);
    expect(started).toEqual([[id, `${id}.here.localhost`]]);
    expect(await service.verifyAgentSecret(id, `key-of-${id}`)).toBe(true);
    const paid = await db.select().from(billPayments).where(eq(billPayments.houseId, id));
    expect(paid).toHaveLength(1);
    expect(paid[0].amount).toBe(12_000);
  });

  it("refuses a server you can't afford, and nothing happens", async () => {
    const id = await newHouse();
    const no = await pay(id, { plan: "large" }).catch((e) => e);
    expect(no.getResponse()).toMatchObject({ code: "no_credit", need: 7_000 });
    expect((await row(id)).agentSecretHash).toBeNull();
    expect(started).toEqual([]);
    expect(await creditOf("jib")).toBe(15_000);
  });

  it("gives the credit back when the rest fails", async () => {
    const id = await newHouse();
    // The house has a key already, and this isn't a renewal: refused after the payment.
    await db.update(houses).set({ agentSecretHash: "x" }).where(eq(houses.id, id));
    await expect(pay(id, { plan: "small" })).rejects.toThrow(ConflictException);
    expect(await creditOf("jib")).toBe(15_000);
    expect(started).toEqual([]);
  });

  it("charges nothing for a new key on a house already paid for", async () => {
    const id = await newHouse();
    await pay(id, { plan: "small" });
    await pay(id, { plan: "small", renew: true });
    expect(await creditOf("jib")).toBe(8_000);
  });

  it("lets a house left half-way with a pasted command pay, and the key it showed stops working", async () => {
    const id = await newHouse();
    // The old way in: a key made and shown on screen, nothing paid, and the server never called.
    await rentServer(id, { plan: "small" });
    const shown = (await service.verifyAgentSecret(id, "x")) === false;
    expect(shown).toBe(true);
    const old = (await row(id)).agentSecretHash;

    await pay(id, { plan: "small", renew: true });
    expect((await row(id)).agentSecretHash).not.toBe(old);
    expect(await service.verifyAgentSecret(id, `key-of-${id}`)).toBe(true);
    expect(hungUp).toContain(id);
    expect(await creditOf("jib")).toBe(8_000);
    expect(started).toHaveLength(1);
    expect(await db.select().from(billPayments).where(eq(billPayments.houseId, id))).toHaveLength(1);
  });

  it("gives one server a person, and says so", async () => {
    const first = await newHouse();
    await pay(first, { plan: "small" });
    await service.markLive(first);
    const { id } = await city.rent({ city: "Dakar", plot: "2.1.0.0", name: "Second" }, req);
    const no = await pay(id, { plan: "small" }).catch((e) => e);
    // It names the house they already run, so the window can take them there.
    expect(no.getResponse()).toMatchObject({ code: "server_limit", house: { id: first } });
    expect(await creditOf("jib")).toBe(8_000);
  });

  it("takes no money when there's no machine to give", async () => {
    const id = await newHouse();
    await expect(pay(id, { plan: "small" }, false)).rejects.toThrow(ConflictException);
    expect(await creditOf("jib")).toBe(15_000);
    expect((await row(id)).agentSecretHash).toBeNull();
    expect(await db.select().from(billPayments).where(eq(billPayments.houseId, id))).toHaveLength(0);
    expect(started).toEqual([]);
  });

  it("only lets the chef pay", async () => {
    const id = await newHouse();
    as = "awa";
    await expect(pay(id, { plan: "small" })).rejects.toThrow("Only the chef rents the server.");
    expect(started).toEqual([]);
  });
});
