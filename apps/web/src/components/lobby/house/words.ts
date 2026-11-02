// The house panel's own words, in English and French (see i18n.ts): its head, tabs, rows and foot (HouseInside.vue),
// the floor plan (FloorPlan.vue), the bill and the tontine (exchange.ts)
// and paying a share (PayBill.vue). The things themselves (a house, a room, a knock) are named in panel/words.ts.
// The French says "vous", like the rest of the site, and keeps names (houses, rooms, projects, people) as they are.
import { defineWords, plural, pluriel } from "../../../i18n";

export const houseWords = defineWords(
  "house",
  {
    missing: "This house doesn't exist.",
    missingWhy: "Check the link.",
    failed: "That didn't load.",
    failedWhy: "Try again in a moment.",
    opening: "Opening the door…",
    inside: (name: string) => `Inside ${name}`,
    rooms: "Rooms",
    parts: "Parts of the house",
    // The tabs' keys are the API's names (chores, fridge); the words are what a newcomer understands.
    tabs: { rooms: "Floor plan", people: "Housemates", channel: "Channel", chores: "Reviews", fridge: "News", bill: "Bill" },
    // The floor plan (FloorPlan.vue).
    plan: {
      rooms: (n: number) => (n === 1 ? "room" : "rooms"),
      free: (n: number) => (n === 1 ? "free" : "free"),
      aMonth: "a month",
      yours: "Your room",
      freeRoom: "Free room",
      pays: (amount: string) => `${amount} a month.`,
      noDescription: "No project description",
    },
    // The housemates' list.
    peopleName: (who: string) => `${who}: their room and project`,
    chefTag: "chef",

    // The chef's invite chip in the head, and the review rule's switch beside its sentence.
    inviteCopied: "Invite link copied",
    copyInvite: "Copy an invite link",
    copied: "Copied",
    invite: "Invite",
    strictName: "Strict reviews",
    strictSentence: "Strict: merge after a flatmate approves.",
    relaxedSentence: "Relaxed: merge without waiting.",
    pressToSwitch: (sentence: string) => `${sentence} Press to switch.`,
    // Sharing the house (ShareHouse.vue): its key in the head, and the small card it opens.
    share: {
      name: (house: string) => `Share ${house}`,
      // The message that goes with the link.
      text: (house: string, city: string, link: string) => `Join ${house} in ${city} on La Coloc, the server you share with friends: ${link}`,
      copy: "Copy the link",
      whatsapp: "WhatsApp",
      whatsappName: "Send it on WhatsApp (opens in a new tab)",
      more: "Share…",
      onlyHere: "Works on this computer only.",
    },

    // The rooms' rows.
    roomForYou: "A room for you",
    // The "+N" row under a long room list: its hidden name (it shows only "+3").
    moreRooms: (n: number) => `Show ${plural(n, "more room", "more rooms")}`,
    takeIt: "Take it",
    yourPart: "Your part",
    freeRow: (memoryMb: number) => `${memoryMb} MB of memory`,
    noDescription: "No description yet.",
    noProject: "No project yet.",
    knock: "Knock",

    // The Reviews tab (chores.ts): the pull requests the house gave someone to review.
    reviews: {
      late: (late: number) => (late === 1 ? "1 review late. It adds to your rent." : `${late} reviews late. They add to your rent.`),
      todo: (count: number, credit: string) => `${plural(count, "review", "reviews")} to do. Each takes ${credit} off your rent.`,
      othersOnly: (count: number) => `Nothing for you. ${plural(count, "review", "reviews")} for flatmates.`,
      none: "Nothing to review.",
      yours: (author: string, title: string) => `Review ${author}'s “${title}”`,
      yoursNoAuthor: (title: string) => `Review “${title}”`,
      theirs: (reviewer: string, author: string, title: string) => `${reviewer} reviews ${author}'s “${title}”`,
      theirsYourPr: (reviewer: string, title: string) => `${reviewer} reviews your “${title}”`,
      theirsNoAuthor: (reviewer: string, title: string) => `${reviewer} reviews “${title}”`,
      dueLate: "Late",
      dueNow: "Due now",
      dueHours: (hours: number) => `Due in ${hours}h`,
      dueDays: (days: number) => `Due in ${plural(days, "day", "days")}`,
      showOthers: (count: number) => `Other reviews (${count})`,
      hideOthers: "Hide other reviews",
    },
    review: "Review",
    reviewName: (pr: string) => `Review ${pr} on GitHub (opens in a new tab)`,

    // The bill, when the API has no bill yet: the even split.
    paid: "Paid",
    toPay: "To pay",
    nothingToPay: "Nothing to pay",
    perMonth: (total: string, share: string) => `${total} a month, about ${share} a room.`,
    yourShare: (share: string) => `Your share: about ${share}.`,
    theirShare: (first: string, share: string) => `${first}'s share: about ${share}.`,
    noServerChef: "No server yet.",
    noServer: "No server yet.",
    markedPaid: "Marked as paid.",
    pay: (amount: string) => `Pay your ${amount}`,

    // The foot: the one next step.
    logInToKnock: "Log in to knock",
    waitingForServer: "Your server is coming",
    rentServer: "Rent the server",
    knockFree: "Knock on a free room",
    seeKnock: "See your knock",
    // The sentences the foot says when there's no button to press (crew.ts).
    foot: {
      waitChef: "The chef is renting the server.",
      example: "Example house. Rooms aren't available.",
      full: "All rooms taken.",
      chatAsked: "Chat request sent.",
      leaving: (date: string) => `You've moved out. On the bill until ${date}.`,
    },
    askChat: "Ask to join the chat",

    // A room's own page (RoomDetails.vue).
    details: {
      back: "Back to the house",
      // Its stats: the number, then the small word under it.
      memory: (mb: number) => (mb < 1024 ? `${mb} MB` : `${+(mb / 1024).toFixed(1)} GB`),
      memoryWord: "memory",
      cpuWord: "CPU",
      manage: "Manage",
      take: "Take this room",
      exampleOnly: "Example. Read only.",
    },

    // Guests in the house's chat, from outside a full house (the housemates' list).
    guests: {
      line: "Guest in the chat",
      remove: "Remove",
      removeName: (who: string) => `Take ${who} out of the chat`,
      leave: "Leave",
      leaveName: "Leave this house's chat",
    },

    // A person on a room's page or the housemates' list.
    person: {
      room: (name: string) => `Room ${name}`,
      chat: "Chat",
      chatName: (first: string) => `Chat with ${first}`,
      projectName: (first: string) => `${first}'s project (opens a new tab)`,
      github: "GitHub",
      githubName: (login: string) => `@${login} on GitHub (opens a new tab)`,
    },


    // The exchange in sentences (exchange.ts).
    thisMonth: "this month",
    reviewsTraded: (n: number) => (n > 0 ? `${plural(n, "review", "reviews")} traded this month.` : "No reviews traded this month."),
    billHead: (total: string, month: string, credit: string) => `${total} for ${month}, split by use. Each review takes ${credit} off.`,
    pool: (pool: string) => `The house pool covers ${pool}.`,
    you: "You",
    reviewed: (who: string, you: boolean, prs: number, credit: string) => `${who} reviewed ${plural(prs, "PR", "PRs")}: ${credit} off.`,
    notReviewed: (who: string, you: boolean) => `${who} ${you ? "haven't" : "hasn't"} reviewed a PR yet.`,
    skipped: (surcharge: string) => `Skipped reviews add ${surcharge}. `,
    arenaPrize: (prize: string) => `Arena prize: ${prize} off, paid by La Coloc. `,
    hasPaid: (who: string, you: boolean, amount: string) => `${who} paid ${amount}.`,
    owesNothing: (who: string, you: boolean) => `${who} ${you ? "owe" : "owes"} nothing this month.`,
    owes: (who: string, you: boolean, amount: string) => `${who} ${you ? "owe" : "owes"} ${amount}.`,
    tontineProject: (day: string, you: boolean, first: string, project: string) =>
      `Until ${day}, ${you ? "your" : `${first}'s`} ${project} is reviewed first.`,
    tontinePerson: (day: string, you: boolean, first: string) => `Until ${day}, ${you ? "your" : `${first}'s`} PRs are reviewed first.`,
    ruleStrict: "Merges wait for a flatmate's approval.",
    ruleRelaxed: "Merges go online without waiting for a review.",

    // Paying a share (PayBill.vue): "Send 3 000 FCFA [copy] with Wave to the chef, and write LC-… [copy] in its note."
    payTitle: (amount: string) => `Pay your ${amount}.`,
    cantMark: "This server can't mark payments yet.",
    back: "Back",
    marking: "One moment…",
    markPaid: "Pay from my credit",
  },
  {
    missing: "Cette maison n'existe pas.",
    missingWhy: "Vérifiez le lien.",
    failed: "Ça n'a pas chargé.",
    failedWhy: "Réessayez dans un instant.",
    opening: "On ouvre la porte…",
    inside: (name) => `Dans ${name}`,
    rooms: "Chambres",
    parts: "Les pièces de la maison",
    tabs: { rooms: "Plan", people: "Colocs", channel: "Salon", chores: "Revues", fridge: "Nouvelles", bill: "Facture" },
    plan: {
      rooms: (n) => (n === 1 ? "chambre" : "chambres"),
      free: (n) => (n === 1 ? "libre" : "libres"),
      aMonth: "par mois",
      yours: "Votre chambre",
      freeRoom: "Chambre libre",
      pays: (amount) => `${amount} par mois.`,
      noDescription: "Pas de description du projet",
    },
    peopleName: (who) => `${who} : sa chambre et son projet`,
    chefTag: "chef",

    inviteCopied: "Lien d'invitation copié",
    copyInvite: "Copier un lien d'invitation",
    copied: "Copié",
    invite: "Inviter",
    strictName: "Revues strictes",
    strictSentence: "Strict : merge après l'accord d'un coloc.",
    relaxedSentence: "Souple : merge sans attendre.",
    pressToSwitch: (sentence) => `${sentence} Appuyez pour changer.`,
    share: {
      name: (house) => `Partager ${house}`,
      text: (house, city, link) => `Rejoignez ${house} à ${city} sur La Coloc, le serveur qu'on partage entre amis : ${link}`,
      copy: "Copier le lien",
      whatsapp: "WhatsApp",
      whatsappName: "L'envoyer sur WhatsApp (s'ouvre dans un nouvel onglet)",
      more: "Partager…",
      onlyHere: "Ne marche que sur cet ordinateur.",
    },

    roomForYou: "Une chambre pour vous",
    moreRooms: (n) => `Voir ${pluriel(n, "autre chambre", "autres chambres")}`,
    takeIt: "La prendre",
    yourPart: "Votre part",
    freeRow: (memoryMb) => `${memoryMb} Mo de mémoire`,
    noDescription: "Pas encore de description.",
    noProject: "Pas encore de projet.",
    knock: "Frapper",

    reviews: {
      late: (late) => (late === 1 ? "1 revue en retard. Elle alourdit votre loyer." : `${late} revues en retard. Elles alourdissent votre loyer.`),
      todo: (count, credit) => `${pluriel(count, "revue", "revues")} à faire. Chacune retire ${credit} du loyer.`,
      othersOnly: (count) => `Rien pour vous. ${pluriel(count, "revue", "revues")} pour les colocs.`,
      none: "Rien à relire.",
      yours: (author, title) => `Relire « ${title} » de ${author}`,
      yoursNoAuthor: (title) => `Relire « ${title} »`,
      theirs: (reviewer, author, title) => `${reviewer} relit « ${title} » de ${author}`,
      theirsYourPr: (reviewer, title) => `${reviewer} relit votre « ${title} »`,
      theirsNoAuthor: (reviewer, title) => `${reviewer} relit « ${title} »`,
      dueLate: "En retard",
      dueNow: "À rendre maintenant",
      dueHours: (hours) => `À rendre dans ${hours} h`,
      dueDays: (days) => `À rendre dans ${pluriel(days, "jour", "jours")}`,
      showOthers: (count) => `Autres revues (${count})`,
      hideOthers: "Masquer les autres revues",
    },
    review: "Relire",
    reviewName: (pr) => `Relire ${pr} sur GitHub (s'ouvre dans un nouvel onglet)`,

    paid: "Payé",
    toPay: "À payer",
    nothingToPay: "Rien à payer",
    perMonth: (total, share) => `${total} par mois, environ ${share} par chambre.`,
    yourShare: (share) => `Votre part : environ ${share}.`,
    theirShare: (first, share) => `Part de ${first} : environ ${share}.`,
    noServerChef: "Pas encore de serveur.",
    noServer: "Pas encore de serveur.",
    markedPaid: "Marqué comme payé.",
    pay: (amount) => `Payer ${amount}`,

    logInToKnock: "Se connecter pour frapper",
    waitingForServer: "Votre serveur arrive",
    rentServer: "Louer le serveur",
    knockFree: "Frapper à une chambre libre",
    seeKnock: "Voir ma demande",
    foot: {
      waitChef: "Le chef loue le serveur.",
      example: "Maison d'exemple. Chambres indisponibles.",
      full: "Toutes les chambres sont prises.",
      chatAsked: "Demande envoyée.",
      leaving: (date) => `Vous avez déménagé. Sur la facture jusqu'au ${date}.`,
    },
    askChat: "Demander à rejoindre la discussion",

    details: {
      back: "Retour à la maison",
      memory: (mb) => (mb < 1024 ? `${mb} Mo` : `${+(mb / 1024).toFixed(1)} Go`),
      memoryWord: "mémoire",
      cpuWord: "CPU",
      manage: "Gérer",
      take: "Prendre cette chambre",
      exampleOnly: "Exemple. Lecture seule.",
    },

    guests: {
      line: "Invité dans la discussion",
      remove: "Retirer",
      removeName: (who) => `Retirer ${who} de la discussion`,
      leave: "Quitter",
      leaveName: "Quitter la discussion de cette maison",
    },

    person: {
      room: (name) => `Chambre ${name}`,
      chat: "Discuter",
      chatName: (first) => `Discuter avec ${first}`,
      projectName: (first) => `Le projet de ${first} (nouvel onglet)`,
      github: "GitHub",
      githubName: (login) => `@${login} sur GitHub (nouvel onglet)`,
    },


    thisMonth: "ce mois-ci",
    reviewsTraded: (n) => (n > 0 ? `${pluriel(n, "revue échangée", "revues échangées")} ce mois-ci.` : "Aucune revue échangée ce mois-ci."),
    billHead: (total, month, credit) => `${total} pour ${month}, partagés selon l'usage. Chaque revue en retire ${credit}.`,
    pool: (pool) => `La caisse commune couvre ${pool}.`,
    you: "Vous",
    reviewed: (who, you, prs, credit) => `${who} ${you ? "avez" : "a"} relu ${prs} PR : ${credit} en moins.`,
    notReviewed: (who, you) => (you ? "Vous n'avez pas encore relu de PR." : `${who} n'a pas encore relu de PR.`),
    skipped: (surcharge) => `Les revues manquées ajoutent ${surcharge}. `,
    arenaPrize: (prize) => `Prix de l'arène : ${prize} de moins, payés par La Coloc. `,
    hasPaid: (who, you, amount) => `${who} ${you ? "avez" : "a"} payé ${amount}.`,
    owesNothing: (who, you) => (you ? "Vous ne devez rien ce mois-ci." : `${who} ne doit rien ce mois-ci.`),
    owes: (who, you, amount) => (you ? `Vous devez ${amount}.` : `${who} doit ${amount}.`),
    tontineProject: (day, you, first, project) =>
      `Jusqu'au ${day}, ${project} (${you ? "le vôtre" : `de ${first}`}) est relu en premier.`,
    tontinePerson: (day, you, first) => `Jusqu'au ${day}, ${you ? "vos PR sont relues" : `les PR de ${first} sont relues`} en premier.`,
    ruleStrict: "Un merge attend l'accord d'un coloc.",
    ruleRelaxed: "Un merge part en ligne sans attendre de revue.",

    payTitle: (amount) => `Payez votre part : ${amount}.`,
    cantMark: "Ce serveur ne sait pas encore enregistrer les paiements.",
    back: "Retour",
    marking: "Un instant…",
    markPaid: "Payer avec mon crédit",
  },
);
