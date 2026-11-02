// The made-up people who walk the city's streets, by city: [full name, handle]. The web walks them around; the API only
// needs them when someone writes to one, to know the handle is theirs and what they're called.
import people from "./passersby.json";

const NAMES = new Map(Object.values(people as unknown as Record<string, [string, string][]>).flatMap((list) => list.map(([name, login]) => [login, name] as const)));

/** A passer-by's full name, from their handle. Undefined: that handle isn't one of them. */
export const passerbyName = (login: string): string | undefined => NAMES.get(login);
