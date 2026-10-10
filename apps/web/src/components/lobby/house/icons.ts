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
  // A ticked box: chores.
  check: "M9 11l3 3 8-8 M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  // A speech bubble: the channel.
  chat: "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z",
  // A fridge, seen from the front.
  fridge: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M5 10h14 M9 6v2 M9 13v3",
  // A receipt with a torn edge: the bill.
  bill: "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z M9 8h6 M9 12h6",
  // A knuckle on a door: knock.
  knock: "M5 4h14v16H5z M9 9a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0z M12 15v2",
  // Two people.
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  // An arrow into a door: log in.
  login: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3",
  // Two sheets: copy.
  copy: "M9 9h11v12H9z M5 15V3h11",
  // A key.
  key: "M8 21a5 5 0 1 1 3.9-8.1L21 4 M16 9l2 2 M13 12l2 2",
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
  // A right chevron: next.
  next: "M9 6l6 6-6 6",
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
} as const;

export type IconName = keyof typeof icons;
