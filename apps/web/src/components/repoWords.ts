// The repo picker's words (RepoPicker.vue), in English and French (see i18n.ts). Repo names stay as they are.
import { defineWords } from "../i18n";

export const repoWords = defineWords(
  "repos",
  {
    label: "Your GitHub repos",
    search: "Search your repos",
    none: "No repo has that name.",
    empty: "No repos here yet.",
    private: "Private",
    allow: "Allow more repos",
    asking: "Asking GitHub…",
    down: "GitHub isn't answering.",
    tryAgain: "Try again",
    install: "Let La Coloc see your repos.",
    installGo: "Open GitHub",
    noGithub: "Log in with GitHub to import your repos.",
    noGithubGo: "Log in with GitHub",
    newTab: " (opens in a new tab)",
  },
  {
    label: "Vos dépôts GitHub",
    search: "Chercher dans vos dépôts",
    none: "Aucun dépôt ne porte ce nom.",
    empty: "Aucun dépôt ici pour l'instant.",
    private: "Privé",
    allow: "Autoriser d'autres dépôts",
    asking: "On demande à GitHub…",
    down: "GitHub ne répond pas.",
    tryAgain: "Réessayer",
    install: "Laissez La Coloc voir vos dépôts.",
    installGo: "Ouvrir GitHub",
    noGithub: "Connectez-vous avec GitHub pour importer vos dépôts.",
    noGithubGo: "Se connecter avec GitHub",
    newTab: " (s'ouvre dans un nouvel onglet)",
  },
);
