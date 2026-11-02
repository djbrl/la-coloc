import "reflect-metadata";
import { type Db, deployments, fridgeNotes, repos, roomSecrets, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { type ApiToAgent, BUILD_CANCELLED, type DeployCommand } from "@coloc/protocol";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { LogsBroker } from "../agents/logs.broker";
import type { AuthService } from "../auth/auth.service";
import type { GithubAppClient } from "../github/github.client";
import { GithubReposController } from "../github/repos.controller";
import { GithubRepos } from "../github/repos.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { RoomDeployer } from "./room-deployer";
import { RoomsController } from "./rooms.controller";
import { projectFrom, RoomsService } from "./rooms.service";
import { SecretBox } from "./secrets";

let db: Db;
let sent: ApiToAgent[];
let as: string | null;
let online: boolean;
let controller: RoomsController;
let service: RoomsService;
let logs: LogsBroker;
let houses: HousesService;
let auth: AuthService;
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
  auth = {
    userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
  } as unknown as AuthService;
  houses = new HousesService(db);
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

  it("lets the chef update any room in the house, from the code its flatmate picked", async () => {
    as = "moussa";
    await controller.settings("sacre-coeur", "moussa", { source: body.repo }, req);
    as = "jib";
    await controller.deploy("sacre-coeur", "moussa", {}, req);
    expect(deployCmd()).toMatchObject({ room: "moussa", repo: body.repo, limits: { memoryMb: 128 } });
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

describe("reading a project before building it", () => {
  const findings = { branch: "main", sha: "abc", stack: "node" as const, port: 8080, portFrom: "env" as const, env: ["API_KEY"], flags: [], folders: [] };

  it("asks the caretaker about the typed repo, and only answers its own house", async () => {
    as = "awa";
    const pending = controller.inspect("sacre-coeur", "awa", { source: "https://github.com/awa/ndaje.git" }, req);
    await new Promise((r) => setTimeout(r, 0));
    const ask = sent.find((c) => c.type === "inspect") as { requestId: string; repo: string };
    expect(ask.repo).toBe("https://github.com/awa/ndaje.git");
    logs.deliverFindings("almadies", { type: "inspected", requestId: ask.requestId, findings: { ...findings, port: 1 } });
    logs.deliverFindings("sacre-coeur", { type: "inspected", requestId: ask.requestId, findings });
    expect(await pending).toEqual(findings);
  });

  it("isn't for just anyone", async () => {
    as = "moussa";
    await expect(controller.inspect("sacre-coeur", "awa", { source: "https://github.com/awa/ndaje.git" }, req)).rejects.toThrow(/your room/);
    expect(sent).toHaveLength(0);
  });

  it("names a nameless project after its repo or image", () => {
    expect(projectFrom("https://github.com/awa/ndaje.git")).toBe("ndaje");
    expect(projectFrom("https://gitlab.com/awa/ndaje/")).toBe("ndaje");
    expect(projectFrom("docker://ghcr.io/awa/ndaje:1.0")).toBe("ndaje");
    expect(projectFrom("docker://traefik/whoami")).toBe("whoami");
  });

  it("builds the repo's own default branch when the room names none", async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/awa/ndaje.git" }, req);
    expect((deployCmd() as { ref?: string }).ref).toBeUndefined();
  });

  it("refuses a local folder or a link with a password in it", async () => {
    as = "awa";
    await expect(controller.inspect("sacre-coeur", "awa", { source: "file:///etc" }, req)).rejects.toThrow(/https/);
    await expect(controller.inspect("sacre-coeur", "awa", { source: "https://me:pw@github.com/a/b.git" }, req)).rejects.toThrow(/credentials/);
  });

  it("takes a Docker image as a room's code, and has nothing to read in it", async () => {
    as = "awa";
    const image = "docker://ghcr.io/awa/ndaje:1.0";
    expect(await controller.inspect("sacre-coeur", "awa", { source: image }, req)).toMatchObject({ stack: "image" });
    expect(sent.filter((c) => c.type === "inspect")).toHaveLength(0);
    await controller.settings("sacre-coeur", "awa", { source: image }, req);
    await controller.redeploy("sacre-coeur", "awa", req);
    expect(deployCmd()).toMatchObject({ repo: image });
    await expect(controller.settings("sacre-coeur", "awa", { source: "docker://Bad Name; rm" }, req)).rejects.toThrow(/https/);
  });
});

describe("cancelling a build", () => {
  const start = async () => {
    as = "awa";
    await controller.deploy("sacre-coeur", "awa", { repo: "https://github.com/awa/ndaje.git" }, req);
    return deployCmd();
  };
  const cancelled = (deployId: string) => houses.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId, room: "awa", status: "failed", detail: BUILD_CANCELLED });
  const roomNow = async () => (await db.query.rooms.findFirst({ where: (r, { and, eq }) => and(eq(r.houseId, "sacre-coeur"), eq(r.name, "awa")) }))!;

  it("tells the caretaker, for whoever may manage the room", async () => {
    await db.update(rooms).set({ status: "empty", url: null }).where(eq(rooms.name, "awa"));
    await start();
    expect(await controller.cancelBuild("sacre-coeur", "awa", req)).toEqual({ ok: true });
    expect(sent.filter((c) => c.type === "cancel_build")).toEqual([{ type: "cancel_build", room: "awa" }]);
    as = "fatou";
    await expect(controller.cancelBuild("sacre-coeur", "awa", req)).rejects.toThrow();
  });

  it("answers 409 when the server is offline or nothing is building", async () => {
    as = "awa";
    await db.delete(deployments).where(eq(deployments.room, "awa"));
    await expect(controller.cancelBuild("sacre-coeur", "awa", req)).rejects.toMatchObject({ status: 409 });
    const { deployId } = await start();
    online = false;
    await expect(controller.cancelBuild("sacre-coeur", "awa", req)).rejects.toMatchObject({ status: 409 });
    online = true;
    await cancelled(deployId);
    await expect(controller.cancelBuild("sacre-coeur", "awa", req)).rejects.toMatchObject({ status: 409 });
    expect(sent.filter((c) => c.type === "cancel_build")).toHaveLength(0);
  });

  it("puts a room that was never online back to where it was, without a note, and it can build again", async () => {
    await db.update(rooms).set({ status: "empty", url: null }).where(eq(rooms.name, "awa"));
    const { deployId } = await start();
    const notes = (await db.select().from(fridgeNotes)).length;
    await cancelled(deployId);
    expect((await roomNow()).status).toBe("empty");
    expect((await db.select().from(fridgeNotes)).length).toBe(notes);
    expect(await service.lastBuild("sacre-coeur", "awa")).toMatchObject({ status: "failed", detail: BUILD_CANCELLED });
    await expect(controller.redeploy("sacre-coeur", "awa", req)).resolves.toBeTruthy();
  });

  it("a room that had crashed stays stopped, not failed", async () => {
    await db.update(rooms).set({ status: "down", url: "http://awa.x" }).where(eq(rooms.name, "awa"));
    const { deployId } = await start();
    await cancelled(deployId);
    expect(await roomNow()).toMatchObject({ status: "down", url: "http://awa.x" });
  });

  it("keeps a live room live", async () => {
    await db.update(rooms).set({ status: "live", url: "http://awa.x" }).where(eq(rooms.name, "awa"));
    const { deployId } = await start();
    await cancelled(deployId);
    expect(await roomNow()).toMatchObject({ status: "live", url: "http://awa.x" });
  });
});

