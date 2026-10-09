import "reflect-metadata";
import { chores, type Db, deployments, houses, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { seedCity } from "../seed/city";
import { ChoresService, type GhEvent } from "./chores.service";
import { DeploysService } from "./deploys.service";
import type { GithubAppClient } from "./github.client";

let db: Db;
let houses_: HousesService;
let chores_: ChoresService;
let deploys: DeploysService;
let sent: ApiToAgent[];
let comments: string[];
let online: boolean;

const repo = { id: 100, full_name: "awa/ndaje", default_branch: "main" };
const awa = { id: 2, login: "awa" };
const jib = { id: 1, login: "jib" };

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  await db.update(users).set({ githubId: 1 }).where(eq(users.login, "jib"));
  await db.update(users).set({ githubId: 2 }).where(eq(users.login, "awa"));
  sent = [];
  comments = [];
  online = true;
  const github = {
    installationToken: async () => "ghs_secret_token",
    defaultBranch: async () => "main",
    comment: async (_i: number, r: string, n: number, text: string) => void comments.push(`${r}#${n}: ${text}`),
    requestReview: async () => true,
  } as unknown as GithubAppClient;
  const agents = { isOnline: () => online, send: (_h: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  houses_ = new HousesService(db);
  chores_ = new ChoresService(db, houses_, github);
  deploys = new DeploysService(db, houses_, agents, new RoomDeployer(db, houses_, agents, null, github), github);
  deploys.onModuleInit();
  // Awa installed the App on her repo, then opened PR #7: Jib is on review duty.
  await chores_.handle("installation", { action: "created", installation: { id: 7 }, sender: awa, repositories: [repo] });
  await chores_.handle("pull_request", {
    action: "opened",
    installation: { id: 7 },
    repository: repo,
    pull_request: { number: 7, title: "Checkout", html_url: "u", user: awa },
  });
  comments = [];
  sent = [];
});

const merged = (extra: Partial<NonNullable<GhEvent["pull_request"]>> = {}): GhEvent => ({
  action: "closed",
  installation: { id: 7 },
  repository: repo,
  pull_request: { number: 7, title: "Checkout", html_url: "u", user: awa, merged: true, base: { ref: "main" }, ...extra },
});
const approve = () => chores_.handle("pull_request_review", { action: "submitted", repository: repo, pull_request: { number: 7, title: "", html_url: "", user: awa }, review: { state: "APPROVED", user: jib } });
const relax = () => db.update(houses).set({ rules: { strictReviews: false } }).where(eq(houses.id, "sacre-coeur"));

describe("deploy on merge", () => {
  it("in a strict house, refuses to deploy a merge nobody approved, and says why", async () => {
    expect(await deploys.handle("pull_request", merged())).toMatch(/not deployed/);
    // The preview still leaves; nothing new is deployed.
    expect(sent).toEqual([{ type: "remove_preview", room: "awa" }]);
    expect(comments[0]).toMatch(/Not deployed.*strict house/);
  });

  it("deploys an approved merge into the author's room, with a short-lived token", async () => {
    await approve();
    expect(await deploys.handle("pull_request", merged())).toMatch(/^deploying /);
    expect(sent.map((c) => c.type)).toEqual(["remove_preview", "deploy"]);
    expect(sent[1]).toMatchObject({
      type: "deploy",
      room: "awa",
      kind: "prod",
      ref: "main",
      repo: "https://x-access-token:ghs_secret_token@github.com/awa/ndaje.git",
      limits: { memoryMb: 256, cpus: 0.5 },
    });
    const [d] = await db.select().from(deployments);
    expect(d).toMatchObject({ prNumber: 7, githubRepoId: 100, room: "awa" });
    // The token reaches the agent, never the database.
    expect(d.repo).not.toContain("ghs_secret_token");
  });

  it("in a relaxed house, deploys an unreviewed merge but notes it", async () => {
    await relax();
    expect(await deploys.handle("pull_request", merged())).toMatch(/^deploying /);
    const jibId = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!.id;
    const notes = (await houses_.view("sacre-coeur", jibId))!.notes!;
    expect(notes.some((n) => n.text.includes("without a flatmate's approval. Relaxed house"))).toBe(true);
  });

  it("ignores closed-without-merging, other branches, and repos outside any room", async () => {
    await relax();
    expect(await deploys.handle("pull_request", merged({ merged: false }))).toBe("closed without merging: preview removed");
    sent = [];
    expect(await deploys.handle("pull_request", merged({ base: { ref: "feature" } }))).toMatch(/not the default branch/);
    expect(await deploys.handle("pull_request", { ...merged(), repository: { id: 5, full_name: "x/y", default_branch: "main" } })).toBe("repo not in any room");
    expect(await deploys.handle("pull_request", { ...merged(), action: "edited" })).toBe("ignored");
    expect(sent.filter((c) => c.type === "deploy")).toHaveLength(0);
  });

  it("doesn't deploy while the house's server is offline", async () => {
    await approve();
    online = false;
    expect(await deploys.handle("pull_request", merged())).toMatch(/offline/);
    expect(sent).toHaveLength(0);
    expect(comments[0]).toMatch(/server is offline/);
  });

  it("reports the result back on the pull request", async () => {
    await approve();
    await deploys.handle("pull_request", merged());
    const id = (sent.find((c) => c.type === "deploy") as { deployId: string }).deployId;
    await houses_.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: id, room: "awa", status: "live", url: "http://awa.coloc.localhost:8000" });
    await new Promise((r) => setTimeout(r, 10));
    expect(comments.at(-1)).toMatch(/^awa\/ndaje#7: \*\*Deployed\*\* to http:\/\/awa\.coloc\.localhost:8000/);

    await houses_.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: id, room: "awa", status: "failed", detail: "build failed: no Dockerfile\nmore" });
    await new Promise((r) => setTimeout(r, 10));
    expect(comments.at(-1)).toMatch(/Deploy failed:\*\* build failed: no Dockerfile\. The previous version is still running/);
  });

  it("only counts the assignee's approval, not a comment or a change request", async () => {
    await chores_.handle("pull_request_review", { action: "submitted", repository: repo, pull_request: { number: 7, title: "", html_url: "", user: awa }, review: { state: "CHANGES_REQUESTED", user: jib } });
    const [c] = await db.select().from(chores);
    expect(c.outcome).toBe("changes_requested");
    expect(await deploys.handle("pull_request", merged())).toMatch(/not deployed/);
  });

  it("lets a later approval count: changes requested, fixed, then approved", async () => {
    await chores_.handle("pull_request_review", { action: "submitted", repository: repo, pull_request: { number: 7, title: "", html_url: "", user: awa }, review: { state: "CHANGES_REQUESTED", user: jib } });
    expect(await approve()).toBe("outcome now approved");
    expect(await deploys.handle("pull_request", merged())).toMatch(/^deploying /);
  });

});

