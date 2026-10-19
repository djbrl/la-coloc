// What the city plays on a house: its last ten minutes (reviews, crashes, deploys going live, teams), read back from
// the rows the API already writes, and the roof's smoke (the rooms' CPU added up).
import "reflect-metadata";
import { chores, type Db, fridgeNotes, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCity } from "../seed/city";
import { HAPPENINGS_PER_HOUSE } from "./happenings";
import { HousesService } from "./houses.service";
import { noteText } from "./lines";

let db: Db;
let svc: HousesService;
const ids: Record<string, string> = {};
const MINUTE = 60_000;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.dev` });
  svc = new HousesService(db);
  for (const u of await db.select().from(users)) ids[u.login] = u.id;
});

const sacreCoeur = async () => (await svc.city()).houses.find((h) => h.id === "sacre-coeur")!;

let pr = 0;
async function review(reviewer: string, author: string, doneAt: Date) {
  pr++;
  const [c] = await db
    .insert(chores)
    .values({ houseId: "sacre-coeur", repoId: 1, repoFullName: "jib/kër-bot", prNumber: pr, prTitle: "x", prUrl: "https://github.com/jib/ker-bot/pull/1", authorId: ids[author], assigneeId: ids[reviewer], status: "done", dueAt: doneAt, doneAt })
    .returning();
  return c.id;
}

describe("the city's happenings", () => {
  it("has none on a quiet house", async () => {
    expect((await sacreCoeur()).recent).toEqual([]);
  });

  it("plays a review done just now, from the reviewer to the author, but not an old one", async () => {
    const id = await review("awa", "jib", new Date(Date.now() - MINUTE));
    await review("moussa", "awa", new Date(Date.now() - 20 * MINUTE));
    expect((await sacreCoeur()).recent).toEqual([{ id: `review:${id}`, at: expect.any(String), kind: "review", from: "awa", to: "jib" }]);
  });

  it("plays a crash the caretaker reported, and a second crash as a second moment", async () => {
    const oom = { type: "room_event" as const, room: "moussa", event: "oom" as const, at: "" };
    await svc.recordRoomEvent("sacre-coeur", oom);
    const first = (await sacreCoeur()).recent;
    expect(first).toEqual([expect.objectContaining({ kind: "crash", room: "moussa" })]);
    await svc.recordRoomEvent("sacre-coeur", { ...oom, event: "crashed" });
    await svc.recordRoomEvent("sacre-coeur", oom);
    const after = (await sacreCoeur()).recent;
    // The repeated out-of-memory note is one row with a count of 2: a new id, so the page plays it again.
    expect(after).toHaveLength(2);
    expect(after.map((h) => h.id)).not.toContain(first[0].id);
    // "Back up" isn't a crash.
    await svc.recordRoomEvent("sacre-coeur", { ...oom, event: "restarted" });
    expect((await sacreCoeur()).recent).toHaveLength(2);
  });

  it("plays a prod deploy going live, not a preview, nor one that failed", async () => {
    const prod = await svc.createDeployment("sacre-coeur", "awa", "prod", "https://github.com/awa/ndaje.git", "main");
    const preview = await svc.createDeployment("sacre-coeur", "awa", "preview", "https://github.com/awa/ndaje.git", "pr-1");
    const failed = await svc.createDeployment("sacre-coeur", "jib", "prod", "https://github.com/jib/ker-bot.git", "main");
    expect((await sacreCoeur()).recent).toEqual([]);
    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: prod.id, room: "awa", status: "live", url: "http://awa.sacre-coeur.coloc.dev" });
    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: preview.id, room: "awa", status: "live" });
    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: failed.id, room: "jib", status: "failed", detail: "no Dockerfile" });
    expect((await sacreCoeur()).recent).toEqual([{ id: `live:${prod.id}`, at: expect.any(String), kind: "live", room: "awa" }]);
  });

  it("lists the newest first, at most ten, with ids that stay the same from one poll to the next", async () => {
    for (let i = 0; i < HAPPENINGS_PER_HOUSE + 2; i++) await review("awa", "jib", new Date(Date.now() - (i + 1) * 30_000));
    const first = (await sacreCoeur()).recent;
    expect(first).toHaveLength(HAPPENINGS_PER_HOUSE);
    expect([...first].sort((a, b) => b.at.localeCompare(a.at))).toEqual(first);
    expect((await sacreCoeur()).recent.map((h) => h.id)).toEqual(first.map((h) => h.id));
  });

  it("only reads crash notes, and keeps each house's to itself", async () => {
    await db.insert(fridgeNotes).values({ id: "n1", houseId: "almadies", room: "cheikh", tone: "danger", text: noteText("crashed", { name: "Cheikh" }) });
    await db.insert(fridgeNotes).values({ id: "n2", houseId: "almadies", room: "ibou", tone: "danger", text: noteText("deployFailed", { name: "Ibou", reason: "x" }) });
    const city = (await svc.city()).houses;
    expect(city.find((h) => h.id === "almadies")!.recent).toEqual([{ id: "crash:n1:1", at: expect.any(String), kind: "crash", room: "cheikh" }]);
    expect(city.find((h) => h.id === "sacre-coeur")!.recent).toEqual([]);
  });
});

describe("the roof's smoke", () => {
  it("adds up the rooms' latest CPU, 0 when nothing was measured", async () => {
    expect((await sacreCoeur()).cpu).toBe(0);
    const sample = (room: string, cpuPercent: number) => ({ room, cpuPercent, memoryBytes: 1, memoryLimitBytes: 2 });
    await svc.recordUsage("sacre-coeur", { type: "usage", at: new Date().toISOString(), samples: [sample("jib", 12.5), sample("awa", 40)] });
    expect((await sacreCoeur()).cpu).toBe(52.5);
    // A newer reading replaces a room's older one; a free room's leftover container doesn't count.
    await svc.recordUsage("sacre-coeur", { type: "usage", at: new Date().toISOString(), samples: [sample("jib", 2), sample("room-4", 90)] });
    expect((await sacreCoeur()).cpu).toBe(42);
    // The caretaker hung up: nothing is known any more.
    svc.setAgentOnline("sacre-coeur", false);
    expect((await sacreCoeur()).cpu).toBe(0);
  });

  it("is 0 for an example house, which has no server", async () => {
    expect((await svc.city()).houses.find((h) => h.id === "almadies")!.cpu).toBe(0);
  });
});

describe("teams on the house's views", () => {
  it("are empty on the bare city, and the seeded life puts Moussa on Awa's Ndaje, not as news", async () => {
    expect((await svc.view("sacre-coeur"))!.rooms.every((r) => r.team.length === 0)).toBe(true);
    await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.dev`, life: true });
    const house = (await svc.city()).houses.find((h) => h.id === "sacre-coeur")!;
    expect(house.rooms.find((r) => r.name === "awa")!.team.map((p) => p.login)).toEqual(["moussa"]);
    expect(house.recent.filter((h) => h.kind === "team")).toEqual([]);
    // And the seeded life is a month old: nothing to play on a fresh city.
    expect((await svc.city()).houses.flatMap((h) => h.recent)).toEqual([]);
  });

  it("drop someone who no longer lives in the house", async () => {
    await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.dev`, life: true });
    const { memberships } = await import("@coloc/db");
    const [moussa] = await db.select().from(users).where(eq(users.login, "moussa"));
    await db.delete(memberships).where(eq(memberships.userId, moussa.id));
    expect((await svc.view("sacre-coeur"))!.rooms.find((r) => r.name === "awa")!.team).toEqual([]);
  });
});
