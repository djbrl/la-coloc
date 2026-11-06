import "reflect-metadata";
import { type Db, deployments, houses, rooms as roomRows } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { take } from "rxjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CITY, seedCity } from "../seed/city";
import type { CityChange } from "./house.types";
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
  it("says who has a GitHub account, so the web links only real profiles", async () => {
    const { users } = await import("@coloc/db");
    await db.update(users).set({ githubId: 42 }).where(eq(users.login, "jib"));
    const people = Object.fromEntries((await svc.view("sacre-coeur"))!.rooms.filter((r) => r.occupant).map((r) => [r.occupant!.login, r.occupant!.github]));
    expect(people).toEqual({ jib: true, awa: false, moussa: false });
    const almadies = await svc.view("almadies");
    expect(almadies!.members.every((m) => m.github === false)).toBe(true);
  });

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

  it("leaves the workshop's example rooms alone: the agent never reports them", async () => {
    const fatou = (await db.insert((await import("@coloc/db")).users).values({ login: "fatou" }).returning())[0];
    await db.insert(roomRows).values({ houseId: "atelier", name: "fatou", occupantId: fatou.id, memoryMb: 256, cpus: 0.5, status: "live", url: "http://x" });
    await svc.applySnapshot("atelier", { type: "rooms_snapshot", rooms: [] });
    const rows = await db.select().from(roomRows).where(eq(roomRows.houseId, "atelier"));
    const rooms = Object.fromEntries(rows.map((r) => [r.name, [r.status, r.url, r.demo]]));
    expect(rooms).toEqual({
      aissatou: ["live", null, true],
      babacar: ["live", null, true],
      ndeye: ["live", null, true],
      fatou: ["empty", null, false],
    });
  });

  it("fails the builds a caretaker no longer has, and leaves the ones it's still on", async () => {
    const lost = await svc.createDeployment("sacre-coeur", "awa", "prod", "https://github.com/awa/ndaje.git", "main");
    const going = await svc.createDeployment("sacre-coeur", "jib", "prod", "https://github.com/jib/ker-bot.git", "main");
    await svc.failLostBuilds("sacre-coeur", [going.id]);
    const statusOf = async (id: string) => (await db.select().from(deployments).where(eq(deployments.id, id)))[0];
    expect(await statusOf(lost.id)).toMatchObject({ status: "failed", detail: expect.stringMatching(/restarted during/) });
    expect((await statusOf(going.id)).status).toBe("queued");
  });

  it("follows a deploy to live and remembers the room's address", async () => {
    const d = await svc.createDeployment("sacre-coeur", "awa", "prod", "https://github.com/awa/ndaje.git", "main");
    for (const status of ["cloning", "building", "starting"] as const) {
      await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: "awa", status });
    }
    expect((await svc.room("sacre-coeur", "awa"))!.status).toBe("deploying");
    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: "awa", status: "live", url: "http://awa.sacre-coeur.coloc.dev" });
    const awa = (await svc.room("sacre-coeur", "awa"))!;
    expect(awa.status).toBe("live");
    expect(awa.url).toBe("http://awa.sacre-coeur.coloc.dev");
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
    expect(stranger.viewer).toEqual({ login: "koffi", member: false, role: null, room: null, rooms: [], leavingUntil: null, application: null, guest: null });
    expect(stranger.notes).toBeNull();

    const awa = (await svc.view("sacre-coeur", await userId("awa")))!;
    expect(awa.viewer).toEqual({ login: "awa", member: true, role: "flatmate", room: "awa", rooms: ["awa"], leavingUntil: null, application: null, guest: null });
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

