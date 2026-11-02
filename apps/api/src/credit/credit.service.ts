// The city's fake money. Everyone gets some to settle in (users.credit starts at WELCOME_CREDIT_FCFA), spends it on
// servers, rent and projects, and earns more by reviewing code and winning the Arena. Every movement leaves a row in
// credit_entries: that row's unique `key` is what stops the same thing being paid or earned twice, and the balance
// only ever changes in the same transaction as its row.
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { creditEntries, type CreditReason, type Db, users } from "@coloc/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { DB } from "../db/db.module";

// A project is paid for once per person per room.
export const projectKey = (houseId: string, room: string, userId: string) => `project:${houseId}/${room}:${userId}`;

/** What someone reads when they can't afford something: how much they're missing, and how to earn it. */
export function noCredit(need: number): ConflictException {
  return new ConflictException({ code: "no_credit", need, message: `You're ${need} FCFA short. Review a flatmate's code or win the Arena to earn more.` });
}

export interface CreditView {
  credit: number;
  entries: { amount: number; reason: CreditReason; at: string }[];
}

@Injectable()
export class CreditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Adds to someone's credit. False: this key was already paid out. `db` lets a caller's transaction include it. */
  earn(userId: string, amount: number, reason: CreditReason, key: string, db: Db = this.db): Promise<boolean> {
    return db.transaction(async (tx) => {
      if (!(await this.entry(tx, userId, amount, reason, key))) return false;
      await tx.update(users).set({ credit: sql`${users.credit} + ${amount}` }).where(eq(users.id, userId));
      return true;
    });
  }

  /**
   * Takes from someone's credit, or refuses when they don't have enough: the one update that checks and takes, so two
   * payments at once can't overdraw. False: this key was already paid, so nothing was taken this time.
   */
  spend(userId: string, amount: number, reason: CreditReason, key: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (!(await this.entry(tx, userId, -amount, reason, key))) return false;
      const paid = await tx
        .update(users)
        .set({ credit: sql`${users.credit} - ${amount}` })
        .where(and(eq(users.id, userId), gte(users.credit, amount)))
        .returning({ id: users.id });
      if (!paid.length) {
        const [u] = await tx.select({ credit: users.credit }).from(users).where(eq(users.id, userId));
        throw noCredit(amount - (u?.credit ?? 0));
      }
      return true;
    });
  }

  /** Takes what's left at worst, never below zero, for something that already happened (a project just went online). */
  charge(userId: string, amount: number, reason: CreditReason, key: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (!(await this.entry(tx, userId, -amount, reason, key))) return false;
      await tx.update(users).set({ credit: sql`greatest(${users.credit} - ${amount}, 0)` }).where(eq(users.id, userId));
      return true;
    });
  }

  /** Undoes a payment whose purchase then failed. Its row goes too, so the key can pay again on the next try. */
  refund(userId: string, key: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [entry] = await tx.delete(creditEntries).where(and(eq(creditEntries.key, key), eq(creditEntries.userId, userId))).returning({ amount: creditEntries.amount });
      if (entry) await tx.update(users).set({ credit: sql`${users.credit} - ${entry.amount}` }).where(eq(users.id, userId));
    });
  }

  async balance(userId: string): Promise<number> {
    const [u] = await this.db.select({ credit: users.credit }).from(users).where(eq(users.id, userId));
    return u?.credit ?? 0;
  }

  async paid(key: string): Promise<boolean> {
    return (await this.db.select({ id: creditEntries.id }).from(creditEntries).where(eq(creditEntries.key, key))).length > 0;
  }

  /** The balance and the latest movements, newest first. */
  async view(userId: string, last = 5): Promise<CreditView> {
    const entries = await this.db
      .select({ amount: creditEntries.amount, reason: creditEntries.reason, at: creditEntries.at })
      .from(creditEntries)
      .where(eq(creditEntries.userId, userId))
      .orderBy(desc(creditEntries.at))
      .limit(last);
    return { credit: await this.balance(userId), entries: entries.map((e) => ({ ...e, at: e.at.toISOString() })) };
  }

  private async entry(tx: Db, userId: string, amount: number, reason: CreditReason, key: string): Promise<boolean> {
    const made = await tx.insert(creditEntries).values({ userId, amount, reason, key }).onConflictDoNothing().returning({ id: creditEntries.id });
    return made.length > 0;
  }
}
