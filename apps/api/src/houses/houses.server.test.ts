import "reflect-metadata";
import { type Db, houses } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import type { AuthService } from "../auth/auth.service";
import { seedCity } from "../seed/city";
import { CityController, HousesController } from "./houses.controller";
import { hashSecret, HousesService } from "./houses.service";
import { agentUrl, installCommand } from "./server";

let db: Db;
let as: string | null;
let service: HousesService;
let controller: HousesController;
let city: CityController;
let changed: string[];
let hungUp: string[];

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // Sacré-Cœur is live and already has a key ("s"); jib is its chef and awa a flatmate.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  as = null;
  hungUp = [];
  const agents = { isOnline: () => true, send: () => undefined, hangUp: (id: string) => hungUp.push(id) } as unknown as AgentRegistry;
  // Logs the request in as whoever `as` names.
  const auth = {
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
