// A month of life for the seeded city, so a visitor or a juror sees a house that's lived in: reviews traded, two
// waiting, a chat, notes on the fridge, a deploy history and part of the bill paid. Planted by the seed and by the
// demo reset (both go through plantCity). Everything is made up and written straight to the database: nothing
// here calls GitHub, and no message @-mentions anyone.
import { billPayments, chores, type Db, deployments, fridgeNotes, messages } from "@coloc/db";
import { CHORE_HOURS } from "../github/chores.service";
import { monthOf, monthStart } from "../houses/money";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// Sacré-Cœur's reviews live on Jib's test repo. The id is made up (Jib's real repo has another), so these rows never
// clash with chores a real pull request opens there.
const TEST_REPO = { id: 9_000_001, fullName: "Djbrl/coloc-test" };

// Where the seed's houses are, and who lives in each room. Filled in by plantCity.
export interface LifeHouse {
  id: string;
  live: boolean;
  demo: boolean;
  tutorial: boolean;
  monthlyCostFcfa: number | null;
  // Flatmates in room order: login, room name, display name.
  flatmates: { login: string; room: string; name: string; example: boolean }[];
}

// A done review: who reviewed whose pull request, whether it was this month, and whether it went late.
type Done = [reviewer: string, author: string, thisMonth: boolean, late?: boolean];

// Sacré-Cœur's ledger: Awa gave 7 and got 5, Jib gave 5 and got 6, Moussa gave 4 and got 5.
const SACRE_COEUR_DONE: Done[] = [
  ["awa", "jib", true],
  ["awa", "jib", true],
  ["awa", "jib", false],
  ["awa", "jib", false],
  ["awa", "moussa", true],
  ["awa", "moussa", true],
  ["awa", "moussa", false],
  ["jib", "awa", true],
  ["jib", "awa", false],
  ["jib", "awa", false],
  ["jib", "moussa", true],
  ["jib", "moussa", false],
  ["moussa", "awa", true],
  ["moussa", "awa", false, true],
  ["moussa", "jib", false],
  ["moussa", "jib", false],
];

// Pull request titles for the done reviews, in order (Sacré-Cœur only; demo houses get generic ones).
const SACRE_COEUR_TITLES = [
  "Post the weekend fixtures every Friday",
  "Mute the bot in the off season",
  "Fix the score command for away games",
  "Add a /table command",
  "Read Sandaga prices from the new page layout",
  "Keep yesterday's prices when the scrape fails",
  "Show prices per kilo, not per bag",
  "Show prices in FCFA with spaces",
  "Add a basket page",
  "Send the receipt by SMS",
  "Retry Tilène when the site is slow",
  "Log the scrape time in Dakar time",
  "Thank the buyer by name",
  "Hide sold-out items",
  "Pin the league table in the channel",
  "Ignore bot messages in the count",
];

// Two reviews waiting in Sacré-Cœur: one due tomorrow, one already late.
const SACRE_COEUR_OPEN = [
  { reviewer: "jib", author: "awa", title: "Add Orange Money and Free Money to the checkout", openedHoursAgo: 5 },
  { reviewer: "moussa", author: "jib", title: "Retry the fixtures fetch when the league API times out", openedHoursAgo: 30 },
];

