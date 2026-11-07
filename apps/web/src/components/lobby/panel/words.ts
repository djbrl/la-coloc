// The words the lobby's panels use for things, in one place: what each thing is called and the one plain sentence
// that says what it is or does. The house, the room, the knock and the tutorial all read from here, so a room is
// explained the same way wherever you meet it. Keep each sentence short enough for one line in a panel.
// Each sentence is written in English and in French (see i18n.ts): the French must have every key the English has.
import { defineWords, num } from "../../../i18n";
import type { HouseStatus, Room, RoomStatus } from "../../../types";

export const explain = defineWords(
  "explain",
  {
    house: "A server a few devs share. One room each.",
    chef: "The chef rents the server.",
    room: (memoryMb: number, cpus: number) => `${memoryMb} MB of memory, ${num(cpus)} CPU. One project.`,
    rooms: "One project per room.",
    project: "The app in a room, from a Git repo.",
    online: "We fetch the code, build it, start it.",
    address: "Anyone with the address can open it.",
    knock: "Ask for a free room. Flatmates vote.",
    // A knock's thread, said to whoever reads it.
    channel: "The house's group chat.",
    // The Reviews tab (the API's "chores") and the News tab (the API's "fridge"), told behind the panel's "?"
    // (Explain.vue): what it is and why it matters, in at most three short lines.
    chores: (credit: string) =>
      `Flatmates review your code, you review theirs. Each review earns you ${credit} in credit.`,
    fridge: "The house's notice board. It fills itself.",
    // The round "?" button that shows those lines.
    whatIsThis: "What is this?",
    bill: "Server cost per month, split by use. Reviews lower your share.",
    code: "Where the code comes from.",
    secrets: "Keys and passwords. Hidden once saved.",
    logs: "Recent output.",
    history: "Every build, newest first.",
    update: "Latest code, back online.",
    firstOnline: "Build it and put it online.",
    restart: "Off and on. Same code.",
  },
  {
    house: "Un serveur partagé par quelques devs. Une chambre chacun.",
    chef: "Le chef loue le serveur.",
    room: (memoryMb, cpus) => `${memoryMb} Mo de mémoire, ${num(cpus)} CPU. Un projet.`,
    rooms: "Un projet par chambre.",
    project: "L'app d'une chambre, depuis un dépôt Git.",
    online: "On récupère le code, on le construit, on le lance.",
    address: "Quiconque a l'adresse peut l'ouvrir.",
    knock: "Demandez une chambre libre. Les colocs votent.",
    channel: "La discussion de groupe de la maison.",
    chores: (credit) =>
      `Les colocs relisent votre code, vous relisez le leur. Chaque revue vous rapporte ${credit} de crédit.`,
    fridge: "Le tableau d'affichage de la maison. Il se remplit tout seul.",
    whatIsThis: "C'est quoi ?",
    bill: "Coût du serveur par mois, partagé selon l'usage. Les revues allègent votre part.",
    code: "D'où vient le code.",
    secrets: "Clés et mots de passe. Masqués une fois enregistrés.",
    logs: "Sorties récentes.",
    history: "Chaque construction, la plus récente en premier.",
    update: "Dernier code, remis en ligne.",
    firstOnline: "Le construire et le mettre en ligne.",
    restart: "Éteindre et rallumer. Même code.",
  },
);

