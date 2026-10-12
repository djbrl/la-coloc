import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Core, CoreDownError, type CoreConnection, isCoreDown } from "./core";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const refused = () => Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), { code: "ECONNREFUSED" });
const wrapped = (cause: unknown) => Object.assign(new Error("Failed query: select 1\nparams: "), { cause });

// A database we can switch off and on, and a log we can read.
function fixture() {
  const state = { up: false, migrations: 0, pings: 0, trouble: (() => undefined) as (e: Error) => void };
  const conn: CoreConnection = {
    migrate: async () => {
      state.migrations += 1;
      if (!state.up) throw wrapped(refused());
    },
    ping: async () => {
      state.pings += 1;
      if (!state.up) throw wrapped(refused());
    },
    onTrouble: (l) => (state.trouble = l),
  };
  const lines: string[] = [];
  const core = new Core(conn);
  core.out = { log: (m) => lines.push(`log: ${m}`), warn: (m) => lines.push(`warn: ${m}`), error: (m) => lines.push(`error: ${m}`) };
  return { core, state, lines };
}

describe("starting without a database", () => {
  it("returns at once, isn't ready, and logs one line however long the outage lasts", async () => {
    const { core, lines } = fixture();
    core.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(core.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(core.ready).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warn: the database isn't answering \(connect ECONNREFUSED 127\.0\.0\.1:5433\)/);
    expect(lines[0]).toMatch(/trying again/);
  });

  it("becomes ready, without a restart, once the database answers and the migrations ran", async () => {
    const { core, state, lines } = fixture();
    core.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(core.ready).toBe(false);
    state.up = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(core.ready).toBe(true);
    expect(lines.at(-1)).toMatch(/^log: the database answered after \d+ s: connected, schema up to date/);
    // Migrated once it worked, and never again.
    const migrations = state.migrations;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(state.migrations).toBe(migrations);
  });

  it("says a failing migration is a different thing from an unreachable database", async () => {
    const { core, lines } = fixture();
    (core as unknown as { conn: CoreConnection }).conn.migrate = async () => {
      throw new Error("syntax error at or near FROM");
    };
    core.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^error: bringing the database up to date failed \(syntax error/);
    expect(core.ready).toBe(false);
  });

  it("is happy when the database is there from the start", async () => {
    const { core, state, lines } = fixture();
    state.up = true;
    core.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(core.ready).toBe(true);
    expect(lines).toEqual(["log: connected, schema up to date"]);
  });
});

describe("the database goes away after the API is running", () => {
  async function running() {
    const f = fixture();
    f.state.up = true;
    f.core.start();
    await vi.advanceTimersByTimeAsync(0);
    f.lines.length = 0;
    return f;
  }

  it("stays ready, notes the outage once however many requests fail, and notes the recovery once", async () => {
    const { core, state, lines } = await running();
    state.up = false;
    for (let i = 0; i < 50; i++) core.reportDown(wrapped(refused()));
    expect(core.ready).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warn: the database stopped answering/);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(lines).toHaveLength(1);

    state.up = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^log: the database is back after \d+ s\. Serving normally again/);

    // Quiet again, and a second outage is noted again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lines).toHaveLength(2);
    state.up = false;
    core.reportDown(refused());
    expect(lines).toHaveLength(3);
  });

  it("checks for recovery with ever longer waits, never more than 15 s", async () => {
    const { core, state } = await running();
    state.up = false;
    core.reportDown(refused());
    await vi.advanceTimersByTimeAsync(0);
    const first = state.pings;
    await vi.advanceTimersByTimeAsync(60_000);
    // 1+2+4+8 s, then every 15 s: a bit more than 4 tries a minute, far fewer than one per second.
    expect(state.pings - first).toBeLessThan(10);
    expect(state.pings - first).toBeGreaterThan(3);
  });

  it("answers the health question: yes when the database answers, no when it doesn't, and says so when it's back", async () => {
    const { core, state, lines } = await running();
    expect(await core.check()).toBe(true);
    state.up = false;
    expect(await core.check()).toBe(false);
    expect(await core.check()).toBe(false);
    expect(lines).toHaveLength(1);
    state.up = true;
    expect(await core.check()).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/back/);
  });

  it("gives up waiting for a database that doesn't answer within 1.5 s", async () => {
    const { core, state } = await running();
    (core as unknown as { conn: CoreConnection }).conn.ping = () => new Promise(() => undefined);
    const answer = core.check();
    await vi.advanceTimersByTimeAsync(1499);
    let settled = false;
    void answer.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toBe(false);
    expect(state.up).toBe(true);
  });

  it("checks for itself when a connection dies by itself, and says nothing if the database is fine", async () => {
    const { core, state, lines } = await running();
    state.trouble(new Error("Connection terminated unexpectedly"));
    await vi.advanceTimersByTimeAsync(0);
    expect(lines).toEqual([]);
    state.up = false;
    state.trouble(new Error("Connection terminated unexpectedly"));
    await vi.advanceTimersByTimeAsync(0);
    expect(lines).toHaveLength(1);
    expect(core.ready).toBe(true);
  });

  it("says no to health while it isn't ready, without asking the database", async () => {
    const { core, state } = fixture();
    expect(await core.check()).toBe(false);
    expect(state.pings).toBe(0);
  });
});

describe("which errors count as 'the core is down'", () => {
  it("counts its own error, and connection errors under Drizzle's wrapper", () => {
    expect(isCoreDown(new CoreDownError())).toBe(true);
    expect(isCoreDown(wrapped(refused()))).toBe(true);
  });
  it("doesn't count bugs", () => {
    expect(isCoreDown(new TypeError("x is undefined"))).toBe(false);
  });
});
