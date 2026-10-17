// The made-up city's own words in French: the seeded houses' taglines, their projects' lines and free rooms' ads
// (apps/api/src/seed/city.ts), and the line the tutorial gives the ready-made page (apps/api/src/tutorial). The API
// stores them in English, like anything a person writes. A text that is word for word one of these is the seed's,
// so it's shown in the reader's language; anything else is someone's own words and stays as they wrote it.
// seeded.test.ts checks that every sentence of the seed is here.
import { language, nbsp } from "../i18n";

export const SEEDED_FR: Readonly<Record<string, string>> = {
  // Taglines.
  "Three side projects, one server, strict reviews.": "Trois projets perso, un serveur, des revues strictes.",
  "Where newcomers take their first room.": "Là où les nouveaux prennent leur première chambre.",
  "Backend people. We review fast and deploy on Fridays anyway.": "Des gens du backend. On relit vite, et on déploie le vendredi quand même.",
  "Starting a house for mobile devs. Two of four signed up.": "Une maison de devs mobile en préparation. Deux inscrits sur quatre.",
  "Six rooms, mostly fintech. One free.": "Six chambres, surtout de la fintech. Une de libre.",
  "Bilingual house. Code reviews in French or English.": "Maison bilingue. Revues de code en français ou en anglais.",
  "Small, full, and very strict about tests.": "Petite, pleine, et très stricte sur les tests.",
  "Data people. Looking for one more.": "Des gens de la data. On cherche encore quelqu'un.",
  "A house for game devs, in the making.": "Une maison pour les devs de jeux, en préparation.",
  "Four rooms, four bots.": "Quatre chambres, quatre bots.",

  // What each project is.
  "A Discord bot for the neighbourhood's football league.": "Un bot Discord pour la ligue de foot du quartier.",
  "A small shop that takes mobile money.": "Une petite boutique qui accepte le mobile money.",
  "Today's prices at Sandaga and Tilène.": "Les prix du jour à Sandaga et à Tilène.",
  "The ready-made page every newcomer puts online first.": "La page toute prête que chaque nouveau venu met en ligne en premier.",
  "A hello page with her name and a photo of Gorée.": "Une page qui dit bonjour, avec son nom et une photo de Gorée.",
  "A Telegram bot that sends Dakar's weather every morning.": "Un bot Telegram qui envoie la météo de Dakar chaque matin.",
  "Her design work, on one page.": "Ses travaux de design, sur une seule page.",
  "A to-do API: add a task, tick it off, list what's left.": "Une API de tâches : ajouter une tâche, la cocher, voir ce qui reste.",
  "Shared-ride matching for the airport run.": "Du covoiturage pour aller à l'aéroport.",
  "A Wolof spell-checker as a service.": "Un correcteur d'orthographe pour le wolof, en API.",
  "Live scores for the Senegalese league.": "Les scores en direct du championnat sénégalais.",
  "Booking for hair salons, by WhatsApp.": "La prise de rendez-vous des salons de coiffure, par WhatsApp.",
  "Moto-taxi fares, crowdsourced.": "Les prix des motos-taxis, donnés par les passagers.",
  "Thank-you notes for small businesses.": "Des mots de remerciement pour les petits commerces.",
  "Tontines with reminders and a ledger.": "Des tontines, avec des rappels et un livre de comptes.",
  "Minibus routes across Abidjan.": "Les trajets des minibus dans tout Abidjan.",
  "Invoices for freelancers, in FCFA.": "Des factures pour les freelances, en FCFA.",
  "A recipe API for West African dishes.": "Une API de recettes de plats d'Afrique de l'Ouest.",
  "Find a plumber who answers.": "Trouver un plombier qui répond.",
  "Container arrival alerts for importers.": "Des alertes d'arrivée de conteneurs pour les importateurs.",
  "Group savings, done in the open.": "L'épargne de groupe, en toute transparence.",
  "Job ads scraped from five sites.": "Des offres d'emploi récupérées sur cinq sites.",
  "Receipts for moto rides.": "Des reçus pour les courses à moto.",
  "Volunteer sign-ups for community days.": "Les inscriptions des bénévoles aux journées de travail collectif.",
  "Rain alerts for farmers, by SMS.": "Des alertes pluie pour les agriculteurs, par SMS.",
  "Shared-taxi departures between cities.": "Les départs des taxis collectifs entre les villes.",
  "Exchange-rate history and alerts.": "L'historique des taux de change, avec des alertes.",
  "A multiplayer trading game.": "Un jeu de commerce multijoueur.",
  "A stall finder for the big market.": "Pour trouver un étal dans le grand marché.",
  "A Telegram bot for moto-taxi prices.": "Un bot Telegram pour les prix des motos-taxis.",
  "A festival calendar.": "Un calendrier des festivals.",
  "Mirrors of public legal texts.": "Des copies des textes de loi publics.",
  // The ready-made page's line, written by the tutorial (SAMPLE_PROJECT in tutorial.service.ts).
  "My first project: a small page that says hello.": "Mon premier projet : une petite page qui dit bonjour.",

  // What free rooms are looking for.
  "Looking for a mobile dev (Flutter or React Native)": "Cherche un dev mobile (Flutter ou React Native)",
  "Looking for a Flutter dev": "Cherche un dev Flutter",
  "Looking for anyone who ships": "Cherche quelqu'un qui met ses projets en ligne, peu importe la techno",
  "Looking for a backend dev (Go or Node)": "Cherche un dev backend (Go ou Node)",
  "Looking for a designer who codes": "Cherche un designer qui code",
  "Looking for a data / ML dev": "Cherche un dev data / ML",
  "Looking for a game dev (Godot or web)": "Cherche un dev de jeux (Godot ou web)",
  "Looking for a pixel artist who codes": "Cherche un pixel artist qui code",
};

/** A text in the reader's language if it's one of the seed's own sentences; anyone's own words as they are. */
export function seeded<T extends string | null | undefined>(text: T): T {
  if (language.lang !== "fr" || !text || !Object.hasOwn(SEEDED_FR, text)) return text;
  return nbsp(SEEDED_FR[text]) as T;
}