describe("the seed", () => {
  it("gives every seeded person one login, none taken twice", () => {
    // A login is a person: two houses naming the same one would make them live in both.
    const occupants = CITY.flatMap((h) => h.rooms.map((r) => r.who).filter(Boolean));
    expect(new Set(occupants).size).toBe(occupants.length);
    for (const h of CITY) if (h.rooms.length) expect(h.rooms.map((r) => r.who)).toContain(h.chef);
  });

  it("runs the workshop with a host, and two learners' example rooms nobody else is shown", async () => {
    const v = (await svc.view("atelier", await userId("ndeye")))!;
    expect(v).toMatchObject({ tutorial: true, demo: false, status: "live" });
    expect(v.chef!.login).toBe("ndeye");
    expect(v.members.map((m) => [m.login, m.role])).toEqual([
      ["ndeye", "chef"],
      ["aissatou", "flatmate"],
      ["babacar", "flatmate"],
    ]);
    expect(v.rooms).toHaveLength(3);
    for (const r of v.rooms) {
      expect(r).toMatchObject({ demo: true, status: "live", url: null, ad: null });
      expect(r.project).toBeTruthy();
      expect(r.projectDescription).toMatch(/\.$/);
    }
    // Someone logged out sees nobody in it.
    const outside = (await svc.view("atelier"))!;
    expect([outside.rooms, outside.members, outside.chef]).toEqual([[], [], null]);
    // Only the workshop has example rooms; everywhere else rooms are what they say.
    expect((await svc.view("sacre-coeur"))!.rooms.every((r) => !r.demo)).toBe(true);
    expect((await svc.view("sacre-coeur"))!.tutorial).toBe(false);
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

  it("says what each project does", async () => {
    const { houses } = await svc.city();
    const jib = houses.find((h) => h.id === "sacre-coeur")!.rooms.find((r) => r.name === "jib")!;
    expect(jib).toMatchObject({ project: "Kër Bot", projectDescription: "A Discord bot for the neighbourhood's football league." });
    expect(houses.find((h) => h.id === "sacre-coeur")!.rooms.find((r) => r.name === "room-4")!.projectDescription).toBeNull();
  });
});

describe("a room's address, as a caretaker reports it", () => {
  it("is kept only when it's the room's own name under its house's domain, over http(s)", async () => {
    const { roomAddress } = await import("./houses.service");
    expect(roomAddress("http://awa.coloc.localhost:8000", "awa", "coloc.localhost")).toBe("http://awa.coloc.localhost:8000");
    expect(roomAddress("https://preview-awa.h.coloc.dev", "awa", "h.coloc.dev")).toBe("https://preview-awa.h.coloc.dev");
    expect(roomAddress("javascript:alert(1)", "awa", "coloc.localhost")).toBeNull();
    expect(roomAddress("https://evil.example/awa", "awa", "coloc.localhost")).toBeNull();
    expect(roomAddress("http://jib.coloc.localhost", "awa", "coloc.localhost")).toBeNull();
    expect(roomAddress("http://user:pw@awa.coloc.localhost", "awa", "coloc.localhost")).toBeNull();
  });
});

describe("the city stream's feed", () => {
  const nextChange = () => new Promise<CityChange>((resolve) => svc.cityChanges.pipe(take(1)).subscribe(resolve));

  it("opens with the whole city, the same one the page asks for", async () => {
    expect((await svc.citySnapshot()).houses.map((h) => h.id)).toEqual((await svc.city()).houses.map((h) => h.id));
  });

  it("says only the house that changed, once, however many pages listen", async () => {
    await svc.citySnapshot();
    const city = vi.spyOn(svc, "city");
    const pages = [nextChange(), nextChange(), nextChange()];
    await db.update(houses).set({ tagline: "New words" }).where(eq(houses.id, "almadies"));
    svc.changes.next("almadies");
    svc.changes.next("almadies");
    const [first, second] = await Promise.all(pages);
    expect(first.changed.map((h) => h.id)).toEqual(["almadies"]);
    expect(first.changed[0].tagline).toBe("New words");
    expect(first.gone).toEqual([]);
    expect(second).toBe(first);
    expect(city).toHaveBeenCalledOnce();
  });

  it("stays quiet when a change changes nothing the city shows", async () => {
    await svc.citySnapshot();
    const heard = vi.fn();
    const sub = svc.cityChanges.subscribe(heard);
    svc.changes.next("almadies");
    await new Promise((r) => setTimeout(r, 1200));
    await svc.citySnapshot();
    expect(heard).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  it("doesn't ask the database while nobody listens, and the next page gets the news", async () => {
    await svc.citySnapshot();
    const city = vi.spyOn(svc, "city");
    await db.update(houses).set({ tagline: "Unheard" }).where(eq(houses.id, "almadies"));
    svc.changes.next("almadies");
    await new Promise((r) => setTimeout(r, 1200));
    expect(city).not.toHaveBeenCalled();
    expect((await svc.citySnapshot()).houses.find((h) => h.id === "almadies")!.tagline).toBe("Unheard");
  });
});
