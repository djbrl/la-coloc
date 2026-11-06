// The API's refusals in the reader's language. The API says no in an English sentence that says what to do, and,
// for the ones people meet (chat, knocks, invitations, the tutorial), adds a stable `code` and what the sentence
// needs ({ message, code: "tooLong", max: 500 }). In English the API's own sentence is shown; in French the one
// here, by code. A refusal without a code, or with one this page doesn't know yet, shows the API's English.
// refusals.test.ts checks that every code the API writes has its French here.
import { language, nbsp } from "./i18n";

/** What the API sends back with a refusal. */
export type Refusal = { message: string; code?: unknown; [blank: string]: unknown };

const fr: Record<string, (r: Refusal) => string> = {
  logInFirst: () => "Connectez-vous d'abord.",
  // Deleting your account.
  typeYourLogin: () => "Tapez votre identifiant pour confirmer.",

  // Buying credit with PayDunya.
  topUpClosed: () => "On ne peut pas acheter de crédit ici.",
  topUpAmount: () => "Choisissez un des montants proposés.",
  topUpDown: () => "PayDunya ne répond pas. Réessayez dans un instant.",

  // Chat: direct messages, a city's room and its board.
  adminsOnly: () => "Seuls les admins de la ville peuvent lire les signalements.",
  noCity: () => "Cette ville n'existe pas.",
  youBlocked: () => "Vous avez bloqué cette personne. Débloquez-la pour lui écrire.",
  theyBlocked: () => "Cette personne n'accepte pas vos messages.",
  noMessage: () => "Ce message n'existe pas.",
  noPost: () => "Cette annonce n'existe pas.",
  noReply: () => "Cette réponse n'existe pas.",
  onlyAuthorPost: () => "Seul son auteur peut supprimer une annonce.",
  onlyAuthorReply: () => "Seul son auteur peut supprimer une réponse.",
  reportOwn: () => "C'est à vous : supprimez-le plutôt que de le signaler.",
  reportHouse: () => "C'est la maison qui parle : il n'y a personne à signaler.",
  nobodyInCity: () => "Personne ne porte ce nom dans la ville.",
  thatsYou: () => "C'est vous.",
  writeSomething: () => "Écrivez quelque chose d'abord.",
  tooLong: (r) => `Moins de ${r.max} caractères, s'il vous plaît.`,
  slowDownMessages: () => "Doucement : attendez quelques secondes avant de réécrire.",
  slowDownPosts: () => "Ça fait beaucoup d'annonces pour une heure. Réessayez plus tard.",

  // The Arena: the week's challenge, its pull requests and the titles won.
  arenaBadUrl: () => "Collez l'adresse d'une pull request, comme https://github.com/compte/depot/pull/12.",
  arenaWrongRepo: (r) => (typeof r.repo === "string" ? `Envoyez-la au dépôt de l'arène, ${r.repo}.` : "Envoyez-la au dépôt de l'arène."),
  arenaNotYourPr: () => "Cette pull request a été ouverte par quelqu'un d'autre. Envoyez une des vôtres.",
  arenaPrTooOld: () => "Cette pull request date d'avant le début du défi de la semaine. Ouvrez-en une nouvelle.",
  arenaPrNotFound: () => "GitHub ne trouve pas cette pull request. Vérifiez l'adresse.",
  arenaAlreadySubmitted: () => "Cette pull request est déjà inscrite au défi de la semaine.",
  arenaGithubDown: () => "GitHub ne répond pas. Réessayez dans une minute.",
  arenaOtherCity: (r) => (typeof r.city === "string" ? `Vous êtes déjà dans l'arène de ${r.city} cette semaine : une arène par semaine.` : "Vous êtes déjà dans une autre arène cette semaine : une arène par semaine."),
  arenaJudge: () => "Vous êtes juge de l'arène (vous mergez et étiquetez ses pull requests) : vous ne pouvez pas y participer.",
  arenaGithubNeeded: () => "Connectez-vous avec GitHub pour envoyer des pull requests : c'est ainsi qu'on sait qu'elles sont à vous.",
  arenaNoSubmission: () => "Vous n'avez pas cette pull request dans le défi de la semaine.",
  arenaNoAward: () => "Ce titre n'est pas à vous.",
  slowDownArena: () => "Ça fait beaucoup de pull requests pour une heure. Réessayez plus tard.",

  // The city's credit, and the limits on what one person can take.
  no_credit: (r) => `Il vous manque ${r.need} FCFA. Relisez le code d'un coloc ou gagnez l'arène pour en gagner.`,
  server_limit: () => "Un serveur par personne : vous en avez déjà un. Vous pouvez prendre d'autres chambres dans cette maison.",
  room_limit: (r) => `${r.max} chambres par personne. Rendez-en une pour en prendre une autre.`,
  takeMembersOnly: () => "Seuls les gens qui habitent cette maison peuvent y prendre une autre chambre. Frappez plutôt à sa porte.",
  takeNotHere: () => "Cette chambre n'est pas à prendre.",
  leaseNotYours: () => "Ce n'est pas votre chambre.",
  leaseNotHere: () => "Cette chambre n'a pas de bail à rendre.",
  project_limit: (r) => `${r.max} projets par personne. Videz une de vos chambres pour en lancer un autre.`,

  // Knocking on a house.
  demoHouseKnock: () => "C'est une maison d'exemple : personne n'habite ici pour vous ouvrir.",
  roomTaken: () => "Quelqu'un habite déjà cette chambre.",
  sshNoGithub: () => "Ce compte n'est pas un compte GitHub.",
  sshPrivateKey: () => "C'est une clé privée, elle reste sur votre ordinateur. Collez le fichier .pub.",
  sshBadKey: () => "Ce n'est pas une clé publique. Elle commence par ssh-ed25519 ou ssh-rsa.",
  sshGithubDown: () => "GitHub n'a pas répondu. Réessayez.",
  sshKeyLimit: (r) => `${r.max} clés par personne. Retirez-en une d'abord.`,
  alreadyLiveHere: () => "Vous habitez déjà ici.",
  alreadyKnocked: () => "Vous avez déjà frappé à cette maison.",
  knockClosed: () => "Cette demande est close.",
  flatmatesOnlyTalk: () => "Seuls les colocs peuvent parler dans le salon.",
  flatmatesOnlyVote: () => "Seuls les colocs votent.",
  knockDecided: () => "Cette demande a déjà été tranchée.",
  knockerOnlyWithdraws: () => "Seule la personne qui a frappé peut retirer sa demande.",
  slowDownKnock: () => "Doucement : trop de messages en une minute.",

  // Invitations.
  noHouse: () => "Cette maison n'existe pas.",
  inviteMembersOnly: () => "Seuls les habitants d'une maison peuvent y inviter quelqu'un.",
  exampleHouseInvite: () => "C'est une maison d'exemple : personne ne peut y emménager.",
  workshopInvite: () => "L'atelier sert à s'entraîner. Invitez cette personne dans une vraie maison.",
  alreadyFlatmate: () => "Cette personne habite déjà cette maison.",
  roomNotFree: () => "Cette chambre n'est plus libre.",
  houseFull: () => "Votre maison est pleine : aucune chambre libre à proposer.",
  tooManyInvites: () => "Ça fait beaucoup d'invitations pour une journée. Réessayez demain.",
  noInvite: () => "Cette invitation n'existe pas.",
  inviteAnswered: () => "Cette invitation a déjà reçu une réponse.",
  inviteWithdrawn: () => "La personne a repris son invitation.",
  nothingToAnswer: () => "Il n'y a rien à répondre ici.",
  nobodyByLogin: () => "Personne ne porte ce nom sur La Coloc.",
  inviteYourself: () => "Vous ne pouvez pas vous inviter vous-même.",
  youBlockedInvite: () => "Vous avez bloqué cette personne. Débloquez-la pour l'inviter.",
  theyBlockedInvite: () => "Cette personne n'accepte pas vos invitations.",
  examplePersonInvite: () => "C'est une personne d'exemple : personne ne recevrait l'invitation.",
  alreadyInvited: () => "Invitation déjà envoyée. La personne la verra sous sa cloche.",
  saidNoToday: () => "Cette personne a dit non aujourd'hui. Réessayez un autre jour.",
  houseGone: () => "Cette maison n'existe plus.",
  senderMovedOut: () => "La personne n'y habite plus : l'invitation est tombée.",
  roomTakenFirst: () => "Quelqu'un d'autre a pris cette chambre avant vous.",
  inviteExpired: () => "Cette invitation a expiré.",
  inviteLapsed: () => "Cette invitation n'est plus valable.",

  // Friends.
  alreadyFriends: () => "Vous êtes déjà amis.",
  notFriends: () => "Cette personne n'est pas dans vos amis.",
  friendRequestLapsed: () => "Cette demande d'ami n'est plus valable.",

  noRoom: () => "Cette chambre n'existe pas.",

  // A full house's group chat.
  guestExampleHouse: () => "C'est une maison d'exemple : personne ne répondrait.",
  guestLivesHere: () => "Vous habitez ici : la discussion est déjà la vôtre.",
  guestRoomFree: () => "Une chambre est libre ici. Frappez plutôt.",
  guestAlreadyIn: () => "Vous êtes déjà dans la discussion de cette maison.",
  guestAlreadyAsked: () => "Vous avez déjà demandé. Un coloc répondra.",
  tooManyGuestAsks: () => "Beaucoup de maisons pour une journée. Réessayez demain.",
  notGuest: () => "Cette personne n'est pas invitée dans cette discussion.",
  guestFlatmatesOnly: () => "Seuls les colocs peuvent retirer un invité de la discussion.",
  guestLeftHouse: () => "Vous n'habitez plus cette maison : la demande a expiré.",

  // A room's code and deploys.
  alreadyDeploying: () => "Cette chambre est déjà en train d'être mise en ligne. Attendez la fin.",
  slowDownDeploys: () => "Ça fait beaucoup de mises en ligne en quelques minutes. Attendez un peu avant la suivante.",
  flatmateOnlySource: () => "Seul le coloc qui habite ici peut changer d'où vient le code de la chambre.",
  httpsRepo: () => "Le dépôt doit être une adresse https://.",
  serverOffline: () => "Le serveur de la maison est éteint.",
  nothingBuilding: () => "Rien n'est en construction dans cette chambre.",

  // The tutorial.
  takeRoomFirst: () => "Prenez d'abord une chambre.",
  githubLoginNeeded: () => "Connectez-vous avec GitHub pour apporter votre propre projet.",
  repoNotVisible: () => "La Coloc ne voit pas ce dépôt. Autorisez-le d'abord sur GitHub.",
  repoTaken: (r) => `${r.repo} est déjà installé dans une autre chambre.`,
  githubDown: () => "GitHub ne répond pas. Réessayez dans une minute.",
  takeWorkshopRoomFirst: () => "Prenez d'abord une chambre dans l'atelier.",
  workshopOffline: () => "Le serveur de l'atelier est éteint.",
  linkRepoFirst: () => "Liez d'abord un dépôt sur GitHub.",
  noWorkshop: () => "Il n'y a pas d'atelier sur ce serveur.",
};

/** The codes this page can say in French, for the test. */
export const frenchRefusals: readonly string[] = Object.keys(fr);

/** A refusal in the reader's language: the French for its code, else the API's own sentence. */
export function refusalText(r: Refusal): string {
  if (language.lang !== "fr" || typeof r.code !== "string" || !Object.hasOwn(fr, r.code)) return r.message;
  return nbsp(fr[r.code](r));
}
