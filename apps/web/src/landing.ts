// The landing page's numbers and its one decision, apart from the page so they can be tested: whether someone arriving
// at "/" sees it at all, and where the room behind the wall lines up with the picture.
import { ref } from "vue";

/**
 * Does "/" open on the landing? Only for someone we know is logged out, who hasn't chosen to walk around as a visitor,
 * and who didn't come through a link to a place in the city (`?in=` or `?city=`), which must keep leading there.
 * While we don't know who you are (the API hasn't said, or the core is down) the city's own screens decide.
 */
export function opensOnLanding(you: { known: boolean; loggedIn: boolean; visiting: boolean; linked: boolean }): boolean {
  return you.known && !you.loggedIn && !you.visiting && !you.linked;
}

const KEY = "coloc.visiting";

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

// "Try the demo" was pressed: this tab walks the city as a visitor. Kept for the tab's life, so a reload stays in the
// city; a new visit starts on the landing again.
export const visiting = ref(typeof sessionStorage === "undefined" ? false : read());

/** Walks in as a visitor (or stops, after logging out), and the tab remembers. */
export function setVisiting(on: boolean) {
  visiting.value = on;
  try {
    if (on) sessionStorage.setItem(KEY, "yes");
    else sessionStorage.removeItem(KEY);
  } catch {
    // No storage: the choice lasts until the page reloads.
  }
}

// ---- The room behind the wall ----
//
// The wall, the name and the sign don't move: they're the picture. The room behind the window is live 3D (see
// lobby/landingRoom.ts), drawn only where the window is. To look around without moving the wall we move the eye and
// pin the frustum to the wall's plane, as if the screen were the wall itself: what's on that plane stays put, and the
// further behind it something is, the more it shifts. These are the numbers the picture was rendered with.
export const PLANE_Z = 2.4;
const PICTURE_CENTRE = { x: 1.9, y: 3.6 };
const PICTURE_WIDTH = 21;
// The camera that took the picture stood this far from the wall.
const PICTURE_DISTANCE = 34;
// The part of the wall's plane the canvas covers: the window, up to the middle of its frame and down to its sill.
export const WINDOW_VIEW = { left: -4.76, right: 4.76, bottom: 0.17, top: 4.76 };

export interface Eye {
  x: number;
  y: number;
  z: number;
}
export const PICTURE_EYE: Eye = { x: PICTURE_CENTRE.x, y: PICTURE_CENTRE.y, z: PLANE_Z + PICTURE_DISTANCE };

// In the page's --u units, the picture being 1440 wide.
const PER_UNIT = 1440 / PICTURE_WIDTH;
const onPicture = (x: number, y: number) => ({
  left: (x - PICTURE_CENTRE.x + PICTURE_WIDTH / 2) * PER_UNIT,
  top: (PICTURE_CENTRE.y + (PICTURE_WIDTH * 0.625) / 2 - y) * PER_UNIT,
});

/** Where the window sits on the picture. */
export function windowOnPicture() {
  return {
    ...onPicture(WINDOW_VIEW.left, WINDOW_VIEW.top),
    width: (WINDOW_VIEW.right - WINDOW_VIEW.left) * PER_UNIT,
    height: (WINDOW_VIEW.top - WINDOW_VIEW.bottom) * PER_UNIT,
  };
}

// The three flatmates' heads as the picture has them: Kofi, Awa, Moussa.
const HEADS = [
  { x: -3.9, y: 2.4, z: -1.1 },
  { x: -0.72, y: 1.85, z: -0.72 },
  { x: 2.3, y: 2.55, z: -0.72 },
];

/** Where each flatmate's bubble points on the picture. */
export function headsOnPicture() {
  return HEADS.map((head) => {
    const seen = seenOnWall(head, PICTURE_EYE);
    return onPicture(seen.x, seen.y);
  });
}

/** The sides of the view from `eye`, at distance `near`, so that the window's rectangle always fills it exactly. */
export function windowFrustum(eye: Eye, near: number) {
  const scale = near / (eye.z - PLANE_Z);
  return {
    left: (WINDOW_VIEW.left - eye.x) * scale,
    right: (WINDOW_VIEW.right - eye.x) * scale,
    top: (WINDOW_VIEW.top - eye.y) * scale,
    bottom: (WINDOW_VIEW.bottom - eye.y) * scale,
  };
}

/** Where a point in the room appears on the wall's plane, seen from `eye`. */
export function seenOnWall(point: { x: number; y: number; z: number }, eye: Eye) {
  const scale = (eye.z - PLANE_Z) / (eye.z - point.z);
  return { x: eye.x + (point.x - eye.x) * scale, y: eye.y + (point.y - eye.y) * scale };
}
