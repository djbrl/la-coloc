// A place you can open inside the lobby: a house, a knock's thread, or a room. The sheet (Inside.vue) keeps a
// stack of these, and the pages hand one back when they want another place opened.
export type Place = { kind: "house"; id: string } | { kind: "application"; id: string } | { kind: "room"; houseId: string; room: string };

// The same place, as a line: used as a component key, and to tell two places apart.
export function placeKey(p: Place): string {
  return p.kind === "room" ? `room:${p.houseId}/${p.room}` : `${p.kind}:${p.id}`;
}

// Turns a site link into a place: "/houses/x" opens a house, "/houses/x/rooms/y" a room, "/applications/x" a
// knock. "/" means the city itself. Anything else (/login, an outside link) is not ours to handle.
export function placeFromPath(path: string): Place | "city" | null {
  const clean = path.split(/[?#]/)[0];
  if (clean === "/") return "city";
  const parts = clean.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "houses" && parts.length === 2) return { kind: "house", id: parts[1] };
  if (parts[0] === "houses" && parts.length === 4 && parts[2] === "rooms") return { kind: "room", houseId: parts[1], room: parts[3] };
  if (parts[0] === "applications" && parts.length === 2) return { kind: "application", id: parts[1] };
  return null;
}
