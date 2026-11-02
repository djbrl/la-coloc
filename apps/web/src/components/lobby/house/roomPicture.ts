// What you see through a room's window: its flatmate's lobby character at home (public/rooms, npm run render:rooms). The
// house views don't say which character someone picked, so it's chosen from their login, and stays the same for them.
const CHARACTERS = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `${s}-${l}`));

export function roomPicture(login: string): string {
  let hash = 0;
  for (const c of login) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return `/rooms/${CHARACTERS[Math.abs(hash) % CHARACTERS.length]}.webp`;
}
