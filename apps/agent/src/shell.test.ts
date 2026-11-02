// A shell in a room. The real thing is `docker exec`, tried on a real server; here, what's asked of Docker and when.
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  containers: [] as { Id: string; State: string }[],
  execs: [] as { opts: { Cmd: string[]; Tty?: boolean; Env?: string[] }; stream: unknown; start: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; inspect: ReturnType<typeof vi.fn> }[],
}));

vi.mock("./docker", () => ({
  roomContainers: vi.fn(async () => h.containers),
  docker: {
    modem: { demuxStream: (s: NodeJS.ReadableStream, out: NodeJS.WritableStream) => s.pipe(out) },
    getContainer: () => ({
      exec: async (opts: { Cmd: string[]; Tty?: boolean; Env?: string[] }) => {
        const stream = new PassThrough();
        const exec = { opts, stream, start: vi.fn(async () => stream), resize: vi.fn(async () => undefined), inspect: vi.fn(async () => ({ ExitCode: 7 })) };
        h.execs.push(exec);
        return exec;
      },
    }),
  },
}));

import { pidFile, shellCommand, Shells, stopCommand } from "./shell";

const stream = (i: number) => h.execs[i].stream as PassThrough;

describe("a shell in a room", () => {
  let sent: { type: string; shellId?: string; data?: string; code?: number; reason?: string }[];
  let shells: Shells;

  beforeEach(() => {
    h.containers = [{ Id: "c1", State: "running" }];
    h.execs = [];
    sent = [];
    shells = new Shells("eaz", (m) => void sent.push(m));
  });

  it("says so when nothing is running", async () => {
    h.containers = [{ Id: "c1", State: "exited" }];
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl" });
    expect(sent).toEqual([{ type: "shell_exit", shellId: "s1", reason: "not_running" }]);
    expect(h.execs).toEqual([]);
  });

  it("opens a terminal of the size asked, and passes bytes both ways", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl", tty: { term: "xterm", cols: 80, rows: 24 } });
    expect(h.execs[0].opts.Tty).toBe(true);
    expect(h.execs[0].opts.Env).toContain("TERM=xterm");
    expect(h.execs[0].start).toHaveBeenCalledWith(expect.objectContaining({ ConsoleSize: [24, 80] }));
    const typed = vi.spyOn(stream(0), "write");
    shells.input("s1", Buffer.from("ls\n").toString("base64"));
    expect(typed).toHaveBeenCalledWith(Buffer.from("ls\n"));
    stream(0).emit("data", Buffer.from("hello"));
    expect(sent.at(-1)).toEqual({ type: "shell_output", shellId: "s1", data: Buffer.from("hello").toString("base64") });
    shells.resize("s1", 100, 40);
    expect(h.execs[0].resize).toHaveBeenCalledWith({ w: 100, h: 40 });
  });

  it("reports how the command ended, and clears up behind it", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl", command: "exit 7" });
    expect(h.execs[0].opts.Cmd.at(-1)).toBe("exit 7");
    stream(0).emit("end");
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ type: "shell_exit", shellId: "s1", code: 7 }));
    expect(h.execs[1].opts.Cmd).toEqual(stopCommand("s1"));
  });

  it("stops what's inside when the person leaves, and tells nobody", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl" });
    await shells.close("s1");
    expect(stream(0).destroyed).toBe(true);
    expect(h.execs[1].opts.Cmd).toEqual(stopCommand("s1"));
    expect(sent.some((m) => m.type === "shell_exit")).toBe(false);
  });

  it("closes everything when the line to the API drops", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl" });
    await shells.start({ type: "shell_open", shellId: "s2", room: "djbrl" });
    shells.closeAll();
    expect(stream(0).destroyed && stream(1).destroyed).toBe(true);
  });

  it("makes a chatty command wait until the person has caught up", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl", tty: { term: "xterm", cols: 80, rows: 24 } });
    stream(0).emit("data", Buffer.alloc(1024 * 1024));
    expect(stream(0).isPaused()).toBe(true);
    shells.ack("s1", 512 * 1024);
    expect(stream(0).isPaused()).toBe(true);
    shells.ack("s1", 512 * 1024);
    expect(stream(0).isPaused()).toBe(false);
  });

  it("tells a terminal its input ended with Ctrl-D, without closing it", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl", tty: { term: "xterm", cols: 80, rows: 24 } });
    const typed = vi.spyOn(stream(0), "write");
    shells.eof("s1");
    expect(typed).toHaveBeenCalledWith("\x04");
    expect(stream(0).writableEnded).toBe(false);
    await shells.start({ type: "shell_open", shellId: "s2", room: "djbrl" });
    shells.eof("s2");
    expect(stream(1).writableEnded).toBe(true);
  });

  it("says it couldn't start a shell, instead of Docker's words", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl", tty: { term: "xterm", cols: 80, rows: 24 } });
    stream(0).emit("data", Buffer.from('OCI runtime exec failed: exec: "/bin/sh": no such file'));
    stream(0).emit("end");
    await vi.waitFor(() => expect(sent).toContainEqual({ type: "shell_exit", shellId: "s1", reason: "failed" }));
    expect(sent.some((m) => m.type === "shell_output")).toBe(false);
  });

  it("keeps what's typed or piped before the shell has started", async () => {
    const starting = shells.start({ type: "shell_open", shellId: "s1", room: "djbrl" });
    shells.input("s1", Buffer.from("early").toString("base64"));
    shells.eof("s1");
    await starting;
    // This pretend shell says back what it's told.
    await vi.waitFor(() => expect(sent).toContainEqual({ type: "shell_output", shellId: "s1", data: Buffer.from("early").toString("base64") }));
    expect(stream(0).writableEnded).toBe(true);
  });

  it("closes a shell someone pours in far more than it reads", async () => {
    await shells.start({ type: "shell_open", shellId: "s1", room: "djbrl" });
    vi.spyOn(stream(0), "writableLength", "get").mockReturnValue(17 * 1024 * 1024);
    shells.input("s1", "eA==");
    expect(stream(0).destroyed).toBe(true);
  });

  it("never lets a shell's name reach the command line as anything but itself", () => {
    expect(pidFile("a;rm -rf /")).toBe("/tmp/.coloc-shell-arm-rf");
    expect(shellCommand("abc", "ls; pwd").at(-1)).toBe("ls; pwd");
  });
});
