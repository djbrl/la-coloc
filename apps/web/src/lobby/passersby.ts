// Passers-by: made-up people who walk the streets so a city doesn't feel empty with only a few flatmates by their
// doors. Each has a full name fitting the city and a GitHub-style handle on their name tag (lowercase letters, digits
// and single hyphens, as GitHub allows), invented here: no real person's handle on purpose. They have no house and no
// GitHub account, and their card says they're an example person. Nothing about them goes to the API.
// Pure: no three.js. The lobby (Lobby.ts) dresses them with the same avatars as everyone and walks them along routes
// on its walk grid (path.ts).
import { seeded } from "./neighbourhood";

export interface Passerby {
  // A GitHub-style handle, shown on their name tag.
  login: string;
  // Their full name, shown on their card.
  name: string;
}

// [full name, handle], by city. Names from the city's own languages; none repeats a seeded flatmate's first name in
// the same city, so a passer-by is never mistaken for someone who lives there.
const PEOPLE: Record<string, [string, string][]> = {
  dakar: [
    ["Mamadou Diop", "mdiop221"],
    ["Fatou Sow", "fatou-sow-dev"],
    ["Ousmane Fall", "ousfall"],
    ["Mariama Sarr", "msarr-sn"],
    ["Pape Seck", "pape-seck-221"],
    ["Astou Faye", "astoufaye"],
    ["Ibrahima Gueye", "ibagueye"],
    ["Rokhaya Ndour", "rokhaya-nd"],
    ["Modou Thiam", "modou-thiam"],
    ["Seynabou Kane", "seynabou-k"],
    ["Abdou Ndao", "abdou-ndao-sn"],
    ["Khadija Cissé", "kcisse-dev"],
    ["Saliou Mbengue", "saliou-mb"],
    ["Bineta Diagne", "bineta221"],
    ["Alioune Wade", "alioune-wade-codes"],
    ["Ndeye Fatou Lo", "nflo-dev"],
  ],
  lomé: [
    ["Kossi Amegah", "kossi-amegah"],
    ["Afi Mensah", "afi-mensah"],
    ["Yawo Adjovi", "yawo228"],
    ["Akossiwa Lawson", "akossiwa-l"],
    ["Sena Dossou", "sena-dossou"],
    ["Komlan Ayivi", "komlan-dev"],
    ["Ama Tsogbe", "ama-tsogbe"],
    ["Elom Atsu", "elom-atsu"],
    ["Kodjo Agbeko", "kodjo-codes"],
    ["Abla Kpodar", "abla-kp"],
    ["Mawuli Gbedemah", "mawuli228"],
    ["Dzifa Amouzou", "dzifa-am"],
    ["Selom Klu", "selomklu"],
    ["Enyonam Afatsawo", "enyo-af"],
    ["Kafui Logo", "kafui-logo"],
    ["Yao Komla Tete", "ykt-dev"],
  ],
  cotonou: [
    ["Sèna Houngbo", "sena-houngbo"],
    ["Codjo Dossa", "codjo229"],
    ["Mahugnon Akpo", "mahu-akpo"],
    ["Gildas Zinsou", "gzinsou"],
    ["Ablawa Tossou", "ablawa-t"],
    ["Romaric Ahouandjinou", "romaric-a"],
    ["Bernice Kiki", "bernice-kiki"],
    ["Brice Gbaguidi", "bgbaguidi"],
    ["Dossi Agbodjan", "dossi-ag"],
    ["Hermione Sossou", "hsossou229"],
    ["Ulrich Adjaho", "ulrich-adj"],
    ["Carmelle Houessou", "carmelle-h"],
    ["Fiacre Hounsa", "fiacre-dev"],
    ["Prudence Ahyi", "prudence-ahyi"],
    ["Wilfried Tchibozo", "wtchibozo"],
    ["Yétondé Avocè", "yetonde-av"],
  ],
  abidjan: [
    ["Konan Kouassi", "konan-kouassi"],
    ["Aya Koné", "aya-kone-dev"],
    ["Adjoua Bamba", "adjoua225"],
    ["Kader Diabaté", "kader-db"],
    ["Amenan Yapi", "amenan-yapi"],
    ["Ibrahim Doumbia", "idoumbia225"],
    ["Affoué Kra", "affoue-kra"],
    ["Didier N'Guessan", "didier-ng"],
    ["Fanta Konaté", "fanta-konate"],
    ["Hervé Gnahoré", "herve-gn-dev"],
    ["Akissi Kouadio", "akissi-k"],
    ["Souleymane Traoré", "soul-traore"],
    ["Mireille Aka", "mireille-aka"],
    ["Jean-Marc Yao Kouamé", "jmkouame"],
    ["Bintou Sangaré", "bintou225"],
    ["Wilfried Assi", "wassi-codes"],
  ],
  douala: [
    ["Franck Nkotto", "franck-nk"],
    ["Larissa Fotso", "lfotso"],
    ["Hervé Tchoua", "hervetch"],
    ["Ange-Marie Ngono", "am-ngono"],
    ["Paul Ekwalla", "pekwalla237"],
    ["Sandrine Moukoko", "sandrine-mk"],
    ["Yannick Njoya", "ynjoya"],
    ["Prisca Ewane", "prisca-ewane"],
    ["Steve Essomba", "steve-essomba"],
    ["Brenda Ngassa", "brenda237"],
    ["Rodrigue Tagne", "rtagne-dev"],
    ["Mireille Ebode", "mireille-eb"],
    ["Cédric Kamga", "ckamga"],
    ["Linda Nkwenti", "linda-nk"],
    ["Arnaud Belinga", "arnaud-bel"],
    ["Vanessa Mbarga", "vmbarga237"],
  ],
  kigali: [
    ["Divine Ingabire", "divine-ing"],
    ["Jean Bosco Niyonzima", "jbniyo"],
    ["Patrick Mugisha", "pmugisha250"],
    ["Claudine Uwimana", "claudine-uw"],
    ["Olivier Nshuti", "onshuti"],
    ["Diane Umutoni", "diane-umutoni"],
    ["Kevin Manzi", "kmanzi-dev"],
    ["Ange Uwase", "ange-uwase"],
    ["Fabrice Habimana", "fhabimana"],
    ["Sandrine Mukamana", "sandrine-mkm"],
    ["Yves Ishimwe", "yves-ishimwe"],
    ["Nadine Iradukunda", "nadine-ira"],
    ["Christian Mugabo", "cmugabo250"],
    ["Joselyne Uwera", "jose-uwera"],
    ["Emmanuel Nkusi", "emma-nkusi"],
    ["Alice Mutesi", "alice-mutesi-dev"],
  ],
  tunis: [
    ["Amine Gharbi", "amine-gh"],
    ["Ines Jebali", "ines-jebali"],
    ["Mehdi Chaabane", "mehdi-ch"],
    ["Rania Hammami", "rhammami"],
    ["Karim Mejri", "karim216"],
    ["Nour Ben Ammar", "nour-ba"],
    ["Oussama Sassi", "osassi"],
    ["Yosra Khelifi", "yosra-kh"],
    ["Skander Ayari", "skander-ayari"],
    ["Mariem Dridi", "mariem-dridi"],
    ["Firas Bouzid", "firas216"],
    ["Emna Chaari", "emna-ch-dev"],
    ["Wassim Riahi", "wriahi"],
    ["Asma Ferchichi", "asma-fer"],
    ["Hamza Mzoughi", "hmzoughi"],
    ["Sarra Belhadj", "sarra-bh"],
  ],
  marrakech: [
    ["Youssef Amrani", "yamrani"],
    ["Hajar Ouazzani", "hajar-oz"],
    ["Anas Berrada", "anas-berrada"],
    ["Imane Tazi", "imane-tazi"],
    ["Hamza Alaoui", "hamza212"],
    ["Kenza Bennani", "kbennani-dev"],
    ["Ayoub Chraibi", "ayoub-chr"],
    ["Zineb Fassi", "zineb-fassi"],
    ["Soufiane Lahlou", "soufiane-l"],
    ["Meryem Kettani", "meryem212"],
    ["Ilyas Bensouda", "ilyas-bs"],
    ["Nisrine Tahiri", "nisrine-t"],
    ["Reda Sqalli", "reda-sq"],
    ["Ghita Benjelloun", "ghita-bj"],
    ["Othmane Idrissi", "othmane-id"],
    ["Loubna Saidi", "loubna-saidi-dev"],
  ],
};

