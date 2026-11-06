// A room is one person's: whoever lives in it manages it, enters it and knows its SSH address. The chef keeps
// updating and restarting it. Nobody else, not another flatmate, and not someone who once teamed up on it (teaming
// up is gone, but an older database may still have its rows and its notifications).
import "reflect-metadata";
import { type Db, notifications, roomTeammates, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { LogsBroker } from "../agents/logs.broker";
import { ShellBroker } from "../agents/shell.broker";
import type { AuthService } from "../auth/auth.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { NotificationsController } from "../notifications/notifications.controller";
import { NotificationsService } from "../notifications/notifications.service";
import { seedCity } from "../seed/city";
import { RoomDeployer } from "./room-deployer";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { SecretBox } from "./secrets";

let db: Db;
let houses: HousesService;
let bell: NotificationsService;
let roomsController: RoomsController;
let sent: ApiToAgent[];
let as: string | null;
const ids: Record<string, string> = {};
const req = { headers: {} };
const H = "sacre-coeur";

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // The bare city: Sacré-Cœur has Jib (the chef), Awa and Moussa, each in their own room.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  bell = new NotificationsService(db, houses, new DoorbellService(db, houses), { devLogin: false });
  sent = [];
  as = null;
  const auth = {
    userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
  } as unknown as AuthService;
  const agents = { isOnline: () => true, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  const box = new SecretBox(randomBytes(32).toString("base64"));
  roomsController = new RoomsController(new RoomsService(db, houses, box), new RoomDeployer(db, houses, agents, box, null), houses, agents, new LogsBroker(agents), auth, new ShellBroker(agents));
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  for (const [login, githubId] of [["jib", 201], ["awa", 202], ["moussa", 203]] as const) await db.update(users).set({ githubId }).where(eq(users.id, ids[login]));
  await db.update(rooms).set({ demo: false }).where(and(eq(rooms.houseId, H), eq(rooms.name, "awa")));
  // This server has an SSH door.
  vi.stubEnv("COLOC_SSH_PORT", "2222");
  vi.stubEnv("COLOC_SSH_HOST", "ssh.coloc.test");
  vi.stubEnv("COLOC_SSH_HOST_KEY_FILE", "/dev/null");
});

afterEach(() => vi.unstubAllEnvs());

// The status a call is refused with, or "ok".
async function status(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
}

// Moussa was on Awa's team before teaming up went: the row is still there.
async function leftoverTeammate() {
  const [awaRoom] = await db.select().from(rooms).where(and(eq(rooms.houseId, H), eq(rooms.name, "awa")));
  await db.insert(roomTeammates).values({ roomId: awaRoom.id, userId: ids.moussa });
}

describe("someone else's room", () => {
  // Every route on a room, as `login` would call it on Awa's.
  const everyRoute = (login: string) => {
    as = login;
    return [
      roomsController.manage(H, "awa", req),
      roomsController.inside(H, "awa", req),
      roomsController.address(H, "awa", { port: 3000 }, req),
      roomsController.settings(H, "awa", { source: "https://github.com/moussa/other.git" }, req),
      roomsController.setSecret(H, "awa", "WAVE_KEY", { value: "wv_test" }, req),
      roomsController.deleteSecret(H, "awa", "WAVE_KEY", req),
      roomsController.deploy(H, "awa", {}, req),
      roomsController.redeploy(H, "awa", req),
      roomsController.restart(H, "awa", req),
      roomsController.roomLogs(H, "awa", undefined, undefined, req),
      roomsController.inspect(H, "awa", {}, req),
      roomsController.buildLog(H, "awa", undefined, req),
      roomsController.cancelBuild(H, "awa", req),
    ].map(status);
  };

  it("is closed to a former teammate: no page, no settings, no secrets, no deploy, no restart, no shell", async () => {
    await leftoverTeammate();
    const answers = await Promise.all(everyRoute("moussa"));
    expect(answers.every((s) => s === 403)).toBe(true);
    expect(sent).toEqual([]);
  });

  it("is closed to any other flatmate, and to someone from outside", async () => {
    // Moussa never teamed up; Fatou lives in no house.
    expect((await Promise.all(everyRoute("moussa"))).every((s) => s === 403)).toBe(true);
    const [fatou] = await db.insert(users).values({ login: "fatou", name: "Fatou", githubId: 204 }).returning();
    ids.fatou = fatou.id;
    expect((await Promise.all(everyRoute("fatou"))).every((s) => s === 403)).toBe(true);
    expect(sent).toEqual([]);
  });
});

describe("the SSH address", () => {
  it("is on the room page for the one who lives there, with the Inside tab", async () => {
    as = "awa";
    const page = await roomsController.manage(H, "awa", req);
    expect(page.as).toBe("flatmate");
    expect(page.ssh).toMatchObject({ host: "ssh.coloc.test", port: 2222, user: `awa.${H}` });
    expect(page.inside).toBe(true);
    expect("team" in page.room).toBe(false);
  });

  it("isn't for the chef, who still updates and restarts but has no way in", async () => {
    as = "jib";
    const page = await roomsController.manage(H, "awa", req);
    expect(page.as).toBe("chef");
    expect(page.ssh).toBeNull();
    expect(page.inside).toBe(false);
    expect(await status(roomsController.inside(H, "awa", req))).toBe(403);
    expect(await status(roomsController.restart(H, "awa", req))).toBe("ok");
    expect(sent.map((c) => c.type)).toEqual(["restart_room"]);
  });

  it("is nowhere on the house or the city, whoever looks", async () => {
    await leftoverTeammate();
    for (const viewer of [ids.moussa, ids.jib, ids.awa, undefined]) {
      const seen = JSON.stringify([await houses.view(H, viewer), await houses.city()]);
      expect(seen).not.toContain("ssh.coloc.test");
      expect(seen).not.toContain(`awa.${H}`);
      expect(seen).not.toContain('"team"');
    }
  });
});

describe("old team notifications", () => {
  it("are left out of the bell, and can't be answered or taken back", async () => {
    const [ask] = await db
      .insert(notifications)
      .values({ userId: ids.moussa, kind: "team_invite", fromId: ids.awa, houseId: H, room: "awa", state: "open" })
      .returning();
    await db.insert(notifications).values({ userId: ids.awa, kind: "team_accepted", fromId: ids.moussa, houseId: H, room: "awa" });

    expect(await bell.list(ids.moussa)).toMatchObject({ unread: 0, items: [] });
    expect(await bell.list(ids.awa)).toMatchObject({ unread: 0, items: [], sent: [] });
    expect(await status(bell.accept(ids.moussa, ask.id))).toBe(409);
    expect(await status(bell.decline(ids.moussa, ask.id))).toBe(409);
    expect(await status(bell.withdraw(ids.awa, ask.id))).toBe(404);
    // Accepting put nobody anywhere.
    expect(await db.select().from(roomTeammates)).toEqual([]);
  });

  it("have no route left to make one", () => {
    const routes = Object.getOwnPropertyNames(NotificationsController.prototype);
    expect(routes).not.toContain("teamUp");
    expect(routes).not.toContain("leaveTeam");
  });
});
