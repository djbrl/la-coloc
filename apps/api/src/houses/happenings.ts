// What just happened in each house, for the city to play: a review done, a room's app crashed and restarted, a
// project went live. The city is polled (every 4 s on the shared site), so a moment can't be a
// one-off push that a page between two polls would miss: each house carries its last few minutes as a list, and the
// page plays the ones whose id it hasn't seen.
//
// Nothing new is recorded for this: every moment is read back from rows the API already writes (chores, fridge
// notes, deployments). Each id is made from its row, so it never changes from one poll to the next.
import { chores, type Db, deployments, fridgeNotes, users } from "@coloc/db";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CityHappening } from "./house.types";
import { readNote } from "./lines";

// How far back the city looks, and how many moments one house carries at most.
export const HAPPENING_WINDOW_MS = 10 * 60 * 1000;
export const HAPPENINGS_PER_HOUSE = 10;

// The fridge notes that say a room's app went down and came back on its own (see fridge.ts noteForRoomEvent).
const CRASH_NOTES = new Set(["oom", "crashed"]);

/** The last ten minutes of each of `houseIds`, newest first, at most HAPPENINGS_PER_HOUSE each. */
export async function happenings(db: Db, houseIds: string[], now = new Date()): Promise<Map<string, CityHappening[]>> {
  const out = new Map<string, CityHappening[]>(houseIds.map((id) => [id, []]));
  if (!houseIds.length) return out;
  const since = new Date(now.getTime() - HAPPENING_WINDOW_MS);
  const add = (houseId: string, h: CityHappening) => out.get(houseId)?.push(h);

  // Reviews done: the reviewer (the chore's assignee) sends it to the pull request's author.
  const author = alias(users, "author");
  const reviews = await db
    .select({ id: chores.id, houseId: chores.houseId, at: chores.doneAt, from: users.login, to: author.login })
    .from(chores)
    .innerJoin(users, eq(users.id, chores.assigneeId))
    .innerJoin(author, eq(author.id, chores.authorId))
    .where(and(inArray(chores.houseId, houseIds), eq(chores.status, "done"), gte(chores.doneAt, since)));
  for (const r of reviews) add(r.houseId, { id: `review:${r.id}`, at: (r.at ?? now).toISOString(), kind: "review", from: r.from, to: r.to });

  // Crashes, as the caretaker reported them (an out-of-memory kill or an exit; Docker restarts the app). The same
  // note repeated within a few minutes is one row with a count, so the count is part of the id: a second crash is a
  // second moment.
  const notes = await db
    .select({ id: fridgeNotes.id, houseId: fridgeNotes.houseId, room: fridgeNotes.room, text: fridgeNotes.text, count: fridgeNotes.count, at: fridgeNotes.at })
    .from(fridgeNotes)
    .where(and(inArray(fridgeNotes.houseId, houseIds), isNotNull(fridgeNotes.room), inArray(fridgeNotes.tone, ["warning", "danger"]), gte(fridgeNotes.at, since)));
  for (const n of notes) {
    if (n.room && CRASH_NOTES.has(readNote(n.text)?.kind ?? "")) add(n.houseId, { id: `crash:${n.id}:${n.count}`, at: n.at.toISOString(), kind: "crash", room: n.room });
  }

  // Projects that went live: a prod deploy's last word is "live", and nothing updates it after that.
  const lives = await db
    .select({ id: deployments.id, houseId: deployments.houseId, room: deployments.room, at: deployments.updatedAt })
    .from(deployments)
    .where(and(inArray(deployments.houseId, houseIds), eq(deployments.kind, "prod"), eq(deployments.status, "live"), gte(deployments.updatedAt, since)));
  for (const d of lives) add(d.houseId, { id: `live:${d.id}`, at: d.at.toISOString(), kind: "live", room: d.room });

  for (const [id, list] of out) out.set(id, list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, HAPPENINGS_PER_HOUSE));
  return out;
}
