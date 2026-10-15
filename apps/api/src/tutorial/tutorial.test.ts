import "reflect-metadata";
import { type Db, fridgeNotes, memberships, repos, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent, DeployCommand } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { loadAuthConfig } from "../auth/auth.config";
import { AuthController } from "../auth/auth.controller";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import type { GithubAppClient } from "../github/github.client";
import { MembershipsService } from "../auth/memberships.service";
import { CityController } from "../houses/houses.controller";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { RoomsService } from "../rooms/rooms.service";
import { seedCity } from "../seed/city";
import { TutorialController } from "./tutorial.controller";
import { CHAPTERS, TutorialService, tutorialRoomName } from "./tutorial.service";

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
    // A stand-in for GitHub: a token and a default branch, so a linked repo can be deployed without the network.
    new RoomDeployer(db, houses, agents, null, { installationToken: async () => "t0ken", defaultBranch: async () => "trunk" } as unknown as GithubAppClient),
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
      github: { installUrl: "https://github.com/apps/la-coloc-dev/installations/new", linked: false, repo: null },
      chapter: null,
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
    expect(await tutorial.room(req, first)).toEqual({ room: { name: "fatou", status: "empty", url: null } });
    expect(first.code).toBe(201);

    const again = response();
    expect(await tutorial.room(req, again)).toEqual({ room: { name: "fatou", status: "empty", url: null } });
    expect(again.code).toBe(200);

    // One new room, next to the workshop's example rooms; it's a real one.
    const rs = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.demo, false)));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ memoryMb: 256, cpus: 0.5, status: "empty", demo: false });
    const fatou = await user("fatou");
    expect(rs[0].occupantId).toBe(fatou.id);
    const ms = await db.select().from(memberships).where(and(eq(memberships.houseId, "atelier"), eq(memberships.userId, fatou.id)));
    expect(ms.map((m) => m.role)).toEqual(["flatmate"]);

    expect((await tutorial.state(req)).room).toEqual({ name: "fatou", status: "empty", url: null, why: null });
  });

  it("doesn't take an example room for the newcomer's, even when they log in as one of the learners", async () => {
    // A dev login as "babacar" is the seeded learner, who lives in an example room called "babacar": they still get
    // a room of their own, and the name being taken, it's "babacar-home".
    const asBabacar = await loggedIn("babacar");
    expect(await tutorial.room(asBabacar, response())).toEqual({ room: { name: "babacar-home", status: "empty", url: null } });
    expect((await tutorial.state(req)).room).toBeNull();
    // Taking it again removes that room only: Babacar still lives in the example room, as a flatmate.
    await tutorial.reset(asBabacar);
    const theirs = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.occupantId, (await user("babacar")).id)));
    expect(theirs.map((r) => r.name)).toEqual(["babacar"]);
    expect(await db.select().from(memberships).where(and(eq(memberships.houseId, "atelier"), eq(memberships.userId, (await user("babacar")).id)))).toHaveLength(1);
  });

  it("names the room after the login, and keeps it a valid room name whatever the login", () => {
    expect(tutorialRoomName("Djbrl")).toBe("djbrl");
    expect(tutorialRoomName("Aïssatou-Ba")).toBe("aissatou-ba");
    // Too long, starting with a digit, one letter, or looking like a preview's address: "home-" in front.
    for (const login of ["a-very-long-login-that-goes-on-and-on-and-on", "42", "a", "preview-jib", "-"]) {
      const name = tutorialRoomName(login);
      expect(name).toMatch(/^[a-z][a-z0-9-]{1,30}$/);
      expect(name).not.toMatch(/^preview-|-$/);
    }
    expect(tutorialRoomName("42")).toBe("home-42");
    expect(tutorialRoomName("preview-jib")).toBe("home-preview-jib");
  });

  it("gives the second of two same-looking logins another room name", async () => {
    await tutorial.room(await loggedIn("Fatou"), response());
    expect(await tutorial.room(req, response())).toEqual({ room: { name: "fatou-home", status: "empty", url: null } });
    expect(await tutorial.room(await loggedIn("FATOU"), response())).toEqual({ room: { name: "fatou-2", status: "empty", url: null } });
  });

  it("never reuses a room name from another house: a caretaker names Docker networks after the room alone", async () => {
    // Jib lives in Sacré-Cœur's room "jib"; the workshop may run on the same machine.
    expect(await tutorial.room(await loggedIn("jib"), response())).toEqual({ room: { name: "jib-home", status: "empty", url: null } });
  });

  it("pins a welcome on the workshop's fridge when the room is new, and only then", async () => {
    await tutorial.room(req, response());
    await tutorial.room(req, response());
    const notes = await db.select().from(fridgeNotes).where(eq(fridgeNotes.houseId, "atelier"));
    const welcome = notes.filter((n) => n.text.includes("Welcome home"));
    expect(welcome).toHaveLength(1);
    expect(welcome[0]).toMatchObject({ tone: "thanks", room: "fatou", text: "fatou moved in. Welcome home!", count: 1 });
  });

  it("says when the GitHub repo is linked", async () => {
    await tutorial.room(req, response());
    await db.insert(repos).values({ githubId: 7, fullName: "fatou/hello", houseId: "atelier", room: "fatou", installationId: 1 });
    expect((await tutorial.state(req)).github).toMatchObject({ linked: true, repo: "fatou/hello" });
  });
});

