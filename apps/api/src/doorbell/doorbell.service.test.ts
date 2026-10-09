import "reflect-metadata";
import { type Db, memberships, rooms } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { DoorbellService } from "./doorbell.service";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  // Fatou is new in town: no house yet.
  const [fatou] = await db.insert((await import("@coloc/db")).users).values({ login: "fatou", name: "Fatou" }).returning();
  ids.fatou = fatou.id;
});

const knock = (who = "fatou", room = "room-4") => doorbell.knock("sacre-coeur", room, ids[who], { message: "Mobile dev from Lomé, I'd host my tontine app." });

describe("knocking", () => {
  it("opens a thread the applicant and the flatmates can read, and nobody else", async () => {
    const { id } = await knock();
    const asFatou = await doorbell.view(id, ids.fatou);
    expect(asFatou.viewer.as).toBe("applicant");
    expect(asFatou.messages.map((m) => m.body)).toEqual(["Fatou knocked on room-4.", "Mobile dev from Lomé, I'd host my tontine app."]);
    expect(asFatou.messages[0].author).toBeNull();
    expect((await doorbell.view(id, ids.awa)).viewer.as).toBe("flatmate");
    await expect(doorbell.view(id, ids.koffi)).rejects.toThrow();
  });

  it("rings the house: a fridge note and the doorbell list on the house page", async () => {
    await knock();
    const v = (await houses.view("sacre-coeur", ids.jib))!;
    expect(v.notes!.some((n) => n.text.includes("Fatou knocked"))).toBe(true);
    expect(v.doorbell!.map((d) => [d.applicant.login, d.room, d.tally.needed])).toEqual([["fatou", "room-4", 2]]);
    expect((await houses.view("sacre-coeur", ids.fatou))!.viewer!.application).not.toBeNull();
  });

  it("refuses occupied rooms, demo houses, flatmates and double knocks", async () => {
    await expect(knock("fatou", "awa")).rejects.toThrow(/already lives/);
    await expect(doorbell.knock("cocody", "room-6", ids.fatou, { message: "hi" })).rejects.toThrow(/demo house/);
    await expect(knock("awa")).rejects.toThrow(/already live here/);
    await knock();
    await expect(knock()).rejects.toThrow(/already knocked/);
  });
});

describe("the vote", () => {
  it("moves the applicant in once a majority says yes", async () => {
    const { id } = await knock();
    expect((await doorbell.vote(id, ids.jib, true)).verdict).toBe("open");
    expect((await doorbell.vote(id, ids.awa, true)).verdict).toBe("admitted");

    const [room] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    expect(room.occupantId).toBe(ids.fatou);
    expect(room.ad).toBeNull();
    const [m] = await db.select().from(memberships).where(and(eq(memberships.houseId, "sacre-coeur"), eq(memberships.userId, ids.fatou)));
    expect(m.role).toBe("flatmate");
    expect(m.tontinePosition).toBe(3);

    const thread = await doorbell.view(id, ids.fatou);
    expect(thread.status).toBe("admitted");
    expect(thread.messages.at(-1)!.body).toContain("Welcome home, Fatou");
    expect((await houses.view("sacre-coeur", ids.fatou))!.viewer).toMatchObject({ member: true, room: "room-4" });
  });

  it("closes the knock politely when a majority says no", async () => {
    const { id } = await knock();
    await doorbell.vote(id, ids.jib, false);
    expect((await doorbell.vote(id, ids.moussa, false)).verdict).toBe("declined");
    const thread = await doorbell.view(id, ids.fatou);
    expect(thread.status).toBe("declined");
    expect(thread.messages.at(-1)!.body).toContain("said no");
    await expect(doorbell.vote(id, ids.awa, true)).rejects.toThrow(/already decided/);
  });

  it("lets a flatmate change their mind before it's decided", async () => {
    const { id } = await knock();
    await doorbell.vote(id, ids.jib, false);
    await doorbell.vote(id, ids.jib, true);
    expect((await doorbell.view(id, ids.jib)).tally).toMatchObject({ yes: 1, no: 0 });
  });

  it("shows flatmates who voted what, and the applicant only the counts", async () => {
    const { id } = await knock();
    await doorbell.vote(id, ids.moussa, false);
    expect((await doorbell.view(id, ids.jib)).votes).toEqual([{ voter: expect.objectContaining({ login: "moussa" }), yes: false }]);
    const asFatou = await doorbell.view(id, ids.fatou);
    expect(asFatou.votes).toBeNull();
    expect(asFatou.tally).toMatchObject({ yes: 0, no: 1 });
  });

  it("only lets flatmates vote", async () => {
    const { id } = await knock();
    await expect(doorbell.vote(id, ids.fatou, true)).rejects.toThrow(/Only flatmates/);
    await expect(doorbell.vote(id, ids.koffi, true)).rejects.toThrow();
  });

  it("when two people knock on one room, the first one admitted gets it", async () => {
    const a = await knock("fatou");
    const b = await doorbell.knock("sacre-coeur", "room-4", ids.koffi, { message: "me too" });
    await doorbell.vote(a.id, ids.jib, true);
    await doorbell.vote(a.id, ids.awa, true);
    const other = await doorbell.view(b.id, ids.koffi);
    expect(other.status).toBe("declined");
    expect(other.messages.at(-1)!.body).toContain("Someone else moved in");
  });
});

describe("talking", () => {
  it("keeps the living room for flatmates", async () => {
    await doorbell.postToHouse("sacre-coeur", ids.awa, "who broke the build?");
    await expect(doorbell.postToHouse("sacre-coeur", ids.fatou, "hi")).rejects.toThrow(/Only flatmates/);
    const v = (await houses.view("sacre-coeur", ids.moussa))!;
    expect(v.channel!.map((m) => [m.author?.login, m.body])).toEqual([["awa", "who broke the build?"]]);
    expect((await houses.view("sacre-coeur"))!.channel).toBeNull();
  });

  it("refuses empty and huge messages, and brakes floods", async () => {
    const { id } = await knock();
    await expect(doorbell.postToApplication(id, ids.fatou, "   ")).rejects.toThrow(/Write something/);
    await expect(doorbell.postToApplication(id, ids.fatou, "x".repeat(2001))).rejects.toThrow(/under/);
    for (let i = 0; i < 20; i++) await doorbell.postToApplication(id, ids.fatou, `msg ${i}`);
    await expect(doorbell.postToApplication(id, ids.fatou, "one more")).rejects.toThrow(/Slow down/);
  });

  it("lets the applicant withdraw, and then the thread is read-only", async () => {
    const { id } = await knock();
    await expect(doorbell.withdraw(id, ids.jib)).rejects.toThrow(/Only the person/);
    await doorbell.withdraw(id, ids.fatou);
    await expect(doorbell.postToApplication(id, ids.fatou, "wait")).rejects.toThrow(/closed/);
  });
});
