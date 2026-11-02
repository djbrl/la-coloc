// The arena's words, in English and French (see i18n.ts): its panel (ArenaPanel.vue and its three tabs), the badge
// chip next to names (BadgeChip.vue), the HUD's way in, and the settings row that picks the title you wear. What the
// API writes itself (a challenge's title, summary and rules, a badge's title) comes in both languages from the API.
// The French says "vous", and keeps a title's own words as they are.
import { defineWords, plural, pluriel } from "../../i18n";

export const arenaWords = defineWords(
  "arena",
  {
    label: (city: string) => `The arena of ${city}`,
    opening: "Opening the arena…",
    closed: "Closed for now.",
    closedLine: "Back soon.",
    failed: "The arena didn't open.",
    close: "Close the arena (Esc)",
    tabsLabel: "The arena",
    tabs: { challenge: "Challenge", board: "Leaderboard", room: "Room" },
    kinds: { bounty: "Bug bounty", hackathon: "Hackathon", challenge: "Coding challenge" },

    // The countdown, compact: "2d 4h", "3h 12m", "12m 05s", "45s".
    days: (d: number, h: number) => `${d}d ${h}h`,
    hours: (h: number, m: number) => `${h}h ${m}m`,
    minutes: (m: number, s: string) => `${m}m ${s}s`,
    seconds: (s: number) => `${s}s`,
    ended: "Ended",
    timeLeftName: (left: string) => `Time left: ${left}`,
    endedName: "This week's challenge has ended",

    // The stats, as icons with numbers; these are their hidden names.
    prizeName: (amount: string, title: string) => `Prize: ${amount} and the title ${title}`,
    entrantsName: (n: number) => `${plural(n, "person", "people")} taking part`,
    crowdName: (n: number) => `${plural(n, "person", "people")} in the arena now`,

    // The repo.
    folderName: (path: string) => `The challenge's folder: ${path}`,
    copy: "Copy",
    copied: "Copied",
    copyName: "Copy the git clone command (for your fork)",
    fork: "Fork",
    forkName: "Fork the repo on GitHub: you clone your fork and open your pull request from it",
    githubName: "Open the folder on GitHub",
    rules: "Rules",
    points: (n: number) => `${n} pts`,
    // Under the points table: who decides, and until when.
    scoring: (deadline: string) => `Merged before ${deadline} only.`,
    notOpen: "The repo isn't public yet.",
    notOpenTitle: "Opening soon",

    // Taking part.
    join: "Join",
    logIn: "Log in",
    submit: "Submit",
    prPlaceholder: "https://github.com/…/pull/12",
    prName: "Your pull request's address",
    empty: "Paste your pull request's address first.",
    notPull: "Not a GitHub pull request link.",
    wrongRepo: (repo: string) => `Open it on ${repo}: that's where the challenge lives.`,
    sent: "Sent.",
    mineName: "Your pull requests",
    states: { open: "Waiting", merged: "Merged", closed: "Closed" },
    takeBack: "Take back",
    takeBackName: (n: number) => `Take back pull request #${n}`,
    openPrName: (n: number) => `Open pull request #${n} on GitHub`,

    // The leaderboard.
    boardName: "This week's top ten",
    championName: (name: string) => `Last week's winner: ${name}`,
    nobody: "No scores yet.",
    placeName: (n: number) => `Place ${n}`,
    prs: (n: number) => `${n} PR`,
    prsName: (n: number) => plural(n, "pull request", "pull requests"),
    you: "You",

    // The room.
    roomTitle: (city: string) => `The arena's room, ${city}`,
    sayRoom: "Say something to the arena",
    logInWord: "Log in",

    // The HUD, and the prompt at the entrance.
    goTo: "Go to the arena",
    arena: "The Arena",
    arenaWhere: (title: string) => `, ${title}`,

    // A badge's hidden name: what, which place, where and when.
    place: (n: 1 | 2 | 3) => ["1st", "2nd", "3rd"][n - 1],
    badgeName: (title: string, place: string, city: string, week: string) => `${title}, ${place} place, ${city}, week of ${week}`,

    // Settings: the title you wear.
    titleWorn: "Title worn",
    titleGroup: "The title shown next to your name",
    noTitle: "None",
  },
  {
    label: (city) => `L'arène de ${city}`,
    opening: "Ouverture de l'arène…",
    closed: "Fermée pour l'instant.",
    closedLine: "Bientôt de retour.",
    failed: "L'arène ne s'est pas ouverte.",
    close: "Fermer l'arène (Échap)",
    tabsLabel: "L'arène",
    tabs: { challenge: "Défi", board: "Classement", room: "Salon" },
    kinds: { bounty: "Chasse aux bugs", hackathon: "Hackathon", challenge: "Défi de code" },

    days: (d, h) => `${d} j ${h} h`,
    hours: (h, m) => `${h} h ${m} min`,
    minutes: (m, s) => `${m} min ${s} s`,
    seconds: (s) => `${s} s`,
    ended: "Terminé",
    timeLeftName: (left) => `Temps restant : ${left}`,
    endedName: "Le défi de la semaine est terminé",

    prizeName: (amount, title) => `Prix : ${amount} et le titre « ${title} »`,
    entrantsName: (n) => `${pluriel(n, "personne", "personnes")} en lice`,
    crowdName: (n) => `${pluriel(n, "personne", "personnes")} dans l'arène en ce moment`,

    folderName: (path) => `Le dossier du défi : ${path}`,
    copy: "Copier",
    copied: "Copié",
    copyName: "Copier la commande git clone (de votre fork)",
    fork: "Forker",
    forkName: "Forker le dépôt sur GitHub : vous clonez votre fork et ouvrez votre pull request depuis lui",
    githubName: "Ouvrir le dossier sur GitHub",
    rules: "Règles",
    points: (n) => `${n} pts`,
    scoring: (deadline) => `Mergées avant le ${deadline} uniquement.`,
    notOpen: "Le dépôt n'est pas encore public.",
    notOpenTitle: "Bientôt ouvert",

    join: "Participer",
    logIn: "Se connecter",
    submit: "Envoyer",
    prPlaceholder: "https://github.com/…/pull/12",
    prName: "L'adresse de votre pull request",
    empty: "Collez d'abord l'adresse de votre pull request.",
    notPull: "Pas un lien de pull request GitHub.",
    wrongRepo: (repo) => `Ouvrez-la sur ${repo} : c'est là que se trouve le défi.`,
    sent: "Envoyée.",
    mineName: "Vos pull requests",
    states: { open: "En attente", merged: "Mergée", closed: "Fermée" },
    takeBack: "Retirer",
    takeBackName: (n) => `Retirer la pull request n° ${n}`,
    openPrName: (n) => `Ouvrir la pull request n° ${n} sur GitHub`,

    boardName: "Le top 10 de la semaine",
    championName: (name) => `Vainqueur de la semaine dernière : ${name}`,
    nobody: "Pas encore de score.",
    placeName: (n) => (n === 1 ? "1re place" : `${n}e place`),
    prs: (n) => `${n} PR`,
    prsName: (n) => pluriel(n, "pull request", "pull requests"),
    you: "Vous",

    roomTitle: (city) => `Le salon de l'arène, ${city}`,
    sayRoom: "Dites quelque chose à l'arène",
    logInWord: "Se connecter",

    goTo: "Aller à l'arène",
    arena: "L'Arène",
    arenaWhere: (title) => `, ${title}`,

    place: (n) => ["1re", "2e", "3e"][n - 1],
    badgeName: (title, place, city, week) => `${title}, ${place} place, ${city}, semaine du ${week}`,

    titleWorn: "Titre porté",
    titleGroup: "Le titre affiché à côté de votre nom",
    noTitle: "Aucun",
  },
);
