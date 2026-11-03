// What's in a room, without going in: its kept files and what's running, for the room page. A small script runs inside
// the container, as the room's own user, using only /proc and what any image with a shell has. No `ps` or `ss` needed.
//
// The room answers about itself, so a room can lie: all of this only ever goes to its own people, as plain text, and
// nothing here decides anything for anyone else. Everything is cut to size on the way out (the protocol checks again).
import type { Inside, RoomEntry, RoomInside, RoomProcess } from "@coloc/protocol";
import type { AgentConfig } from "./config";
import { docker, readExec, roomContainers } from "./docker";
import { routedTo, routeTo } from "./proxy";
import { LABEL, PROJECT_LINK, roomHomeOf } from "./room-spec";

const MAX_ENTRIES = 40;
const MAX_RUNNING = 30;
// Named, so a look doesn't list itself, or the one before it.
const OWN_NAME = "coloc-look";

// What a folder holds, in the order that says the most. A Dockerfile says less than a package.json next to it.
const STACKS: [string, string][] = [
  ["package.json", "node"],
  ["requirements.txt", "python"],
  ["pyproject.toml", "python"],
  ["go.mod", "go"],
  ["Cargo.toml", "rust"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
  ["pom.xml", "java"],
  ["build.gradle", "java"],
  ["Dockerfile", "docker"],
  ["index.html", "website"],
  [".git", "git"],
];

// One line per fact, tagged by its first letter. U: disk used. E: a thing in the folder. N: how many there are. L: a port
// listening. P: a process (its session tells the project's from what someone started: `docker exec` opens a new one). S:
// a socket a process holds, which ties a port to who's listening.
export const LOOK = [
  'h=$1',
  'if [ -n "$h" ] && [ -d "$h" ]; then',
  '  set -- $(du -sk "$h" 2>/dev/null); printf \'U\\t%s\\n\' "${1:-0}"',
  '  n=0',
  '  for f in "$h"/*; do',
  '    [ -e "$f" ] || [ -L "$f" ] || continue',
  '    n=$((n+1)); [ "$n" -gt ' + MAX_ENTRIES + ' ] && continue',
  '    t=f; k=; m=',
  '    if [ -L "$f" ]; then t=l; else [ -d "$f" ] && t=d; set -- $(du -sk "$f" 2>/dev/null); k=${1:-}; fi',
  `    if [ -d "$f" ]; then for x in ${STACKS.map(([file]) => file).join(" ")}; do [ -e "$f/$x" ] && m="$m $x"; done; fi`,
  '    printf \'E\\t%s\\t%s\\t%s\\t%s\\n\' "$t" "$k" "$m" "${f##*/}"',
  '  done',
  '  printf \'N\\t%s\\n\' "$n"',
  'fi',
  'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | while read -r _ l _ st _ _ _ _ _ i _; do [ "$st" = 0A ] && printf \'L\\t%s\\t%s\\n\' "$l" "$i"; done',
  'for d in /proc/[0-9]*; do',
  '  p=${d##*/}; [ "$p" = "$$" ] && continue',
  '  { read -r s < "$d/stat"; } 2>/dev/null || continue',
  '  c=${s#*\\(}; c=${c%\\)*}',
  '  set -- ${s##*) }',
  '  [ "$1" = Z ] && continue',
  '  printf \'P\\t%s\\t%s\\t%s\\t\' "$p" "$4" "$c"',
  '  head -c 400 "$d/cmdline" 2>/dev/null',
  '  printf \'\\n\'',
  '  ls -l "$d/fd" 2>/dev/null | while read -r l; do case $l in *socket:*) printf \'S\\t%s\\t%s\\n\' "$p" "${l##*socket:}";; esac; done',
  'done',
].join("\n");

// Control characters and all: what comes back is the room's to write, and it should read as one short line.
const tidy = (text: string, max: number) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, max);
const base = (arg: string) => arg.slice(arg.lastIndexOf("/") + 1);
const SHELLS = new Set(["sh", "ash", "dash", "bash", "zsh", "fish"]);

/**
 * What to call a process: `node server.js`, `python3 -m http.server`, `npm run dev`. It stops at the first flag or
 * setting, which is where a command line starts holding things like tokens.
 */
export function commandName(args: string[], fallback: string): string {
  if (!args.length) return tidy(fallback, 80);
  const words = [base(args[0])];
  for (const arg of args.slice(1)) {
    if (words.length >= 3) break;
    if (arg === "-m" && words.length === 1) words.push(arg);
    else if (arg.startsWith("-") || arg.includes("=")) break;
    else words.push(arg.includes("/") ? base(arg) : arg);
  }
  return tidy(words.join(" "), 80);
}

// A shell someone is typing in, or one that only ran a command, says nothing about what's running. A script does.
const justAShell = (args: string[]) => SHELLS.has(base(args[0] ?? "").replace(/^-/, "")) && (args.length < 2 || args[1].startsWith("-"));

// An address only the room itself can reach. /proc writes them backwards: 0100007F is 127.0.0.1.
const isLocal = (hex: string) => /^[0-9A-F]{6}7F$/.test(hex) || hex === "00000000000000000000000001000000";

interface Process {
  pid: string;
  session: string;
  comm: string;
  args: string[];
}

