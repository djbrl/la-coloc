// The development city. Sacré-Cœur is the house our local agent actually runs (see docs/dev.md), and L'Atelier
// is the workshop where newcomers take the tutorial (a second agent runs it, with the same secret).
// Every other house is a demo house: flagged `demo`, labelled as such in the UI, with made-up flatmates
// who have no GitHub account. They exist so the city isn't empty on screen.
import {
  applications,
  arenaChallenges,
  billPayments,
  chores,
  creditEntries,
  type Db,
  deployments,
  fridgeNotes,
  houses,
  memberships,
  messages,
  notifications,
  repos,
  roomTeammates,
  rooms,
  sessions,
  usageSamples,
  users,
  votes,
} from "@coloc/db";
import { WELCOME_CREDIT_FCFA } from "../houses/money";
import { and, eq } from "drizzle-orm";
import { hashSecret } from "../houses/houses.service";
import { plantArena } from "./arena";
import { plantLife } from "./life";

interface SeedRoom {
  name: string;
  // Login of the flatmate living here. Missing: the room is free.
  who?: string;
  memoryMb?: number;
  cpus?: number;
  project?: string;
  description?: string;
  ad?: string;
  // An example room in a real house: shown as lived in and online, but nothing runs there (rooms.demo).
  demo?: boolean;
  // Where a redeploy gets its code when no GitHub repo is linked: a repo URL and the folder with the Dockerfile.
  source?: string;
  buildPath?: string;
}

interface SeedHouse {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string;
  status: "making" | "live";
  demo: boolean;
  // The tutorial's workshop: never drawn on the city.
  tutorial?: boolean;
  // Null: nobody pays for it.
  monthlyCostFcfa: number | null;
  chef: string;
  rooms: SeedRoom[];
}

// The project's own repo, which holds the example apps in examples/.
const EXAMPLES_REPO = "https://github.com/Djbrl/la-coloc.git";

