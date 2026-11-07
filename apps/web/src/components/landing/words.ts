// What the landing says below the street, once the visitor scrolls: mockup L on the design canvas, "le film". Big
// pictures of the city and its people, one title and one sentence a screen, and the app's windows turned into simple
// cards. Each title is one natural phrase, each line one full sentence saying what the feature does, in "vous". The
// figures are the real defaults (256 MB and 0.5 vCPU a room, four rooms, 12 000 FCFA a house so 3 000 a share, 500 of
// credit a review); the names are the seeded flatmates of Sacré-Cœur, and the repo is made up.
import { defineWords } from "../../i18n";

export const storyWords = defineWords(
  "landingStory",
  {
    down: "How it works",
    square: {
      title: "A city where every house is a team of devs",
      line: "Walk from street to street to see what the other houses are working on, in Dakar as in Tunis.",
      alt: "A square in Dakar in La Coloc, with devs walking around",
    },
    talk: {
      title: "Talk to whoever you run into",
      line: "Your messages show up in a bubble over your avatar, for everyone walking past to read.",
      alt: "Four flatmates chatting in the street, their messages over their heads",
    },
    room: {
      title: "Your room is a real server",
      line: "Every flatmate has their own container, on day and night, with SSH access and an HTTPS address.",
      alt: "A house of four rooms: Moussa, Awa, Jib, and a free room",
      you: "You?",
      memory: "256 MB",
    },
    push: {
      title: "Connect your GitHub repo and your project goes online",
      line: "Every time you merge into main, your room fetches the latest version and puts it back online by itself.",
      alt: "A GitHub repo going online",
      online: "Online",
    },
    rent: {
      title: "Rent split between four flatmates",
      line: "Your share is paid in credit that you top up with Wave or Orange Money, and every review you do for a flatmate earns you more.",
      alt: "Your share: 3 000 FCFA, topped up with Wave or Orange Money",
      perReview: "+500 FCFA per review",
    },
    arena: {
      title: "A coding challenge every week",
      line: "The whole city meets at the Arena to work on the same challenge for the week.",
      alt: "The Arena, in the middle of the city",
    },
    cities: {
      title: "Other cities to visit",
      line: "Dakar, Kigali, Marrakech and Tunis each have their own houses and devs, and you go from one to another whenever you like.",
    },
    end: {
      title: "Join the coloc!",
      line: "Log in with GitHub to move in with Moussa, Awa and Jib.",
      moveIn: "Move in with GitHub",
    },
    hosted: "Hosted on Datacloud",
  },
  {
    down: "Comment ça marche",
    square: {
      title: "Une ville où chaque maison est une équipe de devs",
      line: "Promenez-vous de rue en rue pour voir sur quoi travaillent les autres maisons, à Dakar comme à Tunis.",
      alt: "Une place de Dakar dans La Coloc, des devs qui se promènent",
    },
    talk: {
      title: "Parlez à ceux que vous croisez",
      line: "Vos messages apparaissent dans une bulle au-dessus de votre avatar, visibles par tous ceux qui passent à côté.",
      alt: "Quatre colocs discutent dans la rue, leurs messages au-dessus de leurs têtes",
    },
    room: {
      title: "Votre chambre est un vrai serveur",
      line: "Chaque coloc a son propre conteneur, allumé jour et nuit, avec un accès SSH et une adresse en HTTPS.",
      alt: "Un appartement de quatre chambres : Moussa, Awa, Jib, et une chambre libre",
      you: "Vous ?",
      memory: "256 Mo",
    },
    push: {
      title: "Branchez votre dépôt GitHub et votre projet passe en ligne",
      line: "À chaque merge sur main, votre chambre récupère la dernière version et la remet en ligne toute seule.",
      alt: "Un dépôt GitHub qui se met en ligne",
      online: "En ligne",
    },
    rent: {
      title: "Un loyer partagé entre quatre colocs",
      line: "Votre part se paie en crédit, que vous rechargez en Wave ou en Orange Money, et chaque code que vous relisez pour un coloc vous en rapporte.",
      alt: "Votre part : 3 000 FCFA, rechargés avec Wave ou Orange Money",
      perReview: "+500 FCFA par code relu",
    },
    arena: {
      title: "Un défi de code chaque semaine",
      line: "Toute la ville se retrouve à l'Arène pour travailler sur le même sujet pendant la semaine.",
      alt: "L'Arène, au milieu de la ville",
    },
    cities: {
      title: "D'autres villes à visiter",
      line: "Dakar, Kigali, Marrakech et Tunis ont chacune leurs maisons et leurs devs, et vous passez de l'une à l'autre quand vous voulez.",
    },
    end: {
      title: "Rejoignez la coloc !",
      line: "Connectez-vous avec GitHub pour emménager avec Moussa, Awa et Jib.",
      moveIn: "Emménager avec GitHub",
    },
    hosted: "Hébergé sur Datacloud",
  },
);