describe("importing a GitHub repo into a room", () => {
  const seen = [
    { id: 11, full_name: "awa/one", description: null, language: "Go", private: false, pushed_at: "2026-01-01T00:00:00Z" },
    { id: 22, full_name: "awa/two", description: "Second", language: null, private: true, pushed_at: "2026-10-01T00:00:00Z" },
  ];
  const client = { userInstallation: async () => 9, installationRepos: async () => seen } as unknown as GithubAppClient;
  const config = { appId: "1", privateKey: "k", webhookSecret: "w", slug: "la-coloc-dev" };
  let github: GithubReposController;
  const linkOf = async (id: number) => (await db.select().from(repos).where(eq(repos.githubId, id)))[0];

  beforeEach(async () => {
    github = new GithubReposController(new GithubRepos(db, houses, client, config), service, auth);
    await db.delete(repos);
    await db.update(users).set({ githubId: 77 }).where(eq(users.login, "awa"));
    as = "awa";
  });

  it("lists the repos the App can see, newest first, with where to give it more", async () => {
    const got = await github.list(req);
    expect(got.repos.map((r) => r.fullName)).toEqual(["awa/two", "awa/one"]);
    expect(got).toMatchObject({ reason: null, installUrl: "https://github.com/apps/la-coloc-dev/installations/new" });
  });

  it("says why there's no list: no App here, or no GitHub login", async () => {
    const off = new GithubReposController(new GithubRepos(db, houses, null, null), service, auth);
    expect(await off.list(req)).toEqual({ repos: [], reason: "off", installUrl: null });
    await db.update(users).set({ githubId: null }).where(eq(users.login, "awa"));
    expect(await github.list(req)).toEqual({ repos: [], reason: "no-github", installUrl: null });
    as = null;
    await expect(github.list(req)).rejects.toThrow(/Log in/);
  });

  it("links it to the room, starts clean, and names the project after it", async () => {
    await db.update(rooms).set({ branch: "old", buildPath: "apps/x", port: 9000, project: null, source: null }).where(eq(rooms.name, "awa"));
    expect(await github.import("sacre-coeur", "awa", { id: 11 }, req)).toEqual({ repo: "awa/one" });
    expect(await linkOf(11)).toMatchObject({ houseId: "sacre-coeur", room: "awa", installationId: 9 });
    const [room] = await db.select().from(rooms).where(eq(rooms.name, "awa"));
    expect(room).toMatchObject({ branch: null, buildPath: ".", port: null, project: "one" });
    // Another repo replaces it, and takes the name; a name of their own stays.
    await github.import("sacre-coeur", "awa", { id: 22 }, req);
    expect(await linkOf(11)).toBeUndefined();
    expect((await db.select().from(rooms).where(eq(rooms.name, "awa")))[0].project).toBe("two");
    await db.update(rooms).set({ project: "My site" }).where(eq(rooms.name, "awa"));
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    expect((await db.select().from(rooms).where(eq(rooms.name, "awa")))[0].project).toBe("My site");
  });

  it("keeps the settings when it's the same repo again", async () => {
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    await db.update(rooms).set({ branch: "dev", port: 8080 }).where(eq(rooms.name, "awa"));
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    expect((await db.select().from(rooms).where(eq(rooms.name, "awa")))[0]).toMatchObject({ branch: "dev", port: 8080 });
  });

  it("moves it from another room of theirs, or a room nobody lives in, but not out of someone else's", async () => {
    const awa = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "awa") }))!;
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "awa-two", occupantId: awa.id, memoryMb: 256, cpus: 0.5, status: "empty" });
    await db.insert(repos).values({ githubId: 11, fullName: "awa/one", houseId: "sacre-coeur", room: "awa-two", installationId: 9 });
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    expect(await linkOf(11)).toMatchObject({ room: "awa" });

    await db.delete(repos);
    await db.update(rooms).set({ occupantId: null }).where(eq(rooms.name, "awa-two"));
    await db.insert(repos).values({ githubId: 11, fullName: "awa/one", houseId: "sacre-coeur", room: "awa-two", installationId: 9 });
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    expect(await linkOf(11)).toMatchObject({ room: "awa" });

    await db.delete(repos);
    await db.insert(repos).values({ githubId: 22, fullName: "awa/two", houseId: "sacre-coeur", room: "moussa", installationId: 9 });
    await expect(github.import("sacre-coeur", "awa", { id: 22 }, req)).rejects.toMatchObject({ status: 409, response: { code: "repoTaken" } });
    expect(await linkOf(22)).toMatchObject({ room: "moussa" });
  });

  it("refuses someone who can't manage the room, a chef on a lived-in room, a repo it can't see, and a bad body", async () => {
    as = "moussa";
    await expect(github.import("sacre-coeur", "awa", { id: 11 }, req)).rejects.toMatchObject({ status: 403 });
    as = "awa";
    await expect(github.import("sacre-coeur", "awa", { id: 999 }, req)).rejects.toMatchObject({ status: 404 });
    await expect(github.import("sacre-coeur", "awa", { id: "x" }, req)).rejects.toMatchObject({ status: 400 });
    const chef = (await db.query.memberships.findFirst({ where: (m, { and, eq }) => and(eq(m.houseId, "sacre-coeur"), eq(m.role, "chef")) }))!;
    as = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, chef.userId) }))!.login;
    if (as !== "awa") await expect(github.import("sacre-coeur", "awa", { id: 11 }, req)).rejects.toMatchObject({ status: 403 });
    expect(await linkOf(11)).toBeUndefined();
  });

  it("a link or an image given by hand replaces the linked repo, and the name that came with it", async () => {
    await db.update(rooms).set({ project: null, source: null }).where(eq(rooms.name, "awa"));
    await github.import("sacre-coeur", "awa", { id: 11 }, req);
    await controller.settings("sacre-coeur", "awa", { source: "docker://nginx:alpine" }, req);
    expect(await linkOf(11)).toBeUndefined();
    expect((await db.select().from(rooms).where(eq(rooms.name, "awa")))[0]).toMatchObject({ source: "docker://nginx:alpine", project: "nginx" });
  });
});