describe("when GitHub counts as linked", () => {
  it("counts a repo in a real room the newcomer lives in, not only the workshop room", async () => {
    await tutorial.room(req, response());
    expect((await tutorial.state(req)).github.linked).toBe(false);
    const fatou = await user("fatou");
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "fatou-real", occupantId: fatou.id, memoryMb: 256, cpus: 0.5 });
    await db.insert(repos).values({ githubId: 8, fullName: "fatou/real", houseId: "sacre-coeur", room: "fatou-real", installationId: 1 });
    // Linked, but not to the workshop room: the coach has no repo there to name.
    expect((await tutorial.state(req)).github).toMatchObject({ linked: true, repo: null });
  });

  it("doesn't count someone else's repo", async () => {
    await tutorial.room(req, response());
    await db.insert(repos).values({ githubId: 9, fullName: "jib/hello", houseId: "sacre-coeur", room: "room-4", installationId: 1 });
    expect((await tutorial.state(req)).github.linked).toBe(false);
  });
});

describe("putting the sample online", () => {
  const deployed = () => sent.filter((c) => c.type === "deploy") as DeployCommand[];
  const fatouRoom = async () => (await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.name, "fatou"))))[0];
  const linkRepo = () => db.insert(repos).values({ githubId: 7, fullName: "fatou/portfolio", houseId: "atelier", room: "fatou", installationId: 1 });

  it("deploys the sample into the newcomer's room", async () => {
    await tutorial.room(req, response());
    const { id } = await tutorial.deploy(req);
    expect(deployed()[0]).toMatchObject({ deployId: id, room: "fatou", repo: sample.repo, ref: "main", path: "examples/hello" });
    expect(await fatouRoom()).toMatchObject({ source: sample.repo, buildPath: "examples/hello", branch: null, status: "deploying", project: "Hello" });
  });

  it("deploys the starter when asked, even with a repo linked, and leaves the room set up for that repo", async () => {
    await tutorial.room(req, response());
    await linkRepo();
    await tutorial.deploy(req, { source: "starter" });
    expect(deployed()[0]).toMatchObject({ room: "fatou", repo: sample.repo, ref: "main", path: "examples/hello" });
    // The starter's folder went with that deploy only: the repo's next merge still builds from its root.
    expect((await fatouRoom()).buildPath).toBe(".");
  });

  it("deploys the linked repo from its root, named after the repo", async () => {
    await tutorial.room(req, response());
    await tutorial.deploy(req, { source: "starter" });
    await linkRepo();
    await tutorial.deploy(req, { source: "github" });
    expect(deployed()[1]).toMatchObject({ room: "fatou", repo: "https://x-access-token:t0ken@github.com/fatou/portfolio.git", ref: "trunk", path: "." });
    // The starter's name and line gave way to the repo's name.
    expect(await fatouRoom()).toMatchObject({ buildPath: ".", project: "portfolio", projectDescription: null });
  });

  it("keeps a project name the newcomer chose when their repo goes online", async () => {
    await tutorial.room(req, response());
    await db.update(rooms).set({ project: "Kër Bot", projectDescription: "Mine." }).where(eq(rooms.name, "fatou"));
    await linkRepo();
    await tutorial.deploy(req, { source: "github" });
    expect(await fatouRoom()).toMatchObject({ project: "Kër Bot", projectDescription: "Mine." });
  });

  it("deploys the linked repo by default once there is one, from its root", async () => {
    await tutorial.room(req, response());
    await linkRepo();
    await tutorial.deploy(req);
    expect(deployed()[0]).toMatchObject({ repo: "https://x-access-token:t0ken@github.com/fatou/portfolio.git", path: "." });
  });

  it("answers 409 when asked for the GitHub repo before one is linked", async () => {
    await tutorial.room(req, response());
    const e = await tutorial.deploy(req, { source: "github" }).catch((x) => x);
    expect(status(e)).toBe(409);
    expect(e.message).toBe("Link a repo on GitHub first.");
    expect(sent).toHaveLength(0);
  });

  it("answers 400 for a source it doesn't know", async () => {
    await tutorial.room(req, response());
    expect(status(await tutorial.deploy(req, { source: "gitlab" }).catch((x) => x))).toBe(400);
  });

  it("says why the last deploy failed, in one line, and forgets it once a deploy goes well", async () => {
    await tutorial.room(req, response());
    const first = await tutorial.deploy(req);
    await houses.recordDeployStatus("atelier", {
      type: "deploy_status",
      deployId: first.id,
      room: "fatou",
      status: "failed",
      detail: "\nthe build failed: npm ERR! missing script: start\nstep 4/7\n",
    });
    expect((await tutorial.state(req)).room).toMatchObject({ status: "failed", why: "the build failed: npm ERR! missing script: start" });
    const second = await tutorial.deploy(req);
    expect((await tutorial.state(req)).room!.why).toBeNull();
    await houses.recordDeployStatus("atelier", { type: "deploy_status", deployId: second.id, room: "fatou", status: "live", url: "http://fatou.atelier.coloc.localhost" });
    expect((await tutorial.state(req)).room!.why).toBeNull();
  });

  it("says which step the deployment is at while it goes, so the coach can follow it", async () => {
    await tutorial.room(req, response());
    const { id } = await tutorial.deploy(req);
    expect((await tutorial.state(req)).room!.status).toBe("queued");
    for (const step of ["cloning", "building", "starting"] as const) {
      await houses.recordDeployStatus("atelier", { type: "deploy_status", deployId: id, room: "fatou", status: step });
      expect((await tutorial.state(req)).room!.status).toBe(step);
    }
    await houses.recordDeployStatus("atelier", { type: "deploy_status", deployId: id, room: "fatou", status: "live", url: "http://fatou.atelier.coloc.localhost" });
    expect((await tutorial.state(req)).room).toEqual({ name: "fatou", status: "live", url: "http://fatou.atelier.coloc.localhost", why: null });
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

describe("the quest's chapters", () => {
  it("starts at none, moves forward, and never goes back", async () => {
    expect((await tutorial.state(req)).chapter).toBeNull();
    expect(await tutorial.progress(req, { chapter: "keys" })).toEqual({ chapter: "keys" });
    expect((await tutorial.state(req)).chapter).toBe("keys");
    // An older chapter (a lagging tab, a replay) keeps the furthest one.
    expect(await tutorial.progress(req, { chapter: "find" })).toEqual({ chapter: "keys" });
    expect(await tutorial.progress(req, { chapter: "keys" })).toEqual({ chapter: "keys" });
    expect(await tutorial.progress(req, { chapter: "house" })).toEqual({ chapter: "house" });
    expect((await tutorial.state(req)).chapter).toBe("house");
  });

  it("knows the eight chapters, in order", () => {
    expect(CHAPTERS).toEqual(["arrive", "find", "keys", "project", "launch", "open", "share", "house"]);
  });

  it("answers 400 for a chapter it doesn't know, and 401 when logged out", async () => {
    for (const body of [{ chapter: "attic" }, {}, null, { chapter: 3 }]) {
      const e = await tutorial.progress(req, body).catch((x) => x);
      expect(status(e)).toBe(400);
      expect(e.message).toBe("Pick one of the tutorial's chapters.");
    }
    expect(status(await tutorial.progress({ headers: {} }, { chapter: "find" }).catch((x) => x))).toBe(401);
  });

  it("is each person's own", async () => {
    await tutorial.progress(req, { chapter: "share" });
    expect((await tutorial.state(await loggedIn("moussa"))).chapter).toBeNull();
  });
});

describe("taking the tutorial again", () => {
  it("removes the room and the flatmate's place, and clears done and the chapter", async () => {
    await tutorial.room(req, response());
    await me.updateMe(req, { tutorialDone: true });
    await tutorial.progress(req, { chapter: "open" });
    expect((await tutorial.state(req)).done).toBe(true);

    expect(await tutorial.reset(req)).toEqual({ ok: true });
    expect(sent).toEqual([{ type: "remove_room", room: "fatou" }]);
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
    expect(state.chapter).toBeNull();
    // The welcome note went with the room.
    expect((await db.select().from(fridgeNotes).where(eq(fridgeNotes.houseId, "atelier"))).some((n) => n.room === "fatou")).toBe(false);
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

describe("picking which GitHub repo to bring", () => {
  // What GitHub knows: Fatou installed the App on her account (installation 9) and allowed three repos.
  let installation: number | null;
  const allowed = [
    { id: 301, full_name: "fatou/old", description: null, language: "C", private: false, pushed_at: "2024-01-01T00:00:00Z" },
    { id: 302, full_name: "fatou/portfolio", description: "My site", language: "HTML", private: false, pushed_at: "2026-10-01T00:00:00Z" },
    { id: 303, full_name: "fatou/api", description: null, language: "TypeScript", private: true, pushed_at: "2026-05-01T00:00:00Z" },
  ];
  let picker: TutorialController;

  beforeEach(async () => {
    installation = 9;
    const agents = { isOnline: () => true, send: () => {} } as unknown as AgentRegistry;
    const client = {
      userInstallation: async (login: string) => (login === "fatou" ? installation : null),
      installationRepos: async () => allowed,
    } as unknown as GithubAppClient;
    const service = new TutorialService(
      db,
      houses,
      new RoomsService(db, houses, null),
      new RoomDeployer(db, houses, agents, null, client),
      agents,
      { appId: "1", privateKey: "k", webhookSecret: "w", slug: "la-coloc-dev" },
      sample,
      client,
    );
    picker = new TutorialController(service, auth);
    await db.update(users).set({ githubId: 77 }).where(eq(users.login, "fatou"));
  });

  it("lists the repos she allowed, the most recently pushed first", async () => {
    const got = await picker.repos(req);
    expect(got.reason).toBeNull();
    expect(got.repos.map((r) => r.fullName)).toEqual(["fatou/portfolio", "fatou/api", "fatou/old"]);
    expect(got.repos[1]).toMatchObject({ id: 303, language: "TypeScript", private: true });
    expect(got.chosen).toBeNull();
  });

  it("says why the list is empty: not installed, no GitHub login, or no App on this server", async () => {
    installation = null;
    expect(await picker.repos(req)).toMatchObject({ repos: [], reason: "not-installed" });
    expect(await picker.repos(await loggedIn("someone-new"))).toMatchObject({ repos: [], reason: "no-github" });
    expect(await tutorial.repos(req)).toMatchObject({ repos: [], reason: "off" });
  });

  it("puts the picked repo in her room, and only that one, then swaps it for another", async () => {
    await picker.room(req, response());
    expect(await picker.repo(req, { id: 302 })).toEqual({ repo: "fatou/portfolio" });
    expect((await picker.state(req)).github).toMatchObject({ linked: true, repo: "fatou/portfolio" });
    expect(await picker.repo(req, { id: 303 })).toEqual({ repo: "fatou/api" });
    const inRoom = await db.select().from(repos).where(and(eq(repos.houseId, "atelier"), eq(repos.room, "fatou")));
    expect(inRoom.map((r) => [r.fullName, r.installationId])).toEqual([["fatou/api", 9]]);
    expect((await picker.repos(req)).chosen).toBe(303);
  });

  it("refuses a repo she didn't allow, one in someone else's room, or a pick before taking a room", async () => {
    await expect(picker.repo(req, { id: 302 })).rejects.toSatisfy((e) => status(e) === 404);
    await picker.room(req, response());
    await expect(picker.repo(req, { id: 999 })).rejects.toSatisfy((e) => status(e) === 404);
    await db.insert(repos).values({ githubId: 301, fullName: "fatou/old", houseId: "sacre-coeur", room: "awa", installationId: 9 });
    await expect(picker.repo(req, { id: 301 })).rejects.toSatisfy((e) => status(e) === 409);
    await expect(picker.repo(req, { id: "x" })).rejects.toSatisfy((e) => status(e) === 400);
  });
});