// The living-room chat, oldest first. English, French and a little Wolof, as the house speaks.
const CHANNELS: Record<string, [login: string, body: string][]> = {
  "sacre-coeur": [
    ["moussa", "Salut tout le monde. Prix Marché scraped Sandaga and Tilène at 6am, all green."],
    ["awa", "Nanga def ? Ndaje had its first three orders yesterday."],
    ["jib", "Jamm rekk. Congrats Awa! Who can look at my PR for the league fixtures?"],
    ["moussa", "Je regarde ce soir, promis."],
    ["awa", "I can take it tomorrow morning if you're busy, Moussa."],
    ["moussa", "Waaw, merci Awa. Long week at work, I'm a bit behind."],
    ["jib", "No stress. The fixtures can wait a day."],
    ["awa", "Small question: my room used more memory during the sale last night. Does it change the bill?"],
    ["jib", "A little: the bill is split by room size and CPU. But your reviews come off your line, so you're fine."],
    ["awa", "Reviews as rent, I like it. Jërëjëf!"],
    ["moussa", "Mon PR sur le cache des prix est prêt quand vous voulez."],
    ["jib", "I'll take it after lunch. Then I'm off to the match."],
    ["awa", "Good luck to Ouakam! Ba suba."],
  ],
  atelier: [
    ["ndeye", "Dalal ak jàmm! Welcome to L'Atelier. Take a room, put the Hello page online, then come say hi here."],
    ["aissatou", "Done! My page shows a photo of Gorée now."],
    ["babacar", "Mine says nanga def in the morning and bonsoir at night."],
    ["ndeye", "Bravo à vous deux. Next step: link a GitHub repo, and every merge goes online by itself."],
    ["coumba", "Is the port always 3000?"],
    ["lamine", "It's the PORT variable. Read it from the environment and you're fine."],
    ["coumba", "Merci Lamine, ça marche."],
    ["ndeye", "Lamine's to-do API has a test for every route. A good one to copy."],
    ["lamine", "Jërëjëf. Happy to review anyone's first PR."],
    ["babacar", "Ma Météo Bot dit qu'il fera 31 degrés demain à Dakar."],
    ["aissatou", "Again? We need a bot that sends rain instead."],
    ["ndeye", "When you're ready, knock on a house in the city. They vote, and you move in."],
  ],
  almadies: [
    ["aminata", "Taxi Clando matched 40 airport rides this week."],
    ["cheikh", "Nice. Wolof NLP now knows 12 000 words. Jërëjëf for the reviews."],
    ["ibou", "Friday deploy incoming, don't tell anyone."],
    ["khady", "Trop tard, on a vu. Good luck!"],
  ],
  "be-kpota": [
    ["koffi", "Two of four. Who do we know who writes Flutter?"],
    ["edem", "Je demande à mon cousin à Kara."],
  ],
  cocody: [
    ["yao", "Tontine Plus sent 300 reminders this month, zero complaints."],
    ["serge", "Facture now does invoices in FCFA with the right spaces."],
    ["mariam", "Kalo has 80 recipes. Attiéké is the most asked for, of course."],
    ["ange", "On dit quoi ? I'll review Serge's PR tonight."],
  ],
  akwa: [
    ["nadege", "Port Watch caught a ship two days early. Happy importer."],
    ["boris", "Njangi is ready for a review, en français ou en anglais."],
    ["carine", "I'll take it. Mboa Jobs scraped 1 200 offers today."],
  ],
  kacyiru: [
    ["aline", "Muraho! Moto Pay passed all tests on the first try."],
    ["eric", "Umuganda sign-ups open for Saturday."],
    ["grace", "Imvura sent rain alerts to 500 farmers. Murakoze for the reviews."],
  ],
  lafayette: [
    ["yassine", "Aslema! Louage has the Sousse departures now."],
    ["salma", "Dinar Watch alert: a good day to change. Review mine when you can?"],
  ],
  gueliz: [["omar", "Souk Rush has its first map. Looking for two more devs to finish it."]],
  ganhi: [
    ["fifame", "Marché Dantokpa found 30 new stalls this week."],
    ["rodrigue", "Zem Bot answers in Fon now, thanks to Sika."],
    ["sika", "Vodun Days has the January dates up."],
    ["kevin", "Bénin Code mirrored 40 new texts. Who reviews?"],
  ],
};

