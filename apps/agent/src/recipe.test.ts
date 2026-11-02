import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDockerfile, NO_RECIPE, onePlatform, recipeFor } from "./recipe";

const pkg = (o: object) => JSON.stringify(o);

describe("recipeFor", () => {
  it("runs a Node project's start script, after its build", () => {
    const r = recipeFor({ names: ["package.json", "package-lock.json"], packageJson: pkg({ scripts: { build: "tsc", start: "node dist/index.js" } }) });
    expect(r?.stack).toBe("node");
    expect(r?.dockerfile).toContain("RUN npm ci");
    expect(r?.dockerfile).toContain("RUN npm run build");
    expect(r?.dockerfile).toContain("CMD exec npm start");
  });

  it("uses the project's own package manager", () => {
    const r = recipeFor({ names: ["package.json", "pnpm-lock.yaml"], packageJson: pkg({ scripts: { build: "x", start: "y" } }) });
    expect(r?.dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(r?.dockerfile).toContain("RUN pnpm run build");
  });

  it("falls back on a Node project's main file", () => {
    const r = recipeFor({ names: ["package.json", "server.js"], packageJson: pkg({}) });
    expect(r?.dockerfile).toContain("CMD exec node server.js");
  });

  it("serves a site that only builds as files", () => {
    const r = recipeFor({ names: ["package.json"], packageJson: pkg({ scripts: { build: "vite build" } }) });
    expect(r?.stack).toBe("static");
    expect(r?.dockerfile).toContain("AS build");
    expect(r?.dockerfile).toContain("COPY --from=build /site /site");
    expect(r?.dockerfile).toContain('httpd -f -p "${PORT:-3000}"');
  });

  it("runs Nuxt's own server", () => {
    const r = recipeFor({ names: ["package.json", "nuxt.config.ts"], packageJson: pkg({ scripts: { build: "nuxt build" }, devDependencies: { nuxt: "^3" } }), nuxtConfig: "export default defineNuxtConfig({})" });
    expect(r?.stack).toBe("node");
    expect(r?.dockerfile).toContain("RUN npm run build");
    expect(r?.dockerfile).toContain("CMD exec node .output/server/index.mjs");
  });

  it("makes plain pages of a Nuxt project built for someone's cloud", () => {
    const r = recipeFor({
      names: ["package.json", "package-lock.json", "nuxt.config.ts"],
      packageJson: pkg({ scripts: { build: "nuxt build", postbuild: "node x.mjs" }, dependencies: { nuxt: "^3" } }),
      nuxtConfig: "const p = { preset: 'cloudflare-pages' }",
    });
    expect(r?.stack).toBe("static");
    expect(r?.dockerfile).toContain("RUN npx nuxt generate");
    expect(r?.dockerfile).not.toContain("npm run build");
    expect(r?.dockerfile).toContain("dist/client");
    expect(r?.dockerfile).toContain("/site/200.html");
  });

  it("gives up on a Node project with nothing to run, or a broken package.json", () => {
    expect(recipeFor({ names: ["package.json"], packageJson: pkg({ scripts: { test: "x" } }) })).toBeNull();
    expect(recipeFor({ names: ["package.json"], packageJson: "{ nope" })).toBeNull();
  });

  it("knows the common Python ways to start", () => {
    const flask = recipeFor({ names: ["requirements.txt", "app.py"], requirements: "Flask==3.0\n" });
    expect(flask?.dockerfile).toContain("python -m flask --app app run");
    const fast = recipeFor({ names: ["requirements.txt", "main.py"], requirements: "fastapi\n" });
    expect(fast?.dockerfile).toContain("python -m uvicorn main:app");
    expect(fast?.dockerfile).toContain("pip install --no-cache-dir uvicorn");
    const django = recipeFor({ names: ["requirements.txt", "manage.py"], requirements: "django\n" });
    expect(django?.dockerfile).toContain("manage.py runserver");
    const bot = recipeFor({ names: ["requirements.txt", "bot.py"], requirements: "requests\n" });
    expect(bot?.dockerfile).toContain("CMD exec python bot.py");
    expect(recipeFor({ names: ["requirements.txt"], requirements: "requests\n" })).toBeNull();
  });

  it("builds Go, serves PHP and plain pages, and says nothing for the rest", () => {
    expect(recipeFor({ names: ["go.mod", "main.go"] })?.stack).toBe("go");
    expect(recipeFor({ names: ["index.php"] })?.stack).toBe("php");
    expect(recipeFor({ names: ["index.html", "style.css"] })?.stack).toBe("static");
    expect(recipeFor({ names: ["README.md", "Cargo.toml"] })).toBeNull();
  });

  it("listens on the port the room gives, with no EXPOSE to override it", () => {
    for (const names of [["index.html"], ["index.php"], ["go.mod"]]) expect(recipeFor({ names })?.dockerfile).not.toContain("EXPOSE");
  });
});

describe("onePlatform", () => {
  it("drops a stage's platform and leaves everything else", () => {
    const file = "FROM --platform=$BUILDPLATFORM python:alpine AS base\nRUN echo --platform=x\nfrom --platform=linux/arm64 node:22\nFROM busybox\n";
    expect(onePlatform(file)).toBe("FROM python:alpine AS base\nRUN echo --platform=x\nfrom node:22\nFROM busybox\n");
  });
});

describe("ensureDockerfile", () => {
  async function inFolder(files: Record<string, string>, then: (dir: string) => Promise<void>) {
    const dir = await mkdtemp(path.join(tmpdir(), "coloc-recipe-"));
    try {
      await Promise.all(Object.entries(files).map(([n, text]) => writeFile(path.join(dir, n), text)));
      await then(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("leaves a repo's own Dockerfile alone", () =>
    inFolder({ Dockerfile: "FROM mine", "package.json": "{}" }, async (dir) => {
      expect(await ensureDockerfile(dir)).toBe("dockerfile");
      expect(await readFile(path.join(dir, "Dockerfile"), "utf8")).toBe("FROM mine");
    }));

  it("writes one when it can tell", () =>
    inFolder({ "index.html": "<h1>hi</h1>" }, async (dir) => {
      expect(await ensureDockerfile(dir)).toBe("static");
      expect(await readFile(path.join(dir, "Dockerfile"), "utf8")).toContain("httpd");
    }));

  it("says so plainly when it can't", () =>
    inFolder({ "README.md": "hi" }, async (dir) => {
      await expect(ensureDockerfile(dir)).rejects.toThrow(NO_RECIPE);
    }));
});
