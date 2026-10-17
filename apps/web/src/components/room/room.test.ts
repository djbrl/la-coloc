import { describe, expect, it } from "vitest";
import { explain } from "../lobby/panel/words";
import {
  canRestart,
  codeRows,
  deploymentStep,
  deploymentTitle,
  draftRows,
  firstLine,
  memoryUse,
  neverOnline,
  parsePort,
  projectTitle,
  secretName,
  secretNameOk,
  settingsBody,
  roomSentence,
  span,
  updateTile,
} from "./room";

const build = (kind: "prod" | "preview", status: string, updatedAt = "2026-10-10T10:00:00Z") => ({
  id: `${kind}-${status}-${updatedAt}`,
  kind,
  ref: "main",
  status,
  detail: null,
  prNumber: null,
  createdAt: updatedAt,
  updatedAt,
});

describe("the update tile", () => {
  it("says Put online until the room has been online once", () => {
    expect(updateTile("empty", [])).toEqual({ verb: "Put online", hint: explain.firstOnline, icon: "rocket" });
    // Every build so far failed: it still has never been online.
    expect(updateTile("failed", [build("prod", "failed")]).verb).toBe("Put online");
    // A preview going live doesn't put the room itself online.
    expect(updateTile("deploying", [build("preview", "live")]).verb).toBe("Put online");
  });

  it("says Update once it has been", () => {
    expect(updateTile("live", [])).toEqual({ verb: "Update", hint: explain.update, icon: "spin" });
    expect(updateTile("down", []).verb).toBe("Update");
    expect(updateTile("failed", [build("prod", "failed"), build("prod", "live")]).verb).toBe("Update");
  });

  it("only offers a restart when something has run", () => {
    expect(canRestart("empty", [])).toBe(false);
    expect(canRestart("failed", [build("prod", "failed")])).toBe(false);
    expect(canRestart("live", [])).toBe(true);
    expect(canRestart("down", [])).toBe(true);
    expect(canRestart("failed", [build("prod", "live")])).toBe(true);
    expect(neverOnline("deploying", [build("prod", "live")])).toBe(false);
  });
});

describe("how the room is doing", () => {
  it("names the project, or says what it is, or Hello in the workshop", () => {
    expect(projectTitle({ project: "Ndaje", projectDescription: "A shop." })).toBe("Ndaje");
    expect(projectTitle({ project: null, projectDescription: "A shop." })).toBe("A shop.");
    expect(projectTitle({ project: null, projectDescription: null }, true)).toBe("Hello");
    expect(projectTitle({ project: "", projectDescription: null })).toBe("Untitled project");
  });

  it("reads memory against the limit", () => {
    expect(memoryUse(null)).toBeNull();
    expect(memoryUse({ cpuPercent: 0, memoryBytes: 0, memoryLimitBytes: 0, at: "" })).toBeNull();
    expect(memoryUse({ cpuPercent: 1, memoryBytes: 64 * 1048576, memoryLimitBytes: 256 * 1048576, at: "" })).toEqual({ mb: 64, pct: 25 });
    expect(memoryUse({ cpuPercent: 1, memoryBytes: 300 * 1048576, memoryLimitBytes: 256 * 1048576, at: "" })?.pct).toBe(100);
  });

  it("says how the room is doing in one sentence", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const limits = { memoryMb: 256, cpus: 0.5 };
    const usage = { cpuPercent: 0.2, memoryBytes: 9 * 1048576, memoryLimitBytes: 256 * 1048576, at: "" };
    const builds = [build("prod", "failed", "2026-10-10T10:00:00Z"), build("prod", "live", "2026-10-07T12:00:00Z")];
    expect(roomSentence({ status: "live", limits, usage }, builds, now)).toBe("Online for 3 days, using 9 of its 256 MB and almost no CPU.");
    expect(roomSentence({ status: "live", limits, usage: { ...usage, cpuPercent: 12.4 } }, [], now)).toBe("Online, using 9 of its 256 MB and 12% of a CPU.");
    expect(roomSentence({ status: "empty", limits, usage: null }, [], now)).toBe("Never built yet. It has 256 MB of memory and half a CPU of its own.");
    expect(roomSentence({ status: "failed", limits: { memoryMb: 512, cpus: 1 }, usage: null }, builds, now)).toBe(
      "Its last build failed 2 hours ago. It has 512 MB of memory and 1 CPU of its own.",
    );
    expect(span(3 * 60_000)).toBe("a few minutes");
    expect(span(25 * 60_000)).toBe("25 minutes");
    expect(span(3600_000)).toBe("1 hour");
  });
});

