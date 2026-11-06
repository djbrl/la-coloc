// The SSH door: `ssh -p 2222 room.house@city`. It isn't the server's own SSH: nobody gets near the server. It checks the
// key against the people who may enter that room, then passes bytes to a shell inside the room's running app, through
// the house's caretaker (shell.broker.ts, then apps/agent/src/shell.ts). Keys only, shells only: no passwords, no port
// forwarding, no file-transfer subsystem. Off unless COLOC_SSH_PORT and COLOC_SSH_HOST_KEY_FILE are set.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { Server, type AuthContext, type Connection, type ServerChannel, type Session, utils } from "ssh2";
import { type Shell, ShellBroker } from "../agents/shell.broker";
import { Limiter } from "../chat/limiter";
import { parseLogin, SshService } from "./ssh.service";

const AUTH_TIMEOUT_MS = 20_000;
// Nothing typed or printed for this long: the shell closes.
const IDLE_MS = 30 * 60_000;
// How often someone inside is checked: they may have moved out.
const RECHECK_MS = 60_000;
const SHELLS_PER_PERSON = 4;
const SHELLS_PER_SERVER = 40;
const CONNECTIONS_AT_ONCE = 200;
// Logged in, but no shell open for this long: nobody's using it.
const NO_SHELL_MS = 2 * 60_000;
export const CONNECTIONS_PER_ADDRESS = { count: 30, perMs: 60_000 };

const NOT_RUNNING = "Nothing is running in this room. Put a project online first.\r\n";
const OFFLINE = "The house's server is offline. Try again in a moment.\r\n";
const FAILED = "This room couldn't open a shell. Its image may not have one (/bin/sh).\r\n";
const LOST = "\r\nThe line to the house's server dropped.\r\n";
const TOO_MANY = "Too many shells open. Close one first.\r\n";
const IDLE = "\r\nClosed after 30 minutes of nothing.\r\n";
const MOVED_OUT = "\r\nYou no longer have access to this room.\r\n";

