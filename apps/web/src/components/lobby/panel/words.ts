// The words the lobby's panels use for things, in one place: what each thing is called and the one plain sentence
// that says what it is or does. The house, the room, the knock and the tutorial all read from here, so a room is
// explained the same way wherever you meet it. Keep each sentence short enough for one line in a panel.
import type { HouseStatus, Room, RoomStatus } from "../../../types";

export const explain = {
  house: "A server a few devs rent together. Each of them gets a room on it.",
  chef: "The chef started the house and rents its server.",
  room: (memoryMb: number, cpus: number) => `Your share of the house's server: ${memoryMb} MB of memory and ${cpus} CPU, for one project.`,
  rooms: "Each row is a room: one person's project, running on this house's server.",
  project: "The app in a room: a site, an API, a bot. Its code comes from a Git repo.",
  online: "We fetch the code, build it, and start it at the room's address.",
  address: "Anyone with the address can open the project.",
  knock: "Ask for a free room. The flatmates vote, and a majority lets you in.",
  // A knock's thread, said to whoever reads it.
  knockYours: "The flatmates read your note and vote. A majority lets you in.",
  knockTheirs: "Read their note and what they've built, then vote. A majority lets them in.",
  channel: "The house's group chat.",
  chores: "Pull requests a flatmate asked you to review.",
  fridge: "Notes the server pins when something needs a look.",
  bill: "What the server costs a month, split by use. Each review you do takes some off your share.",
  code: "Where the code comes from, and how it starts.",
  secrets: "Passwords and API keys your app reads. Hidden once saved.",
  logs: "What your app printed lately.",
  history: "Every time this room was built, newest first.",
  update: "Get the latest code and put it online again.",
  firstOnline: "Fetch the code, build it, and put it online.",
  restart: "Switch the app off and on. Same code.",
} as const;

// A state: its tone (the colour of its dot) and a word or two for the dot's hidden name. The visible words are
// always a sentence around it (see roomLine and houseLine below): no pill says "Online" on its own.
export type Tone = "live" | "warn" | "danger" | "free" | "neutral";
export interface State {
  tone: Tone;
  word: string;
}

const ROOM: Record<RoomStatus, State> = {
  live: { tone: "live", word: "Online" },
  deploying: { tone: "warn", word: "Building" },
  down: { tone: "danger", word: "Stopped" },
  failed: { tone: "danger", word: "Build failed" },
  empty: { tone: "neutral", word: "Not online yet" },
};

/** A room's state. A free room is free; in a house still being made nothing can run yet; an example room (or any
 *  room of an example house) is an example, never "Online", since nothing runs there. */
export function roomState(room: Pick<Room, "status" | "occupant"> & { demo?: boolean }, house: HouseStatus = "live", demoHouse = false): State {
  if (!room.occupant) return { tone: "free", word: "Free" };
  if (room.demo || demoHouse) return { tone: "neutral", word: "Example project" };
  if (house === "making") return { tone: "warn", word: "Waiting for server" };
  return ROOM[room.status] ?? ROOM.empty;
}

// The same states as the start of a sentence, for a room's row: "Online.", "An example project."
const ROOM_LINE: Record<RoomStatus, string> = {
  live: "Online.",
  deploying: "Building now.",
  down: "Stopped.",
  failed: "Its last build failed.",
  empty: "Not online yet.",
};

/** A lived-in room's state as the first words of its row's line. */
export function roomLine(room: Pick<Room, "status" | "occupant"> & { demo?: boolean }, house: HouseStatus = "live", demoHouse = false): string {
  if (!room.occupant) return "Free.";
  if (room.demo || demoHouse) return "An example project.";
  if (house === "making") return "Waits for the server.";
  return ROOM_LINE[room.status] ?? ROOM_LINE.empty;
}

/** A house's state. A demo house has no server at all: it's an example, not a house whose server is down. */
export function houseState(status: HouseStatus, agentOnline: boolean, demo = false): State {
  if (demo) return { tone: "neutral", word: "Example house" };
  if (status === "making") return { tone: "warn", word: "Setting up" };
  return agentOnline ? { tone: "live", word: "Server running" } : { tone: "danger", word: "Server down" };
}

/** A house's state in a sentence, with where it is: "Dakar. Its server is running." An example house says so once,
 *  here, in words. */
export function houseLine(h: { city: string; status: HouseStatus; agentOnline: boolean; demo: boolean }): string {
  if (h.demo) return `${h.city}. An example house, to show how one looks.`;
  if (h.status === "making") return `${h.city}. Still being set up.`;
  return h.agentOnline ? `${h.city}. Its server is running.` : `${h.city}. Its server is down for now.`;
}

/** "jib.coloc.localhost" from "http://jib.coloc.localhost:8000/": an address as people read it. */
export const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
