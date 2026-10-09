// The development city. Sacré-Cœur is the house our local agent actually runs (see docs/dev.md).
// Every other house is a demo house: flagged `demo`, labelled as such in the UI, with made-up flatmates
// who have no GitHub account. They exist so the city isn't empty on screen.
import { applications, chores, type Db, deployments, fridgeNotes, houses, memberships, messages, repos, rooms, sessions, usageSamples, users, votes } from "@coloc/db";
import { hashSecret } from "../houses/houses.service";

interface SeedRoom {
  name: string;
  // Login of the flatmate living here. Missing: the room is free.
  who?: string;
  memoryMb?: number;
  cpus?: number;
  project?: string;
  description?: string;
  ad?: string;
}

interface SeedHouse {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string;
  status: "making" | "live";
  demo: boolean;
  monthlyCostFcfa: number;
  chef: string;
  rooms: SeedRoom[];
}

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
      { name: "awa", who: "awa", project: "Ndaje", description: "A small shop that takes Wave payments." },
      { name: "moussa", who: "moussa", memoryMb: 128, project: "Prix Marché", description: "Scrapes market prices every morning." },
      { name: "room-4", ad: "Looking for a mobile dev (Flutter or React Native)" },
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
};

const displayName = (login: string) => NAMES[login] ?? login.charAt(0).toUpperCase() + login.slice(1);

/**
 * Wipes coloc.dev's tables and plants the development city. Only for a local database:
 * the caller checks that before calling.
 */
export async function seedCity(db: Db, opts: { agentSecret: string; domain: (houseId: string) => string }) {
  await db.transaction(async (tx) => {
    for (const t of [messages, votes, applications, chores, repos, usageSamples, fridgeNotes, deployments, sessions, memberships, rooms, houses, users]) await tx.delete(t);

    const logins = [...new Set(CITY.flatMap((h) => h.rooms.map((r) => r.who).filter((w): w is string => !!w)))];
    const inserted = await tx
      .insert(users)
      .values(logins.map((login) => ({ login, name: displayName(login) })))
      .returning();
    const id = Object.fromEntries(inserted.map((u) => [u.login, u.id]));

    for (const h of CITY) {
      await tx.insert(houses).values({
        id: h.id,
        name: h.name,
        city: h.city,
        country: h.country,
        tagline: h.tagline,
        status: h.status,
        demo: h.demo,
        domain: opts.domain(h.id),
        monthlyCostFcfa: h.monthlyCostFcfa,
        chefId: id[h.chef],
        // Only the real house has an agent.
        agentSecretHash: h.demo ? null : hashSecret(opts.agentSecret),
      });
      await tx.insert(rooms).values(
        h.rooms.map((r) => ({
          houseId: h.id,
          name: r.name,
          occupantId: r.who ? id[r.who] : null,
          memoryMb: r.memoryMb ?? 256,
          cpus: r.cpus ?? 0.5,
          project: r.project ?? null,
          projectDescription: r.description ?? null,
          ad: r.ad ?? null,
          // Demo houses that are live show their rooms as lived in; nothing actually runs there.
          status: (h.demo && h.status === "live" && r.who ? "live" : "empty") as "live" | "empty",
        })),
      );
      const members = h.rooms.filter((r) => r.who);
      await tx.insert(memberships).values(
        members.map((r, i) => ({ houseId: h.id, userId: id[r.who!], role: r.who === h.chef ? ("chef" as const) : ("flatmate" as const), tontinePosition: i })),
      );
    }
  });
}
