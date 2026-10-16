import { describe, expect, it } from "vitest";
import { allPassersBy, isGithubHandle, MOST, passerbyCount, passersBy } from "./passersby";

describe("passers-by", () => {
  it("carry handles GitHub would take: lowercase, digits, single hyphens, no dots", () => {
    expect(isGithubHandle("awa-ndiaye")).toBe(true);
    expect(isGithubHandle("mdiop221")).toBe(true);
    expect(isGithubHandle("moussa.dev")).toBe(false);
    expect(isGithubHandle("-awa")).toBe(false);
    expect(isGithubHandle("awa--n")).toBe(false);
    expect(isGithubHandle("Awa")).toBe(false);
    for (const p of allPassersBy()) expect(isGithubHandle(p.login), p.login).toBe(true);
  });

  it("never share a handle, and have a full name", () => {
    const all = allPassersBy();
    expect(new Set(all.map((p) => p.login)).size).toBe(all.length);
    for (const p of all) expect(p.name.split(" ").length, p.name).toBeGreaterThan(1);
  });

  it("are the same people, in the same order, every time a city is built", () => {
    expect(passersBy("Dakar", 5)).toEqual(passersBy("Dakar", 5));
    expect(passersBy("Dakar", 5)).not.toEqual(passersBy("Tunis", 5));
    expect(passersBy("Lomé", 99)).toHaveLength(MOST);
    // A city without its own list still gets people.
    expect(passersBy("Accra", 3)).toHaveLength(3);
  });

  it("are fewer on low quality and on a small screen", () => {
    expect(passerbyCount("low", true)).toBeLessThan(passerbyCount("low", false));
    expect(passerbyCount("low", false)).toBeLessThan(passerbyCount("high", true));
    expect(passerbyCount("high", true)).toBeLessThanOrEqual(passerbyCount("high", false));
  });
});