describe("the Code tab", () => {
  const settings = { source: null, branch: null, buildPath: ".", port: null };

  it("says what happens when nothing is set", () => {
    expect(codeRows(settings, null)).toEqual([
      { term: "Repo", value: "Not set yet", unset: true },
      { term: "Branch", value: "main", unset: true },
      { term: "Folder", value: "The repo's root", unset: true },
      { term: "Port", value: "Default (3000)", unset: true },
    ]);
  });

  it("shows a repo link as people read it, and GitHub when it's linked", () => {
    const rows = codeRows({ source: "https://github.com/jib/site.git", branch: "dev", buildPath: "web", port: 8080 }, null);
    expect(rows.map((r) => r.value)).toEqual(["github.com/jib/site", "dev", "web", "8080"]);
    expect(rows[0].href).toBe("https://github.com/jib/site.git");
    const linked = codeRows(settings, { fullName: "jib/site", url: "https://github.com/jib/site" });
    expect(linked[0]).toEqual({ term: "GitHub", value: "jib/site", href: "https://github.com/jib/site" });
    expect(linked[1].value).toBe("The default branch");
  });

  it("calls the tutorial's local starter the starter page, never a path on the laptop", () => {
    const rows = codeRows({ ...settings, source: "file:///Users/dsy/la-coloc" }, null);
    expect(rows[0]).toEqual({ term: "Repo", value: "Starter page" });
  });

  it("previews a draft before it's saved", () => {
    const form = { project: "", projectDescription: "", source: " https://x.dev/a.git ", branch: "", buildPath: "", port: "3000" };
    expect(draftRows(form, null).map((r) => r.value)).toEqual(["x.dev/a", "main", "The repo's root", "3000"]);
  });

  it("takes ports from 1 to 65535, or none", () => {
    expect(parsePort("")).toEqual({ ok: true, port: null });
    expect(parsePort("  ")).toEqual({ ok: true, port: null });
    expect(parsePort("3000")).toEqual({ ok: true, port: 3000 });
    expect(parsePort("0").ok).toBe(false);
    expect(parsePort("65536").ok).toBe(false);
    expect(parsePort("80.5").ok).toBe(false);
    expect(parsePort("web").ok).toBe(false);
  });

  it("sends the settings in the shape the API reads, without source when GitHub is linked", () => {
    const form = { project: "Site", projectDescription: "A site.", source: " https://x.dev/a.git ", branch: " ", buildPath: " ", port: "3000" };
    expect(settingsBody(form, false, 3000)).toEqual({
      project: "Site",
      projectDescription: "A site.",
      source: "https://x.dev/a.git",
      branch: null,
      buildPath: ".",
      port: 3000,
    });
    expect(settingsBody(form, true, null).source).toBeUndefined();
    expect(settingsBody({ ...form, source: "" }, false, null).source).toBeNull();
  });
});

describe("secrets and history", () => {
  it("names secrets in capitals", () => {
    expect(secretName("  stripe_key ")).toBe("STRIPE_KEY");
    expect(secretNameOk("STRIPE_KEY")).toBe(true);
    expect(secretNameOk("_X1")).toBe(true);
    expect(secretNameOk("1X")).toBe(false);
    expect(secretNameOk("MY-KEY")).toBe(false);
    expect(secretNameOk("A".repeat(65))).toBe(false);
  });

  it("reads builds plainly", () => {
    expect(deploymentTitle({ kind: "prod", ref: "main" })).toBe("Update of main");
    expect(deploymentTitle({ kind: "preview", ref: "fix" })).toBe("Preview of fix");
    expect(deploymentStep("live")).toMatchObject({ word: "Went online", tone: "live" });
    expect(deploymentStep("failed")).toMatchObject({ word: "Failed", tone: "danger" });
    expect(deploymentStep("pushing").tone).toBe("warn");
    expect(firstLine("\n  npm ERR! missing script\nmore")).toBe("npm ERR! missing script");
    expect(firstLine(null)).toBe("");
  });
});
