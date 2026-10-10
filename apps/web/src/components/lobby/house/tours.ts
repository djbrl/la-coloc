// Which first-time tours this browser has finished or skipped, kept in localStorage under "coloc.tours" (the
// settings pane's reset forgets them). Storage can be missing or blocked: then nothing counts as seen and every
// tour shows again, which is fine.
const KEY = "coloc.tours";

export function toursSeen(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function markTourSeen(name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...toursSeen(), name])]));
  } catch {
    // No storage: the tour will show again next time.
  }
}

// The house a link opened the page on (`?in=house:…`), read once, when the app starts (not when a panel opens: the
// lobby writes `?in=` itself as you walk in and out). Someone following a shared link came to see that house, so
// its first-visit tour doesn't cover it.
export const linkedHouse: string | null = (() => {
  const place = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("in");
  return place?.startsWith("house:") ? place.slice("house:".length) : null;
})();