describe("previews", () => {
  const opened = (extra: Partial<NonNullable<GhEvent["pull_request"]>> = {}): GhEvent => ({
    action: "synchronize",
    installation: { id: 7 },
    repository: repo,
    pull_request: { number: 7, title: "Checkout", html_url: "u", user: awa, head: { ref: "checkout", repo: { id: 100 } }, ...extra },
  });

  it("builds a preview of the PR's branch, next to the room", async () => {
    expect(await deploys.handle("pull_request", opened())).toMatch(/^preview /);
    expect(sent[0]).toMatchObject({ type: "deploy", kind: "preview", room: "awa", ref: "checkout" });
  });

  it("never runs a fork's code in the house", async () => {
    expect(await deploys.handle("pull_request", opened({ head: { ref: "evil", repo: { id: 999 } } }))).toMatch(/forks/);
    expect(sent).toHaveLength(0);
  });

  it("removes the preview when the pull request closes", async () => {
    await deploys.handle("pull_request", merged({ merged: false }));
    expect(sent).toEqual([{ type: "remove_preview", room: "awa" }]);
  });

  it("says the preview is ready once, not on every push", async () => {
    for (const _ of [1, 2]) {
      await deploys.handle("pull_request", opened());
      const id = (sent.at(-1) as { deployId: string }).deployId;
      await houses_.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: id, room: "awa", status: "live", url: "http://preview-awa.x" });
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(comments.filter((c) => c.includes("**Preview** ready at http://preview-awa.x"))).toHaveLength(1);
  });

  it("doesn't touch the room's real status", async () => {
    await deploys.handle("pull_request", opened());
    const id = (sent.at(-1) as { deployId: string }).deployId;
    await houses_.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: id, room: "awa", status: "failed", detail: "boom" });
    const awaRoom = (await houses_.view("sacre-coeur"))!.rooms.find((r) => r.name === "awa")!;
    expect(awaRoom.status).not.toBe("failed");
  });
});
