import "reflect-metadata";
import { type Db, houses } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCity } from "../seed/city";
import { HousesService } from "./houses.service";

const oom = { type: "room_event" as const, room: "moussa", event: "oom" as const, at: "" };
let db: Db;
let svc: HousesService;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "dev-secret-change-me", domain: (id) => `${id}.coloc.dev` });
  svc = new HousesService(db);
});

async function userId(login: string) {
  const u = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) });
  return u!.id;
}

describe("HousesService", () => {
  it("collapses a crash loop into one fridge note with a count", async () => {
    await svc.recordRoomEvent("sacre-coeur", oom);
    await svc.recordRoomEvent("sacre-coeur", oom);
    await svc.recordRoomEvent("sacre-coeur", oom);
    const notes = (await svc.view("sacre-coeur", await userId("jib")))!.notes!;
    expect(notes).toHaveLength(1);
    expect(notes[0].count).toBe(3);
    expect(notes[0].text).toContain("Moussa");
  });

  it("rebuilds room status from the agent's snapshot after a restart", async () => {
    await svc.applySnapshot("sacre-coeur", {
      type: "rooms_snapshot",
      rooms: [
        { room: "jib", kind: "prod", state: "running", url: "http://jib.coloc.localhost:8000" },
        { room: "moussa", kind: "prod", state: "restarting", url: "http://moussa.coloc.localhost:8000" },
      ],
    });
    const rooms = Object.fromEntries((await svc.view("sacre-coeur"))!.rooms.map((r) => [r.name, r.status]));
    expect(rooms).toEqual({ jib: "live", awa: "empty", moussa: "down", "room-4": "empty" });
  });

  it("follows a deploy to live and remembers the room's address", async () => {
    const d = await svc.createDeployment("sacre-coeur", "awa", "prod", "https://github.com/awa/ndaje.git", "main");
    for (const status of ["cloning", "building", "starting"] as const) {
      await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: "awa", status });
    }
    expect((await svc.room("sacre-coeur", "awa"))!.status).toBe("deploying");
    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: "awa", status: "live", url: "http://awa.x" });
    const awa = (await svc.room("sacre-coeur", "awa"))!;
    expect(awa.status).toBe("live");
    expect(awa.url).toBe("http://awa.x");
  });

  it("never stores a token that came in a repo URL", async () => {
    const d = await svc.createDeployment("sacre-coeur", "jib", "prod", "https://x-access-token:ghs_secret@github.com/jib/bot.git", "main");
    const stored = await db.query.deployments.findFirst({ where: (t, { eq }) => eq(t.id, d.id) });
    expect(stored!.repo).not.toContain("ghs_secret");
  });

  it("checks agent secrets against their hash", async () => {
    expect(await svc.verifyAgentSecret("sacre-coeur", "dev-secret-change-me")).toBe(true);
    expect(await svc.verifyAgentSecret("sacre-coeur", "guess")).toBe(false);
    expect(await svc.verifyAgentSecret("nowhere", "dev-secret-change-me")).toBe(false);
    // Demo houses have no agent at all.
    expect(await svc.verifyAgentSecret("almadies", "")).toBe(false);
    const [h] = await db.select().from(houses).where(eq(houses.id, "sacre-coeur"));
    expect(h.agentSecretHash).not.toContain("dev-secret");
  });
});

describe("the house profile", () => {
  it("is public, but deployments and fridge notes are for flatmates only", async () => {
    await svc.recordRoomEvent("sacre-coeur", oom);
    const visitor = (await svc.view("sacre-coeur"))!;
    expect(visitor.rooms.map((r) => r.occupant?.login ?? null)).toEqual(["awa", "jib", "moussa", null]);
    expect(visitor.notes).toBeNull();
    expect(visitor.deployments).toBeNull();
    expect(visitor.viewer).toBeNull();

    const stranger = (await svc.view("sacre-coeur", await userId("koffi")))!;
    expect(stranger.viewer).toEqual({ login: "koffi", member: false, role: null, room: null });
    expect(stranger.notes).toBeNull();

    const awa = (await svc.view("sacre-coeur", await userId("awa")))!;
    expect(awa.viewer).toEqual({ login: "awa", member: true, role: "flatmate", room: "awa" });
    expect(awa.notes).toHaveLength(1);
  });

  it("shows a free room's ad, and who the chef is", async () => {
    const v = (await svc.view("sacre-coeur"))!;
    expect(v.rooms.find((r) => r.name === "room-4")!.ad).toContain("mobile dev");
    expect(v.chef!.login).toBe("jib");
    expect(v.members.find((m) => m.login === "jib")!.role).toBe("chef");
  });

  it("never exposes the agent secret or its hash", async () => {
    const json = JSON.stringify(await svc.view("sacre-coeur", await userId("jib")));
    expect(json).not.toContain("dev-secret");
    expect(json).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("the city", () => {
  it("lists the real house first, then the demo houses, each labelled", async () => {
    const { houses } = await svc.city();
    expect(houses[0]).toMatchObject({ id: "sacre-coeur", demo: false });
    expect(houses.slice(1).every((h) => h.demo)).toBe(true);
    expect(houses.length).toBeGreaterThan(5);
  });

  it("shows which rooms are free and what they're looking for", async () => {
    const { houses } = await svc.city();
    const lome = houses.find((h) => h.id === "be-kpota")!;
    expect(lome.status).toBe("making");
    expect(lome.rooms.filter((r) => !r.occupant).map((r) => r.ad)).toHaveLength(2);
  });
});
