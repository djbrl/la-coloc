import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "./config";

const h = vi.hoisted(() => ({
  containers: [] as object[],
  output: "",
  routed: null as { container: string; port: number } | null,
  routeTo: vi.fn(async () => undefined),
  exec: vi.fn(),
}));

vi.mock("./docker", () => ({
  docker: { getContainer: () => ({}) },
  readExec: (...args: unknown[]) => {
    h.exec(...args);
    return Promise.resolve(h.output);
  },
  roomContainers: async () => h.containers,
}));
vi.mock("./proxy", () => ({ routedTo: async () => h.routed, routeTo: h.routeTo }));

import { commandName, lookInside, parseLook, setAddress } from "./inside";

// What the script really printed in a busybox room on the rehearsal server, with its cmdlines' NULs.
const BUSYBOX = [
  "U\t8",
  "E\td\t0\t .git\tblog",
  "E\tf\t4\t\tnotes.txt",
  "E\tl\t\t\tproject",
  "E\td\t4\t package.json\tshop",
  "E\tf\t0\t\twith space.txt",
  "N\t5",
  "L\t0100007F:2328\t96496",
  "L\t00000000000000000000000000000000:0BB8\t96343",
  "L\t00000000000000000000000000000000:1F40\t96423",
  "P\t1\t1\thttpd\thttpd\0-f\0-p\x003000\0",
  "S\t1\t[96343]",
  "P\t18\t8\thttpd\thttpd\0-f\0-p\x008000\0",
  "S\t18\t[96423]",
  "P\t19\t19\thttpd\thttpd\0-f\0-p\x00127.0.0.1:9000\0",
  "S\t19\t[96496]",
  "P\t25\t25\tsleep\tsleep\x00300\0",
  "",
].join("\n");

describe("reading a look inside a room", () => {
  const found = parseLook(BUSYBOX, "/home/your-room", 1024)!;

  it("lists the folder, with what each thing looks like", () => {
    expect(found.home).toMatchObject({ path: "/home/your-room", usedKb: 8, limitMb: 1024, more: 0 });
    expect(found.home!.entries).toEqual([
      { name: "blog", kind: "folder", kb: 0, stack: "git" },
      { name: "notes.txt", kind: "file", kb: 4 },
      { name: "project", kind: "link", project: true },
      { name: "shop", kind: "folder", kb: 4, stack: "node" },
      { name: "with space.txt", kind: "file", kb: 0 },
    ]);
  });

  it("says which port is whose, and tells the project from what someone started", () => {
    expect(found.running).toEqual([
      { command: "httpd", port: 3000, started: false },
      { command: "httpd", port: 8000, started: true },
      { command: "httpd", port: 9000, localOnly: true, started: true },
      { command: "sleep 300", started: true },
    ]);
  });

  it("names the project's main program when it listens on nothing", () => {
    const { running } = parseLook("P\t1\t1\tworker\tpython\0worker.py\0\n", undefined, undefined)!;
    expect(running).toEqual([{ command: "python worker.py", started: false }]);
  });

  it("leaves out itself, and shells someone is only typing in", () => {
    const text = ["P\t1\t1\tnode\tnode\0a.js\0", "P\t9\t9\tsh\t/bin/sh\0-c\0script\0coloc-look\0", "P\t10\t10\tbash\tbash\0", "P\t11\t11\tbash\tbash\0run.sh\0", ""].join("\n");
    expect(parseLook(text, undefined, undefined)!.running.map((r) => r.command)).toEqual(["node a.js", "bash run.sh"]);
  });

  it("counts a port on both IPv4 and IPv6 once, and it's only local if every way in is", () => {
    const text = ["L\t0100007F:1F40\t1", "L\t00000000000000000000000000000000:1F40\t2", "P\t1\t1\tx\tx\0", "S\t1\t[1]", ""].join("\n");
    expect(parseLook(text, undefined, undefined)!.running[0]).toMatchObject({ port: 8000, command: "x" });
    expect(parseLook(text, undefined, undefined)!.running[0].localOnly).toBeUndefined();
    expect(parseLook("L\t0100007F:1F40\t1\nP\t1\t1\tx\tx\0\n", undefined, undefined)!.running[0].localOnly).toBe(true);
  });

  it("isn't fooled by what a room puts in a file name or a command", () => {
    const text = ["N\t1", "E\tf\t4\t\tevil\u0007\u001b[31mname", "E\tnope\tx\ty\tz", "L\tjunk\t1", "L\t00000000:FFFFF\t2", "P\t1\t1\tx\tx\0", ""].join("\n");
    const found = parseLook(text, "/home/your-room", undefined)!;
    expect(found.home!.entries).toEqual([{ name: "evil  [31mname", kind: "file", kb: 4 }]);
    expect(found.running).toEqual([{ command: "x", started: false }]);
  });

  it("gives up when the script never ran: the image has no shell", () => {
    expect(parseLook("OCI runtime exec failed: no such file\n", "/home/your-room", 1024)).toBeNull();
  });

  it("says how much more there is than it lists", () => {
    const text = [...Array.from({ length: 40 }, (_, i) => `E\tf\t1\t\tf${i}`), "N\t52", "P\t1\t1\tx\tx\0", ""].join("\n");
    expect(parseLook(text, "/home/your-room", undefined)!.home).toMatchObject({ more: 12 });
  });
});