export const CITY: SeedHouse[] = [
  {
    id: "sacre-coeur",
    name: "Sacré-Cœur",
    city: "Dakar",
    country: "SN",
    tagline: "Three side projects, one server, strict reviews.",
    status: "live",
    demo: false,
    monthlyCostFcfa: 12_000,
    chef: "jib",
    rooms: [
      { name: "jib", who: "jib", project: "Kër Bot", description: "A Discord bot for the neighbourhood's football league." },
      {
        name: "awa",
        who: "awa",
        project: "Ndaje",
        description: "A small shop that takes mobile money.",
        source: EXAMPLES_REPO,
        buildPath: "examples/ndaje",
      },
      {
        name: "moussa",
        who: "moussa",
        memoryMb: 128,
        project: "Prix Marché",
        description: "Today's prices at Sandaga and Tilène.",
        source: EXAMPLES_REPO,
        buildPath: "examples/prix-marche",
      },
      { name: "room-4", ad: "Looking for a mobile dev (Flutter or React Native)" },
    ],
  },
  {
    // Newcomers take their first room here during the tutorial; each room is removed when its tutorial restarts.
    // The host and two learners live here already, so with you it's a house of four: their rooms are examples
    // (`demo`), seeded online with no address, and nothing runs in them.
    id: "atelier",
    name: "L'Atelier",
    city: "Dakar",
    country: "SN",
    tagline: "Where newcomers take their first room.",
    status: "live",
    demo: false,
    tutorial: true,
    monthlyCostFcfa: null,
    chef: "ndeye",
    rooms: [
      { name: "ndeye", who: "ndeye", demo: true, project: "Hello", description: "The ready-made page every newcomer puts online first." },
      { name: "aissatou", who: "aissatou", demo: true, project: "Salut Gorée", description: "A hello page with her name and a photo of Gorée." },
      { name: "babacar", who: "babacar", demo: true, project: "Météo Bot", description: "A Telegram bot that sends Dakar's weather every morning." },
    ],
  },
  {
    id: "almadies",
    name: "Almadies",
    city: "Dakar",
    country: "SN",
    tagline: "Backend people. We review fast and deploy on Fridays anyway.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 15_000,
    chef: "aminata",
    rooms: [
      { name: "aminata", who: "aminata", project: "Taxi Clando API", description: "Shared-ride matching for the airport run." },
      { name: "cheikh", who: "cheikh", project: "Wolof NLP", description: "A Wolof spell-checker as a service." },
      { name: "ibou", who: "ibou", project: "Ligue 1 Live", description: "Live scores for the Senegalese league." },
      { name: "khady", who: "khady", project: "Rendez-vous", description: "Booking for hair salons, by WhatsApp." },
    ],
  },
  {
    id: "be-kpota",
    name: "Bè Kpota",
    city: "Lomé",
    country: "TG",
    tagline: "Starting a house for mobile devs. Two of four signed up.",
    status: "making",
    demo: true,
    monthlyCostFcfa: 10_000,
    chef: "koffi",
    rooms: [
      { name: "koffi", who: "koffi", project: "Zém Tracker", description: "Moto-taxi fares, crowdsourced." },
      { name: "edem", who: "edem", project: "Akpé", description: "Thank-you notes for small businesses." },
      { name: "room-3", ad: "Looking for a Flutter dev" },
      { name: "room-4", ad: "Looking for anyone who ships" },
    ],
  },
  {
    id: "cocody",
    name: "Cocody",
    city: "Abidjan",
    country: "CI",
    tagline: "Six rooms, mostly fintech. One free.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 20_000,
    chef: "yao",
    rooms: [
      { name: "yao", who: "yao", project: "Tontine Plus", description: "Tontines with reminders and a ledger." },
      { name: "awa-k", who: "awa-k", project: "Gbaka Routes", description: "Minibus routes across Abidjan." },
      { name: "serge", who: "serge", project: "Facture", description: "Invoices for freelancers, in FCFA." },
      { name: "mariam", who: "mariam", project: "Kalo", description: "A recipe API for West African dishes." },
      { name: "ange", who: "ange", project: "Allô Plombier", description: "Find a plumber who answers." },
      { name: "room-6", ad: "Looking for a backend dev (Go or Node)" },
    ],
  },
  {
    id: "akwa",
    name: "Akwa",
    city: "Douala",
    country: "CM",
    tagline: "Bilingual house. Code reviews in French or English.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 12_000,
    chef: "nadege",
    rooms: [
      { name: "nadege", who: "nadege", project: "Port Watch", description: "Container arrival alerts for importers." },
      { name: "boris", who: "boris", project: "Njangi", description: "Group savings, done in the open." },
      { name: "carine", who: "carine", project: "Mboa Jobs", description: "Job ads scraped from five sites." },
      { name: "room-4", ad: "Looking for a designer who codes" },
    ],
  },
  {
    id: "kacyiru",
    name: "Kacyiru",
    city: "Kigali",
    country: "RW",
    tagline: "Small, full, and very strict about tests.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 9_000,
    chef: "aline",
    rooms: [
      { name: "aline", who: "aline", project: "Moto Pay", description: "Receipts for moto rides." },
      { name: "eric", who: "eric", project: "Umuganda", description: "Volunteer sign-ups for community days." },
      { name: "grace", who: "grace", project: "Imvura", description: "Rain alerts for farmers, by SMS." },
    ],
  },
  {
    id: "lafayette",
    name: "Lafayette",
    city: "Tunis",
    country: "TN",
    tagline: "Data people. Looking for one more.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 11_000,
    chef: "yassine",
    rooms: [
      { name: "yassine", who: "yassine", project: "Louage", description: "Shared-taxi departures between cities." },
      { name: "salma", who: "salma", project: "Dinar Watch", description: "Exchange-rate history and alerts." },
      { name: "room-3", ad: "Looking for a data / ML dev" },
    ],
  },
  {
    id: "gueliz",
    name: "Guéliz",
    city: "Marrakech",
    country: "MA",
    tagline: "A house for game devs, in the making.",
    status: "making",
    demo: true,
    monthlyCostFcfa: 10_000,
    chef: "omar",
    rooms: [
      { name: "omar", who: "omar", project: "Souk Rush", description: "A multiplayer trading game." },
      { name: "room-2", ad: "Looking for a game dev (Godot or web)" },
      { name: "room-3", ad: "Looking for a pixel artist who codes" },
    ],
  },
  {
    id: "ganhi",
    name: "Ganhi",
    city: "Cotonou",
    country: "BJ",
    tagline: "Four rooms, four bots.",
    status: "live",
    demo: true,
    monthlyCostFcfa: 12_000,
    chef: "fifame",
    rooms: [
      { name: "fifame", who: "fifame", project: "Marché Dantokpa", description: "A stall finder for the big market." },
      { name: "rodrigue", who: "rodrigue", project: "Zem Bot", description: "A Telegram bot for moto-taxi prices." },
      { name: "sika", who: "sika", project: "Vodun Days", description: "A festival calendar." },
      { name: "kevin", who: "kevin", project: "Bénin Code", description: "Mirrors of public legal texts." },
    ],
  },
];

const NAMES: Record<string, string> = {
  jib: "Jib",
  awa: "Awa",
  moussa: "Moussa",
  "awa-k": "Awa K.",
  ndeye: "Ndèye",
  aissatou: "Aïssatou",
};

const displayName = (login: string) => NAMES[login] ?? login.charAt(0).toUpperCase() + login.slice(1);

export interface SeedOptions {
  // The secret of the real houses' agents (Sacré-Cœur and L'Atelier share it).
  agentSecret: string;
  domain: (houseId: string) => string;
  // Plant a month of life too (reviews, chat, notes, deploy history, payments; see life.ts). The dev seed and the
  // demo reset do; most tests start from the bare city.
  life?: boolean;
}

/**
 * The options `npm run dev:seed` uses, from the environment. The demo reset reads the same ones, so a reset
 * city is the seeded city.
 */
