import "reflect-metadata";
import { type Db } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { BadRequestException, Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, NestFactory } from "@nestjs/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Core, CORE_DOWN_BODY, type CoreConnection } from "./core";
import { CoreDownFilter } from "./core-down.filter";
import { CoreGate } from "./core.guard";
import { HealthController } from "./health.controller";

const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });
// How Drizzle reports it when the database is off.
const drizzleDown = () => Object.assign(new Error("Failed query: select 1\nparams: "), { cause: pgError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5433") });

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

// The little database we ask in these tests. `broken` switches it off.
let broken = false;
const ask = async () => {
  if (broken) throw drizzleDown();
  await db.execute(sql`select 1`);
};

// A few routes that fail in different ways, to see what the filter makes of each.
@Controller()
class ProbeController {
  @Get("city")
  async city() {
    await ask();
    return { houses: 3 };
  }
  @Get("bad-request")
  badRequest() {
    throw new BadRequestException("Pick a name.");
  }
  @Get("bug")
  bug(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'id')");
  }
  @Get("down-from-a-service")
  downFromAService() {
    return ask().then(() => {
      throw drizzleDown();
    });
  }
}

let app: INestApplication | undefined;
let migrated = true;
const quiet = { log: () => undefined, warn: () => undefined, error: () => undefined };

// The real gate, filter and health route, on a real HTTP server, in front of a database that we can switch off.
async function start({ ready = true } = {}) {
  const conn: CoreConnection = {
    migrate: async () => {
      if (!migrated) throw drizzleDown();
    },
    ping: ask,
    onTrouble: () => undefined,
  };
  migrated = ready;
  const core = new Core(conn);
  core.out = quiet;
  @Module({
    controllers: [HealthController, ProbeController],
    providers: [{ provide: Core, useValue: core }, { provide: APP_GUARD, useClass: CoreGate }, { provide: APP_FILTER, useClass: CoreDownFilter }],
  })
  class TestApp {}
  app = await NestFactory.create(TestApp, { logger: false });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: "http://localhost:5175" });
  await app.listen(0, "127.0.0.1");
  core.start();
  await new Promise((r) => setTimeout(r, 20));
  const address = app.getHttpServer().address() as { port: number };
  const get = async (path: string, headers: Record<string, string> = {}) => {
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  return { core, get };
}

afterEach(async () => {
  broken = false;
  await app?.close();
  app = undefined;
});

describe("GET /api/health", () => {
  it("says ok when the database answers", async () => {
    const { get } = await start();
    expect(await get("/api/health")).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("says 503 core_down when the database doesn't answer, and ok again when it does, without a restart", async () => {
    const { get } = await start();
    broken = true;
    const down = await get("/api/health");
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ ok: false, code: "core_down", message: "The city's database isn't answering. It usually comes back on its own." });
    broken = false;
    expect(await get("/api/health")).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("answers 503 (not an error, not a hang) while the API is still waiting to migrate", async () => {
    const { get, core } = await start({ ready: false });
    expect(core.ready).toBe(false);
    const res = await get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual(CORE_DOWN_BODY);
  });
});

describe("every other route", () => {
  it("answers 503 core_down while the API hasn't migrated yet, without running the route", async () => {
    const { get } = await start({ ready: false });
    for (const path of ["/api/city", "/api/bug", "/api/bad-request"]) {
      const res = await get(path);
      expect(res.status, path).toBe(503);
      expect(res.body).toEqual(CORE_DOWN_BODY);
    }
  });

  it("serves normally once the database is ready", async () => {
    const { get } = await start();
    expect(await get("/api/city")).toMatchObject({ status: 200, body: { houses: 3 } });
  });

  it("turns 'the database is unreachable' into 503 core_down, JSON, with a retry hint", async () => {
    const { get, core } = await start();
    broken = true;
    const res = await get("/api/city");
    expect(res.status).toBe(503);
    expect(res.body).toEqual(CORE_DOWN_BODY);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("content-type")).toMatch(/json/);
    // Normal CORS headers are still there, so the website can read the answer.
    const withOrigin = await get("/api/city", { Origin: "http://localhost:5175" });
    expect(withOrigin.headers.get("access-control-allow-origin")).toBe("http://localhost:5175");
    expect(core.ready).toBe(true);
  });

  it("recovers by itself when the database comes back", async () => {
    const { get } = await start();
    broken = true;
    expect((await get("/api/city")).status).toBe(503);
    broken = false;
    expect(await get("/api/city")).toMatchObject({ status: 200, body: { houses: 3 } });
  });

  it("keeps real errors as they were: validation stays 400, a bug stays 500, an unknown route stays 404", async () => {
    const { get } = await start();
    expect(await get("/api/bad-request")).toMatchObject({ status: 400, body: { message: "Pick a name." } });
    const bug = await get("/api/bug");
    expect(bug.status).toBe(500);
    expect(bug.body.code).toBeUndefined();
    expect((await get("/api/nope")).status).toBe(404);
  });

  it("catches the error however deep in a promise chain it is thrown", async () => {
    const { get } = await start();
    expect((await get("/api/down-from-a-service")).status).toBe(503);
  });
});

describe("the SSE streams", () => {
  it("skip an update instead of ending, while the database is down", async () => {
    const { skipWhileCoreDown } = await import("./streams");
    const { from, lastValueFrom, of, concatMap, toArray, throwError } = await import("rxjs");
    const updates = of(1, 2, 3).pipe(concatMap((n) => from(n === 2 ? Promise.reject(drizzleDown()) : Promise.resolve(n)).pipe(skipWhileCoreDown())));
    expect(await lastValueFrom(updates.pipe(toArray()))).toEqual([1, 3]);
    // A real bug still ends the stream.
    await expect(lastValueFrom(throwError(() => new TypeError("bug")).pipe(skipWhileCoreDown()))).rejects.toThrow("bug");
  });
});

describe("the last safety net", () => {
  it("swallows a rejection that only means 'database unreachable', and lets anything else crash as usual", async () => {
    const { protectFromDatabaseOutages } = await import("./process-guard");
    let handler: (reason: unknown) => void = () => undefined;
    const down = vi.fn();
    const core = { reportDown: down } as unknown as Core;
    protectFromDatabaseOutages(core, { on: ((_: string, h: (r: unknown) => void) => (handler = h)) as never });
    handler(drizzleDown());
    expect(down).toHaveBeenCalledOnce();
    expect(() => handler(new TypeError("real bug"))).toThrow("real bug");
  });
});
