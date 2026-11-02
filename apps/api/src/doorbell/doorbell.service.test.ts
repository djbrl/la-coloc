import "reflect-metadata";
import { chores, type Db, memberships, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipsService } from "../auth/memberships.service";
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
    expect(asFatou.messages.map((m) => m.body)).toEqual(["Fatou knocked on a free room.", "Mobile dev from Lomé, I'd host my tontine app."]);
    expect(asFatou.messages[0].author).toBeNull();
    // The house's line says what it is, so the web can say it in French; Fatou's own words don't.
    expect(asFatou.messages.map((m) => m.said)).toEqual([{ kind: "knocked", params: { name: "Fatou" } }, null]);
    // Logged in by name, not with GitHub: no profile to link.
    expect(asFatou.applicant.github).toBe(false);
    expect((await doorbell.view(id, ids.awa)).viewer.as).toBe("flatmate");
    await expect(doorbell.view(id, ids.koffi)).rejects.toThrow();
  });

  it("shows the house what the applicant has built: their top repos and the reviews they traded anywhere", async () => {
    const repos = [{ fullName: "fatou/tontine", url: "https://github.com/fatou/tontine", language: "Dart" }];
    await db.update(users).set({ githubRepos: repos }).where(eq(users.id, ids.fatou));
    const chore = (n: number, assignee: string, author: string, status: "open" | "done") =>
      ({ houseId: "almadies", repoId: 7, repoFullName: "x/y", prNumber: n, prTitle: "t", prUrl: "u", assigneeId: ids[assignee], authorId: ids[author], status, dueAt: new Date() });
    await db.insert(chores).values([chore(1, "fatou", "cheikh", "done"), chore(2, "fatou", "ibou", "done"), chore(3, "cheikh", "fatou", "done"), chore(4, "fatou", "ibou", "open")]);
    const { id } = await knock();
    expect((await doorbell.view(id, ids.awa)).work).toEqual({ repos, given: 2, received: 1 });
    // Someone who never logged in with GitHub has no repos to show.
    await db.update(users).set({ githubRepos: null }).where(eq(users.id, ids.fatou));
    expect((await doorbell.view(id, ids.fatou)).work).toEqual({ repos: [], given: 2, received: 1 });
  });

  it("names people, never room slugs, in what the house says", async () => {
    const { id } = await knock();
    const notes = (await houses.view("sacre-coeur", ids.jib))!.notes!;
    expect(notes[0].text).toBe("Fatou knocked on a free room. Answer the door!");
    for (const flatmate of ["jib", "awa"]) await doorbell.vote(id, ids[flatmate], true);
    const after = (await houses.view("sacre-coeur", ids.jib))!.notes!.map((n) => n.text);
    expect(after).toContain("Fatou moved in. Welcome home!");
    expect(after.join(" ")).not.toContain("room-4");
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

describe("your knocks", () => {
  it("lists the knocks still waiting for a vote, and drops them once withdrawn or decided", async () => {
    const memberships = new MembershipsService(db);
    expect(await memberships.openKnocks(ids.fatou)).toEqual([]);
    const { id } = await knock();
    expect(await memberships.openKnocks(ids.fatou)).toEqual([{ id, houseId: "sacre-coeur", room: "room-4" }]);
    expect(await memberships.openKnocks(ids.koffi)).toEqual([]);
    await doorbell.withdraw(id, ids.fatou);
    expect(await memberships.openKnocks(ids.fatou)).toEqual([]);

    const again = await knock();
    await doorbell.vote(again.id, ids.jib, true);
    await doorbell.vote(again.id, ids.awa, true);
    expect(await memberships.openKnocks(ids.fatou)).toEqual([]);
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

describe("the workshop's answer to your first word", () => {
  const channelOf = async (viewer: string) => (await houses.view("atelier", ids[viewer]))!.channel!.filter((m) => m.author?.login === "ndeye" && m.body.includes("Fatou"));

  beforeEach(async () => {
    doorbell.replyDelayMs = 1;
    await db.insert(memberships).values({ houseId: "atelier", userId: ids.fatou });
  });

  it("answers once, by your first name, however many times you talk", async () => {
    await doorbell.postToHouse("atelier", ids.fatou, "Salut !");
    await vi.waitFor(async () => expect(await channelOf("fatou")).toHaveLength(1));
    await doorbell.postToHouse("atelier", ids.fatou, "Encore moi");
    await new Promise((r) => setTimeout(r, 20));
    expect(await channelOf("fatou")).toHaveLength(1);
  });

  it("stays quiet in a real house", async () => {
    await doorbell.postToHouse("sacre-coeur", ids.awa, "who broke the build?");
    await new Promise((r) => setTimeout(r, 20));
    expect((await houses.view("sacre-coeur", ids.awa))!.channel).toHaveLength(1);
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
