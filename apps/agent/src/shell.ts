// A shell inside a room's running app, for SSH (apps/api/src/ssh). It's `docker exec`: the same container, so the same
// walls. Same user, same disk, same memory and process limits, nothing of the server to see. The bytes only pass through
// here, and they aren't kept or logged.
import type { AgentToApi, ShellOpen } from "@coloc/protocol";
import { PassThrough, type Duplex } from "node:stream";
import { docker, roomContainers } from "./docker";
import { ROOM_HOME, roomFilter } from "./room-spec";

// How much output can be on its way to the person before a very chatty command is made to wait for them: it's on the
// other side of a slow connection, and nothing in between should hold more than this.
const MAX_ON_THE_WAY_BYTES = 1024 * 1024;
const RESUME_BELOW_BYTES = 256 * 1024;
const CHUNK_BYTES = 48 * 1024;
// What someone can pour in faster than the command reads it, before the shell is closed.
const MAX_UNREAD_INPUT_BYTES = 16 * 1024 * 1024;

// `ssh` itself tells the two apart: an interactive shell (bash if the image has it), or one command. Either way the
// shell first writes down its own number, because closing the line doesn't stop what `docker exec` started.
export const shellCommand = (shellId: string, command?: string): string[] => {
  const body = command ?? "command -v bash >/dev/null 2>&1 && exec bash || exec sh";
  return ["/bin/sh", "-c", `echo $$ > ${pidFile(shellId)}; exec /bin/sh -c "$1"`, "shell", body];
};
export const pidFile = (shellId: string) => `/tmp/.coloc-shell-${shellId.replace(/[^a-zA-Z0-9-]/g, "")}`;
// Leaving hangs up, as on any server: what it started stops, unless the person asked otherwise (`nohup`, `tmux`).
const HANG_UP = 'kill -HUP -- "-$p" 2>/dev/null; kill -HUP "$p" 2>/dev/null';
// After a crash: whatever earlier shells left behind, in a container nobody's in any more.
export const STOP_ALL = ["/bin/sh", "-c", `for f in /tmp/.coloc-shell-*; do [ -f "$f" ] || continue; p=$(cat "$f"); rm -f "$f"; ${HANG_UP}; done; exit 0`];
export const stopCommand = (shellId: string): string[] => {
  const f = pidFile(shellId);
  return ["/bin/sh", "-c", `p=$(cat ${f} 2>/dev/null); rm -f ${f}; [ -n "$p" ] || exit 0; ${HANG_UP}; exit 0`];
};

interface Open {
  containerId: string;
  stream: Duplex;
  exec: Awaited<ReturnType<ReturnType<typeof docker.getContainer>["exec"]>>;
  tty: boolean;
  onTheWay: number;
  // Docker's words instead of the shell's: it couldn't start one.
  noShell: boolean;
}

export class Shells {
  private open = new Map<string, Open>();
  // Still starting: what's been said to it so far. A pipe (`cat file | ssh room ...`) doesn't wait for a shell to be ready.
  private starting = new Map<string, { left: boolean; said: ((shell: Open) => void)[] }>();

  constructor(
    private readonly houseId: string,
    private readonly send: (msg: AgentToApi) => void,
  ) {}

  async start(cmd: ShellOpen): Promise<void> {
    const { shellId } = cmd;
    const waiting = { left: false, said: [] as ((shell: Open) => void)[] };
    this.starting.set(shellId, waiting);
    const exit = (msg: { code?: number; reason?: "not_running" | "failed" }) => this.send({ type: "shell_exit", shellId, ...msg });
    try {
      const running = (await roomContainers(this.houseId, cmd.room, "prod")).find((c) => c.State === "running");
      if (!running) return exit({ reason: "not_running" });
      const container = docker.getContainer(running.Id);
      const tty = !!cmd.tty;
      const exec = await container.exec({
        Cmd: shellCommand(shellId, cmd.command),
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: tty,
        // Where its kept files are, or else the only place it can write, so history and the like have somewhere to go.
        Env: [`HOME=${running.Mounts?.some((m) => m.Destination === ROOM_HOME) ? ROOM_HOME : "/tmp"}`, ...(cmd.tty ? [`TERM=${cmd.tty.term}`] : [])],
      });
      // ConsoleSize: a command as quick as `stty size` must already see the right one. A resize that early comes too late.
      const size = cmd.tty ? { ConsoleSize: [cmd.tty.rows, cmd.tty.cols] } : {};
      const stream = (await exec.start({ hijack: true, stdin: true, Tty: tty, ...size })) as unknown as Duplex;
      this.open.set(shellId, { containerId: running.Id, stream, exec, tty, onTheWay: 0, noShell: false });
      this.relay(shellId, stream, tty);
      for (const say of waiting.said) say(this.open.get(shellId)!);
      if (waiting.left) await this.close(shellId);
    } catch (e) {
      console.error(`[shell] ${cmd.room}: ${(e as Error).message}`);
      this.open.delete(shellId);
      exit({ reason: "failed" });
    } finally {
      this.starting.delete(shellId);
    }
  }