// A city without its own list borrows one, the same one each time.
const FALLBACK = "dakar";

// The most there can be in a city: one list's length.
export const MOST = 16;

/** How many walk around: fewer on low quality (a slow phone), and fewer on a small screen, which shows less street. */
export function passerbyCount(quality: "high" | "low", smallScreen: boolean): number {
  if (quality === "low") return smallScreen ? 4 : 6;
  return smallScreen ? 10 : MOST;
}

/** `count` passers-by for a city, in an order that's the same every time for that city. */
export function passersBy(city: string, count: number): Passerby[] {
  const list = PEOPLE[city.toLowerCase()] ?? PEOPLE[FALLBACK];
  const rand = seeded(`passersby:${city.toLowerCase()}`);
  const shuffled = list.map(([name, login]) => ({ name, login, k: rand() })).sort((a, b) => a.k - b.k);
  return shuffled.slice(0, Math.max(0, Math.min(count, list.length))).map(({ name, login }) => ({ name, login }));
}

/** Whether a handle is one GitHub would take: 1 to 39 letters, digits or single hyphens, not starting or ending in one. */
export function isGithubHandle(login: string): boolean {
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(login);
}

/** Every handle, for the tests: none may repeat, and each must look like a real GitHub handle. */
export function allPassersBy(): Passerby[] {
  return Object.values(PEOPLE).flatMap((list) => list.map(([name, login]) => ({ name, login })));
}
