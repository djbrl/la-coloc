// Reads shared by the house page and the doorbell: chat history and vote tallies.
import { applications, type Db, messages, users, votes } from "@coloc/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DoorbellItem, MessageView, PersonView, VoteTally } from "../houses/house.types";
import { readKnockLine } from "../houses/lines";

export const HISTORY = 50;

export const houseChannel = (houseId: string) => `house:${houseId}`;
export const applicationChannel = (applicationId: string) => `application:${applicationId}`;

// `github` when the row says (a full users row): their login is a real GitHub handle, so the web links it.
export function person(u: { login: string; name: string | null; avatarUrl: string | null; githubId?: number | null }): PersonView {
  return { login: u.login, name: u.name, avatarUrl: u.avatarUrl, ...(u.githubId !== undefined ? { github: u.githubId !== null } : {}) };
}

export function tally(flatmates: number, vs: { yes: boolean }[]): VoteTally {
  const yes = vs.filter((v) => v.yes).length;
  return { flatmates, yes, no: vs.length - yes, needed: Math.floor(flatmates / 2) + 1 };
}

/** The last messages of a channel, oldest first. */
export async function channelMessages(db: Db, channel: string, limit = HISTORY): Promise<MessageView[]> {
  const rows = await db
    .select({ id: messages.id, body: messages.body, at: messages.at, author: users })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.channel, channel))
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows
    .reverse()
    .map((m) => ({ id: String(m.id), body: m.body, said: m.author ? null : readKnockLine(m.body), at: m.at.toISOString(), author: m.author ? person(m.author) : null }));
}

/** Everyone currently knocking on a house, with where the vote stands. */
export async function openDoorbell(db: Db, houseId: string, flatmates: number): Promise<DoorbellItem[]> {
  const open = await db
    .select({ app: applications, applicant: users })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.applicantId))
    .where(and(eq(applications.houseId, houseId), eq(applications.status, "open")))
    .orderBy(asc(applications.createdAt));
  if (!open.length) return [];
  const all = await db.select().from(votes).where(inArray(votes.applicationId, open.map((o) => o.app.id)));
  return open.map(({ app, applicant }) => ({
    id: app.id,
    room: app.room,
    applicant: person(applicant),
    tally: tally(flatmates, all.filter((v) => v.applicationId === app.id)),
    createdAt: app.createdAt.toISOString(),
  }));
}
