import { describe, expect, it } from "vitest";
import { assertSafeRef, assertSafeRepo, resolveInside, run } from "./git";

describe("checkout safety", () => {
  it("only clones https URLs, and local file:// repos only in development", () => {
    expect(() => assertSafeRepo("https://github.com/a/b.git")).not.toThrow();
    expect(() => assertSafeRepo("file:///etc")).toThrow();
    expect(() => assertSafeRepo("file:///Users/me/app", true)).not.toThrow();
    expect(() => assertSafeRepo("--upload-pack=touch /tmp/pwned")).toThrow();
    expect(() => assertSafeRepo("ssh://evil/repo")).toThrow();
  });

  it("with a list, lets in only the local repos it names", () => {
    const only = ["file:///Users/me/la-coloc"];
    expect(() => assertSafeRepo("file:///Users/me/la-coloc", only)).not.toThrow();
    expect(() => assertSafeRepo("file:///Users/me/la-coloc/", only)).not.toThrow();
    expect(() => assertSafeRepo("file:///Users/me/secret-project", only)).toThrow();
    expect(() => assertSafeRepo("file:///Users/me/la-coloc/../secret", only)).toThrow();
    expect(() => assertSafeRepo("file:///Users/me", [])).toThrow();
  });

  it("refuses refs that look like git options", () => {
    expect(() => assertSafeRef("main")).not.toThrow();
    expect(() => assertSafeRef("feature/login")).not.toThrow();
    expect(() => assertSafeRef("--exec=sh")).toThrow();
    expect(() => assertSafeRef("a..b")).toThrow();
  });

  it("keeps sub-folders inside the checkout", () => {
    expect(resolveInside("/tmp/c", "apps/web")).toBe("/tmp/c/apps/web");
    expect(resolveInside("/tmp/c", ".")).toBe("/tmp/c");
    expect(() => resolveInside("/tmp/c", "../../etc")).toThrow();
  });

  it("kills the child when its signal aborts", async () => {
    const stop = new AbortController();
    const started = Date.now();
    const running = run("sleep", ["30"], undefined, stop.signal);
    stop.abort();
    await expect(running).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
