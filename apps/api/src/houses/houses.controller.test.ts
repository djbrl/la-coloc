import "reflect-metadata";
import { type Db } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
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
  controller = new HousesController(new HousesService(db), agents, auth);
});

const req = { headers: {} };
const body = { repo: "https://github.com/awa/ndaje.git" };

describe("who can deploy where", () => {
  it("asks you to log in first", async () => {
    await expect(controller.deploy("sacre-coeur", "awa", body, req)).rejects.toThrow(/log in/);
    expect(sent).toHaveLength(0);
  });

  it("lets a flatmate deploy to their own room, with the room's size", async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", body, req);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "deploy", room: "awa", limits: { memoryMb: 256, cpus: 0.5 } });
  });

  it("refuses a flatmate deploying into someone else's room", async () => {
    as = "moussa";
    await expect(controller.deploy("sacre-coeur", "awa", body, req)).rejects.toThrow(/isn't your room/);
    expect(sent).toHaveLength(0);
  });

  it("refuses strangers, even ones living in another house", async () => {
    as = "koffi";
    await expect(controller.deploy("sacre-coeur", "room-4", body, req)).rejects.toThrow(/isn't your room/);
  });

  it("lets the chef deploy anywhere in the house", async () => {
    as = "jib";
    await controller.deploy("sacre-coeur", "moussa", body, req);
    expect(sent[0]).toMatchObject({ room: "moussa", limits: { memoryMb: 128 } });
  });

  it("only lets the chef empty a room", async () => {
    as = "awa";
    await expect(controller.empty("sacre-coeur", "moussa", req)).rejects.toThrow(/only the chef/);
    as = "jib";
    await controller.empty("sacre-coeur", "moussa", req);
    expect(sent).toEqual([{ type: "remove_room", room: "moussa" }]);
  });
});
