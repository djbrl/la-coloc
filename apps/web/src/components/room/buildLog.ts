// Making a build's raw lines readable for the log window (BuildLog.vue). No DOM here, so it's easy to test.
export type LineKind = "step" | "error" | "plain";

// Docker's own bookkeeping: says nothing about the project, and the window is short.
const NOISE = /^\s*(---> |Removing intermediate|Sending build context|Successfully (built|tagged)|npm notice)/;
const STEP = /^Step \d+\/\d+ : /;
const ERROR = /^(build failed|error\b|npm (ERR!|error)|The command '.*returned a non-zero code)|\berror:/i;

export function lineKind(line: string): LineKind {
  if (STEP.test(line)) return "step";
  return ERROR.test(line) ? "error" : "plain";
}

/** What the window shows: every line but Docker's bookkeeping, each with its kind. */
export function readable(lines: string[]): { text: string; kind: LineKind }[] {
  return lines.filter((l) => !NOISE.test(l)).map((text) => ({ text, kind: lineKind(text) }));
}
