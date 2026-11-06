// The house inside's icons: simple strokes on a 24px grid, drawn by hand so nothing is downloaded.
// Each entry is one SVG path (`d`); several shapes share a path by starting a new "M". Icon.vue draws them.
export const icons = {
  // A rack: two drawers with a light on each.
  server: "M4 4h16v6H4z M4 14h16v6H4z M7.5 7h.01 M7.5 17h.01",
  // Two chain links: an invitation is a link to the house.
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  // A shield with a tick: the house rules.
  rules: "M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z M9 12l2 2 4-4",
  // A door with a handle: your room, or a free one.
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17 M3 21h18 M14.5 12h.01",
  // A ticked box: reviews to do.
  check: "M9 11l3 3 8-8 M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  // A speech bubble: the channel.
  chat: "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z",
  // A house's channel: a #, so it never looks like a direct message's bubble.
  channel: "M10 4 8 20 M16 4l-2 16 M5 9h15 M4 15h15",
  // A fridge, seen from the front.
  fridge: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M5 10h14 M9 6v2 M9 13v3",
  // A push pin: the house's news, the notes it pins on its board.
  pin: "M9 3h6 M10 3v6l-4 5h12l-4-5V3 M12 14v7",
  // A heart: a thank-you, good news.
  heart: "M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z",
  // A stop sign with a bang: something broke (an app crashed, a build failed).
  alert: "M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M12 8v5 M12 16.5h.01",
  // A receipt with a torn edge: the bill.
  bill: "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z M9 8h6 M9 12h6",
  // A knuckle on a door: knock.
  knock: "M5 4h14v16H5z M9 9a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0z M12 15v2",
  // Two people.
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  // A person and a plus: add a friend.
  addFriend: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M19 8v6 M16 11h6",
  // An arrow into a door: log in.
  login: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3",
  // An arrow out of a door: logging out.
  logout: "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4 M16 17l5-5-5-5 M21 12H9",
  // Two sheets: copy.
  copy: "M9 9h11v12H9z M5 15V3h11",
  // A key.
  key: "M13 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M11.5 12.5L21 3 M17 7l3 3 M14 10l2.5 2.5",
  // A window with four panes: a room's app. Coloured by state (lit, dark).
  window: "M4 4h16v16H4z M12 4v16 M4 12h16",
  // A warning triangle: a room that's down.
  warn: "M12 3l10 18H2z M12 10v4 M12 18h.01",
  // A traffic cone: a building site, the house still being made.
  cone: "M10 3h4l4 15H6z M8.3 10h7.4 M3 18h18",
  // Arrows in a circle: deploying.
  spin: "M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6",
  // A house: the tour's first step.
  house: "M3 11l9-8 9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6",
  // A card with a face and two lines: someone's profile (no brand logos, so GitHub is this and its name).
  profile: "M3 5h18v14H3z M9 12a2.2 2.2 0 1 0 0-4.4A2.2 2.2 0 0 0 9 12z M5.8 16.5a3.5 3.5 0 0 1 6.4 0 M14.5 9.5h4 M14.5 13h3",
  // A right chevron: next.
  next: "M9 6l6 6-6 6",
  // A coin: the city's credit.
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v10 M15 9.5c-.6-.9-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.6-3-1.5",
  // A tick: done.
  tick: "M5 12l5 5L20 7",
  // A thread: a knock you've already made.
  thread: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  // A power symbol: restart.
  power: "M12 3v8 M6.3 6.8a8 8 0 1 0 11.4 0",
  // An arrow leaving a box: opens in a new tab.
  external: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  // A pencil: edit.
  edit: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
  // Angle brackets: code.
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  // A padlock: secrets.
  lock: "M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  // A terminal prompt: logs.
  logs: "M4 4h16v16H4z M8 9l3 3-3 3 M13 15h3",
  // A clock: history.
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  // A gauge: a room at a glance.
  gauge: "M4 18a8 8 0 1 1 16 0 M12 18l4-6 M3 18h18",
  // A crown: the chef.
  crown: "M4 18h16 M4 18L3 8l5 4 4-6 4 6 5-4-1 10",
  // A plus: add.
  plus: "M12 5v14 M5 12h14",
  // A rocket: put online.
  rocket: "M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2 M9 15l-3-3c2-6 7-9 14-9 0 7-3 12-9 14z M14.5 9.5h.01",
  // A box: a project.
  box: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
  // An "i" in a circle: what is this.
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  // A flag on its pole: report something to the admins.
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  // A circle with a bar across: block someone.
  block: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M5.6 5.6l12.8 12.8",
  // A bin: delete.
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
  // A cork board with two notes pinned: the city board.
  board: "M3 5h18v14H3z M6 8h5v4H6z M13 8h5v7h-5z M8.5 8v.01 M15.5 8v.01",
  // A globe: the city's public room.
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z",
  // A back arrow.
  back: "M15 6l-6 6 6 6",
  // A cup with two handles on a stand: the arena, a title won there.
  trophy: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 21h8 M9.5 17h5v4h-5z",
  // A bug: a security bug bounty.
  bug: "M9 7a3 3 0 0 1 6 0 M7 10h10v4a5 5 0 0 1-10 0z M12 10v9 M4 12h3 M17 12h3 M5 18l2.5-2 M19 18l-2.5-2 M5 6l2.5 2.5 M19 6l-2.5 2.5",
  // An eye: someone watching, people here now.
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  // A box with an arrow rising out of it: share.
  share: "M12 3v12 M7.5 7.5L12 3l4.5 4.5 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7",
  // A lightning bolt: dash.
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  // A map folded in three: the map.
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15",
  // A folder and a sheet of paper: what's in a room.
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  file: "M6 3h8l4 4v14H6z M14 3v4h4",
  // A prompt on a screen: someone's in over SSH, or started something there.
  prompt: "M3 5h18v14H3z M7 10l3 2-3 2 M12 15h5",
  // A keyboard: every key.
  keyboard: "M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10",
  // A bell: the notifications' card.
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
  // A cog: the settings' card.
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 3v2.5 M12 18.5V21 M3 12h2.5 M18.5 12H21 M5.6 5.6l1.8 1.8 M16.6 16.6l1.8 1.8 M5.6 18.4l1.8-1.8 M16.6 7.4l1.8-1.8",
} as const;

export type IconName = keyof typeof icons;
