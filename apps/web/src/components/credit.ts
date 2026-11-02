// The city's fake money and the character you start with, in plain sums: no DOM here, so it's easy to test.
import { fcfa } from "./lobby/house/server";

/** "15 000": an amount without its currency, for where the coin already says what it is. */
export const digits = (amount: number): string => fcfa(amount).replace(/\sFCFA$/, "");

/** How much you're missing to pay for something: 0 when you have enough, or when this API doesn't say what you have. */
export const shortBy = (credit: number | undefined, price: number): number => (credit === undefined ? 0 : Math.max(0, price - credit));

/** Someone logged in with no look yet: at first login, and after the demo restarts. */
export const needsCharacter = (loaded: boolean, person: { avatar: string | null } | null | undefined): boolean => loaded && !!person && !person.avatar;
