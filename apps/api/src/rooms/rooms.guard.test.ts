// Found in the 16 Oct review: who may choose a room's code, and how often a build can be asked for by hand.
import "reflect-metadata";
import { type Db } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent, DeployCommand } from "@coloc/protocol";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { LogsBroker } from "../agents/logs.broker";
import type { AuthService } from "../auth/auth.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { RoomDeployer } from "./room-deployer";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { SecretBox } from "./secrets";

let db: Db;
let sent: ApiToAgent[];
let as: string | null;
let controller: RoomsController;
const box = new SecretBox(randomBytes(32).toString("base64"));
const req = { headers: {} };

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  sent = [];
  as = null;
  const agents = { isOnline: () => true, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  const auth = {
    userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
  } as unknown as AuthService;
  const houses = new HousesService(db);
  controller = new RoomsController(new RoomsService(db, houses, box), new RoomDeployer(db, houses, agents, box, null), houses, agents, new LogsBroker(agents), auth);
});

const deployCmd = () => sent.find((c) => c.type === "deploy") as DeployCommand;

describe("where a room's code comes from is the flatmate's alone", () => {
  it("the chef can't point a flatmate's room at another repo, so the flatmate's secrets stay theirs", async () => {
    as = "awa";
    await controller.setSecret("sacre-coeur", "awa", "WAVE_KEY", { value: "wv_live_awa_only" }, req);
    expect(JSON.stringify(await controller.manage("sacre-coeur", "awa", req))).not.toContain("wv_live_awa_only");

    as = "jib"; // the chef
    await expect(controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/evil-chef/print-env.git" }, req)).rejects.toThrow(/Only the flatmate/);
    expect(deployCmd()).toBeUndefined();
  });

  it("the chef may still rename it, and the flatmate may still change it", async () => {
    as = "jib";
    await controller.settings("sacre-coeur", "awa", { project: "Ndaje 2" }, req);
    as = "awa";
    await controller.settings("sacre-coeur", "awa", { source: "https://github.com/awa/ndaje.git" }, req);
  });
});

describe("a folder on the server's disk is never a room's code", () => {
  it("refuses file:// from anyone, and sends nothing to the caretaker", async () => {
    as = "awa";
    await expect(controller.deploy("sacre-coeur", "awa", { repo: "file:///Users/dsy/la-coloc", path: "." }, req)).rejects.toThrow(/https/);
    await expect(controller.settings("sacre-coeur", "awa", { source: "file:///etc" }, req)).rejects.toThrow(/https/);
    expect(deployCmd()).toBeUndefined();
  });

  it("takes the page's masked starter address back as 'leave it as it is'", async () => {
    as = "awa";
    await controller.settings("sacre-coeur", "awa", { source: "file://", project: "x" }, req);
  });
});

describe("the brake on deploys asked for by hand", () => {
  it("won't start a second build of a room while the first is under way", async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/awa/ndaje.git" }, req);
    await expect(controller.redeploy("sacre-coeur", "awa", req)).rejects.toThrow(/already being put online/);
    expect(sent.filter((c) => c.type === "deploy")).toHaveLength(1);
  });
});
