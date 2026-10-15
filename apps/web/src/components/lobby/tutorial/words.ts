// The quest's words, "Your first home", in English and French (see i18n.ts): the welcome card and the city's card
// (Welcome.vue), the chapters' names (QuestTracker.vue), the coach at the bottom of the screen (Coach.vue), and the
// big moments: the keys (KeysCard.vue), the launch (LaunchCard.vue), sharing (ShareCard.vue) and "Welcome home"
// (HomeCard.vue). The one-time tips that come after are in tips.ts. The French says "vous", like the rest of the site.
import { defineWords } from "../../../i18n";
import type { Chapter, HouseCard, Stage } from "./tutorial";

const CHAPTER_NAMES: Record<Chapter, string> = {
  arrive: "Arrive",
  find: "Find a home",
  keys: "Get the keys",
  project: "Bring a project",
  launch: "Launch it",
  open: "Open it",
  share: "Show it off",
  house: "Meet the house",
};
const STAGE_NAMES: Record<Stage, string> = { fetch: "Fetching your code", build: "Building", start: "Starting", live: "Live" };
const HOUSE_CARD_TITLES: Record<HouseCard, string> = { flatmates: "Your flatmates", reviews: "Reviews", news: "News" };

export const tutorialWords = defineWords(
  "tutorial",
  {
    // The quest and its chapters (the tracker at the top).
    quest: "Your first home",
    chapters: CHAPTER_NAMES,
    chapterOf: (n: number, total: number, name: string) => `Chapter ${n} of ${total}: ${name}`,
    stampDone: "done",
    stampNow: "now",
    stampLater: "to come",
    // The line of news when a chapter is stamped.
    stamped: (n: number) => `Chapter ${n} done. Well done!`,

    // The first card, before anything else.
    welcome: "Welcome to La Coloc.",
    pitch: "A city of dev houses, from Dakar to Kigali. Each house is a server a few developers share.",
    promise: "In five minutes: your own room, your project online, and a link to show your friends.",
    start: "Start",
    skip: "Not now",
    welcomeBack: "Welcome back.",
    resumeAt: (n: number, name: string) => `You were at chapter ${n}: ${name}.`,
    continue: "Continue",
    fromStart: "From the start",
    // The last card, in the real city.
    city: "Welcome to the city.",
    cityPitch: "Every lit window is someone's project. Go into a house to see who lives there and what they build. Knock on a free room, and the house votes.",
    cityHint: "The city's name, top left, takes you to other cities. The quest is in settings.",
    letsGo: "Let's go",

    // The coach.
    waiting: "Waiting for the city…",
    waitingWhy: "Your place is kept. We'll go on when it's back.",
    missing: "The quest isn't on this server yet.",
    leave: "Leave",
    walkTouch: "Tap the ground to walk there.",
    walkKeys: "Walk with W A S D, or click the ground.",
    look: "There's a free room down the street. Follow the light.",
    goTouch: "Walk to the light and tap Go in at the door.",
    goKeys: "Walk to the light and press E at the door.",
    room: "A room is free. Take it.",
    roomWhy: "It's your share of this house's server, for one project.",
    takeRoom: "Take the room",

    // Chapter 3: the keys.
    keysTitle: "It's yours.",
    keysLine: (room: string, house: string) => `Room ${room} in ${house}. Your name is on the door.`,
    keysTag: "Your room",
    moveIn: "Move in",

    // Chapter 4: bring a project.
    projectTitle: "What goes in your room?",
    projectWhy: "A project is an app: a site, an API, a bot. Its code lives in a Git repo.",
    starter: "A ready-made page",
    starterWhy: "Your name, your house, your city. Online in a minute.",
    own: "My own, from GitHub",
    ownWhy: "Pick one of your repos on GitHub.",
    ownOff: "GitHub isn't set up on this server.",
    waitingGithub: "On GitHub, pick a repo and press Install. We'll see it here.",
    openGithub: "Open GitHub",
    linkedRepo: (repo: string) => `${repo} is linked to your room.`,
    linkedSome: "A repo is linked to your room.",
    putOnline: "Put it online",
    useStarter: "Use the ready-made page",
    back: "Back",

    // Chapter 5: the launch.
    launching: "Putting it online",
    stages: STAGE_NAMES,
    stageOf: (n: number, total: number, name: string) => `Step ${n} of ${total}: ${name}`,
    seconds: (s: number) => `${s} s`,
    liveTitle: "It's live!",
    failed: "It didn't go online.",
    failedWhy: "The build stopped with:",
    tryAgain: "Try again",

    // Chapter 6: open it.
    openTitle: "Your project has an address.",
    openWhy: "Anyone with it can open your page, from anywhere.",
    openIt: "Open it",
    opensInTab: "(opens in a new tab)",

    // Chapter 7: show it off.
    shareTitle: "Show it off.",
    shareWhy: "Send the link to a friend, or scan it with your phone.",
    shareText: (url: string) => `I just moved into La Coloc, a city of dev houses. My first project is online: ${url}`,
    shareTitleText: "My first project on La Coloc",
    copy: "Copy the link",
    copied: "Copied",
    whatsapp: "WhatsApp",
    whatsappName: "Send it on WhatsApp (opens in a new tab)",
    shareMore: "Share…",
    qrName: (address: string) => `QR code for ${address}. Scan it with your phone's camera.`,
    scan: "Scan with your phone",
    postcardFrom: (house: string, city: string) => `From ${house}, ${city}`,
    later: "Later",

    // Chapter 8: meet the house, one idea per card.
    houseTitles: HOUSE_CARD_TITLES,
    flatmatesLine: "Each face is a flatmate, with a room like yours. Say hi in the house's chat.",
    reviewsLine: (credit: string) => `Your flatmates review your code; you review theirs. Each review takes ${credit} off your rent.`,
    newsLine: "The house pins a note here when something happens. Look: your move is on it.",
    houseCardOf: (n: number, total: number) => `${n}/${total}`,
    next: "Next",
    gotIt: "Got it",

    // "Welcome home": the end of the quest.
    homeTitle: (first: string) => `Welcome home, ${first}.`,
    homeTitlePlain: "Welcome home.",
    homeLine: "You have a room, a project online, and flatmates next door.",
    homeNext: "Next, the city: visit houses, meet developers, and knock on one you'd like to live in.",
    intoCity: "Into the city",

    // The workshop before the API has said anything about it.
    workshopTagline: "Where newcomers take their first room.",
  },
  {
    quest: "Votre premier chez-vous",
    chapters: {
      arrive: "Arriver",
      find: "Trouver un toit",
      keys: "Prendre les clés",
      project: "Apporter un projet",
      launch: "Le lancer",
      open: "L'ouvrir",
      share: "Le montrer",
      house: "Rencontrer la maison",
    },
    chapterOf: (n, total, name) => `Chapitre ${n} sur ${total} : ${name}`,
    stampDone: "fait",
    stampNow: "en cours",
    stampLater: "à venir",
    stamped: (n) => `Chapitre ${n} terminé. Bravo !`,

    welcome: "Bienvenue à La Coloc.",
    pitch: "Une ville de maisons de devs, de Dakar à Kigali. Chaque maison est un serveur que quelques développeurs partagent.",
    promise: "En cinq minutes : votre chambre, votre projet en ligne, et un lien à montrer à vos amis.",
    start: "Commencer",
    skip: "Pas maintenant",
    welcomeBack: "Bon retour.",
    resumeAt: (n, name) => `Vous en étiez au chapitre ${n} : ${name}.`,
    continue: "Continuer",
    fromStart: "Depuis le début",
    city: "Bienvenue en ville.",
    cityPitch: "Chaque fenêtre allumée est le projet de quelqu'un. Entrez dans une maison pour voir qui y vit et ce qu'on y construit. Frappez à une chambre libre, et la maison vote.",
    cityHint: "Le nom de la ville, en haut à gauche, mène aux autres villes. La quête est dans les réglages.",
    letsGo: "C'est parti",

    waiting: "En attente de la ville…",
    waitingWhy: "Votre place est gardée. On reprend dès qu'elle revient.",
    missing: "La quête n'est pas encore sur ce serveur.",
    leave: "Quitter",
    walkTouch: "Touchez le sol pour y aller.",
    walkKeys: "Marchez avec W A S D, ou cliquez sur le sol.",
    look: "Il y a une chambre libre au bout de la rue. Suivez la lumière.",
    goTouch: "Marchez jusqu'à la lumière et touchez Entrer à la porte.",
    goKeys: "Marchez jusqu'à la lumière et appuyez sur E à la porte.",
    room: "Une chambre est libre. Prenez-la.",
    roomWhy: "C'est votre part du serveur de cette maison, pour un projet.",
    takeRoom: "Prendre la chambre",

    keysTitle: "Elle est à vous.",
    keysLine: (room, house) => `Chambre ${room} à ${house}. Votre nom est sur la porte.`,
    keysTag: "Votre chambre",
    moveIn: "Emménager",

    projectTitle: "Qu'est-ce qu'on met dans votre chambre ?",
    projectWhy: "Un projet, c'est une app : un site, une API, un bot. Son code est dans un dépôt Git.",
    starter: "Une page toute prête",
    starterWhy: "Votre nom, votre maison, votre ville. En ligne en une minute.",
    own: "Le mien, depuis GitHub",
    ownWhy: "Choisissez un de vos dépôts sur GitHub.",
    ownOff: "GitHub n'est pas configuré sur ce serveur.",
    waitingGithub: "Sur GitHub, choisissez un dépôt et appuyez sur Install. On le verra ici.",
    openGithub: "Ouvrir GitHub",
    linkedRepo: (repo) => `${repo} est relié à votre chambre.`,
    linkedSome: "Un dépôt est relié à votre chambre.",
    putOnline: "Mettre en ligne",
    useStarter: "Prendre la page toute prête",
    back: "Retour",

    launching: "Mise en ligne",
    stages: { fetch: "On récupère le code", build: "Construction", start: "Démarrage", live: "En ligne" },
    stageOf: (n, total, name) => `Étape ${n} sur ${total} : ${name}`,
    seconds: (s) => `${s} s`,
    liveTitle: "C'est en ligne !",
    failed: "La mise en ligne n'a pas marché.",
    failedWhy: "La construction s'est arrêtée sur :",
    tryAgain: "Réessayer",

    openTitle: "Votre projet a une adresse.",
    openWhy: "Avec elle, n'importe qui peut ouvrir votre page, de n'importe où.",
    openIt: "L'ouvrir",
    opensInTab: "(s'ouvre dans un nouvel onglet)",

    shareTitle: "Montrez-le.",
    shareWhy: "Envoyez le lien à un ami, ou scannez-le avec votre téléphone.",
    shareText: (url) => `Je viens d'emménager à La Coloc, une ville de maisons de devs. Mon premier projet est en ligne : ${url}`,
    shareTitleText: "Mon premier projet sur La Coloc",
    copy: "Copier le lien",
    copied: "Copié",
    whatsapp: "WhatsApp",
    whatsappName: "L'envoyer sur WhatsApp (s'ouvre dans un nouvel onglet)",
    shareMore: "Partager…",
    qrName: (address) => `QR code de ${address}. Scannez-le avec l'appareil photo de votre téléphone.`,
    scan: "Scannez avec votre téléphone",
    postcardFrom: (house, city) => `Depuis ${house}, ${city}`,
    later: "Plus tard",

    houseTitles: { flatmates: "Vos colocs", reviews: "Revues", news: "Nouvelles" },
    flatmatesLine: "Chaque visage est un coloc, avec une chambre comme la vôtre. Dites bonjour dans le salon de la maison.",
    reviewsLine: (credit) => `Vos colocs relisent votre code ; vous relisez le leur. Chaque revue retire ${credit} de votre loyer.`,
    newsLine: "La maison épingle un mot ici quand il se passe quelque chose. Regardez : votre arrivée y est.",
    houseCardOf: (n, total) => `${n}/${total}`,
    next: "Suivant",
    gotIt: "Compris",

    homeTitle: (first) => `Bienvenue chez vous, ${first}.`,
    homeTitlePlain: "Bienvenue chez vous.",
    homeLine: "Vous avez une chambre, un projet en ligne, et des colocs à côté.",
    homeNext: "Ensuite, la ville : visitez des maisons, rencontrez des développeurs, et frappez à celle où vous aimeriez vivre.",
    intoCity: "Vers la ville",

    workshopTagline: "Là où les nouveaux prennent leur première chambre.",
  },
);