describe("what a process is called", () => {
  it("is its program and what it runs", () => {
    expect(commandName(["/usr/local/bin/node", "/app/server.js"], "node")).toBe("node server.js");
    expect(commandName(["python3", "-m", "http.server", "8000"], "python3")).toBe("python3 -m http.server");
    expect(commandName(["npm", "run", "dev"], "npm")).toBe("npm run dev");
  });

  it("stops before flags and settings, which is where tokens live", () => {
    expect(commandName(["app", "--token", "secret"], "app")).toBe("app");
    expect(commandName(["app", "serve", "API_KEY=secret"], "app")).toBe("app serve");
    expect(commandName(["node", "-e", "secret()"], "node")).toBe("node");
  });

  it("falls back on the kernel's name for it", () => {
    expect(commandName([], "worker")).toBe("worker");
  });
});

describe("looking inside and moving the address", () => {
  const cfg = { houseId: "h", roomDiskMb: 1024 } as AgentConfig;
  const running = { Id: "c1", State: "running", Created: 2, Names: ["/coloc-awa-prod-d1"], Labels: { "coloc.port": "3000" }, Mounts: [{ Name: "coloc-home-h--awa--u", Destination: "/home/your-room" }] };

  beforeEach(() => {
    h.containers = [running];
    h.output = BUSYBOX;
    h.routed = { container: "coloc-awa-prod-d1", port: 3000 };
    h.routeTo.mockClear();
    h.exec.mockClear();
  });

  it("says so when nothing's running, without touching anything", async () => {
    h.containers = [{ ...running, State: "exited" }];
    await expect(lookInside(cfg, "awa")).resolves.toEqual({ error: "not_running" });
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("looks in the folder that container really has", async () => {
    const { inside } = await lookInside(cfg, "awa");
    expect(h.exec.mock.calls[0][1].at(-1)).toBe("/home/your-room");
    expect(inside).toMatchObject({ projectPort: 3000, addressPort: 3000 });
  });

  it("says when the image has no shell", async () => {
    h.output = "";
    await expect(lookInside(cfg, "awa")).resolves.toEqual({ error: "no_shell" });
  });

  it("sends the address to a port something's listening on", async () => {
    const { inside } = await setAddress(cfg, "awa", 8000);
    expect(h.routeTo).toHaveBeenCalledWith(cfg, "awa", "prod", "coloc-awa-prod-d1", 8000);
    expect(inside?.addressPort).toBe(8000);
  });

  it("won't send it to a port nothing's on, or one only the room itself can reach", async () => {
    await expect(setAddress(cfg, "awa", 7777)).resolves.toEqual({ error: "not_listening" });
    await expect(setAddress(cfg, "awa", 9000)).resolves.toEqual({ error: "not_listening" });
    expect(h.routeTo).not.toHaveBeenCalled();
  });
});
