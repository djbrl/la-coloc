import { describe, expect, it } from "vitest";
import { readable } from "./buildLog";

describe("a build's log, for reading", () => {
  it("drops Docker's bookkeeping and keeps the project's own lines", () => {
    const shown = readable(["Step 5/11 : RUN npm ci", " ---> Running in a97035643e0a", "---> Removed intermediate container a970", "added 684 packages", "npm notice New major version"]);
    expect(shown.map((l) => l.text)).toEqual(["Step 5/11 : RUN npm ci", "added 684 packages"]);
  });

  it("tells steps and errors from the rest", () => {
    const kinds = readable(["Step 1/2 : FROM node", "added 3 packages", "npm ERR! missing script", "The command '/bin/sh -c x' returned a non-zero code: 1"]).map((l) => l.kind);
    expect(kinds).toEqual(["step", "plain", "error", "error"]);
  });

  it("doesn't call a harmless word an error", () => {
    expect(readable(["ℹ .nuxt/dist/client/_nuxt/error-500.css 1.88 kB"])[0].kind).toBe("plain");
  });
});
