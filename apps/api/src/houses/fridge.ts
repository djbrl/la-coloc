// Turns what happens in the house into fridge notes, in the house's own voice.
import type { DeployStatus, RoomEvent } from "@coloc/protocol";
import type { FridgeNoteView } from "./house.types";

export type Draft = { tone: FridgeNoteView["tone"]; text: string; room: string };

export function noteForRoomEvent(e: RoomEvent, flatmate: string): Draft {
  switch (e.event) {
    case "oom":
      return { tone: "warning", room: e.room, text: `${flatmate}'s app ate all its memory and got restarted. The other rooms didn't notice.` };
    case "crashed":
      return { tone: "danger", room: e.room, text: `${flatmate}'s app crashed. Restarting it.` };
    case "restarted":
      return { tone: "info", room: e.room, text: `${flatmate}'s app is back up.` };
  }
}

export function noteForDeploy(s: DeployStatus, flatmate: string): Draft | null {
  if (s.status === "live") return { tone: "thanks", room: s.room, text: `${flatmate} shipped a new version.` };
  if (s.status === "failed") {
    const reason = (s.detail ?? "unknown error").split("\n")[0];
    return { tone: "danger", room: s.room, text: `${flatmate}'s deploy failed: ${reason}. The previous version is still running.` };
  }
  return null;
}