  input(shellId: string, data: string) {
    this.when(shellId, (shell) => {
      shell.stream.write(Buffer.from(data, "base64"));
      if (shell.stream.writableLength > MAX_UNREAD_INPUT_BYTES) shell.stream.destroy();
    });
  }

  eof(shellId: string) {
    // A terminal hears the end of its input as Ctrl-D, as it would from a keyboard. Closing the stream would cut its output.
    this.when(shellId, (shell) => (shell.tty ? shell.stream.write("\x04") : shell.stream.end()));
  }

  // Now, or as soon as it has started.
  private when(shellId: string, say: (shell: Open) => void) {
    const shell = this.open.get(shellId);
    if (shell) say(shell);
    else this.starting.get(shellId)?.said.push(say);
  }

  ack(shellId: string, bytes: number) {
    const shell = this.open.get(shellId);
    if (!shell) return;
    shell.onTheWay = Math.max(0, shell.onTheWay - bytes);
    if (shell.onTheWay < RESUME_BELOW_BYTES && shell.stream.isPaused()) shell.stream.resume();
  }

  resize(shellId: string, cols: number, rows: number) {
    const shell = this.open.get(shellId);
    if (shell?.tty) void shell.exec.resize({ w: cols, h: rows }).catch(() => undefined);
  }

  /** The person left. Nobody's waiting for an answer, only for it to stop. */
  async close(shellId: string): Promise<void> {
    const waiting = this.starting.get(shellId);
    if (waiting) waiting.left = true;
    const shell = this.open.get(shellId);
    if (!shell) return;
    this.open.delete(shellId);
    shell.stream.destroy();
    await this.stop(shellId, shell.containerId);
  }

  /** The line to the API dropped: it has forgotten these shells, so nobody can reach them any more. */
  closeAll() {
    for (const id of [...this.open.keys()]) void this.close(id);
  }

  /** When the caretaker starts: the one before it may have died with shells open, and nobody will close them now. */
  async sweep(): Promise<void> {
    const rooms = await docker.listContainers({ filters: { label: roomFilter(this.houseId), status: ["running"] } });
    await Promise.all(
      rooms.map(async (c) => {
        const exec = await docker.getContainer(c.Id).exec({ Cmd: STOP_ALL, AttachStdout: false, AttachStderr: false });
        await exec.start({ Detach: true });
      }),
    ).catch(() => undefined);
  }

  private async stop(shellId: string, containerId: string) {
    try {
      const exec = await docker.getContainer(containerId).exec({ Cmd: stopCommand(shellId), AttachStdout: false, AttachStderr: false });
      await exec.start({ Detach: true });
    } catch {
      // The container has gone already, and everything inside it.
    }
  }

  private relay(shellId: string, stream: Duplex, tty: boolean) {
    const forward = (source: NodeJS.ReadableStream, stderr: boolean) => {
      source.on("data", (data: Buffer) => {
        const shell = this.open.get(shellId);
        if (!shell) return;
        if (data.includes("OCI runtime exec failed")) {
          shell.noShell = true;
          return;
        }
        for (let at = 0; at < data.length; at += CHUNK_BYTES) {
          const part = data.subarray(at, at + CHUNK_BYTES).toString("base64");
          this.send({ type: "shell_output", shellId, data: part, ...(stderr ? { stderr } : {}) });
        }
        shell.onTheWay += data.length;
        if (shell.onTheWay >= MAX_ON_THE_WAY_BYTES) stream.pause();
      });
    };
    if (tty) {
      forward(stream, false);
    } else {
      // Without a terminal Docker mixes stdout and stderr in one stream, with a header on each part.
      const out = new PassThrough();
      const err = new PassThrough();
      docker.modem.demuxStream(stream, out, err);
      forward(out, false);
      forward(err, true);
    }
    let over = false;
    const finished = () => {
      if (over) return;
      over = true;
      void this.finish(shellId);
    };
    stream.on("end", finished);
    stream.on("close", finished);
    stream.on("error", finished);
  }

  private async finish(shellId: string) {
    const shell = this.open.get(shellId);
    if (!shell) return;
    this.open.delete(shellId);
    let code: number | undefined;
    try {
      code = (await shell.exec.inspect()).ExitCode ?? undefined;
    } catch {
      // The container went while it ran: there's no number to give.
    }
    await this.stop(shellId, shell.containerId);
    if (shell.noShell) this.send({ type: "shell_exit", shellId, reason: "failed" });
    else this.send({ type: "shell_exit", shellId, ...(code === undefined ? {} : { code }) });
  }
}
