// Whether a room's app can actually be reached on its port. A container that stays up isn't enough: an app that listens
// on localhost only, or on another port, stays up while every visitor gets an error. The kernel lists a container's
// sockets in /proc/<its pid>/net/tcp and tcp6, readable from the machine without anything inside the container.
// On a Mac, Docker runs in a VM and those files aren't there: then we don't know, and don't hold the deploy up.
import { readFile } from "node:fs/promises";

export interface Listener {
  port: number;
  // Only from inside the container (127.x, ::1): the proxy can't reach it.
  loopback: boolean;
}

const LISTEN = "0A";

/** The listening sockets in one /proc/net/tcp or tcp6 file. Addresses are hex, little-endian per 32-bit word. */
export function parseProcNet(text: string): Listener[] {
  const out: Listener[] = [];
  for (const line of text.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[3] !== LISTEN) continue;
    const [addr, portHex] = cols[1].split(":");
    if (!addr || !portHex) continue;
    // IPv4 127.x.x.x is "..7F" (the last byte printed last); IPv6 ::1 is one word of 01000000; ::ffff:127.x ends like IPv4.
    const loopback = addr.length === 8 ? addr.endsWith("7F") : addr === "00000000000000000000000001000000" || (addr.startsWith("0000000000000000FFFF0000") && addr.endsWith("7F"));
    out.push({ port: parseInt(portHex, 16), loopback });
  }
  return out;
}

/** The container's listening sockets, or null when they can't be read (no such process, or not Linux). */
export async function listenersOf(pid: number): Promise<Listener[] | null> {
  if (!pid) return null;
  try {
    const [v4, v6] = await Promise.all([readFile(`/proc/${pid}/net/tcp`, "utf8"), readFile(`/proc/${pid}/net/tcp6`, "utf8").catch(() => "")]);
    return [...parseProcNet(v4), ...parseProcNet(v6)];
  } catch {
    return null;
  }
}

export type Reachability = { ok: true } | { ok: false; why: "loopback" | "otherPort" | "nothing"; others: number[] };

/** Can the proxy reach `port`? If not, why, and which ports the app does listen on for everyone. */
export function reachability(listeners: Listener[], port: number): Reachability {
  if (listeners.some((l) => l.port === port && !l.loopback)) return { ok: true };
  const others = [...new Set(listeners.filter((l) => !l.loopback && l.port !== port).map((l) => l.port))].sort((a, b) => a - b);
  if (listeners.some((l) => l.port === port)) return { ok: false, why: "loopback", others };
  return { ok: false, why: others.length ? "otherPort" : "nothing", others };
}

/** What a failed check says, in the build log: what's wrong, and what to change. */
export function unreachableMessage(r: Exclude<Reachability, { ok: true }>, port: number): string {
  if (r.why === "loopback") return `listens on localhost only, port ${port}, so visitors can't reach it. Make it listen on 0.0.0.0 (often HOST=0.0.0.0).`;
  if (r.why === "otherPort") return `listens on port ${r.others.join(", ")}, not ${port}. Set the room's port to ${r.others[0]}, or make the app use ${port}.`;
  return `nothing listens on port ${port}. Make the app listen on 0.0.0.0:${port}, or set the room's port to the one it uses.`;
}
