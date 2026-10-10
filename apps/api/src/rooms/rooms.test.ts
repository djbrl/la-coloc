import "reflect-metadata";
import { type Db, roomSecrets, rooms } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent, DeployCommand } from "@coloc/protocol";
import { and, eq } from "drizzle-orm";
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
let online: boolean;
let controller: RoomsController;
let service: RoomsService;
let logs: LogsBroker;
const box = new SecretBox(randomBytes(32).toString("base64"));
const req = { headers: {} };

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  sent = [];
  as = null;
  online = true;
  const agents = { isOnline: () => online, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  const auth = {
    userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
  } as unknown as AuthService;
  const houses = new HousesService(db);
  service = new RoomsService(db, houses, box);
  logs = new LogsBroker(agents);
  controller = new RoomsController(service, new RoomDeployer(db, houses, agents, box, null), houses, agents, logs, auth);
});

const deployCmd = () => sent.find((c) => c.type === "deploy") as DeployCommand;

describe("who can deploy where", () => {
  const body = { repo: "https://github.com/awa/ndaje.git" };

  it("asks you to log in first", async () => {
    await expect(controller.deploy("sacre-coeur", "awa", body, req)).rejects.toThrow(/log in/);
    expect(sent).toHaveLength(0);
  });

  it("lets a flatmate deploy their own room, with the room's size, and remembers the repo", async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", body, req);
    expect(deployCmd()).toMatchObject({ type: "deploy", room: "awa", repo: body.repo, limits: { memoryMb: 256, cpus: 0.5 } });
    const [r] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "awa")));
    expect(r.source).toBe(body.repo);
  });

  it("refuses someone else's room, and strangers", async () => {
    as = "moussa";
    await expect(controller.deploy("sacre-coeur", "awa", body, req)).rejects.toThrow(/isn't your room/);
    as = "koffi";
    await expect(controller.deploy("sacre-coeur", "room-4", body, req)).rejects.toThrow(/isn't your room/);
    expect(sent).toHaveLength(0);
  });

  it("lets the chef deploy anywhere in the house", async () => {
    as = "jib";
    await controller.deploy("sacre-coeur", "moussa", body, req);
    expect(deployCmd()).toMatchObject({ room: "moussa", limits: { memoryMb: 128 } });
  });

  it("never takes credentials in a repo URL", async () => {
    as = "awa";
    await expect(controller.deploy("sacre-coeur", "awa", { repo: "https://user:ghp_x@github.com/a/b.git" }, req)).rejects.toThrow(/credentials/);
  });
});

describe("settings and secrets", () => {
  it("builds with the room's settings and decrypted secrets", async () => {
    as = "awa";
    await controller.settings("sacre-coeur", "awa", { buildPath: "apps/shop", port: 8080, branch: "prod", project: "Ndaje v2" }, req);
    await controller.setSecret("sacre-coeur", "awa", "WAVE_KEY", { value: "wv_live_123" }, req);
    // No source: the room has never been deployed from a URL (the seed points it at an example app; forget it).
    await db.update(rooms).set({ source: null }).where(eq(rooms.name, "awa"));
    await controller.redeploy("sacre-coeur", "awa", req).catch(() => undefined);
    expect(sent).toHaveLength(0);
    await controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/awa/ndaje.git" }, req);
    expect(deployCmd()).toMatchObject({ path: "apps/shop", port: 8080, ref: "prod", env: { WAVE_KEY: "wv_live_123" } });
  });

  it("tells the app where it lives, so it can greet in its own city", async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/awa/ndaje.git" }, req);
    expect(deployCmd().env).toMatchObject({
      COLOC_ROOM: "awa",
      COLOC_HOUSE: "Sacré-Cœur",
      COLOC_CITY: "Dakar",
      COLOC_COUNTRY: "SN",
      COLOC_LOGIN: "awa",
      COLOC_NAME: "Awa",
    });
    await expect(controller.setSecret("sacre-coeur", "awa", "COLOC_CITY", { value: "Paris" }, req)).rejects.toThrow(/set by La Coloc/);
  });

  it("stores secrets encrypted, and only ever shows their names", async () => {
    as = "awa";
    await controller.setSecret("sacre-coeur", "awa", "WAVE_KEY", { value: "wv_live_123" }, req);
    const [row] = await db.select().from(roomSecrets);
    expect(row.value).not.toContain("wv_live");
    const view = await controller.manage("sacre-coeur", "awa", req);
    expect(view.secrets).toEqual([{ name: "WAVE_KEY", updatedAt: expect.any(String) }]);
    expect(JSON.stringify(view)).not.toContain("wv_live");
    await controller.deleteSecret("sacre-coeur", "awa", "WAVE_KEY", req);
    expect((await controller.manage("sacre-coeur", "awa", req)).secrets).toEqual([]);
  });

  it("refuses bad secret names and someone else's room", async () => {
    as = "awa";
    await expect(controller.setSecret("sacre-coeur", "awa", "PORT", { value: "1" }, req)).rejects.toThrow(/set by La Coloc/);
    await expect(controller.setSecret("sacre-coeur", "awa", "lower", { value: "1" }, req)).rejects.toThrow(/capitals/);
    as = "moussa";
    await expect(controller.manage("sacre-coeur", "awa", req)).rejects.toThrow(/isn't your room/);
    await expect(controller.setSecret("sacre-coeur", "awa", "X", { value: "1" }, req)).rejects.toThrow(/isn't your room/);
  });

  it("refuses folders and branches that try to climb out", async () => {
    as = "awa";
    await expect(controller.settings("sacre-coeur", "awa", { buildPath: "../../etc" }, req)).rejects.toThrow();
    await expect(controller.settings("sacre-coeur", "awa", { branch: "a..b" }, req)).rejects.toThrow();
  });
});

describe("the workshop's example rooms", () => {
  it("never go online or restart, even for the learner who lives there", async () => {
    as = "babacar";
    await expect(controller.redeploy("atelier", "babacar", req)).rejects.toThrow(/example room/);
    await expect(controller.restart("atelier", "babacar", req)).rejects.toThrow(/example room/);
    expect(sent).toHaveLength(0);
  });
});

describe("restart and logs", () => {
  it("restarts the room and says so on the fridge", async () => {
    as = "awa";
    await controller.restart("sacre-coeur", "awa", req);
    expect(sent).toEqual([{ type: "restart_room", room: "awa" }]);
  });

  it("asks the agent for logs and returns its answer", async () => {
    as = "awa";
    const pending = controller.roomLogs("sacre-coeur", "awa", undefined, "50", req);
    await new Promise((r) => setTimeout(r, 0));
    const ask = sent.find((c) => c.type === "get_logs") as { requestId: string; lines: number };
    expect(ask.lines).toBe(50);
    // A reply from another house with the same id is ignored.
    logs.deliver("almadies", { type: "logs", requestId: ask.requestId, room: "awa", text: "not yours" });
    logs.deliver("sacre-coeur", { type: "logs", requestId: ask.requestId, room: "awa", text: "listening on 3000" });
    expect(await pending).toEqual({ text: "listening on 3000" });
  });

  it("says so when the server is offline", async () => {
    as = "awa";
    online = false;
    await expect(controller.roomLogs("sacre-coeur", "awa", undefined, undefined, req)).rejects.toThrow(/offline/);
    await expect(controller.restart("sacre-coeur", "awa", req)).rejects.toThrow(/offline/);
  });
});