@Injectable()
export class SshGateway implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("ssh");
  private server?: Server;
  private connections = 0;
  private perAddress = new Limiter(CONNECTIONS_PER_ADDRESS.count, CONNECTIONS_PER_ADDRESS.perMs);
  private openShells = new Map<string, number>();

  constructor(
    private readonly ssh: SshService,
    private readonly shells: ShellBroker,
  ) {}

  onModuleInit() {
    const port = Number(process.env.COLOC_SSH_PORT);
    const keyFile = process.env.COLOC_SSH_HOST_KEY_FILE;
    if (!port || !keyFile) return;
    this.listen(readFileSync(keyFile), port, process.env.COLOC_SSH_BIND ?? "0.0.0.0");
  }

  /** Starts the door. Resolves with the port, which the tests leave to the system. */
  listen(hostKey: Buffer | string, port: number, bind = "127.0.0.1"): Promise<number> {
    this.server = new Server({ hostKeys: [hostKey], ident: "LaColoc" }, (client, info) => this.welcome(client, info.ip));
    this.server.on("error", (e: Error) => this.log.error(`the door stopped: ${e.message}`));
    return new Promise((resolve) => {
      this.server!.listen(port, bind, () => {
        const at = (this.server!.address() as { port: number }).port;
        this.log.log(`listening on ${bind}:${at}`);
        resolve(at);
      });
    });
  }

  onModuleDestroy() {
    this.server?.close();
  }

  private welcome(client: Connection, ip: string) {
    // A door on the internet gets knocked on all day. Whoever knocks too much just isn't answered.
    if (this.connections >= CONNECTIONS_AT_ONCE || !this.perAddress.take(ip)) {
      client.on("error", () => undefined);
      client.end();
      return;
    }
    this.connections++;
    const timer = setTimeout(() => client.end(), AUTH_TIMEOUT_MS);
    let who: { userId: string; houseId: string; room: string } | null = null;

    client.on("error", () => undefined);
    client.on("close", () => {
      clearTimeout(timer);
      this.connections--;
    });
    client.on("authentication", (ctx) => {
      void this.check(ctx)
        .then((found) => {
          if (found === "ask") return ctx.accept();
          if (!found) return ctx.reject(["publickey"]);
          who = found;
          ctx.accept();
        })
        .catch(() => ctx.reject(["publickey"]));
    });
    client.on("ready", () => {
      clearTimeout(timer);
      this.log.log(`${who!.userId} came in to ${who!.room}.${who!.houseId}`);
      // A connection nobody opens a shell on is only taking up a place.
      let shellsHere = 0;
      let unused = setTimeout(() => client.end(), NO_SHELL_MS);
      client.on("close", () => clearTimeout(unused));
      client.on("session", (accept) => {
        const session = accept();
        clearTimeout(unused);
        shellsHere++;
        session.once("close", () => {
          if (--shellsHere === 0) unused = setTimeout(() => client.end(), NO_SHELL_MS);
        });
        this.session(session, who!);
      });
    });
  }

  /**
   * "ask": the key could open this room, so the client may sign with it. It signs, and then who they are. Null: no.
   * An unknown room and a wrong key look the same from outside.
   */
  private async check(ctx: AuthContext): Promise<{ userId: string; houseId: string; room: string } | "ask" | null> {
    if (ctx.method !== "publickey") return null;
    const door = parseLogin(ctx.username);
    if (!door) return null;
    const offered = ctx.key.data;
    const keys = await this.ssh.keysFor(door.houseId, door.room);
    const match = keys.find((k) => Buffer.from(k.publicKey.split(" ")[1], "base64").equals(offered));
    if (!match) return null;
    if (!ctx.signature) return "ask";
    const key = utils.parseKey(match.publicKey);
    if (key instanceof Error || Array.isArray(key) || key.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) !== true) return null;
    return { userId: match.userId, ...door };
  }

  private session(session: Session, who: { userId: string; houseId: string; room: string }) {
    let tty: { term: string; cols: number; rows: number } | undefined;
    let shell: Shell | null = null;

    session.on("pty", (accept, _reject, info) => {
      // ssh2 passes the terminal's name along, though its types leave it out.
      const term = (info as { term?: string }).term ?? "";
      tty = { term: term.replace(/[^\w.+-]/g, "").slice(0, 64) || "xterm", cols: clamp(info.cols), rows: clamp(info.rows) };
      accept?.();
    });
    session.on("window-change", (accept, _reject, info) => {
      accept?.();
      shell?.resize(clamp(info.cols), clamp(info.rows));
    });
    const start = (channel: ServerChannel, command?: string) => {
      shell = this.run(channel, who, tty, command);
    };
    session.on("shell", (accept) => start(accept()));
    session.on("exec", (accept, _reject, info) => start(accept(), info.command));
    // Everything else, it says no to: subsystems (sftp), and the rest ssh2 refuses by itself when nobody listens.
    session.on("subsystem", (_accept, reject) => reject());
  }

  private run(channel: ServerChannel, who: { userId: string; houseId: string; room: string }, tty: { term: string; cols: number; rows: number } | undefined, command?: string): Shell | null {
    const say = (text: string, code: number) => {
      channel.stderr.write(text);
      end(code);
    };
    let ended = false;
    let idle: NodeJS.Timeout | undefined;
    let recheck: NodeJS.Timeout | undefined;
    let shell: Shell | null = null;
    const end = (code: number) => {
      if (ended) return;
      ended = true;
      clearTimeout(idle);
      clearInterval(recheck);
      if (shell) this.count(who.userId, -1);
      channel.exit(code);
      channel.end();
    };
    if (this.count(who.userId, 0) >= SHELLS_PER_PERSON || [...this.openShells.values()].reduce((a, b) => a + b, 0) >= SHELLS_PER_SERVER) {
      say(TOO_MANY, 1);
      return null;
    }
    const touched = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        channel.stderr.write(IDLE);
        shell?.close();
        end(0);
      }, IDLE_MS);
      idle.unref();
    };
    try {
      shell = this.shells.open(who.houseId, who.room, { command, tty }, {
        output: (data, stderr) => {
          if (ended) return;
          touched();
          // Told once it has really gone out: a slow connection slows the command down, and nothing piles up here.
          (stderr ? channel.stderr : channel).write(data, () => shell?.ack(data.length));
        },
        exit: (code, reason) => {
          if (reason === "not_running") return say(NOT_RUNNING, 1);
          if (reason === "failed") return say(FAILED, 1);
          if (reason === "gone") return say(LOST, 1);
          end(code ?? 0);
        },
      }, who.userId);
    } catch {
      say(OFFLINE, 1);
      return null;
    }
    this.count(who.userId, 1);
    touched();
    recheck = setInterval(() => {
      void this.ssh
        .mayStay(who.houseId, who.room, who.userId)
        .then((stays) => {
          if (stays) return;
          channel.stderr.write(MOVED_OUT);
          shell?.close();
          end(1);
        })
        .catch(() => undefined);
    }, RECHECK_MS);
    recheck.unref();
    channel.on("data", (data: Buffer) => {
      touched();
      shell?.input(data);
    });
    channel.on("end", () => shell?.eof());
    channel.on("close", () => {
      shell?.close();
      end(0);
    });
    return shell;
  }

  private count(userId: string, by: number): number {
    const n = (this.openShells.get(userId) ?? 0) + by;
    if (n > 0) this.openShells.set(userId, n);
    else this.openShells.delete(userId);
    return n;
  }
}

const clamp = (n: number) => Math.min(1000, Math.max(1, Math.round(n) || 1));