// A few fixed hex digits, so a commit looks like a commit and the seed stays the same every time.
function fakeSha(...parts: (string | number)[]): string {
  let h = 2166136261;
  for (const c of parts.join("/")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

/**
 * When something seeded this month happened: the `k`-th of `n` moments spread between the first of the month and
 * an hour ago. Early in a month they bunch up, which is what a real month looks like too.
 */
function thisMonth(now: Date, k: number, n: number): Date {
  const start = monthStart(monthOf(now)).getTime() + HOUR;
  const end = Math.max(start, now.getTime() - HOUR);
  return new Date(start + ((end - start) * (k + 1)) / (n + 1));
}

// The `k`-th of `n` moments spread over last month, before this one started.
function lastMonth(now: Date, k: number, n: number): Date {
  const end = monthStart(monthOf(now)).getTime() - HOUR;
  return new Date(end - 25 * DAY + (25 * DAY * (k + 1)) / (n + 1));
}

// Reviews a demo house traded: each flatmate reviews the next one, and a few more, varied but fixed. One flatmate
// let a review go late this month, so their line pays towards the others' credits.
function demoDone(h: LifeHouse, salt: number): Done[] {
  const people = h.flatmates.map((f) => f.login);
  const slow = people[salt % people.length];
  const done: Done[] = [];
  people.forEach((reviewer, i) =>
    people.forEach((author, j) => {
      if (i === j) return;
      const n = j === (i + 1) % people.length ? 1 + ((i * 7 + j * 3 + salt) % 3) : (i * 5 + j * 2 + salt) % 3;
      for (let k = 0; k < n; k++) done.push([reviewer, author, k % 2 === 0, reviewer === slow && j === (i + 1) % people.length && k === 0]);
    }),
  );
  return done;
}

/** Plants a month of life in every seeded house. `ids` maps a seeded login to its user id. */
export async function plantLife(db: Db, city: LifeHouse[], ids: Record<string, string>, now = new Date()) {
  for (const [salt, h] of city.entries()) {
    const real = h.flatmates.filter((f) => !f.example);
    const nameOf = (login: string) => h.flatmates.find((f) => f.login === login)?.name ?? login;

    // Reviews: the ledger and this month's credits come from these. The workshop's people are examples: none.
    if (!h.tutorial && h.flatmates.length >= 2) {
      const sacre = h.id === "sacre-coeur";
      const done = sacre ? SACRE_COEUR_DONE : demoDone(h, salt);
      const repo = sacre ? TEST_REPO : { id: 9_000_100 + salt, fullName: `example/${h.id}` };
      const inMonth = done.filter((d) => d[2]).length;
      const before = done.length - inMonth;
      let m = 0;
      let b = 0;
      const rows: (typeof chores.$inferInsert)[] = done.map(([reviewer, author, mine, late], k) => {
        const doneAt = mine ? thisMonth(now, m++, inMonth) : lastMonth(now, b++, before);
        const createdAt = new Date(doneAt.getTime() - (late ? CHORE_HOURS + 6 : 5) * HOUR);
        const dueAt = new Date(createdAt.getTime() + CHORE_HOURS * HOUR);
        const prNumber = k + 1;
        return {
          houseId: h.id,
          repoId: repo.id,
          repoFullName: repo.fullName,
          prNumber,
          prTitle: sacre ? SACRE_COEUR_TITLES[k] : `Small fix #${prNumber}`,
          prUrl: sacre ? `https://github.com/${repo.fullName}/pull/${prNumber}` : "",
          authorId: ids[author],
          assigneeId: ids[reviewer],
          status: "done",
          outcome: "approved",
          dueAt,
          lateNotedAt: late ? new Date(dueAt.getTime() + 10 * 60_000) : null,
          createdAt,
          doneAt,
        };
      });
      if (sacre) {
        SACRE_COEUR_OPEN.forEach((o, i) => {
          const createdAt = new Date(now.getTime() - o.openedHoursAgo * HOUR);
          const dueAt = new Date(createdAt.getTime() + CHORE_HOURS * HOUR);
          const prNumber = done.length + i + 1;
          rows.push({
            houseId: h.id,
            repoId: repo.id,
            repoFullName: repo.fullName,
            prNumber,
            prTitle: o.title,
            prUrl: `https://github.com/${repo.fullName}/pull/${prNumber}`,
            authorId: ids[o.author],
            assigneeId: ids[o.reviewer],
            status: "open",
            dueAt,
            // Already noted as late, so the late-chores sweep doesn't pin a second note.
            lateNotedAt: dueAt < now ? new Date(dueAt.getTime() + 10 * 60_000) : null,
            createdAt,
          });
        });
      }
      if (rows.length) await db.insert(chores).values(rows);
    }

    // The living-room chat, over the last nine days.
    const lines = CHANNELS[h.id] ?? [];
    if (lines.length) {
      await db.insert(messages).values(
        lines.map(([login, body], k) => ({
          channel: `house:${h.id}`,
          authorId: ids[login],
          body,
          at: new Date(now.getTime() - 9 * DAY + (9 * DAY * (k + 1)) / (lines.length + 1)),
        })),
      );
    }

    // Deploy history: 3 to 5 per lived-in room of a house with a server, the latest one live. Example rooms never
    // ran anything, so they have none.
    if (h.live) {
      const rows = real.flatMap((f, i) => {
        const n = 3 + ((i + salt) % 3);
        return Array.from({ length: n }, (_, k) => {
          const at = new Date(now.getTime() - (n - k) * 4 * DAY + i * 3 * HOUR);
          // One room in three had a failed build along the way, and fixed it on the next push.
          const failed = k === n - 2 && (i + salt) % 3 === 0;
          const sha = fakeSha(h.id, f.room, k);
          return {
            id: `s${fakeSha(h.id, f.room, k, "id")}`,
            houseId: h.id,
            room: f.room,
            kind: "prod" as const,
            repo: h.id === "sacre-coeur" ? "https://github.com/Djbrl/coloc-test.git" : `https://example.invalid/${h.id}/${f.room}.git`,
            ref: "main",
            status: failed ? ("failed" as const) : ("live" as const),
            detail: failed ? "npm ERR! Missing script: \"build\"" : `commit ${sha}`,
            createdAt: at,
            updatedAt: new Date(at.getTime() + 40_000),
          };
        });
      });
      if (rows.length) await db.insert(deployments).values(rows);
    }

    // Notes on the fridge: thanks for reviews, a ship or two, and the late review in Sacré-Cœur.
    const notes: { tone: "info" | "warning" | "thanks"; text: string; room?: string; hoursAgo: number }[] = [];
    if (h.id === "sacre-coeur") {
      notes.push(
        { tone: "thanks", text: `Awa reviewed ${TEST_REPO.fullName}#6. Merci!`, hoursAgo: 70 },
        { tone: "thanks", text: "Moussa shipped a new version.", room: "moussa", hoursAgo: 50 },
        { tone: "thanks", text: `Jib reviewed ${TEST_REPO.fullName}#11. Merci!`, hoursAgo: 26 },
        {
          tone: "warning",
          text: `Moussa hasn't reviewed ${TEST_REPO.fullName}#${SACRE_COEUR_DONE.length + 2} yet. It was due ${CHORE_HOURS}h after it opened.`,
          hoursAgo: 5,
        },
        { tone: "thanks", text: "Awa paid her part of this month's bill.", hoursAgo: 3 },
      );
    } else if (h.id === "atelier") {
      notes.push({ tone: "info", text: "Aïssatou put her first project online. Welcome!", room: "aissatou", hoursAgo: 30 });
    } else if (real.length >= 2) {
      notes.push(
        { tone: "thanks", text: `${nameOf(real[1].login)} reviewed ${nameOf(real[0].login)}'s pull request. Merci!`, hoursAgo: 40 },
        { tone: "thanks", text: `${nameOf(real[0].login)} shipped a new version.`, room: real[0].room, hoursAgo: 12 },
      );
    }
    if (notes.length) {
      await db.insert(fridgeNotes).values(
        notes.map((n) => ({
          id: `s${fakeSha(h.id, n.text)}`,
          houseId: h.id,
          room: n.room ?? null,
          tone: n.tone,
          text: n.text,
          at: new Date(now.getTime() - n.hoursAgo * HOUR),
        })),
      );
    }

    // This month's bill: about half the house has paid its line so far (a mock payment, like the button's). The
    // amount kept is an even share, near enough for a record nobody is shown.
    if (h.monthlyCostFcfa && h.live && real.length) {
      const share = Math.round(h.monthlyCostFcfa / real.length);
      const payers = h.id === "sacre-coeur" ? real.filter((f) => f.login === "awa") : real.filter((_, i) => i % 2 === 0);
      if (payers.length) {
        await db.insert(billPayments).values(
          payers.map((f) => ({ houseId: h.id, userId: ids[f.login], month: monthOf(now), amount: share, paidAt: new Date(now.getTime() - 3 * HOUR) })),
        );
      }
    }
  }
}
