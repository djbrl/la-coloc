import { describe, expect, it } from "vitest";
import { explain } from "../lobby/panel/words";
import {
  buildFailed,
  buildTrouble,
  canChangeCode,
  canRestart,
  codeBody,
  codeRows,
  deploymentStep,
  deploymentTitle,
  draftRows,
  firstLine,
  imageNameOk,
  imageRef,
  liveVersion,
  logTail,
  memoryUse,
  neverOnline,
  parsePort,
  projectTitle,
  readTrouble,
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
    expect(roomSentence({ status: "live", limits, usage }, builds, now)).toBe("Online for 3 days: 9 of 256 MB, almost no CPU.");
    expect(roomSentence({ status: "live", limits, usage: { ...usage, cpuPercent: 12.4 } }, [], now)).toBe("Online: 9 of 256 MB, 12% of a CPU.");
    expect(roomSentence({ status: "empty", limits, usage: null }, [], now)).toBe("Never built yet. 256 MB of memory, half a CPU.");
    expect(roomSentence({ status: "failed", limits: { memoryMb: 512, cpus: 1 }, usage: null }, builds, now)).toBe(
      "Its last build failed 2 hours ago. 512 MB of memory, 1 CPU.",
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

describe("uploading a project", () => {
  const form = { project: "x", projectDescription: "y", source: " https://github.com/a/b ", branch: "", buildPath: "", port: "" };

  it("saves where the code comes from and leaves the project's name alone", () => {
    expect(codeBody(form, false, 8080)).toEqual({ source: "https://github.com/a/b", branch: null, buildPath: ".", port: 8080 });
    expect(codeBody(form, true, null).source).toBeUndefined();
    expect(codeBody({ ...form, source: "file://" }, false, null).source).toBeUndefined();
  });

  it("says why a project couldn't be read, in plain words", () => {
    expect(readTrouble("git clone failed: fatal: Remote branch dev not found in upstream origin")).toBe("branch");
    expect(readTrouble("git clone failed: remote: Repository not found.")).toBe("repo");
    expect(readTrouble("git clone failed: fatal: could not read Username for 'https://github.com'")).toBe("repo");
    expect(readTrouble("The house's server didn't answer in time.")).toBe("slow");
    expect(readTrouble("repo must be an https:// URL")).toBeNull();
  });

  it("takes an image's name the way the API does", () => {
    expect(imageNameOk("nginx:alpine")).toBe(true);
    expect(imageNameOk("ghcr.io/you/app:1.0")).toBe(true);
    expect(imageNameOk("Bad Name; rm")).toBe(false);
    expect(imageNameOk("https://hub.docker.com/r/you/app")).toBe(false);
  });

  it("turns what people paste for an image into its name", () => {
    expect(imageRef("https://hub.docker.com/r/42dsy/bount-dev")).toBe("42dsy/bount-dev");
    expect(imageRef("hub.docker.com/r/42dsy/bount-dev/tags?name=x")).toBe("42dsy/bount-dev");
    expect(imageRef("https://hub.docker.com/_/nginx")).toBe("nginx");
    expect(imageRef("https://hub.docker.com/repository/docker/you/app/general")).toBe("you/app");
    expect(imageRef("https://hub.docker.com/layers/you/app/1.0/images/sha256-abc")).toBe("you/app:1.0");
    expect(imageRef("docker pull you/app:1.0")).toBe("you/app:1.0");
    expect(imageRef(" docker://ghcr.io/you/app:1 ")).toBe("ghcr.io/you/app:1");
    expect(imageRef("https://ghcr.io/you/app")).toBe("ghcr.io/you/app");
    expect(imageRef("nginx:alpine")).toBe("nginx:alpine");
  });

  it("says what's wrong with an image that wouldn't pull", () => {
    expect(buildTrouble("no matching manifest for linux/amd64 in the manifest list entries")).toBe("imagePlatform");
    expect(buildTrouble("pull access denied for you/app, repository does not exist")).toBe("imageMissing");
    expect(buildTrouble("(HTTP code 400) unexpected - invalid reference format")).toBe("imageMissing");
    expect(buildTrouble("(HTTP code 404) no such image - No such image: you/app:latest")).toBe("imageMissing");
  });

  it("lets a chef choose the code only for a room nobody lives in", () => {
    const person = { id: "1" } as never;
    expect(canChangeCode({ as: "flatmate", room: { occupant: person } })).toBe(true);
    expect(canChangeCode({ as: "teammate", room: { occupant: person } })).toBe(true);
    expect(canChangeCode({ as: "chef", room: { occupant: person } })).toBe(false);
    expect(canChangeCode({ as: "chef", room: { occupant: null } })).toBe(true);
  });
});

describe("a cancelled build", () => {
  it("isn't a failure anywhere it's shown", () => {
    expect(buildTrouble("Build cancelled.")).toBe("cancelled");
    expect(buildFailed({ status: "failed", detail: "Build cancelled." })).toBe(false);
    expect(buildFailed({ status: "failed", detail: "build failed: npm" })).toBe(true);
    expect(buildFailed({ status: "live", detail: null })).toBe(false);
    expect(buildFailed(undefined)).toBe(false);
    expect(deploymentStep("failed", "Build cancelled.")).toMatchObject({ word: "Cancelled", tone: "warn" });
    expect(deploymentStep("failed", "git clone failed")).toMatchObject({ word: "Failed", tone: "danger" });
  });
});

describe("the room's tiles", () => {
  it("shows the last lines of a log, not the blank ones", () => {
    expect(logTail("one\ntwo  \n\nthree\nfour\n")).toEqual(["two", "three", "four"]);
    expect(logTail("")).toEqual([]);
  });

  it("says what's online, ignoring previews and builds that didn't make it", () => {
    const now = new Date("2026-11-03T12:00:00Z").getTime();
    const deployments = [
      { kind: "preview" as const, status: "live", ref: "fix", updatedAt: "2026-11-03T11:59:00Z" },
      { kind: "prod" as const, status: "failed", ref: "main", updatedAt: "2026-11-03T11:30:00Z" },
      { kind: "prod" as const, status: "live", ref: "main", updatedAt: "2026-11-03T09:00:00Z" },
    ];
    const live = liveVersion(deployments, now);
    expect(live?.branch).toBe("main");
    expect(live?.ago).toContain("3");
    expect(liveVersion(deployments.slice(0, 2), now)).toBeNull();
  });
});
