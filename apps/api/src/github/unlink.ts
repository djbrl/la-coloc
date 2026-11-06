// Dropping links between GitHub repos and rooms, when the App is no longer installed on them: someone removed it from
// their account (in Settings or on GitHub), or deleted their account. A room keeps running its last build. It stops
// updating on merge, and keeps the repo's address as a plain link, so its page still says where the code came from
// (and that it no longer follows merges). Reviews still waiting on those repos go: nobody can report back on them.
import { chores, type Db, repos, rooms } from "@coloc/db";
import { and, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";

type Runner = Pick<Db, "select" | "update" | "delete">;

/** Unlinks every repo matching `where`. Returns what was unlinked. */
export async function unlinkRepos(tx: Runner, where: SQL | undefined): Promise<(typeof repos.$inferSelect)[]> {
  if (!where) return [];
  const gone = await tx.delete(repos).where(where).returning();
  if (!gone.length) return gone;
  await tx.delete(chores).where(and(eq(chores.status, "open"), inArray(chores.repoId, gone.map((r) => r.githubId))));
  for (const r of gone) {
    await tx
      .update(rooms)
      .set({ source: `https://github.com/${r.fullName}` })
      .where(and(eq(rooms.houseId, r.houseId), eq(rooms.name, r.room), isNotNull(rooms.occupantId), isNull(rooms.source)));
  }
  return gone;
}
