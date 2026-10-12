import { describe, expect, it } from "vitest";
import { openPool } from "./index";

// Port 1 never has a database on it: nothing listens there, so connecting is refused straight away.
const NOWHERE = "postgres://coloc:x@127.0.0.1:1/coloc";

describe("opening a connection with no database behind it", () => {
  it("doesn't fail or wait: the pool only connects when asked", () => {
    const conn = openPool(NOWHERE);
    expect(conn.db).toBeDefined();
    return conn.close();
  });

  it("says the database isn't there when asked, without crashing", async () => {
    const conn = openPool(NOWHERE);
    await expect(conn.ping()).rejects.toThrow();
    await expect(conn.migrate()).rejects.toThrow();
    await conn.close();
  });
});
