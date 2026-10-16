// The names of the new chat channels, all kept in the one `messages` table (the house's and a knock's are in
// doorbell/queries.ts). A name says who may read and write there, so the rules can be checked from it alone.
//
//   dm:<userId>:<userId>  two people, the ids sorted so a pair always lands on the same channel
//   city:<City>           a city's public room: anyone reads, logged-in people write
//   post:<postId>         the replies under a city board post: same as the city
export const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
export const cityChannel = (city: string) => `city:${city}`;
export const postChannel = (postId: string) => `post:${postId}`;

/** The two people of a direct channel, or null for any other channel. */
export function dmPeople(channel: string): [string, string] | null {
  const m = /^dm:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(channel);
  return m ? [m[1], m[2]] : null;
}

// The cities the city is drawn in (the web's CITY_SPOTS). A house in another city makes that one valid too.
export const CITIES = ["Dakar", "Marrakech", "Tunis", "Abidjan", "Lomé", "Cotonou", "Douala", "Kigali"];

// The longest a message (DM, city chat, reply) or a board post may be. Short on purpose: it's a chat.
export const MAX_MESSAGE = 1000;
export const MAX_TITLE = 100;
export const MAX_POST = 2000;
// How much of a city's chat a page gets: the last hundred messages.
export const CITY_HISTORY = 100;
// How many posts the board lists.
export const BOARD_POSTS = 50;
