// The player's settings, kept in this browser. The settings pane edits them; the lobby and the city read them.
import { reactive, watch } from "vue";

export interface Settings {
  // How the city shows: the walkable 3D lobby, or a plain list.
  view: "lobby" | "list";
  // Shadows and sharper rendering. Off on slow machines.
  quality: "high" | "low";
  // Calmer motion: no bobbing, no camera glide (also on when the system asks for reduced motion).
  reduceMotion: boolean;
  // Seen the welcome? Set once the onboarding is done.
  welcomed: boolean;
}

const KEY = "coloc.settings";
const defaults: Settings = {
  view: "lobby",
  quality: "high",
  reduceMotion: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  welcomed: false,
};

function read(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}

export const settings = reactive<Settings>(read());

// Whether the settings pane is open. The top bar's gear opens it.
export const settingsPane = reactive({ open: false });

watch(settings, (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the tab closes.
  }
});
