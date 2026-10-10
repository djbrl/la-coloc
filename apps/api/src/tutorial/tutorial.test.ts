import "reflect-metadata";
import { type Db, memberships, repos, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent, DeployCommand } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { loadAuthConfig } from "../auth/auth.config";
import { AuthController } from "../auth/auth.controller";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { MembershipsService } from "../auth/memberships.service";
import { CityController } from "../houses/houses.controller";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { RoomsService } from "../rooms/rooms.service";
import { seedCity } from "../seed/city";
import { TutorialController } from "./tutorial.controller";
import { TutorialService, tutorialRoomName } from "./tutorial.service";

let db: Db;
let sent: ApiToAgent[];
let online: boolean;
let auth: AuthService;
let houses: HousesService;
let tutorial: TutorialController;
let me: AuthController;
let req: { headers: { cookie: string } };
const sample = { repo: "https://github.com/Djbrl/la-coloc.git", path: "examples/hello" };

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.localhost` });
  sent = [];
  online = true;
  const agents = { isOnline: () => online, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  auth = new AuthService(db, loadAuthConfig({ COLOC_DEV_LOGIN: "1" }));
  houses = new HousesService(db);
  const service = new TutorialService(
    db,
    houses,
    new RoomsService(db, houses, null),
    new RoomDeployer(db, houses, agents, null, null),
    agents,
    { appId: "1", privateKey: "k", webhookSecret: "w", slug: "la-coloc-dev" },
    sample,
  );
  tutorial = new TutorialController(service, auth);
  me = new AuthController(auth, new MembershipsService(db));
  // A newcomer, logged in: Fatou isn't in the seeded city.
  req = await loggedIn("fatou");
});

async function loggedIn(login: string) {
  const user = await auth.devLogin(login);
  return { headers: { cookie: `${SESSION_COOKIE}=${await auth.createSession(user.id)}` } };
}

// Stands in for Express's response: remembers the status the route picked.
function response() {
  const res = { code: 0, status: (code: number) => ((res.code = code), { json: (body: unknown) => body }) };
  return res;
}

const status = (e: unknown) => (e as HttpException).getStatus();

describe("the tutorial's state", () => {
  it("starts with no room and not done, in the workshop", async () => {
    expect(await tutorial.state(req)).toEqual({
      house: { id: "atelier", name: "L'Atelier", city: "Dakar", agentOnline: true },
      room: null,
      sample,
      github: { installUrl: "https://github.com/apps/la-coloc-dev/installations/new", linked: false },
      done: false,
    });
  });

  it("asks you to log in first", async () => {
    await expect(tutorial.state({ headers: {} })).rejects.toThrow("Log in first.");
  });
});

describe("taking a room in the workshop", () => {
  it("gives the newcomer a room and a place as a flatmate, and the same room when asked again", async () => {
    const first = response();
    expect(await tutorial.room(req, first)).toEqual({ room: { name: "tuto-fatou", status: "empty", url: null } });
    expect(first.code).toBe(201);

    const again = response();
    expect(await tutorial.room(req, again)).toEqual({ room: { name: "tuto-fatou", status: "empty", url: null } });
    expect(again.code).toBe(200);

    // One new room, next to the workshop's example rooms; it's a real one.
    const rs = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.demo, false)));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ memoryMb: 256, cpus: 0.5, status: "empty", demo: false });
    const fatou = await user("fatou");
    expect(rs[0].occupantId).toBe(fatou.id);
    const ms = await db.select().from(memberships).where(and(eq(memberships.houseId, "atelier"), eq(memberships.userId, fatou.id)));
    expect(ms.map((m) => m.role)).toEqual(["flatmate"]);

    expect((await tutorial.state(req)).room).toEqual({ name: "tuto-fatou", status: "empty", url: null });
  });

  it("doesn't take an example room for the newcomer's, even when they log in as one of the learners", async () => {
    // A dev login as "babacar" is the seeded learner, who lives in an example room: they still get a tuto- room.
    const asBabacar = await loggedIn("babacar");
    expect(await tutorial.room(asBabacar, response())).toEqual({ room: { name: "tuto-babacar", status: "empty", url: null } });
    expect((await tutorial.state(req)).room).toBeNull();
    // Taking it again removes that room only: Babacar still lives in the example room, as a flatmate.
    await tutorial.reset(asBabacar);
    const theirs = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.occupantId, (await user("babacar")).id)));
    expect(theirs.map((r) => r.name)).toEqual(["babacar"]);
    expect(await db.select().from(memberships).where(and(eq(memberships.houseId, "atelier"), eq(memberships.userId, (await user("babacar")).id)))).toHaveLength(1);
  });

  it("keeps room names valid, whatever the login", () => {
    expect(tutorialRoomName("Djbrl")).toBe("tuto-djbrl");
    expect(tutorialRoomName("a-very-long-login-that-goes-on-and-on")).toMatch(/^[a-z][a-z0-9-]{1,30}$/);
  });

  it("says when the GitHub repo is linked", async () => {
    await tutorial.room(req, response());
    await db.insert(repos).values({ githubId: 7, fullName: "fatou/hello", houseId: "atelier", room: "tuto-fatou", installationId: 1 });
    expect((await tutorial.state(req)).github.linked).toBe(true);
  });
});

describe("when GitHub counts as linked", () => {
  it("counts a repo in a real room the newcomer lives in, not only the workshop room", async () => {
    await tutorial.room(req, response());
    expect((await tutorial.state(req)).github.linked).toBe(false);
    const fatou = await user("fatou");
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "fatou-real", occupantId: fatou.id, memoryMb: 256, cpus: 0.5 });
    await db.insert(repos).values({ githubId: 8, fullName: "fatou/real", houseId: "sacre-coeur", room: "fatou-real", installationId: 1 });
    expect((await tutorial.state(req)).github.linked).toBe(true);
  });

  it("doesn't count someone else's repo", async () => {
    await tutorial.room(req, response());
    await db.insert(repos).values({ githubId: 9, fullName: "jib/hello", houseId: "sacre-coeur", room: "room-4", installationId: 1 });
    expect((await tutorial.state(req)).github.linked).toBe(false);
  });
});

describe("putting the sample online", () => {
  it("deploys the sample into the newcomer's room", async () => {
    await tutorial.room(req, response());
    const { id } = await tutorial.deploy(req);
    const cmd = sent.find((c) => c.type === "deploy") as DeployCommand;
    expect(cmd).toMatchObject({ deployId: id, room: "tuto-fatou", repo: sample.repo, ref: "main", path: "examples/hello" });
    const [r] = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.name, "tuto-fatou")));
    expect(r).toMatchObject({ source: sample.repo, buildPath: "examples/hello", branch: null, status: "deploying", project: "Hello" });
  });

  it("says which step the deployment is at while it goes, so the coach can follow it", async () => {
    await tutorial.room(req, response());
    const { id } = await tutorial.deploy(req);
    expect((await tutorial.state(req)).room!.status).toBe("queued");
    for (const step of ["cloning", "building", "starting"] as const) {
      await houses.recordDeployStatus("atelier", { type: "deploy_status", deployId: id, room: "tuto-fatou", status: step });
      expect((await tutorial.state(req)).room!.status).toBe(step);
    }
    await houses.recordDeployStatus("atelier", { type: "deploy_status", deployId: id, room: "tuto-fatou", status: "live", url: "http://tuto-fatou.atelier.coloc.localhost" });
    expect((await tutorial.state(req)).room).toEqual({ name: "tuto-fatou", status: "live", url: "http://tuto-fatou.atelier.coloc.localhost" });
  });

  it("answers 409 when the workshop's server is offline", async () => {
    await tutorial.room(req, response());
    online = false;
    const e = await tutorial.deploy(req).catch((x) => x);
    expect(status(e)).toBe(409);
    expect(e.message).toBe("The workshop's server is offline.");
    expect(sent).toHaveLength(0);
  });

  it("answers 404 before the newcomer has a room", async () => {
    expect(status(await tutorial.deploy(req).catch((x) => x))).toBe(404);
  });
});

describe("taking the tutorial again", () => {
  it("removes the room and the flatmate's place, and clears done", async () => {
    await tutorial.room(req, response());
    await me.updateMe(req, { tutorialDone: true });
    expect((await tutorial.state(req)).done).toBe(true);

    expect(await tutorial.reset(req)).toEqual({ ok: true });
    expect(sent).toEqual([{ type: "remove_room", room: "tuto-fatou" }]);
    // Only the newcomer's room and place go: the host and the learners stay, in their example rooms.
    const left = await db.select().from(rooms).where(eq(rooms.houseId, "atelier"));
    expect(left.map((r) => [r.name, r.demo, r.status]).sort()).toEqual([
      ["aissatou", true, "live"],
      ["babacar", true, "live"],
      ["coumba", true, "live"],
      ["lamine", true, "live"],
      ["ndeye", true, "live"],
    ]);
    const fatou = await user("fatou");
    const ms = await db.select().from(memberships).where(eq(memberships.houseId, "atelier"));
    expect(ms).toHaveLength(5);
    expect(ms.some((m) => m.userId === fatou.id)).toBe(false);
    const state = await tutorial.state(req);
    expect(state.room).toBeNull();
    expect(state.done).toBe(false);
  });
});

describe("me and the tutorial", () => {
  it("round-trips tutorialDone through PATCH /me", async () => {
    expect((await me.me(req)).user).toMatchObject({ login: "fatou", tutorialDone: false });
    await me.updateMe(req, { tutorialDone: true });
    expect((await me.me(req)).user).toMatchObject({ tutorialDone: true });
    await me.updateMe(req, { tutorialDone: false, avatar: "female-a" });
    expect((await me.me(req)).user).toMatchObject({ tutorialDone: false, avatar: "female-a" });
    await expect(me.updateMe(req, {})).rejects.toThrow("Nothing to change.");
    await expect(me.updateMe(req, { avatar: "dragon" })).rejects.toThrow("Pick one of the characters.");
  });

  it("doesn't list the workshop among your houses", async () => {
    await tutorial.room(req, response());
    expect((await me.me(req)).user!.houses).toEqual([]);
  });

  it("lists no knocks for a newcomer", async () => {
    expect((await me.me(req)).user!.knocks).toEqual([]);
  });
});

describe("the city", () => {
  it("leaves the workshop out, but its page is still served", async () => {
    const city = await new CityController(houses, auth).city();
    expect(city.houses.map((h) => h.id)).not.toContain("atelier");
    expect(city.houses.map((h) => h.id)).toContain("sacre-coeur");
    expect((await houses.view("atelier"))!).toMatchObject({ name: "L'Atelier", city: "Dakar", status: "live", demo: false, tutorial: true });
  });
});

async function user(login: string) {
  return (await db.query.users.findFirst({ where: eq(users.login, login) }))!;
}
