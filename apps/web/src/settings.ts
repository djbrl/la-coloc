// The player's settings, kept in this browser. The settings pane edits them; the lobby and the city read them.
import { reactive, watch } from "vue";

export interface Settings {
  // How the city shows: the walkable 3D lobby, or a plain list.
  view: "lobby" | "list";
  // Shadows and sharper rendering. Off on slow machines.
  quality: "high" | "low";
  // Calmer motion: no bobbing, no camera glide (also on when the system asks for reduced motion).
  reduceMotion: boolean;
  // Little sounds for doors and friends.
  sound: boolean;
  // Day or night: the site's light or dark look, or whatever the system says (App.vue applies it).
  theme: "system" | "light" | "dark";
  // Seen the welcome? Set once the onboarding is done.
  welcomed: boolean;
  // The lobby's one-key shortcuts (W A S D, E, M, F, T, ?…). They only ever work while the city itself has the
  // focus; switched off, the keyboard only moves between buttons, as on any page.
  shortcuts: boolean;
  // On a slow phone or connection the lobby offers the list view once; this remembers it did.
  listOffered: boolean;
}

/**
 * A phone or a connection that will struggle with the 3D city: the browser asks to save data, the network is 2G
 * or 3G, or the device has less than 4 GB of memory. Browsers that don't say (Safari, Firefox) count as fine.
 */
export function slowDevice(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const extra = nav as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (extra.connection?.saveData) return true;
  if (/^(slow-)?[23]g$/.test(extra.connection?.effectiveType ?? "")) return true;
  return typeof extra.deviceMemory === "number" && extra.deviceMemory < 4;
}

const KEY = "coloc.settings";
const defaults: Settings = {
  view: "lobby",
  // A slow device starts on low quality; anyone can switch it up in settings.
  quality: slowDevice() ? "low" : "high",
  reduceMotion: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  sound: true,
  theme: "system",
  welcomed: false,
  shortcuts: true,
  listOffered: false,
};

function read(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}

export const settings = reactive<Settings>(read());

// Whether the settings pane is open (the top bar's gear opens it), and the pane's one request to the lobby:
// "take the tutorial again", stamped with the time it was asked so the lobby notices each time. Neither is saved.
export const settingsPane = reactive({ open: false, tutorialRequested: 0 });

// What the lobby wants of the page around it, not saved either: `chrome` is the site's top bar, which the tutorial
// hides until the very end so the screen shows one thing at a time. App.vue reads it.
export const lobbyUi = reactive({ chrome: true });

watch(settings, (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the tab closes.
  }
});