// The states' words: a word or two for a dot's hidden name, and the same state as the start of a row's sentence.
const said = defineWords(
  "states",
  {
    room: { live: "Online", deploying: "Building", down: "Stopped", failed: "Build failed", empty: "Not online yet" },
    free: "Free",
    example: "Example project",
    waiting: "Waiting for server",
    line: { live: "Online.", deploying: "Building now.", down: "Stopped.", failed: "Its last build failed.", empty: "Not online yet." },
    freeLine: "Free.",
    exampleLine: "An example project.",
    waitingLine: "Waits for the server.",
    house: { example: "Example house", making: "Setting up", running: "Server running", down: "Server down" },
    houseLine: {
      example: (city: string) => `${city}. Example house.`,
      making: (city: string) => `${city}. Setting up.`,
      running: (city: string) => `${city}. Server running.`,
      down: (city: string) => `${city}. Server down.`,
    },
    // The same, without the city, for a house's own window (you know where you are): said only when it isn't fine.
    trouble: {
      example: "Example house.",
      making: "Setting up.",
      down: "Server down.",
    },
  },
  {
    room: { live: "En ligne", deploying: "En construction", down: "Arrêté", failed: "Échec de la construction", empty: "Pas encore en ligne" },
    free: "Libre",
    example: "Projet d'exemple",
    waiting: "En attente du serveur",
    line: { live: "En ligne.", deploying: "En construction.", down: "Arrêté.", failed: "Sa dernière construction a échoué.", empty: "Pas encore en ligne." },
    freeLine: "Libre.",
    exampleLine: "Un projet d'exemple.",
    waitingLine: "Attend le serveur.",
    house: { example: "Maison d'exemple", making: "En préparation", running: "Serveur en marche", down: "Serveur arrêté" },
    houseLine: {
      example: (city) => `${city}. Maison d'exemple.`,
      making: (city) => `${city}. En préparation.`,
      running: (city) => `${city}. Serveur en marche.`,
      down: (city) => `${city}. Serveur arrêté.`,
    },
    trouble: {
      example: "Maison d'exemple.",
      making: "En préparation.",
      down: "Serveur arrêté.",
    },
  },
);

// A state: its tone (the colour of its dot) and a word or two for the dot's hidden name. The visible words are
// always a sentence around it (see roomLine and houseLine below): no pill says "Online" on its own.
export type Tone = "live" | "warn" | "danger" | "free" | "neutral";
export interface State {
  tone: Tone;
  word: string;
}

const ROOM_TONE: Record<RoomStatus, Tone> = { live: "live", deploying: "warn", down: "danger", failed: "danger", empty: "neutral" };
const known = (status: RoomStatus): RoomStatus => (status in ROOM_TONE ? status : "empty");

/** A room's state. A free room is free; in a house still being made nothing can run yet; an example room (or any
 *  room of an example house) is an example, never "Online", since nothing runs there. */
export function roomState(room: Pick<Room, "status" | "occupant"> & { demo?: boolean }, house: HouseStatus = "live", demoHouse = false): State {
  if (!room.occupant) return { tone: "free", word: said.free };
  if (room.demo || demoHouse) return { tone: "neutral", word: said.example };
  if (house === "making") return { tone: "warn", word: said.waiting };
  const status = known(room.status);
  return { tone: ROOM_TONE[status], word: said.room[status] };
}

/** A lived-in room's state as the first words of its row's line: "Online.", "An example project." */
export function roomLine(room: Pick<Room, "status" | "occupant"> & { demo?: boolean }, house: HouseStatus = "live", demoHouse = false): string {
  if (!room.occupant) return said.freeLine;
  if (room.demo || demoHouse) return said.exampleLine;
  if (house === "making") return said.waitingLine;
  return said.line[known(room.status)];
}

/** A house's state. A demo house has no server at all: it's an example, not a house whose server is down. */
export function houseState(status: HouseStatus, agentOnline: boolean, demo = false): State {
  if (demo) return { tone: "neutral", word: said.house.example };
  if (status === "making") return { tone: "warn", word: said.house.making };
  return agentOnline ? { tone: "live", word: said.house.running } : { tone: "danger", word: said.house.down };
}

/** A house's state in a sentence, with where it is: "Dakar. Its server is running." An example house says so once,
 *  here, in words. */
export function houseLine(h: { city: string; status: HouseStatus; agentOnline: boolean; demo: boolean }): string {
  if (h.demo) return said.houseLine.example(h.city);
  if (h.status === "making") return said.houseLine.making(h.city);
  return h.agentOnline ? said.houseLine.running(h.city) : said.houseLine.down(h.city);
}

/** What's wrong with a house, in a sentence, or null when its server is simply running: the green dot says that
 *  (with its hidden name), so a house that's fine says nothing. An example house says so, since nothing runs there. */
export function houseTrouble(h: { status: HouseStatus; agentOnline: boolean; demo: boolean }): string | null {
  if (h.demo) return said.trouble.example;
  if (h.status === "making") return said.trouble.making;
  return h.agentOnline ? null : said.trouble.down;
}

/** "jib.coloc.localhost" from "http://jib.coloc.localhost:8000/": an address as people read it. */
export const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
