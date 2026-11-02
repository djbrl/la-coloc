// The city's missions, as plain rules: four things to try on arriving (CityMissions.vue shows them, LobbyView.vue
// notices them happen), saved in this browser's settings. No reward: they're only there to show you around.

export type MissionId = "talk" | "house" | "arena" | "city";
export const MISSIONS: MissionId[] = ["talk", "house", "arena", "city"];

export interface Missions {
  done: MissionId[];
  // Folded to one small key showing "1/4".
  collapsed: boolean;
  // All done and "well done" said: gone for good.
  finished: boolean;
}
export const noMissions = (): Missions => ({ done: [], collapsed: false, finished: false });

/**
 * Which mission a message counts for, from the address it was posted to. A direct message or the city's public room
 * is talking to a stranger. A house's channel or a knock on its door, which always carries a message, is introducing
 * yourself. Anything else (a board's reply, the Arena's chat) counts for nothing.
 */
export function missionOfMessage(url: string): MissionId | null {
  if (/^\/api\/chat\/dm\/[^/]+$/.test(url) || /^\/api\/cities\/[^/]+\/chat$/.test(url)) return "talk";
  if (/^\/api\/houses\/[^/]+\/(messages|knock)$/.test(url)) return "house";
  return null;
}

/** Ticks a mission. The same object back when it was already ticked, so the caller can tell something new happened. */
export function tick(state: Missions, id: MissionId): Missions {
  return state.done.includes(id) ? state : { ...state, done: [...state.done, id] };
}

export const allDone = (state: Missions): boolean => MISSIONS.every((id) => state.done.includes(id));

/** "1/4", for the folded key. */
export const missionCount = (state: Missions): string => `${MISSIONS.filter((id) => state.done.includes(id)).length}/${MISSIONS.length}`;
