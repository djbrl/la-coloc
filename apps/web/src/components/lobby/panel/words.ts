// The words the lobby's panels use for things, in one place: what each thing is called and the one plain sentence
// that says what it is or does. The house, the room, the knock and the tutorial all read from here, so a room is
// explained the same way wherever you meet it. Keep each sentence short enough for one line in a panel.
// Each sentence is written in English and in French (see i18n.ts): the French must have every key the English has.
import { defineWords, num } from "../../../i18n";
import type { HouseStatus, Room, RoomStatus } from "../../../types";

export const explain = defineWords(
  "explain",
  {
    house: "A server a few devs rent together. Each of them gets a room on it.",
    chef: "The chef started the house and rents its server.",
    room: (memoryMb: number, cpus: number) => `Your share of the house's server: ${memoryMb} MB of memory and ${num(cpus)} CPU, for one project.`,
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
  },
  {
    house: "Un serveur que quelques devs louent ensemble. Chacun y a sa chambre.",
    chef: "Le chef a ouvert la maison et loue son serveur.",
    room: (memoryMb, cpus) => `Votre part du serveur de la maison : ${memoryMb} Mo de mémoire et ${num(cpus)} CPU, pour un projet.`,
    rooms: "Une ligne par chambre : le projet d'une personne, sur le serveur de la maison.",
    project: "L'app d'une chambre : un site, une API, un bot. Son code vient d'un dépôt Git.",
    online: "On récupère le code, on le construit et on le lance à l'adresse de la chambre.",
    address: "Quiconque a l'adresse peut ouvrir le projet.",
    knock: "Demandez une chambre libre. Les colocs votent, et la majorité vous fait entrer.",
    knockYours: "Les colocs lisent votre mot et votent. La majorité vous fait entrer.",
    knockTheirs: "Lisez son mot et regardez ce qu'on y a construit, puis votez. La majorité décide.",
    channel: "La discussion de groupe de la maison.",
    chores: "Les pull requests qu'un coloc vous a demandé de relire.",
    fridge: "Les mots que le serveur épingle quand quelque chose mérite un coup d'œil.",
    bill: "Le coût du serveur par mois, partagé selon l'usage. Chaque revue allège votre part.",
    code: "D'où vient le code, et comment il démarre.",
    secrets: "Les mots de passe et clés d'API que lit votre app. Masqués une fois enregistrés.",
    logs: "Ce que votre app a affiché dernièrement.",
    history: "Chaque construction de cette chambre, la plus récente en premier.",
    update: "Récupérer le dernier code et le remettre en ligne.",
    firstOnline: "Récupérer le code, le construire et le mettre en ligne.",
    restart: "Éteindre et rallumer l'app. Même code.",
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
      example: (city: string) => `${city}. An example house, to show how one looks.`,
      making: (city: string) => `${city}. Still being set up.`,
      running: (city: string) => `${city}. Its server is running.`,
      down: (city: string) => `${city}. Its server is down for now.`,
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
      example: (city) => `${city}. Une maison d'exemple, pour montrer à quoi ça ressemble.`,
      making: (city) => `${city}. Encore en préparation.`,
      running: (city) => `${city}. Son serveur tourne.`,
      down: (city) => `${city}. Son serveur est arrêté pour l'instant.`,
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

/** "jib.coloc.localhost" from "http://jib.coloc.localhost:8000/": an address as people read it. */
export const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
