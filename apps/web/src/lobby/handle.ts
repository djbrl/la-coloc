// How someone in the city is named: on the tag over their head and on their card. A real account goes by its handle,
// "@login", the name people know it by on GitHub and in the chat. A made-up person (a seeded flatmate, someone in an
// example house, a passer-by) goes by their name, never with an @: their login may be a real stranger's handle.

export interface CityPerson {
  login: string;
  name?: string | null;
  // Seeded, a passer-by, or someone the live line says is an example.
  example?: boolean;
}

/** "@fatou" for a real account; "Awa Diop" (their name, else their login, with no @) for a made-up person. */
export function cityHandle(p: CityPerson): string {
  if (!p.example) return `@${p.login}`;
  return p.name?.trim() || p.login;
}

/**
 * Whether a house's flatmate is made up, from what the city lists: everyone in an example house, and anyone the API
 * says has no GitHub account (the seeded people). A real one, or an older API that doesn't say: not made up.
 */
export function madeUpFlatmate(house: { demo: boolean }, person: { github?: boolean }): boolean {
  return house.demo || person.github === false;
}
