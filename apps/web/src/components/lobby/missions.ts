// The city's missions, as plain rules: five things to try on arriving (CityMissions.vue shows them, LobbyView.vue
// notices them happen), saved in this browser's settings. No reward: they're only there to show you around.

// "board" came on 6 Nov 2026, first in the list; the other four kept their ids, so what you'd done still counts.
export type MissionId = "board" | "house" | "talk" | "arena" | "city";
export const MISSIONS: MissionId[] = ["board", "house", "talk", "arena", "city"];

export interface Missions {
  done: MissionId[];
  // Folded to one small key showing "1/5".
  collapsed: boolean;
  // All done and "well done" said: gone for good.
  finished: boolean;
}
export const noMissions = (): Missions => ({ done: [], collapsed: false, finished: false });

/**
 * Saved missions brought up to today's list: ids that are no longer missions are dropped, and someone who finished
 * an older, shorter list gets the card back for the ones added since. The same object back when nothing changed.
 */
export function upgrade(state: Missions): Missions {
  const done = (state.done ?? []).filter((id) => MISSIONS.includes(id));
  const finished = state.finished && MISSIONS.every((id) => done.includes(id));
  if (done.length === state.done?.length && finished === state.finished) return state;
  return { ...state, done, finished };
}

/** Who you are, for telling a stranger or someone else's house from your own. */
export interface Sender {
  // Your friends' logins: writing to one of them isn't talking to a stranger.
  friends: string[];
  // Your houses' ids: writing in your own house's chat isn't introducing yourself.
  houses: string[];
}

/**
 * Which mission a message counts for, from the address it was posted to. A direct message to someone who isn't your
 * friend is talking to a stranger. A knock on a free room (it always carries a message), or a message in the chat of
 * a house that isn't yours (a visitor let in as a guest), is introducing yourself. Anything else (the city's room, a
 * board's reply, the Arena's chat, your own house) counts for nothing.
 */
export function missionOfMessage(url: string, you: Sender): MissionId | null {
  const dm = /^\/api\/chat\/dm\/([^/]+)$/.exec(url);
  if (dm) return you.friends.includes(decodeURIComponent(dm[1])) ? null : "talk";
  const house = /^\/api\/houses\/([^/]+)\/(messages|knock)$/.exec(url);
  if (house) return house[2] === "messages" && you.houses.includes(decodeURIComponent(house[1])) ? null : "house";
  return null;
}

/** Ticks a mission. The same object back when it was already ticked, so the caller can tell something new happened. */
export function tick(state: Missions, id: MissionId): Missions {
  return state.done.includes(id) ? state : { ...state, done: [...state.done, id] };
}

export const allDone = (state: Missions): boolean => MISSIONS.every((id) => state.done.includes(id));

/** "1/5", for the folded key. */
export const missionCount = (state: Missions): string => `${MISSIONS.filter((id) => state.done.includes(id)).length}/${MISSIONS.length}`;
