// The arena's words, in English and French (see i18n.ts): its window (ArenaPanel.vue: the prize and the time left, the
// challenge, then how to take part and the rules folded; the leaderboard and the room behind tabs), the badge
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
    // The head's line, under the challenge's title.
    weekly: "This week's challenge.",
    kinds: { bounty: "Bug bounty", hackathon: "Hackathon", challenge: "Coding challenge" },

    ended: "Ended",
    timeLeftName: (left: string) => `Time left: ${left}`,
    endedName: "This week's challenge has ended",
    // The challenge's time left, as the window says it: "4 days left", "1d 6h left", "5h 12m left".
    daysLeft: (d: number) => `${d} days left`,
    dayLeft: (h: number) => `1d ${h}h left`,
    hoursLeft: (h: number, m: number) => `${h}h ${m}m left`,
    minutesLeft: (m: number) => `${m}m left`,
    secondsLeft: (s: number) => `${s}s left`,
    endsAt: (when: string) => `Ends ${when}`,

    // What it pays and who's in, at the top of the tab: numbers, the words small under them.
    andTitle: (title: string) => `and the title “${title}” for first place`,
    forFirst: "for first place",
    entrants: (n: number) => `${n} taking part`,
    here: (n: number) => `${n} here`,
    // The stats' hidden names.
    entrantsName: (n: number) => `${plural(n, "person", "people")} taking part`,
    crowdName: (n: number) => `${plural(n, "person", "people")} in the arena now`,

    // The repo.
    copied: "Copied",
    copyName: "Copy the git clone command (for your fork)",
    fork: "Fork",
    forkName: "Fork the repo on GitHub: you clone your fork and open your pull request from it",
    githubName: "Open the folder on GitHub",
    rules: "Rules",
    points: (n: number) => `${n} pts`,
    notOpen: "The repo isn't public yet.",
    notOpenTitle: "Opening soon",

    // Taking part: the folds under the main button, three steps, then how it's graded.
    stepsName: "How to take part",
    stepsMeta: (n: number) => `${n} steps`,
    rulesPoints: "Rules and points",
    pointsRange: (low: number, high: number) => (low === high ? `${low} pts` : `${low} to ${high} pts`),
    forkStep: "Fork the challenge's folder",
    scoreLine: "Merged before the challenge ends, it scores points.",
    joined: "Joined",
    prStep: "Open a pull request",
    autoStep: "Picked up automatically",
    pasteStep: "Paste its link here",
    pasteInstead: "Paste a link instead",
    graded: "Judges label merged PRs",
    gradedName: (table: string) => `Judges label each merged pull request, and each label is worth points: ${table}`,
    mineChip: (n: number, pts: number) => `${n} PR · ${pts} pts`,
    mineChipName: (n: number, pts: number) => `${plural(n, "pull request", "pull requests")} sent, ${pts} points. See them in the leaderboard`,

    // The payout.
    prizesName: "Prizes",
    prizeName: (place: string, amount: string | null, title: string | null) =>
      `${place} place: ${[amount, title ? `the title ${title}` : "a podium badge"].filter(Boolean).join(" and ")}`,

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
    // Dropping out: the key, the light "are you sure", and the word after.
    dropOut: "Drop out",
    dropOutName: "Drop out of this week's challenge",
    dropOutAsk: "Drop out?",
    dropOutLine: "You leave this week's challenge.",
    dropOutMine: "Your pull requests leave the leaderboard with you.",
    stay: "Stay in",
    droppedOut: "You dropped out.",

    // The leaderboard.
    boardName: "This week's top ten",
    championName: (name: string) => `Last week's winner: ${name}`,
    nobody: "No scores yet.",
    nobodyLine: "This week's top ten shows here.",
    lastWinner: "Last week's winner",
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
    weekly: "Le défi de la semaine.",
    kinds: { bounty: "Chasse aux bugs", hackathon: "Hackathon", challenge: "Défi de code" },

    ended: "Terminé",
    timeLeftName: (left) => `Temps restant : ${left}`,
    endedName: "Le défi de la semaine est terminé",
    daysLeft: (d) => `Encore ${d} jours`,
    dayLeft: (h) => `Encore 1 j ${h} h`,
    hoursLeft: (h, m) => `Encore ${h} h ${m} min`,
    minutesLeft: (m) => `Encore ${m} min`,
    secondsLeft: (s) => `Encore ${s} s`,
    endsAt: (when) => `Se termine le ${when}`,

    andTitle: (title) => `et le titre « ${title} » pour la première place`,
    forFirst: "pour la première place",
    entrants: (n) => `${n} en lice`,
    here: (n) => `${n} sur place`,
    entrantsName: (n) => `${pluriel(n, "personne", "personnes")} en lice`,
    crowdName: (n) => `${pluriel(n, "personne", "personnes")} dans l'arène en ce moment`,

    copied: "Copié",
    copyName: "Copier la commande git clone (de votre fork)",
    fork: "Forker",
    forkName: "Forker le dépôt sur GitHub : vous clonez votre fork et ouvrez votre pull request depuis lui",
    githubName: "Ouvrir le dossier sur GitHub",
    rules: "Règles",
    points: (n) => `${n} pts`,
    notOpen: "Le dépôt n'est pas encore public.",
    notOpenTitle: "Bientôt ouvert",

    stepsName: "Comment participer",
    stepsMeta: (n) => `${n} étapes`,
    rulesPoints: "Règles et points",
    pointsRange: (low, high) => (low === high ? `${low} pts` : `${low} à ${high} pts`),
    forkStep: "Forkez le dossier du défi",
    scoreLine: "Mergée avant la fin du défi, elle marque des points.",
    joined: "Inscrit·e",
    prStep: "Ouvrez une pull request",
    autoStep: "Prise en compte automatiquement",
    pasteStep: "Collez son lien ici",
    pasteInstead: "Coller un lien à la place",
    graded: "Les juges étiquettent les PR mergées",
    gradedName: (table) => `Les juges étiquettent chaque pull request mergée, et chaque étiquette vaut des points : ${table}`,
    mineChip: (n, pts) => `${n} PR · ${pts} pts`,
    mineChipName: (n, pts) => `${pluriel(n, "pull request envoyée", "pull requests envoyées")}, ${pts} points. Les voir dans le classement`,

    prizesName: "Prix",
    prizeName: (place, amount, title) => `${place} place : ${[amount, title ? `le titre « ${title} »` : "un badge de podium"].filter(Boolean).join(" et ")}`,

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

    dropOut: "Abandonner",
    dropOutName: "Abandonner le défi de la semaine",
    dropOutAsk: "Abandonner ?",
    dropOutLine: "Vous quittez le défi de la semaine.",
    dropOutMine: "Vos pull requests quittent le classement avec vous.",
    stay: "Rester",
    droppedOut: "Vous avez abandonné.",

    boardName: "Le top 10 de la semaine",
    championName: (name) => `Vainqueur de la semaine dernière : ${name}`,
    nobody: "Pas encore de score.",
    nobodyLine: "Le top 10 de la semaine s'affiche ici.",
    lastWinner: "Vainqueur de la semaine dernière",
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
