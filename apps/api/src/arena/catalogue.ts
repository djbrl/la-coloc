// The Arena's challenges: each city gets one of these a week (weeks.ts says which). Each is a folder of the arena
// repo (COLOC_ARENA_REPO) with a README saying what to do (challenges/<slug>/README.md in this repo); people send
// pull requests there. Every word is in English and French. The winner's title in French is epicene: the same
// words for anyone, so nobody's title has to guess who they are.
import type { ArenaKind } from "@coloc/db";

export type Text = { en: string; fr: string };

/** What a merged pull request is worth: by label (bounties), and `merged` for one with no label that counts. */
export type PointsRow = { label: string; points: number };

export interface CatalogueEntry {
  slug: string;
  kind: ArenaKind;
  title: Text;
  summary: Text;
  rules: { en: string[]; fr: string[] };
  // The folder in the arena repo.
  path: string;
  prizeFcfa: number;
  points: PointsRow[];
  // The winner's title. 2nd and 3rd get a podium badge instead (arena.service.ts).
  award: { key: string; title: Text };
}

// The label that makes a hackathon or challenge pull request an entry: the judges put it on what they accept. A
// merged pull request without an arena label scores nothing (the arena repo also takes ordinary contributions).
export const ENTRY = "arena:entry";

// Bounties: the judges label a fix by how serious the bug was. No label, no points.
const BOUNTY_POINTS: PointsRow[] = [
  { label: "arena:low", points: 10 },
  { label: "arena:medium", points: 25 },
  { label: "arena:high", points: 50 },
  { label: "arena:critical", points: 100 },
];
const HACKATHON_POINTS: PointsRow[] = [{ label: ENTRY, points: 30 }];
const CHALLENGE_POINTS: PointsRow[] = [{ label: ENTRY, points: 20 }];

