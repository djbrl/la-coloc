// The sentences the API writes by itself, said in the reader's language: fridge notes ("Awa's app crashed.") and the
// house's own lines in a knock's thread ("The house said yes."). The API sends each with `said`, its kind and what
// fills its blanks (apps/api/src/houses/lines.ts holds the English templates); this says it in English or French.
// A kind this page doesn't know, or a text the API couldn't read (an older wording), shows the API's
// own English text.
import { defineWords } from "../i18n";
import type { Said } from "../types";

type P = Record<string, string>;

const notesEn = {
  oom: (p: P) => `${p.name}'s app ate all its memory and got restarted. The other rooms didn't notice.`,
  crashed: (p: P) => `${p.name}'s app crashed. Restarting it.`,
  backUp: (p: P) => `${p.name}'s app is back up.`,
  shipped: (p: P) => `${p.name} shipped a new version.`,
  deployFailed: (p: P) => `${p.name}'s deploy failed: ${p.reason}. The previous version is still running.`,
  movedIn: (p: P) => `${p.name} moved in. Welcome home!`,
  reposMoved: (p: P) => `${p.name} moved ${p.repos} into their room.`,
  knocked: (p: P) => `${p.name} knocked on a free room. Answer the door!`,
  mergedStrict: (p: P) => `${p.ref} was merged without a flatmate's approval. Strict house: not deployed.`,
  mergedRelaxed: (p: P) => `${p.ref} was merged without a flatmate's approval. Relaxed house: deploying anyway.`,
  mergedOffline: (p: P) => `${p.ref} was merged, but the house's server is offline. Not deployed.`,
  restartedOwn: (p: P) => `${p.name} restarted their app.`,
  restartedFree: (p: P) => `${p.name} restarted the app in a free room.`,
  restartedOther: (p: P) => `${p.name} restarted ${p.other}'s app.`,
  reviewedLate: (p: P) => `${p.name} reviewed ${p.ref} (late, but done). Merci!`,
  reviewed: (p: P) => `${p.name} reviewed ${p.ref}. Merci!`,
  reviewLate: (p: P) => `${p.name} hasn't reviewed ${p.ref} yet. It was due ${p.hours}h after it opened.`,
  paidBill: (p: P) => `${p.name} paid their part of this month's bill.`,
  firstProject: (p: P) => `${p.name} put their first project online. Welcome!`,
};

const knockEn = {
  knocked: (p: P) => `${p.name} knocked on a free room.`,
  yes: (p: P) => `The house said yes. Welcome home, ${p.name}!`,
  no: (_p: P) => "The house said no this time. Thanks for knocking.",
  taken: (_p: P) => "Someone else moved into this room first. Knock on another one?",
  withdrawn: (_p: P) => "They withdrew their knock.",
  invited: (_p: P) => "They moved in at a flatmate's invitation.",
};

const noteWords = defineWords("said.notes", notesEn, {
  oom: (p) => `L'app de ${p.name} a pris toute sa mémoire et a été redémarrée. Les autres chambres n'ont rien senti.`,
  crashed: (p) => `L'app de ${p.name} a planté. Elle redémarre.`,
  backUp: (p) => `L'app de ${p.name} tourne de nouveau.`,
  shipped: (p) => `${p.name} a mis en ligne une nouvelle version.`,
  deployFailed: (p) => `Le déploiement de ${p.name} a échoué : ${p.reason}. La version d'avant tourne toujours.`,
  movedIn: (p) => `${p.name} a emménagé. Bienvenue !`,
  reposMoved: (p) => `${p.name} a installé ${p.repos} dans sa chambre.`,
  knocked: (p) => `${p.name} a frappé à une chambre libre. Allez ouvrir !`,
  mergedStrict: (p) => `${p.ref} a été mergée sans l'accord d'un coloc. Revues strictes : pas mise en ligne.`,
  mergedRelaxed: (p) => `${p.ref} a été mergée sans l'accord d'un coloc. Revues souples : mise en ligne quand même.`,
  mergedOffline: (p) => `${p.ref} a été mergée, mais le serveur de la maison est éteint. Pas mise en ligne.`,
  restartedOwn: (p) => `${p.name} a redémarré son app.`,
  restartedFree: (p) => `${p.name} a redémarré l'app d'une chambre libre.`,
  restartedOther: (p) => `${p.name} a redémarré l'app de ${p.other}.`,
  reviewedLate: (p) => `${p.name} a relu ${p.ref} (en retard, mais c'est fait). Merci !`,
  reviewed: (p) => `${p.name} a relu ${p.ref}. Merci !`,
  reviewLate: (p) => `${p.name} n'a pas encore relu ${p.ref}. C'était à faire dans les ${p.hours} h.`,
  paidBill: (p) => `${p.name} a payé sa part de la facture du mois.`,
  firstProject: (p) => `${p.name} a mis en ligne son premier projet. Bienvenue !`,
});

const knockWords = defineWords("said.knock", knockEn, {
  knocked: (p) => `${p.name} a frappé à une chambre libre.`,
  yes: (p) => `La maison a dit oui. Bienvenue, ${p.name} !`,
  no: () => "La maison a dit non cette fois. Merci d'avoir frappé.",
  taken: () => "Quelqu'un d'autre a emménagé dans cette chambre avant. Frapper à une autre ?",
  withdrawn: () => "La personne a retiré sa demande.",
  invited: () => "La personne a emménagé sur l'invitation d'un coloc.",
});

function say(words: Record<string, (p: P) => string>, said: Said | null | undefined, fallback: string): string {
  const write = said && Object.hasOwn(words, said.kind) ? words[said.kind] : null;
  return write ? write(said!.params) : fallback;
}

/** A fridge note in the reader's language, or its stored English text. */
export const noteText = (n: { text: string; said?: Said | null }) => say(noteWords, n.said, n.text);
/** A house line of a knock's thread in the reader's language, or its stored English text. */
export const knockLine = (m: { body: string; said?: Said | null }) => say(knockWords, m.said, m.body);
