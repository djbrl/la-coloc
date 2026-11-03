// Can visitors reach the app? Read from the container's own socket list, the way the kernel prints it.
import { describe, expect, it } from "vitest";
import { parseProcNet, reachability, unreachableMessage } from "./listening";

const HEAD = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n";
const v4 = (addr: string, port: number, st = "0A") => `   0: ${addr}:${port.toString(16).toUpperCase().padStart(4, "0")} 00000000:0000 ${st} 00000000:00000000 00:00000000 00000000     0        0 1 1\n`;

describe("a container's listening sockets", () => {
  it("reads ports and tells localhost apart, in IPv4 and IPv6, skipping connections", () => {
    const tcp = HEAD + v4("0B00007F", 37467) + v4("00000000", 8080) + v4("0100007F", 3000) + v4("0200A8C0", 4000) + v4("00000000", 5000, "01");
    expect(parseProcNet(tcp)).toEqual([
      { port: 37467, loopback: true },
      { port: 8080, loopback: false },
      { port: 3000, loopback: true },
      { port: 4000, loopback: false },
    ]);
    const tcp6 = HEAD + v4("00000000000000000000000000000000", 3000) + v4("00000000000000000000000001000000", 3001) + v4("0000000000000000FFFF00000100007F", 3002);
    expect(parseProcNet(tcp6)).toEqual([
      { port: 3000, loopback: false },
      { port: 3001, loopback: true },
      { port: 3002, loopback: true },
    ]);
  });
});

describe("whether visitors can reach the app", () => {
  // Docker's own name server always listens on 127.0.0.11 inside: never a reason, never a suggestion.
  const dns = { port: 37467, loopback: true };

  it("is fine when it listens on the room's port for everyone", () => {
    expect(reachability([dns, { port: 3000, loopback: false }], 3000)).toEqual({ ok: true });
  });

  it("says localhost only, like `nuxt dev`", () => {
    const r = reachability([dns, { port: 3000, loopback: true }], 3000);
    expect(r).toEqual({ ok: false, why: "loopback", others: [] });
    expect(unreachableMessage(r as never, 3000)).toMatch(/0\.0\.0\.0/);
  });

  it("names the port it does use", () => {
    const r = reachability([dns, { port: 8080, loopback: false }], 3000);
    expect(r).toEqual({ ok: false, why: "otherPort", others: [8080] });
    expect(unreachableMessage(r as never, 3000)).toMatch(/port 8080, not 3000/);
  });

  it("says nothing listens when nothing does", () => {
    expect(reachability([dns], 3000)).toEqual({ ok: false, why: "nothing", others: [] });
  });
});
