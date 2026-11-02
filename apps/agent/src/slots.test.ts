import { describe, expect, it } from "vitest";
import { Slots } from "./slots";

describe("build slots", () => {
  it("never runs more builds at once than it has slots, and runs them in order", async () => {
    const slots = new Slots(1);
    let running = 0;
    let most = 0;
    const order: number[] = [];
    const job = (i: number) => async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      order.push(i);
      running--;
    };
    await Promise.all([1, 2, 3, 4].map((i) => slots.run(job(i))));
    expect(most).toBe(1);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("lets a cancelled build leave the line without taking a slot", async () => {
    const slots = new Slots(1);
    let finish = () => {};
    const first = slots.run(() => new Promise<void>((r) => (finish = r)));
    const stop = new AbortController();
    let ran = false;
    const second = slots.run(async () => void (ran = true), stop.signal);
    expect(slots.queued).toBe(1);
    stop.abort();
    await expect(second).rejects.toBeDefined();
    expect(slots.queued).toBe(0);
    finish();
    await first;
    expect(ran).toBe(false);
    await expect(slots.run(async () => "next")).resolves.toBe("next");
  });

  it("frees the slot when a build fails", async () => {
    const slots = new Slots(1);
    await expect(slots.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(slots.run(async () => "next")).resolves.toBe("next");
  });
});
