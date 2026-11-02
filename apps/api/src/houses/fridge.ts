// Turns what happens in the house into fridge notes, in the house's own voice.
import { BUILD_CANCELLED, type DeployStatus, type RoomEvent } from "@coloc/protocol";
import type { FridgeNoteView } from "./house.types";
import { noteText } from "./lines";

// `room` is left out for notes about the house as a whole, or about a repo rather than a room.
export type Draft = { tone: FridgeNoteView["tone"]; text: string; room?: string };

export function noteForRoomEvent(e: RoomEvent, flatmate: string): Draft {
  switch (e.event) {
    case "oom":
      return { tone: "warning", room: e.room, text: noteText("oom", { name: flatmate }) };
    case "crashed":
      return { tone: "danger", room: e.room, text: noteText("crashed", { name: flatmate }) };
    case "restarted":
      return { tone: "info", room: e.room, text: noteText("backUp", { name: flatmate }) };
  }
}

export function noteForDeploy(s: DeployStatus, flatmate: string): Draft | null {
  if (s.status === "live") return { tone: "thanks", room: s.room, text: noteText("shipped", { name: flatmate }) };
  if (s.status === "failed") {
    // Cancelled on purpose: no news for the house.
    if (s.detail === BUILD_CANCELLED) return null;
    const reason = (s.detail ?? "unknown error").split("\n")[0];
    return { tone: "danger", room: s.room, text: noteText("deployFailed", { name: flatmate, reason }) };
  }
  return null;
}
