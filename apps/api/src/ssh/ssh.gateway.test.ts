// The door, with a real SSH client on the other side. The caretaker is a stand-in: its side is tested on a real server.
import { Client, utils } from "ssh2";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShellBroker, ShellEvents } from "../agents/shell.broker";
import { SshGateway } from "./ssh.gateway";
import type { RoomKey, SshService } from "./ssh.service";

const hostKey = utils.generateKeyPairSync("ed25519").private;
const mine = utils.generateKeyPairSync("ed25519");
const stranger = utils.generateKeyPairSync("ed25519");
const USER = "u-1";

const keyLine = (pub: string) => pub.split(" ").slice(0, 2).join(" ");

let stop: () => void = () => undefined;
afterEach(() => stop());

async function door(shellFor: (events: ShellEvents, opts: { command?: string; tty?: unknown }) => void = () => undefined) {
  const keys: RoomKey[] = [{ userId: USER, publicKey: keyLine(mine.public) }];
  const ssh = {
    keysFor: vi.fn(async (houseId: string, room: string) => (houseId === "eaz" && room === "djbrl" ? keys : [])),
    mayStay: vi.fn(async () => true),
  } as unknown as SshService;
  const input: string[] = [];
  const closed = vi.fn();
  const shells = {
    open: vi.fn((_: string, __: string, opts: { command?: string; tty?: unknown }, events: ShellEvents) => {
      shellFor(events, opts);
      return { input: (d: Buffer) => input.push(d.toString()), eof: vi.fn(), resize: vi.fn(), ack: vi.fn(), close: closed };
    }),
  } as unknown as ShellBroker;
  const gateway = new SshGateway(ssh, shells);
  const port = await gateway.listen(hostKey, 0);
  stop = () => gateway.onModuleDestroy();
  return { port, shells, input, closed };
}

const connect = (port: number, username: string, auth: { privateKey?: string; password?: string }) =>
  new Promise<Client>((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c));
    c.on("error", reject);
    c.connect({ host: "127.0.0.1", port, username, ...auth });
  });

const run = (c: Client, command: string) =>
  new Promise<{ out: string; err: string; code: number | undefined }>((resolve, reject) => {
    c.exec(command, (e, ch) => {
      if (e) return reject(e);
      let out = "";
      let err = "";
      let code: number | undefined;
      ch.on("data", (d: Buffer) => (out += d));
      ch.stderr.on("data", (d: Buffer) => (err += d));
      ch.on("exit", (n: number) => (code = n));
      ch.on("close", () => resolve({ out, err, code }));
    });
  });

describe("the SSH door", () => {
  it("lets the right key in, and passes bytes and the exit code both ways", async () => {
    const { port, shells } = await door((events, opts) => {
      setTimeout(() => {
        events.output(Buffer.from(`ran ${opts.command}`), false);
        events.output(Buffer.from("warned"), true);
        events.exit(3, undefined);
      }, 5);
    });
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    expect(await run(c, "ls /")).toEqual({ out: "ran ls /", err: "warned", code: 3 });
    expect(shells.open).toHaveBeenCalledWith("eaz", "djbrl", expect.objectContaining({ command: "ls /" }), expect.anything(), expect.any(String));
    c.end();
  });

  it("refuses a key that isn't on the list, a password, a wrong room, and logins that aren't rooms", async () => {
    const { port, shells } = await door();
    await expect(connect(port, "djbrl.eaz", { privateKey: stranger.private })).rejects.toThrow(/authentication/i);
    await expect(connect(port, "djbrl.eaz", { password: "hunter2" })).rejects.toThrow(/authentication/i);
    await expect(connect(port, "other.eaz", { privateKey: mine.private })).rejects.toThrow(/authentication/i);
    await expect(connect(port, "root", { privateKey: mine.private })).rejects.toThrow(/authentication/i);
    expect(shells.open).not.toHaveBeenCalled();
  });

  it("says why when nothing is running in the room", async () => {
    const { port } = await door((events) => setTimeout(() => events.exit(undefined, "not_running"), 5));
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    const { err, code } = await run(c, "ls");
    expect(err).toContain("Nothing is running");
    expect(code).toBe(1);
    c.end();
  });

  it("says why when the house's server is offline", async () => {
    const { port, shells } = await door();
    vi.mocked(shells.open).mockImplementation(() => {
      throw new Error("offline");
    });
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    const { err, code } = await run(c, "ls");
    expect(err).toContain("offline");
    expect(code).toBe(1);
    c.end();
  });

  it("refuses sftp and port forwarding", async () => {
    const { port, shells } = await door();
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    await expect(new Promise((resolve, reject) => c.sftp((e, s) => (e ? reject(e) : resolve(s))))).rejects.toThrow();
    await expect(new Promise((resolve, reject) => c.forwardOut("127.0.0.1", 1, "127.0.0.1", 5432, (e, s) => (e ? reject(e) : resolve(s))))).rejects.toThrow();
    await expect(new Promise((resolve, reject) => c.forwardIn("0.0.0.0", 8080, (e) => (e ? reject(e) : resolve(null))))).rejects.toThrow();
    expect(shells.open).not.toHaveBeenCalled();
    c.end();
  });

  it("closes the shell when the person leaves", async () => {
    const { port, closed } = await door();
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    await new Promise<void>((resolve, reject) => c.shell((e) => (e ? reject(e) : resolve())));
    c.end();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
  });

  it("stops at a few shells a person", async () => {
    const { port } = await door();
    const c = await connect(port, "djbrl.eaz", { privateKey: mine.private });
    for (let i = 0; i < 4; i++) await new Promise<void>((resolve, reject) => c.exec("sleep", (e) => (e ? reject(e) : resolve())));
    const { err, code } = await run(c, "one more");
    expect(err).toContain("Too many");
    expect(code).toBe(1);
    c.end();
  });
});