export const CATALOGUE: CatalogueEntry[] = [
  {
    slug: "bug-bounty",
    kind: "bounty",
    title: { en: "Bug bounty: the example apps", fr: "Chasse aux failles : les apps d'exemple" },
    summary: {
      en: "Find a security bug in one of the example apps, fix it, and send the fix as a pull request.",
      fr: "Trouvez une faille de sécurité dans une des apps d'exemple, corrigez-la et envoyez la correction en pull request.",
    },
    rules: {
      en: [
        "Only the apps in examples/ count. Never test anything on a real house or a real person's room.",
        "One bug per pull request: say what it was, how to see it, and how your change fixes it.",
        "The maintainers label it arena:low, arena:medium, arena:high or arena:critical when they merge it.",
      ],
      fr: [
        "Seules les apps du dossier examples/ comptent. Ne testez jamais rien sur une vraie maison ni sur la chambre de quelqu'un.",
        "Une faille par pull request : dites ce qu'elle était, comment la voir et comment votre changement la corrige.",
        "Les mainteneurs ajoutent l'étiquette arena:low, arena:medium, arena:high ou arena:critical en la fusionnant.",
      ],
    },
    path: "challenges/bug-bounty",
    prizeFcfa: 25_000,
    points: BOUNTY_POINTS,
    award: { key: "eagle-eye", title: { en: "Eagle eye", fr: "Œil de lynx" } },
  },
  {
    slug: "accessibility-hunt",
    kind: "bounty",
    title: { en: "Accessibility hunt", fr: "Chasse aux obstacles : l'accessibilité" },
    summary: {
      en: "Find something in the website that shuts people out (keyboard, contrast, screen readers) and fix it.",
      fr: "Trouvez sur le site ce qui laisse des gens dehors (clavier, contrastes, lecteurs d'écran) et corrigez-le.",
    },
    rules: {
      en: [
        "Anything under apps/web counts. Say who it kept out and how you checked your fix.",
        "One problem per pull request. Screenshots or a short recording help the review.",
        "The maintainers label it by how many people it kept out: arena:low to arena:critical.",
      ],
      fr: [
        "Tout ce qui est dans apps/web compte. Dites qui en était privé et comment vous avez vérifié votre correction.",
        "Un problème par pull request. Des captures ou une courte vidéo aident la relecture.",
        "Les mainteneurs ajoutent une étiquette selon le nombre de personnes concernées : de arena:low à arena:critical.",
      ],
    },
    path: "challenges/accessibility-hunt",
    prizeFcfa: 20_000,
    points: BOUNTY_POINTS,
    award: { key: "lookout", title: { en: "Lookout", fr: "Vigie" } },
  },
  {
    slug: "offline-hackathon",
    kind: "hackathon",
    title: { en: "Hackathon: works without a connection", fr: "Hackathon : même sans réseau" },
    summary: {
      en: "In one week, build a small app that keeps working when the connection drops, and put it in its own folder.",
      fr: "En une semaine, construisez une petite app qui marche encore quand le réseau coupe, dans son propre dossier.",
    },
    rules: {
      en: [
        "Put everything in challenges/offline-hackathon/<your GitHub login>/, with a README saying how to run it.",
        "Teams are fine: one pull request, and say who did what.",
        "It must still do its main job with the network off. Merged entries score.",
      ],
      fr: [
        "Mettez tout dans challenges/offline-hackathon/<votre identifiant GitHub>/, avec un README qui explique comment le lancer.",
        "Les équipes sont les bienvenues : une seule pull request, et dites qui a fait quoi.",
        "Elle doit encore faire l'essentiel réseau coupé. Les participations fusionnées marquent des points.",
      ],
    },
    path: "challenges/offline-hackathon",
    prizeFcfa: 50_000,
    points: HACKATHON_POINTS,
    award: { key: "hackathon-ace", title: { en: "Hackathon ace", fr: "As du hackathon" } },
  },
  {
    slug: "market-hackathon",
    kind: "hackathon",
    title: { en: "Hackathon: for the market", fr: "Hackathon : pour le marché" },
    summary: {
      en: "In one week, build a tool a market trader would use every day: prices, stock, credit, anything that helps.",
      fr: "En une semaine, construisez un outil qu'une commerçante ou un commerçant utiliserait chaque jour : prix, stock, crédit, tout ce qui aide.",
    },
    rules: {
      en: [
        "Put everything in challenges/market-hackathon/<your GitHub login>/, with a README and a screenshot.",
        "Teams are fine: one pull request, and say who did what.",
        "It must run with one command. Merged entries score.",
      ],
      fr: [
        "Mettez tout dans challenges/market-hackathon/<votre identifiant GitHub>/, avec un README et une capture.",
        "Les équipes sont les bienvenues : une seule pull request, et dites qui a fait quoi.",
        "Elle doit se lancer en une commande. Les participations fusionnées marquent des points.",
      ],
    },
    path: "challenges/market-hackathon",
    prizeFcfa: 50_000,
    points: HACKATHON_POINTS,
    award: { key: "night-owl", title: { en: "Night owl", fr: "Couche-tard" } },
  },
  {
    slug: "fcfa-in-words",
    kind: "challenge",
    title: { en: "Challenge: amounts in words", fr: "Défi : les montants en toutes lettres" },
    summary: {
      en: "Write a function that writes an amount of FCFA in words, in French, the way it goes on a cheque.",
      fr: "Écrivez une fonction qui écrit un montant en FCFA en toutes lettres, en français, comme sur un chèque.",
    },
    rules: {
      en: [
        "Any language. Put it in challenges/fcfa-in-words/<your GitHub login>/ with its tests.",
        "It must pass every case in challenges/fcfa-in-words/cases.txt.",
        "Merged solutions score. Clear code beats clever code.",
      ],
      fr: [
        "N'importe quel langage. Mettez-la dans challenges/fcfa-in-words/<votre identifiant GitHub>/ avec ses tests.",
        "Elle doit réussir tous les cas de challenges/fcfa-in-words/cases.txt.",
        "Les solutions fusionnées marquent des points. Un code clair vaut mieux qu'un code astucieux.",
      ],
    },
    path: "challenges/fcfa-in-words",
    prizeFcfa: 15_000,
    points: CHALLENGE_POINTS,
    award: { key: "wordsmith", title: { en: "Wordsmith", fr: "Fine plume" } },
  },
  {
    slug: "test-pilot",
    kind: "challenge",
    title: { en: "Challenge: tests for the examples", fr: "Défi : des tests pour les exemples" },
    summary: {
      en: "Pick an example app with few tests and add the ones that would catch its next bug.",
      fr: "Choisissez une app d'exemple qui a peu de tests et ajoutez ceux qui attraperaient son prochain bug.",
    },
    rules: {
      en: [
        "Only examples/ counts. Tests only: don't change how the app behaves.",
        "Each test says in its name what it checks, and fails if that breaks.",
        "Merged pull requests score.",
      ],
      fr: [
        "Seul le dossier examples/ compte. Uniquement des tests : ne changez pas le comportement de l'app.",
        "Chaque test dit dans son nom ce qu'il vérifie, et échoue si ça casse.",
        "Les pull requests fusionnées marquent des points.",
      ],
    },
    path: "challenges/test-pilot",
    prizeFcfa: 15_000,
    points: CHALLENGE_POINTS,
    award: { key: "test-pilot", title: { en: "Test pilot", fr: "Pilote d'essai" } },
  },
];

/**
 * A challenge's catalogue entry by its slug. A slug the catalogue no longer has (a challenge from before it
 * changed) still reads: its slug stands in for the words, and a merged pull request is worth what a challenge's is.
 */
export function catalogueEntry(slug: string, kind: ArenaKind = "challenge"): CatalogueEntry {
  const found = CATALOGUE.find((e) => e.slug === slug);
  if (found) return found;
  const words = { en: slug, fr: slug };
  return {
    slug,
    kind,
    title: words,
    summary: words,
    rules: { en: [], fr: [] },
    path: `challenges/${slug}`,
    prizeFcfa: 0,
    points: kind === "bounty" ? BOUNTY_POINTS : kind === "hackathon" ? HACKATHON_POINTS : CHALLENGE_POINTS,
    award: { key: slug, title: words },
  };
}
