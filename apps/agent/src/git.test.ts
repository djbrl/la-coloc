import { describe, expect, it } from "vitest";
import { assertSafeRef, assertSafeRepo, resolveInside } from "./git";

describe("checkout safety", () => {
  it("only clones https URLs, and local file:// repos only in development", () => {
    expect(() => assertSafeRepo("https://github.com/a/b.git")).not.toThrow();
    expect(() => assertSafeRepo("file:///etc")).toThrow();
    expect(() => assertSafeRepo("file:///Users/me/app", true)).not.toThrow();
    expect(() => assertSafeRepo("--upload-pack=touch /tmp/pwned")).toThrow();
    expect(() => assertSafeRepo("ssh://evil/repo")).toThrow();
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
});
