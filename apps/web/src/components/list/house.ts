// The parts of a house's page in the list view that the lobby's house panel doesn't carry: the rooms at work
// (memory, CPU, reviews, and the chef's way into any room), the builds, the knocks with their votes, and a few
// facts about the house. Worked out from the house view alone, so they're easy to test.
import type { HouseView, Room, Viewer } from "../../types";
import type { IconName } from "../lobby/house/icons";
import { evenSplit, fcfa } from "../lobby/house/server";
import { explain } from "../lobby/panel/words";
import { memoryUse } from "../room/room";

// Sentences only this page says. words.ts holds the shared ones; these stay here until the lead moves them.
export const listWords = {
  work: "What each project is using of its room right now.",
  builds: "Every time a room was built, newest first.",
  door: "Someone asked for a free room. Read their note, then vote.",
  about: "Who runs it, where its projects live, and what it costs.",
  address: "Each room's project gets its own address under it.",
  flatmatesOnly: "The channel, chores, fridge, bill and builds open to the people who live here.",
} as const;

/** The chef can open any lived-in room of a live house to manage it; their own room is already the foot's button. */
export function chefCanManage(room: Pick<Room, "name" | "occupant" | "demo">, viewer: Viewer | null, status: HouseView["status"]): boolean {
  return !!room.occupant && !room.demo && status === "live" && viewer?.role === "chef" && viewer.room !== room.name;
}

export interface WorkRow {
  room: Room;
  memory: { mb: number; pct: number } | null;
  // CPU in use, as a percentage of one core, with one decimal; null when nothing is measured.
  cpu: string | null;
  given: number;
  received: number;
  manage: boolean;
}

/** One row per lived-in room, in the house's order. Nothing runs in a house that's still being set up, or in an
 *  example house: no rows. Nor when the rows would say nothing (nothing measured, no reviews, nothing to manage). */
export function workRows(house: Pick<HouseView, "rooms" | "ledger" | "status" | "demo">, viewer: Viewer | null): WorkRow[] {
  if (house.status === "making" || house.demo) return [];
  const rows = house.rooms
    .filter((r) => r.occupant)
    .map((room) => {
      const l = house.ledger.find((x) => x.login === room.occupant!.login);
      return {
        room,
        memory: memoryUse(room.usage),
        cpu: room.usage ? room.usage.cpuPercent.toFixed(1) : null,
        given: l?.given ?? 0,
        received: l?.received ?? 0,
        manage: chefCanManage(room, viewer, house.status),
      };
    });
  return rows.some((r) => r.memory || r.manage || r.given || r.received) ? rows : [];
}

/** A work row's line: what it uses of its share, or just the share when nothing is measured. */
export function workLine(w: Pick<WorkRow, "memory" | "cpu" | "room">): string {
  const { memoryMb, cpus } = w.room.limits;
  if (!w.memory) return `${memoryMb} MB and ${cpus} CPU. Nothing measured yet.`;
  return `${w.memory.mb} of ${memoryMb} MB · ${w.cpu}% CPU`;
}

/** "2 of 3 yes": a knock's vote so far. */
export const tallyLine = (t: { yes: number; needed: number }) => `${t.yes} of ${t.needed} yes`;

/** The room a build was for, as people know it: whoever lives there, else the room's name. */
export function roomLabel(house: Pick<HouseView, "rooms">, name: string): string {
  const r = house.rooms.find((x) => x.name === name);
  return r?.occupant ? (r.occupant.name ?? r.occupant.login) : `Room ${name}`;
}

export interface Fact {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
}

/** A few facts about the house, one row each. The review rule isn't one: the panel's head shows it. The rent shows
 *  to those who don't live here (flatmates have the bill). */
export function houseFacts(house: Pick<HouseView, "chef" | "domain" | "monthlyCostFcfa" | "rooms" | "ledger" | "status" | "demo" | "viewer">): Fact[] {
  const facts: Fact[] = [];
  const member = !!house.viewer?.member;
  if (house.chef) facts.push({ key: "chef", icon: "crown", title: `${house.chef.name ?? house.chef.login} is the chef`, sub: explain.chef });
  if (!house.demo) facts.push({ key: "address", icon: "link", title: `*.${house.domain}`, sub: listWords.address });
  if (!member && house.monthlyCostFcfa)
    facts.push({ key: "rent", icon: "bill", title: `About ${fcfa(evenSplit(house.monthlyCostFcfa, house.rooms.length))} a room, a month`, sub: explain.bill });
  const reviews = house.ledger.reduce((n, l) => n + l.given, 0);
  if (reviews > 0) facts.push({ key: "reviews", icon: "check", title: `${reviews} ${reviews === 1 ? "review" : "reviews"} between flatmates`, sub: "Every pull request gets a flatmate, in turn." });
  if (!member) facts.push({ key: "flatmates", icon: "lock", title: "The rest is for flatmates", sub: listWords.flatmatesOnly });
  return facts;
}
