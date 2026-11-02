// Pulling someone's image: Docker's reason for refusing comes in the stream, which still ends normally.
import { describe, expect, it, vi } from "vitest";

const { events } = vi.hoisted(() => ({ events: { list: [] as object[] } }));
vi.mock("dockerode", () => ({
  default: class {
    pull = async () => ({});
    getImage = () => ({ inspect: async () => ({ Size: 1 }) });
    modem = {
      followProgress: (_: unknown, done: (err: Error | null) => void, onEvent: (e: object) => void) => {
        events.list.forEach(onEvent);
        done(null);
      },
    };
  },
}));

import { pullImage } from "./docker";

describe("pulling an image", () => {
  it("fails with Docker's own reason", async () => {
    events.list = [{ status: "Pulling from you/app" }, { error: "no matching manifest for linux/amd64 in the manifest list entries" }];
    await expect(pullImage("you/app", () => undefined)).rejects.toThrow("no matching manifest");
  });

  it("says the lines that mean something, and finishes", async () => {
    events.list = [{ status: "Pulling from you/app" }, { status: "Downloading", id: "abc", progress: "1/2" }];
    const said: string[] = [];
    await pullImage("you/app", (l) => said.push(l));
    expect(said).toEqual(["Pulling from you/app"]);
  });
});