export function devSeedOptions(env = process.env): SeedOptions {
  const houseDomain = env.COLOC_DEV_HOUSE_DOMAIN ?? "coloc.localhost";
  return {
    agentSecret: env.COLOC_DEV_AGENT_SECRET ?? "dev-secret-change-me",
    // Locally Sacré-Cœur serves its rooms at <room>.coloc.localhost and the workshop at <room>.atelier.coloc.localhost.
    // Demo houses never serve anything.
    domain: (id) => (id === "sacre-coeur" ? houseDomain : id === "atelier" ? `atelier.${houseDomain}` : `${id}.coloc.dev`),
    life: true,
  };
}

/**
 * Wipes coloc.dev's tables and plants the development city. Only for a local database:
 * the caller checks that before calling.
 */
export async function seedCity(db: Db, opts: SeedOptions) {
  await db.transaction(async (tx) => {
    for (const t of [arenaChallenges, notifications, messages, votes, applications, chores, repos, usageSamples, fridgeNotes, deployments, billPayments, sessions, memberships, roomTeammates /* unused, but an older database may still have rows */, rooms, houses, users])
      await tx.delete(t);
    await tx.delete(creditEntries);
    await tx.update(users).set({ credit: WELCOME_CREDIT_FCFA });
    await plantCity(tx, opts);
  });
}

/**
 * Plants the seeded houses, their rooms and their flatmates, on a database that has no houses. The seeded
 * flatmates who are already there (a demo reset keeps everyone) are reused rather than made again.
 */
export async function plantCity(db: Db, opts: SeedOptions) {
  const logins = [...new Set(CITY.flatMap((h) => [h.chef, ...h.rooms.map((r) => r.who).filter((w): w is string => !!w)]))];
  const id: Record<string, string> = {};
  for (const login of logins) id[login] = await seededPerson(db, login);

  for (const h of CITY) {
    await db.insert(houses).values({
      id: h.id,
      name: h.name,
      city: h.city,
      country: h.country,
      tagline: h.tagline,
      status: h.status,
      demo: h.demo,
      tutorial: h.tutorial ?? false,
      domain: opts.domain(h.id),
      monthlyCostFcfa: h.monthlyCostFcfa,
      chefId: id[h.chef],
      // Only the real houses have an agent.
      agentSecretHash: h.demo ? null : hashSecret(opts.agentSecret),
    });
    if (!h.rooms.length) continue;
    await db.insert(rooms).values(
      h.rooms.map((r) => ({
        houseId: h.id,
        name: r.name,
        occupantId: r.who ? id[r.who] : null,
        memoryMb: r.memoryMb ?? 256,
        cpus: r.cpus ?? 0.5,
        project: r.project ?? null,
        projectDescription: r.description ?? null,
        ad: r.ad ?? null,
        demo: r.demo ?? false,
        source: r.source ?? null,
        buildPath: r.buildPath ?? ".",
        // Demo houses that are live, and example rooms, show as lived in; nothing actually runs there.
        status: ((h.demo && h.status === "live" && r.who) || r.demo ? "live" : "empty") as "live" | "empty",
      })),
    );
    const members = h.rooms.filter((r) => r.who);
    await db.insert(memberships).values(
      members.map((r, i) => ({
        houseId: h.id,
        userId: id[r.who!],
        role: r.who === h.chef ? ("chef" as const) : ("flatmate" as const),
        // The tontine goes round in room order (the reviewer rotation breaks ties in the same order).
        tontinePosition: i,
      })),
    );
  }

  // A month of life on top: reviews, chat, notes, deploy history, bill payments, and the Arena's last week.
  if (!opts.life) return;
  await plantLife(
    db,
    CITY.map((h) => ({
      id: h.id,
      live: h.status === "live",
      demo: h.demo,
      tutorial: h.tutorial ?? false,
      monthlyCostFcfa: h.monthlyCostFcfa,
      flatmates: h.rooms
        .filter((r) => r.who)
        .map((r) => ({ login: r.who!, room: r.name, name: displayName(r.who!), example: !!r.demo })),
    })),
    id,
  );
  // And last week's Arena in Dakar and Abidjan, finished, so titles show from the first visit (seed/arena.ts).
  await plantArena(db, id);
}

/**
 * The user id of a seeded flatmate, made if missing. Seeded people never have a GitHub account. If a real GitHub
 * user has since taken the login, the seeded one was renamed "<login>-demo" (see AuthService.upsertGithubUser),
 * so that name is tried next.
 */
async function seededPerson(db: Db, login: string): Promise<string> {
  for (const candidate of [login, `${login}-demo`]) {
    const [existing] = await db.select({ id: users.id, githubId: users.githubId }).from(users).where(eq(users.login, candidate));
    if (existing && existing.githubId === null) return existing.id;
    if (!existing) {
      const [made] = await db.insert(users).values({ login: candidate, name: displayName(login) }).returning({ id: users.id });
      return made.id;
    }
  }
  throw new Error(`can't seed ${login}: both ${login} and ${login}-demo are GitHub accounts`);
}
