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

describe("emptying a room", () => {
  it("only lets the chef empty a room", async () => {
    as = "awa";
    await expect(controller.empty("sacre-coeur", "moussa", req)).rejects.toThrow(/only the chef/);
    as = "jib";
    await controller.empty("sacre-coeur", "moussa", req);
    expect(sent).toEqual([{ type: "remove_room", room: "moussa" }]);
  });
});