function parseEntry(fields: string[]): RoomEntry | null {
  const [type, kb, marks, ...name] = fields;
  const title = tidy(name.join("\t"), 255);
  if (!title || !["f", "d", "l"].includes(type)) return null;
  const found = marks.split(" ");
  const size = Number(kb);
  return {
    name: title,
    kind: type === "d" ? "folder" : type === "l" ? "link" : "file",
    ...(kb && Number.isSafeInteger(size) && size >= 0 ? { kb: size } : {}),
    ...(found.length ? { stack: STACKS.find(([file]) => found.includes(file))?.[1] } : {}),
    ...(type === "l" && title === PROJECT_LINK ? { project: true } : {}),
  };
}

/** Reads what the script printed. Null: it didn't run (the image has no shell), which leaves no process in the answer. */
export function parseLook(text: string, home: string | undefined, limitMb: number | undefined): Pick<RoomInside, "home" | "running"> | null {
  let usedKb = 0;
  let count = 0;
  const entries: RoomEntry[] = [];
  const ports = new Map<string, { port: number; localOnly: boolean }>();
  const processes = new Map<string, Process>();
  const sockets = new Map<string, string>();

  for (const line of text.split("\n")) {
    const fields = line.split("\t");
    const tag = fields.shift();
    if (tag === "U") usedKb = Number(fields[0]) || 0;
    else if (tag === "N") count = Number(fields[0]) || 0;
    else if (tag === "E" && fields.length >= 4 && entries.length < MAX_ENTRIES) {
      const entry = parseEntry(fields);
      if (entry) entries.push(entry);
    } else if (tag === "L" && fields.length === 2) {
      const [address, inode] = fields;
      const [ip, hex] = address.split(":");
      const port = parseInt(hex, 16);
      if (port >= 1 && port <= 65535) ports.set(inode, { port, localOnly: isLocal(ip) });
    } else if (tag === "P" && fields.length >= 3) {
      const [pid, session, comm, ...rest] = fields;
      const args = rest.join("\t").split("\0").filter(Boolean);
      if (!args.includes(OWN_NAME)) processes.set(pid, { pid, session, comm, args });
    } else if (tag === "S" && fields.length === 2) {
      const inode = /^\[(\d+)\]/.exec(fields[1])?.[1];
      if (inode && processes.has(fields[0])) sockets.set(inode, fields[0]);
    }
  }
  if (!processes.size) return null;

  // v4 and v6 of one port are one thing, and it's only local if every way in is.
  const listening = new Map<number, { localOnly: boolean; pid?: string }>();
  for (const [inode, p] of ports) {
    const known = listening.get(p.port);
    listening.set(p.port, { localOnly: (known?.localOnly ?? true) && p.localOnly, pid: known?.pid ?? sockets.get(inode) });
  }

  const projectSession = processes.get("1")?.session;
  const started = (p: Process | undefined) => !!p && p.session !== projectSession;
  const running: RoomProcess[] = [];
  const named = (p: Process) => commandName(p.args, p.comm);
  for (const [port, l] of [...listening].sort((a, b) => a[0] - b[0])) {
    const p = l.pid ? processes.get(l.pid) : undefined;
    running.push({ command: p ? named(p) : null, port, ...(l.localOnly ? { localOnly: true } : {}), started: started(p) });
  }
  // Without a port: all that someone started, and of the project's own, only its main program when nothing else shows it.
  const listed = new Set([...listening.values()].map((l) => l.pid));
  const seen = new Set<string>();
  for (const p of processes.values()) {
    if (!started(p) || listed.has(p.pid) || justAShell(p.args)) continue;
    const command = named(p);
    if (seen.has(command)) continue;
    seen.add(command);
    running.push({ command, started: true });
  }
  const main = processes.get("1");
  if (main && !running.some((r) => !r.started)) running.unshift({ command: named(main), started: false });

  return {
    home: home ? { path: home, usedKb, ...(limitMb ? { limitMb } : {}), entries, more: Math.max(0, count - entries.length) } : null,
    running: running.slice(0, MAX_RUNNING),
  };
}

type Found = Pick<Inside, "inside" | "error">;

async function runningContainer(cfg: AgentConfig, room: string) {
  const running = (await roomContainers(cfg.houseId, room, "prod")).filter((c) => c.State === "running");
  return running.sort((a, b) => b.Created - a.Created)[0];
}

export async function lookInside(cfg: AgentConfig, room: string): Promise<Found> {
  const c = await runningContainer(cfg, room);
  if (!c) return { error: "not_running" };
  const home = roomHomeOf(c.Mounts);
  const text = await readExec(docker.getContainer(c.Id), ["/bin/sh", "-c", LOOK, OWN_NAME, home ?? ""]);
  const found = parseLook(text, home, cfg.roomDiskMb);
  if (!found) return { error: "no_shell" };
  const projectPort = Number(c.Labels[LABEL.port]) || null;
  return { inside: { ...found, projectPort, addressPort: (await routedTo(cfg, room, "prod"))?.port ?? projectPort } };
}

/**
 * Sends the room's address to a port someone started something on. Only a port that's really listening, and only to the
 * room's own container: a room can't lead anywhere but into itself. A deploy or a restart ends it (proxy.ts).
 */
export async function setAddress(cfg: AgentConfig, room: string, port: number): Promise<Found> {
  const found = await lookInside(cfg, room);
  if (!found.inside) return found;
  if (!found.inside.running.some((r) => r.port === port && !r.localOnly)) return { error: "not_listening" };
  const c = await runningContainer(cfg, room);
  if (!c) return { error: "not_running" };
  await routeTo(cfg, room, "prod", c.Names[0].replace(/^\//, ""), port);
  return { inside: { ...found.inside, addressPort: port } };
}
