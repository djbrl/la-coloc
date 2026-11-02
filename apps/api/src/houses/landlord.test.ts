import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { hashSecret, type HousesService } from "./houses.service";
import { Landlord, loadLandlordConfig } from "./landlord";

const config = { agent: "/agent.js", apiUrl: "ws://localhost:4100/agent", key: "k", max: 2, domain: "here.localhost" };

function fake(keyed: { id: string; domain: string; agentSecretHash: string | null }[] | Error = []) {
  const children: (EventEmitter & { kill: () => void })[] = [];
  const launch = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    children.push(child);
    return child;
  });
  const houses = { keyedHouses: async () => { if (keyed instanceof Error) throw keyed; return keyed; } } as unknown as HousesService;
  return { landlord: new Landlord(houses, config, launch as never), launch, children };
}

describe("the landlord", () => {
  it("is off unless the launcher gives it all three settings", () => {
    expect(loadLandlordConfig({})).toBeNull();
    expect(loadLandlordConfig({ COLOC_LANDLORD_AGENT: "a", COLOC_LANDLORD_API_URL: "b", COLOC_LANDLORD_KEY: "c" })).toMatchObject({ max: 3 });
    expect(new Landlord({} as HousesService, null).hasRoom("x")).toBe(false);
  });

  it("makes each house its own key, the same one every time, safe to paste in a shell", () => {
    const { landlord } = fake();
    expect(landlord.secretFor("a")).toBe(landlord.secretFor("a"));
    expect(landlord.secretFor("a")).not.toBe(landlord.secretFor("b"));
    expect(landlord.secretFor("a")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("gives a caretaker what it needs and none of the API's own secrets", () => {
    process.env.COLOC_DATABASE_URL = "postgres://secret";
    const { landlord, launch } = fake();
    landlord.start("a", "a.coloc.localhost");
    const env = (launch.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }])[2].env;
    expect(env).toMatchObject({ COLOC_HOUSE_ID: "a", COLOC_AGENT_SECRET: landlord.secretFor("a"), COLOC_HOUSE_DOMAIN: "a.coloc.localhost" });
    expect(env).not.toHaveProperty("COLOC_DATABASE_URL");
    delete process.env.COLOC_DATABASE_URL;
  });

  it("tells a caretaker how this machine serves rooms", () => {
    process.env.COLOC_PUBLIC_SCHEME = "https";
    const { landlord, launch } = fake();
    landlord.start("a", "a.coloc.localhost");
    const env = (launch.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }])[2].env;
    expect(env).toMatchObject({ COLOC_PUBLIC_SCHEME: "https" });
    delete process.env.COLOC_PUBLIC_SCHEME;
  });

  it("takes only so many houses, and never starts one twice", () => {
    const { landlord, launch } = fake();
    landlord.start("a", "d");
    landlord.start("a", "d");
    expect(launch).toHaveBeenCalledTimes(1);
    landlord.start("b", "d");
    expect(landlord.hasRoom("c")).toBe(false);
    expect(landlord.hasRoom("a")).toBe(true);
  });

  it("restarts a caretaker that stops, unless it's shutting down", () => {
    vi.useFakeTimers();
    const { landlord, launch, children } = fake();
    landlord.start("a", "d");
    children[0].emit("exit");
    vi.advanceTimersByTime(5_000);
    expect(launch).toHaveBeenCalledTimes(2);
    landlord.onModuleDestroy();
    expect(children[1].kill).toHaveBeenCalled();
    children[1].emit("exit");
    vi.advanceTimersByTime(5_000);
    expect(launch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("brings back only the houses it holds the key of, after a restart", async () => {
    const mine = new Landlord({} as HousesService, config).secretFor("mine");
    const { landlord, launch } = fake([
      { id: "mine", domain: "d", agentSecretHash: hashSecret(mine) },
      { id: "theirs", domain: "d", agentSecretHash: hashSecret("pasted on their own server") },
    ]);
    await landlord.onModuleInit();
    expect(launch).toHaveBeenCalledTimes(1);
    landlord.onModuleDestroy();
  });

  it("stops a caretaker for good, freeing its place", () => {
    vi.useFakeTimers();
    const { landlord, launch, children } = fake();
    landlord.start("a", "a.coloc.localhost");
    landlord.start("b", "b.coloc.localhost");
    expect(landlord.hasRoom("c")).toBe(false);
    landlord.stop("a");
    expect(children[0].kill).toHaveBeenCalled();
    children[0].emit("exit");
    vi.advanceTimersByTime(60_000);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(landlord.hasRoom("c")).toBe(true);
    landlord.onModuleDestroy();
    vi.useRealTimers();
  });

  it("retires a gone house's caretaker after a moment, unless a house of that name is back", async () => {
    vi.useFakeTimers();
    const exists = vi.fn(async (id: string) => id === "back");
    const children: (EventEmitter & { kill: () => void })[] = [];
    const launch = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      children.push(child);
      return child;
    });
    const landlord = new Landlord({ exists } as unknown as HousesService, config, launch as never);
    landlord.start("gone", "gone.coloc.localhost");
    landlord.start("back", "back.coloc.localhost");
    landlord.retire("gone", 1000);
    landlord.retire("back", 1000);
    expect(children[0].kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(children[0].kill).toHaveBeenCalled();
    expect(children[1].kill).not.toHaveBeenCalled();
    landlord.onModuleDestroy();
    vi.useRealTimers();
  });

  it("waits for a database that isn't up yet", async () => {
    const { landlord, launch } = fake(new Error("down"));
    await expect(landlord.onModuleInit()).resolves.toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
    landlord.onModuleDestroy();
  });
});
