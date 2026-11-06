// The sentences the API writes by itself: fridge notes ("Awa's app crashed. Restarting it.") and the house's own
// lines in a knock's thread ("The house said yes. Welcome home, Fatou!"). Each is a template with named blanks,
// written once here, so the same template both writes the English text that's stored and reads it back into a
// kind and its blanks (`readNote`, `readKnockLine`). The views send the kind and the blanks along with the text, and
// the web says the sentence in the reader's language; a text no template matches (an old wording) is shown as it is.
//
// A note's blanks hold free text (a display name, a build's error), which may contain the template's own words:
// "Bob's deploy failed: lol" is a possible name. So each blank of a note is written between two invisible marks,
// Unicode's isolates (U+2068 and U+2069, the standard way to put someone's text inside a sentence), and the marks
// are first taken out of the value itself. Reading a note finds its blanks between the marks, with no guessing.
// Notes written before the marks are read the old way, refs and hours held to their shape. Knock lines have one
// blank at most, so they need no marks.

// Order matters where one template could swallow another: the longer, more specific one comes first.
const NOTES = {
  oom: "{name}'s app ate all its memory and got restarted. The other rooms didn't notice.",
  crashed: "{name}'s app crashed. Restarting it.",
  backUp: "{name}'s app is back up.",
  shipped: "{name} shipped a new version.",
  deployFailed: "{name}'s deploy failed: {reason}. The previous version is still running.",
  movedIn: "{name} moved in. Welcome home!",
  reposMoved: "{name} moved {repos} into their room.",
  knocked: "{name} knocked on a free room. Answer the door!",
  mergedStrict: "{ref} was merged without a flatmate's approval. Strict house: not deployed.",
  mergedRelaxed: "{ref} was merged without a flatmate's approval. Relaxed house: deploying anyway.",
  mergedOffline: "{ref} was merged, but the house's server is offline. Not deployed.",
  restartedOwn: "{name} restarted their app.",
  restartedFree: "{name} restarted the app in a free room.",
  restartedOther: "{name} restarted {other}'s app.",
  reviewedLate: "{name} reviewed {ref} (late, but done). Merci!",
  reviewed: "{name} reviewed {ref}. Merci!",
  reviewLate: "{name} hasn't reviewed {ref} yet. It was due {hours}h after it opened.",
  paidBill: "{name} paid their part of this month's bill.",
  firstProject: "{name} put their first project online. Welcome!",
  tookRoom: "{name} took another room.",
  endedLease: "{name} ended their lease. A room is free.",
  // Someone deleted their account: no name, since nothing of theirs stays.
  flatmateLeft: "A flatmate left La Coloc. A room is free.",
  newChef: "{name} is the house's chef now.",
} as const;

const KNOCK = {
  knocked: "{name} knocked on a free room.",
  yes: "The house said yes. Welcome home, {name}!",
  no: "The house said no this time. Thanks for knocking.",
  taken: "Someone else moved into this room first. Knock on another one?",
  withdrawn: "They withdrew their knock.",
  invited: "They moved in at a flatmate's invitation.",
} as const;

export type NoteKind = keyof typeof NOTES;
export type KnockLine = keyof typeof KNOCK;
export type Blanks = Record<string, string>;

/** A sentence and what it's made of: its kind, and what fills its blanks. */
export interface Said {
  kind: string;
  params: Blanks;
}

const OPEN = "⁨";
const CLOSE = "⁩";
const MARKS = /[⁨⁩]/g;

const fill = (template: string, params: Blanks, blank: (value: string) => string) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => blank(params[k] ?? ""));

/** A fridge note's English text, from its kind and blanks, each blank between isolates. */
export const noteText = (kind: NoteKind, params: Blanks = {}) => fill(NOTES[kind], params, (v) => OPEN + v.replace(MARKS, "") + CLOSE);
/** A knock thread's house line, in English, from its kind and blanks. */
export const knockText = (kind: KnockLine, params: Blanks = {}) => fill(KNOCK[kind], params, (v) => v);
/** A stored note as people read it: without its marks. */
export const plainNote = (text: string) => text.replace(MARKS, "");

// How a blank is found. Between the marks: anything but a mark. In a text written before the marks: a ref is
// "owner/repo#12" and hours a number, so a seeded "Jib reviewed Moussa's pull request." isn't taken for a review
// note; the rest is any text, as little as will do.
const MARKED_BLANK = `${OPEN}([^${OPEN}${CLOSE}]*)${CLOSE}`;
const OLD_BLANK: Record<string, string> = { ref: "(\\S+#\\d+)", hours: "(\\d+)" };

// Each template as a pattern: the words as they are, each blank as above.
function patterns(templates: Record<string, string>, marked: boolean) {
  return Object.entries(templates).map(([kind, template]) => {
    const names: string[] = [];
    const source = template
      .split(/(\{\w+\})/)
      .map((part) => {
        const blank = /^\{(\w+)\}$/.exec(part);
        if (!blank) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(blank[1]);
        return marked ? MARKED_BLANK : (OLD_BLANK[blank[1]] ?? "([\\s\\S]+?)");
      })
      .join("");
    return { kind, names, re: new RegExp(`^${source}$`) };
  });
}
const NOTE_PATTERNS = patterns(NOTES, true);
const OLD_NOTE_PATTERNS = patterns(NOTES, false);
const KNOCK_PATTERNS = patterns(KNOCK, false);

function read(text: string, list: ReturnType<typeof patterns>): Said | null {
  for (const { kind, names, re } of list) {
    const m = re.exec(text);
    if (m) return { kind, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}

/** What a stored fridge note says, as a kind and its blanks; null for a text no template wrote. */
export const readNote = (text: string) => read(text, text.includes(OPEN) ? NOTE_PATTERNS : OLD_NOTE_PATTERNS);
/** What a house line in a knock's thread says; null for anything else. */
export const readKnockLine = (text: string) => read(text, KNOCK_PATTERNS);
