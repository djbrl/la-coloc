import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imageOf } from "./deploy";
import { envNames, findPort, inspectProject, read } from "./inspect";

const pkg = (o: object) => JSON.stringify(o);

describe("reading a project", () => {
  it("lists what an env example asks for, without PORT or comments", () => {
    expect(envNames("# a note\nPORT=3000\nexport api_key=\nDATABASE_URL=postgres://x\nDATABASE_URL=again\nnot a line")).toEqual(["API_KEY", "DATABASE_URL"]);
  });

  it("finds the port, surest source first", () => {
    expect(findPort({ names: [], dockerfile: "FROM x\nEXPOSE 8080\n", envExample: "PORT=1234" })).toEqual({ port: 8080, from: "dockerfile" });
    expect(findPort({ names: [], envExample: "PORT=1234", readme: "http://localhost:5000" })).toEqual({ port: 1234, from: "env" });
    expect(findPort({ names: [], packageJson: pkg({ scripts: { start: "serve --port 4000" } }) })).toEqual({ port: 4000, from: "package" });
    expect(findPort({ names: [], compose: 'ports:\n  - "80:8000"\n' })).toEqual({ port: 8000, from: "compose" });
    expect(findPort({ names: [], readme: "Open http://localhost:5000" })).toEqual({ port: 5000, from: "readme" });
    expect(findPort({ names: [], readme: "no port here" })).toBeNull();
  });

  it("asks no port of plain pages", () => {
    const f = read({ names: ["index.html"], readme: "http://localhost:5173" });
    expect(f.stack).toBe("static");
    expect(f.port).toBeNull();
  });

  it("flags what a sealed room can't give", () => {
    const f = read({ names: ["package.json"], packageJson: pkg({ scripts: { start: "x" }, dependencies: { pg: "8" } }), envExample: "OPENAI_API_KEY=\n" });
    expect(f.flags).toEqual(["wantsDatabase", "wantsInternet"]);
  });

  it("flags a project it can't run", () => {
    expect(read({ names: ["README.md"] })).toMatchObject({ stack: null, flags: ["noRunner"] });
  });

  it("says a Nuxt project built for a cloud goes online as plain pages", () => {
    const f = read({ names: ["package.json"], packageJson: pkg({ scripts: { build: "nuxt build" }, dependencies: { nuxt: "3" } }), nuxtConfig: "preset: 'cloudflare-pages'" });
    expect(f).toMatchObject({ stack: "static", flags: ["forCloud"] });
  });
});

describe("a room's own image", () => {
  it("is told from a repo, and a strange name is refused", () => {
    expect(imageOf("https://github.com/a/b.git")).toBeNull();
    expect(imageOf("docker://ghcr.io/you/app:1.2")).toBe("ghcr.io/you/app:1.2");
    expect(() => imageOf("docker://Bad Name; rm -rf")).toThrow(/not an image/);
  });
});

describe("inspecting a checkout", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "inspect-"));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("points to where the project is in a monorepo", async () => {
    await mkdir(path.join(root, "apps/web"), { recursive: true });
    await mkdir(path.join(root, "node_modules/x"), { recursive: true });
    await writeFile(path.join(root, "apps/web/index.html"), "<p>hi</p>");
    await writeFile(path.join(root, "node_modules/x/index.html"), "<p>no</p>");
    const f = await inspectProject(root, root);
    expect(f.flags).toEqual(["noRunner"]);
    expect(f.folders).toEqual(["apps/web"]);
  });

  it("says when the folder isn't there", async () => {
    expect((await inspectProject(root, path.join(root, "nope"))).flags).toEqual(["noFolder"]);
  });

  it("never follows a link out of the repo", async () => {
    const outside = path.join(root, "outside.env");
    const repo = path.join(root, "repo");
    await mkdir(repo);
    await writeFile(outside, "COLOC_SECRET=1\n");
    await symlink(outside, path.join(repo, ".env.example"));
    await writeFile(path.join(repo, "index.html"), "<p>hi</p>");
    expect((await inspectProject(repo, repo)).env).toEqual([]);
  });
});
