// Building a project that has no Dockerfile: we look at its files and write the Dockerfile ourselves, so a plain
// Node, Python, Go, PHP or static project goes online as it is. It's still Docker underneath, with the same walls: the
// recipe only saves the newcomer from writing one. A Dockerfile in the repo always wins.
//
// A room's disk can be read-only and its app can run as nobody (room-spec.ts, on a machine that can't limit a disk), so
// each recipe keeps what tools write in /tmp. The app is told its port as $PORT; none of them EXPOSE one, so that's 3000 unless the room says otherwise.
import { lstat, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// What a recipe needs to know about the folder: its file names, and the two files that say how to run it.
export interface Project {
  names: string[];
  packageJson?: string | null;
  requirements?: string | null;
  nuxtConfig?: string | null;
}

export interface Recipe {
  stack: "node" | "python" | "go" | "php" | "static";
  dockerfile: string;
}

// The build's output, for a site with a build step and no server of its own (Vite, Create React App, Astro…).
const OUTPUTS = ["dist", "build", "out", ".output/public", "dist/client"];
// What the owner reads when a build ran fine and left no page to serve. The website recognises its start.
export const NO_SITE = "The build finished but made no website";

// A tiny web server for a folder of files. Unknown paths get index.html, so a single-page app's links work.
const SERVE_FILES = `FROM busybox:1.36
RUN echo "E404:/site/index.html" > /etc/httpd.conf
COPY SITE /site
CMD exec httpd -f -p "\${PORT:-3000}" -h /site -c /etc/httpd.conf`;

// Whichever folder the build wrote is what goes online. A site that draws itself in the browser has a 200.html instead
// of an index.html (Nuxt does this): it's the same page.
const COPY_SITE = `mkdir /site && for d in ${OUTPUTS.join(" ")}; do if [ -f "$d/index.html" ] || [ -f "$d/200.html" ]; then cp -r "$d/." /site; break; fi; done; [ -f /site/index.html ] || cp /site/200.html /site/index.html 2>/dev/null || { echo "${NO_SITE}: no index.html in ${OUTPUTS.join(", ")}."; exit 1; }`;

function nodeRecipe(project: Project): Recipe | null {
  let pkg: { scripts?: Record<string, string>; main?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(project.packageJson ?? "");
  } catch {
    return null;
  }
  const has = (name: string) => project.names.includes(name);
  const install = has("pnpm-lock.yaml")
    ? "corepack enable && pnpm install --frozen-lockfile"
    : has("yarn.lock")
      ? "corepack enable && yarn install --frozen-lockfile"
      : has("package-lock.json")
        ? "npm ci"
        : "npm install";
  const run = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
  const generate = run === "npm" ? "npx nuxt generate" : `${run} exec nuxt generate`;
  let build = pkg.scripts?.build ? `RUN ${run} run build\n` : "";
  const entry = [pkg.main, "server.js", "index.js", "app.js"].find((f) => f && has(f));
  const nuxt = !!(pkg.dependencies?.nuxt ?? pkg.devDependencies?.nuxt);
  // Nuxt's own build makes a server that reads $PORT. Unless its config builds for someone's cloud (Cloudflare, Vercel…),
  // which only that cloud can run: then the project goes online as plain pages instead.
  const forACloud = nuxt && /preset\s*:\s*['"`](?!node)/.test(project.nuxtConfig ?? "");
  const start = pkg.scripts?.start ? `npm start` : entry ? `node ${entry}` : nuxt && !forACloud ? "node .output/server/index.mjs" : null;
  if (forACloud) build = `RUN ${generate}\n`;
  const base = `FROM node:22-slim
WORKDIR /app
ENV HOME=/tmp NPM_CONFIG_CACHE=/tmp/npm NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN ${install}
${build}`;
  if (start) return { stack: "node", dockerfile: `${base}ENV NODE_ENV=production\nCMD exec ${start}\n` };
  // No server, but a build: it makes a site.
  if (!build) return null;
  return {
    stack: "static",
    dockerfile: `${base.replace("FROM node:22-slim", "FROM node:22-slim AS build")}RUN ${COPY_SITE}\n${SERVE_FILES.replace("COPY SITE /site", "COPY --from=build /site /site")}\n`,
  };
}

function pythonRecipe(project: Project): Recipe | null {
  const reqs = (project.requirements ?? "").toLowerCase();
  const has = (name: string) => project.names.includes(name);
  const entry = ["main.py", "app.py", "server.py", "bot.py"].find(has);
  const module = entry?.replace(/\.py$/, "");
  const start = has("manage.py")
    ? `python manage.py runserver --noreload "0.0.0.0:\${PORT:-3000}"`
    : module && /^fastapi\b/m.test(reqs)
      ? `python -m uvicorn ${module}:app --host 0.0.0.0 --port "\${PORT:-3000}"`
      : module && /^flask\b/m.test(reqs)
        ? `python -m flask --app ${module} run --host 0.0.0.0 --port "\${PORT:-3000}"`
        : entry
          ? `python ${entry}`
          : null;
  if (!start) return null;
  const install = has("requirements.txt") ? "pip install --no-cache-dir -r requirements.txt" : "pip install --no-cache-dir .";
  const uvicorn = /^fastapi\b/m.test(reqs) && !/^uvicorn\b/m.test(reqs) ? " uvicorn" : "";
  return {
    stack: "python",
    dockerfile: `FROM python:3.12-slim
WORKDIR /app
ENV HOME=/tmp PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY . .
RUN ${install}${uvicorn ? ` && pip install --no-cache-dir${uvicorn}` : ""}
CMD exec ${start}
`,
  };
}

/** How to build and run this folder, or null when we can't tell. */
export function recipeFor(project: Project): Recipe | null {
  const has = (name: string) => project.names.includes(name);
  if (has("package.json")) return nodeRecipe(project);
  if (has("requirements.txt") || has("pyproject.toml")) return pythonRecipe(project);
  if (has("go.mod")) {
    return {
      stack: "go",
      dockerfile: `FROM golang:1-alpine AS build
ENV GOTOOLCHAIN=auto CGO_ENABLED=0
WORKDIR /src
COPY . .
RUN go build -o /server .
FROM alpine:3.20
COPY --from=build /server /server
CMD ["/server"]
`,
    };
  }
  if (has("index.php")) {
    return {
      stack: "php",
      dockerfile: `FROM php:8-cli-alpine
WORKDIR /app
COPY . .
CMD exec php -S "0.0.0.0:\${PORT:-3000}" -t /app
`,
    };
  }
  if (has("index.html")) return { stack: "static", dockerfile: `${SERVE_FILES.replace("COPY SITE /site", "COPY . /site")}\n` };
  return null;
}

// What the room's owner reads when neither a Dockerfile nor a recipe fits. The website recognises its start.
export const NO_RECIPE = "We couldn't tell how to run this project";

/** A project's Dockerfile may name a platform ("FROM --platform=$BUILDPLATFORM node"). The builder here has no such variables, and only one machine to build for: the flag goes. */
export function onePlatform(dockerfile: string): string {
  return dockerfile.replace(/^(\s*FROM\s+)--platform=\S+\s+/gim, "$1");
}

/** Makes sure the folder has a Dockerfile: its own, or one we write for it. Throws when we can't tell. */
export async function ensureDockerfile(dir: string): Promise<Recipe["stack"] | "dockerfile"> {
  // A link is a stranger's way of having us write outside the repo: it goes, and we write our own.
  const there = await lstat(path.join(dir, "Dockerfile")).catch(() => null);
  if (there?.isFile()) {
    const own = await readFile(path.join(dir, "Dockerfile"), "utf8");
    if (onePlatform(own) !== own) await writeFile(path.join(dir, "Dockerfile"), onePlatform(own));
    return "dockerfile";
  }
  if (there) await rm(path.join(dir, "Dockerfile"), { recursive: true, force: true });
  const names = await readdir(dir);
  const read = (name: string) => (names.includes(name) ? readFile(path.join(dir, name), "utf8") : null);
  const recipe = recipeFor({ names, packageJson: await read("package.json"), requirements: await read("requirements.txt"), nuxtConfig: await read(names.find((n) => /^nuxt\.config\.[cm]?[jt]s$/.test(n)) ?? "") });
  if (!recipe) throw new Error(`${NO_RECIPE}: no Dockerfile, package.json, requirements.txt, go.mod, index.php or index.html in this folder.`);
  await writeFile(path.join(dir, "Dockerfile"), recipe.dockerfile);
  return recipe.stack;
}
