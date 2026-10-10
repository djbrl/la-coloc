import "reflect-metadata";
import { type Db } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import type { AuthService } from "../auth/auth.service";
import { seedCity } from "../seed/city";
import { HousesController } from "./houses.controller";
import { HousesService } from "./houses.service";

let db: Db;
let sent: ApiToAgent[];
let as: string | null;
let controller: HousesController;
let service: HousesService;
let changed: string[];

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  sent = [];
  as = null;
  const agents = { isOnline: () => true, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  // Logs the request in as whoever `as` names.
  const auth = {
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
  } as unknown as AuthService;
  service = new HousesService(db);
  changed = [];
  service.changes.subscribe((id) => changed.push(id));
  controller = new HousesController(service, agents, auth);
});

const req = { headers: {} };

describe("emptying a room", () => {
  it("only lets the chef empty a room", async () => {
    as = "awa";
    await expect(controller.empty("sacre-coeur", "moussa", req)).rejects.toThrow(/only the chef/);
    as = "jib";
    await controller.empty("sacre-coeur", "moussa", req);
    expect(sent).toEqual([{ type: "remove_room", room: "moussa" }]);
  });
});

// The status a request is refused with, or "ok".
async function status(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
}

describe("the house's review rule", () => {
  const setRules = (house: string, body: unknown) => controller.setRules(house, body, req);
  const strictness = async (house: string) => (await service.view(house))!.rules.strictReviews;
  const fridge = async (house: string, login: string) => {
    const u = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) });
    return (await service.view(house, u!.id))!.notes!.map((n) => n.text);
  };

  it("lets the chef make reviews relaxed, and strict again, with a fridge note each time", async () => {
    as = "jib";
    expect(await strictness("sacre-coeur")).toBe(true);
    expect(await setRules("sacre-coeur", { strictReviews: false })).toEqual({ rules: { strictReviews: false } });
    expect(await strictness("sacre-coeur")).toBe(false);
    expect(changed).toContain("sacre-coeur");
    expect((await fridge("sacre-coeur", "awa"))[0]).toMatch(/made reviews relaxed: merges go online without waiting for a review\.$/);

    await setRules("sacre-coeur", { strictReviews: true });
    expect(await strictness("sacre-coeur")).toBe(true);
    expect((await fridge("sacre-coeur", "awa"))[0]).toMatch(/made reviews strict: merges go online once a flatmate approves\.$/);
  });

  it("pins no note when the rule doesn't change", async () => {
    as = "jib";
    const before = (await fridge("sacre-coeur", "jib")).length;
    expect(await setRules("sacre-coeur", { strictReviews: true })).toEqual({ rules: { strictReviews: true } });
    expect(await fridge("sacre-coeur", "jib")).toHaveLength(before);
  });

  it("is the chef's call only", async () => {
    expect(await status(setRules("sacre-coeur", { strictReviews: false }))).toBe(401);
    as = "awa";
    expect(await status(setRules("sacre-coeur", { strictReviews: false }))).toBe(403);
    as = "koffi";
    expect(await status(setRules("sacre-coeur", { strictReviews: false }))).toBe(403);
    expect(await strictness("sacre-coeur")).toBe(true);
  });

  it("refuses unknown houses, bad bodies and example houses", async () => {
    as = "jib";
    expect(await status(setRules("nowhere", { strictReviews: false }))).toBe(404);
    expect(await status(setRules("sacre-coeur", { strictReviews: "no" }))).toBe(400);
    expect(await status(setRules("sacre-coeur", {}))).toBe(400);
    as = "aminata";
    const before = await strictness("almadies");
    expect(await status(setRules("almadies", { strictReviews: !before }))).toBe(409);
    expect(await strictness("almadies")).toBe(before);
  });
});
