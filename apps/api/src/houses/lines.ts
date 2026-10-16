// The sentences the API writes by itself: fridge notes ("Awa's app crashed. Restarting it.") and the house's own
// lines in a knock's thread ("The house said yes. Welcome home, Fatou!"). Each is a template with named blanks,
// written once here, so the same template both writes the English text that's stored and reads it back into a
// kind and its blanks (`readNote`, `readKnockLine`). The views send the kind and the blanks along with the text, and
// the web says the sentence in the reader's language; a text no template matches (an old wording, a seeded note)
// is shown as it is. Nothing to migrate: old rows are read the same way.

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

const fill = (template: string, params: Blanks) => template.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? "");

/** A fridge note's English text, from its kind and blanks. */
export const noteText = (kind: NoteKind, params: Blanks = {}) => fill(NOTES[kind], params);
/** A knock thread's house line, in English, from its kind and blanks. */
export const knockText = (kind: KnockLine, params: Blanks = {}) => fill(KNOCK[kind], params);

// Each template as a pattern: the words as they are, each blank any text (as little as will do).
function patterns(templates: Record<string, string>) {
  return Object.entries(templates).map(([kind, template]) => {
    const names: string[] = [];
    const source = template
      .split(/(\{\w+\})/)
      .map((part) => {
        const blank = /^\{(\w+)\}$/.exec(part);
        if (!blank) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        names.push(blank[1]);
        return "([\\s\\S]+?)";
      })
      .join("");
    return { kind, names, re: new RegExp(`^${source}$`) };
  });
}
const NOTE_PATTERNS = patterns(NOTES);
const KNOCK_PATTERNS = patterns(KNOCK);

function read(text: string, list: ReturnType<typeof patterns>): Said | null {
  for (const { kind, names, re } of list) {
    const m = re.exec(text);
    if (m) return { kind, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}

/** What a stored fridge note says, as a kind and its blanks; null for a text no template wrote. */
export const readNote = (text: string) => read(text, NOTE_PATTERNS);
/** What a house line in a knock's thread says; null for anything else. */
export const readKnockLine = (text: string) => read(text, KNOCK_PATTERNS);
