// The Arena's challenges: each city gets one of these a week (weeks.ts says which). Each is a folder of the arena
// repo (COLOC_ARENA_REPO) with a README saying what to do (challenges/<slug>/README.md in this repo); people send
// pull requests there. The arena's window shows the summary on one line and the rules folded, and draws the points
// table itself, so neither says how judging works. Every word is in English and French. The winner's title in
// French is epicene: the same words for anyone, so nobody's title has to guess who they are.
import type { ArenaKind } from "@coloc/db";

export type Text = { en: string; fr: string };

/** What a merged pull request is worth, by the arena label the judges put on it. */
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
      en: "Find a security bug in an example app and fix it.",
      fr: "Trouvez une faille de sécurité dans une app d'exemple et corrigez-la.",
    },
    rules: {
      en: [
        "Only examples/ counts. Never test on a real house.",
        "One bug per pull request: what it was, how to see it, how you fixed it.",
      ],
      fr: [
        "Seul examples/ compte. Ne testez jamais sur une vraie maison.",
        "Une faille par pull request : laquelle, comment la voir, comment vous l'avez corrigée.",
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
      en: "Fix what shuts people out of the example apps: keyboard, contrast, screen readers.",
      fr: "Corrigez ce qui exclut des gens des apps d'exemple : clavier, contrastes, lecteurs d'écran.",
    },
    rules: {
      en: [
        "Any page of examples/ counts. Say who it kept out and how you checked.",
        "One problem per pull request. A screenshot helps.",
      ],
      fr: [
        "Toute page de examples/ compte. Dites qui était exclu et comment vous avez vérifié.",
        "Un problème par pull request. Une capture aide.",
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
      en: "Build a small app that keeps working when the connection drops.",
      fr: "Construisez une petite app qui marche encore quand le réseau coupe.",
    },
    rules: {
      en: [
        "Everything in <your GitHub login>/ in the folder, with a README to run it.",
        "It works with the network off. Teams: one pull request, say who did what.",
      ],
      fr: [
        "Tout dans <votre identifiant GitHub>/ dans le dossier, avec un README pour la lancer.",
        "Elle marche réseau coupé. En équipe : une pull request, dites qui a fait quoi.",
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
      en: "Build an everyday tool for market traders: prices, stock, credit.",
      fr: "Construisez un outil de tous les jours pour le marché : prix, stock, crédit.",
    },
    rules: {
      en: [
        "Everything in <your GitHub login>/ in the folder, with a README and a screenshot.",
        "It runs with one command. Teams: one pull request, say who did what.",
      ],
      fr: [
        "Tout dans <votre identifiant GitHub>/ dans le dossier, avec un README et une capture.",
        "Il se lance en une commande. En équipe : une pull request, dites qui a fait quoi.",
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
      en: "Write a function that spells an FCFA amount in French words, as on a cheque.",
      fr: "Écrivez une fonction qui écrit un montant en FCFA en toutes lettres, comme sur un chèque.",
    },
    rules: {
      en: [
        "Any language, in <your GitHub login>/ in the folder, with its tests.",
        "It passes every case in cases.txt. Clear beats clever.",
      ],
      fr: [
        "N'importe quel langage, dans <votre identifiant GitHub>/ dans le dossier, avec ses tests.",
        "Elle réussit tous les cas de cases.txt. Le clair vaut mieux que l'astucieux.",
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
      en: "Add the tests that would catch an example app's next bug.",
      fr: "Ajoutez les tests qui attraperaient le prochain bug d'une app d'exemple.",
    },
    rules: {
      en: [
        "Only examples/, and tests only: don't change what the app does.",
        "Each test's name says what it checks.",
      ],
      fr: [
        "Seul examples/ compte, et que des tests : ne changez pas ce que fait l'app.",
        "Le nom de chaque test dit ce qu'il vérifie.",
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
