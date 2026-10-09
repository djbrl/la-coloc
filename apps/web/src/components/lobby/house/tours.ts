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
