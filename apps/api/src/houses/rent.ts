// Rent: each flatmate's line of the house's bill, taken from their credit by itself. Their share of the month goes the
// moment they move in, then again for every new month: the hourly settle in leases.service.ts (which also runs when
// the API starts) charges anyone with nothing paid for the current month yet. A charge is the same as paying from the
// bill tab (HousesService.markBillPaid): a "rent" credit entry keyed by house, month and person, and a bill_payments
// row, so one month is never taken twice, whoever asks and however often.
//
// Every charge is news under the bell (rent_paid). With too little credit nothing goes below zero: the month stays
// unpaid and a rent_due says so, once. The next run, or their next top-up, takes it then. An unpaid month changes
// nothing else (nothing reads bill_payments but the bill), and a month that's over is never charged afterwards.
//
// Never in the workshop (a newcomer's first room there is free) or an example house, and not in a house with no bill
// yet (its server isn't paid for): its flatmates pay from the moment it has one.
import { HttpException, Logger } from "@nestjs/common";
import { billPayments, type Db, houses, memberships, notifications } from "@coloc/db";
import { and, eq, gte, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { Subject } from "rxjs";
import { isCoreDown } from "../core/core";
import type { HousesService } from "./houses.service";
import { monthOf, WORKSHOP_ID } from "./money";

// paid: taken now. settled: this month was already paid. short: not enough credit. none: nothing to pay here.
export type RentOutcome = "paid" | "settled" | "short" | "none";

// The houses that charge rent: real ones with a bill (a server paid for), never the workshop or an example house.
const charging = and(eq(houses.demo, false), eq(houses.tutorial, false), ne(houses.id, WORKSHOP_ID), isNotNull(houses.monthlyCostFcfa));

export class RentCollector {
  // Someone just got rent news: the notifications pass it on to the live line, which rings their bell.
  readonly news = new Subject<string>();
  private readonly log = new Logger("rent");

  constructor(
    private readonly db: Db,
    private readonly houses: HousesService,
  ) {}

  /** Takes `userId`'s line of this month's bill in `houseId` from their credit, if it isn't paid yet. */
  async charge(houseId: string, userId: string, now = new Date()): Promise<RentOutcome> {
    const month = monthOf(now);
    const [row] = await this.db
      .select({ leavingMonth: memberships.leavingMonth })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .where(and(eq(memberships.houseId, houseId), eq(memberships.userId, userId), charging));
    // Not a flatmate of a house that charges, or one whose lease ran out with a month that's over (settleLeases
    // takes them off the house on its next run).
    if (!row || (row.leavingMonth !== null && row.leavingMonth < month)) return "none";
    const line = await this.houses.billLine(houseId, userId, now);
    if (!line) return "none";
    if (line.paid) return "settled";
    try {
      return (await this.pay(houseId, userId, now)).fresh ? "paid" : "settled";
    } catch (e) {
      if (!(e instanceof HttpException) || (e.getResponse() as { code?: string }).code !== "no_credit") throw e;
      await this.tellDue(userId, houseId, line.due, line.month);
      return "short";
    }
  }

  /**
   * Pays `userId`'s line of the month from their credit, with its news. Also the bill tab's button, which shows the
   * refusal when credit is short. Paying twice takes nothing the second time.
   */
  async pay(houseId: string, userId: string, now = new Date()): Promise<{ month: string; amount: number; fresh: boolean }> {
    const paid = await this.houses.markBillPaid(houseId, userId, true, now);
    // Reviews and prizes can bring a line to nothing: then it's paid, but nothing was taken, so there's no news.
    if (paid.fresh && paid.amount > 0) await this.tell(userId, "rent_paid", houseId, paid.amount, paid.month);
    return paid;
  }

  /** Someone just moved into `houseId`: their share of this month, now. Never fails the move itself. */
  async movedIn(houseId: string, userId: string, now = new Date()): Promise<void> {
    await this.charge(houseId, userId, now).catch((e) => this.warn(e));
  }

  /** Every flatmate of `houseId` (its server was just paid for: those who moved in before pay now). Never fails. */
  async chargeHouse(houseId: string, now = new Date()): Promise<void> {
    try {
      const flatmates = await this.db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.houseId, houseId));
      for (const f of flatmates) await this.charge(houseId, f.userId, now).catch((e) => this.warn(e));
    } catch (e) {
      this.warn(e);
    }
  }

  /** Every house `userId` lives in (they just topped up: what they owed goes now). Never fails. */
  async chargePerson(userId: string, now = new Date()): Promise<void> {
    try {
      const homes = await this.db.select({ houseId: memberships.houseId }).from(memberships).where(eq(memberships.userId, userId));
      for (const h of homes) await this.charge(h.houseId, userId, now).catch((e) => this.warn(e));
    } catch (e) {
      this.warn(e);
    }
  }

  /**
   * The month's run: everyone in a house that charges, with nothing paid for this month yet. Running it again does
   * nothing new: the paid have a row, and the short were told already. The database being down stops the run.
   */
  async chargeAll(now = new Date()): Promise<void> {
    const month = monthOf(now);
    const owing = await this.db
      .select({ houseId: memberships.houseId, userId: memberships.userId })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .leftJoin(billPayments, and(eq(billPayments.houseId, memberships.houseId), eq(billPayments.userId, memberships.userId), eq(billPayments.month, month)))
      .where(and(charging, isNull(billPayments.month), or(isNull(memberships.leavingMonth), gte(memberships.leavingMonth, month))));
    for (const o of owing) {
      await this.charge(o.houseId, o.userId, now).catch((e) => {
        if (isCoreDown(e)) throw e;
        this.warn(e);
      });
    }
  }

  private async tell(userId: string, kind: "rent_paid" | "rent_due", houseId: string, amount: number, month: string) {
    await this.db.insert(notifications).values({ userId, kind, houseId, payload: { amount, month } });
    this.news.next(userId);
  }

  // Once a month and house: the hourly run would otherwise say it again every hour until they top up.
  private async tellDue(userId: string, houseId: string, amount: number, month: string) {
    const [told] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, "rent_due"), eq(notifications.houseId, houseId), sql`${notifications.payload}->>'month' = ${month}`))
      .limit(1);
    if (!told) await this.tell(userId, "rent_due", houseId, amount, month);
  }

  private warn(e: unknown) {
    if (!isCoreDown(e)) this.log.warn(`couldn't charge rent: ${(e as Error).message}`);
  }
}
