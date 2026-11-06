// What's new in your city's room and on its board since you last looked: a dot on the City and Board tabs of the city
// board's window (lobby/CityBoardWindow.vue). Nobody's bell rings for the city's room (that would be every hello);
// this is how you see it's moving. The API keeps how far you've read (chat_reads), so it's the
// same on your phone and your laptop.
//
// Fresh when you log in, when you change city, when the city's stream says its room or board changed, and when the
// board's window closes or changes tab. Logged out, there's nothing to count. Outages are quiet: it keeps what it had.
import { reactive, watch } from "vue";
import { boardSheet, chatSheet } from "./conversations";
import { me, postJSON } from "./session";
import { openStream, type Stream } from "./stream";

export const cityNews = reactive({ city: "", chat: 0, board: 0 });

const cityUrl = (city: string) => `/api/cities/${encodeURIComponent(city)}`;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Asks again in a moment: a polling tick says "chat" and "board" together, and that's one question. */
export function loadCityNews() {
  clearTimeout(timer);
  timer = setTimeout(() => void ask(), 50);
}

async function ask() {
  const city = chatSheet.city;
  if (!me.value) {
    Object.assign(cityNews, { city, chat: 0, board: 0 });
    return;
  }
  try {
    const res = await fetch(`${cityUrl(city)}/unread`);
    if (!res.ok || city !== chatSheet.city) return;
    const data = (await res.json()) as { chat: number; board: number };
    Object.assign(cityNews, { city, chat: data.chat ?? 0, board: data.board ?? 0 });
  } catch {
    // Keep what we had.
  }
}

/** You're looking at the city's room or its board: what's there isn't new any more. */
export async function markCitySeen(city: string, what: "chat" | "board") {
  if (!me.value) return;
  if (cityNews.city === city) cityNews[what] = 0;
  await postJSON(`${cityUrl(city)}/read`, { what });
  // A count asked for while this was on its way may be stale.
  loadCityNews();
}

/** Keeps the counts fresh until the returned stop is called (the board's window, while it's open). */
export function followCityNews(): () => void {
  let stream: Stream | null = null;
  const stopCity = watch(
    () => [chatSheet.city, me.value?.login] as const,
    ([city, login]) => {
      stream?.close();
      stream = null;
      loadCityNews();
      if (login) stream = openStream(`${cityUrl(city)}/stream`, { chat: loadCityNews, board: loadCityNews });
    },
    { immediate: true },
  );
  const stopSheet = watch(() => [boardSheet.open, boardSheet.tab], loadCityNews);
  return () => {
    stopCity();
    stopSheet();
    stream?.close();
    clearTimeout(timer);
  };
}
