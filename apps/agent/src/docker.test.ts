// Pulling someone's image: Docker's reason for refusing comes in the stream, which still ends normally.
import type Docker from "dockerode";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const { events } = vi.hoisted(() => ({ events: { list: [] as object[] } }));
vi.mock("dockerode", () => ({
  default: class {
    pull = async () => ({});
    getImage = () => ({ inspect: async () => ({ Size: 1 }) });
    modem = {
      // Docker's parts as the real one splits them: stdout one way, stderr the other.
      demuxStream: (source: NodeJS.ReadableStream, out: NodeJS.WritableStream, err: NodeJS.WritableStream) => {
        source.on("data", (data: Buffer) => {
          for (let at = 0; at < data.length; at += 8 + data.readUInt32BE(at + 4)) {
            (data[at] === 2 ? err : out).write(data.subarray(at + 8, at + 8 + data.readUInt32BE(at + 4)));
          }
        });
      },
      followProgress: (_: unknown, done: (err: Error | null) => void, onEvent: (e: object) => void) => {
        events.list.forEach(onEvent);
        done(null);
      },
    };
  },
}));

import { pullImage, readExec } from "./docker";

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

describe("reading from inside a room", () => {
  // Docker's format with no terminal: an 8-byte header on each part, saying stdout or stderr and how long.
  const frame = (text: string, stream = 1) => {
    const body = Buffer.from(text);
    const head = Buffer.alloc(8);
    head[0] = stream;
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const room = (stream: PassThrough) => ({ exec: async () => ({ start: async () => stream }) }) as unknown as Docker.Container;

  it("keeps what it printed and drops its complaints", async () => {
    const stream = new PassThrough();
    const read = readExec(room(stream), ["x"]);
    await new Promise((r) => setTimeout(r));
    stream.write(frame("hello "));
    stream.write(frame("oops", 2));
    stream.end(frame("there"));
    await expect(read).resolves.toBe("hello there");
  });

  it("stops listening to a room that prints too much", async () => {
    const stream = new PassThrough();
    const read = readExec(room(stream), ["x"], { bytes: 10, ms: 1000 });
    await new Promise((r) => setTimeout(r));
    stream.write(frame("0123456789abcdef"));
    await expect(read).resolves.toBe("0123456789abcdef");
    expect(stream.destroyed).toBe(true);
  });

  it("gives up on a room that never answers", async () => {
    const stream = new PassThrough();
    await expect(readExec(room(stream), ["x"], { bytes: 10, ms: 5 })).rejects.toThrow(/too long/);
    expect(stream.destroyed).toBe(true);
  });
});
