// What each notification says under the bell, and what you can do about it. Pure, so it's tested: Bell.vue only
// draws the rows. One short line (who did what), a quieter line under it, and at most two actions.
import type { Notice } from "../../types";
import { bellWords as w } from "./words";

// accept / decline: answer an invitation. house: open the house it's about. knock: open the knock's thread.
// plot: walk to an empty plot (renting together).
export type NoticeAction = "accept" | "decline" | "house" | "knock" | "plot";

export interface NoticeRow {
  title: string;
  sub: string | null;
  actions: NoticeAction[];
  // The accept button's word: "Move in" for a house, "I'm in" for renting together.
  acceptWord: string;
}

const nameOf = (n: Notice) => n.from?.name?.trim().split(/\s+/)[0] || n.from?.login || w.someone;

export function noticeRow(n: Notice): NoticeRow {
  const who = nameOf(n);
  const house = n.house?.name ?? "";
  const row = (title: string, sub: string | null, actions: NoticeAction[] = [], acceptWord = w.moveIn): NoticeRow => ({ title, sub, actions, acceptWord });
  switch (n.kind) {
    case "house_invite":
      if (n.state === "open") return row(w.invite(who, house), n.room ? w.inviteRoom(n.room) : null, ["accept", "decline"]);
      if (n.state === "accepted") return row(w.invite(who, house), w.youMovedIn(house), n.house ? ["house"] : []);
      return row(w.invite(who, house), n.state === "declined" ? w.youSaidNo : n.state === "withdrawn" ? w.takenBack : w.lapsed);
    case "rent_together":
      if (n.state === "open") return row(w.rent(who), w.rentHow, ["accept", "decline"], w.imIn);
      if (n.state === "accepted") return row(w.youRent(who), w.rentHow, ["plot"]);
      return row(w.rent(who), n.state === "declined" ? w.youSaidNo : n.state === "withdrawn" ? w.takenBack : w.lapsed);
    case "rent_together_yes":
      return row(w.rentYes(who), w.rentHow, ["plot"]);
    case "invite_accepted":
      return row(w.tookInvite(who, house), w.tookInviteWhy, n.house ? ["house"] : []);
    case "invite_declined":
      return row(w.declinedInvite(who, house), w.declinedWhy);
    case "rent_together_no":
      return row(w.rentNo(who), w.declinedWhy);
    case "knock":
      return row(w.knock(who, house), n.room ? w.knockRoom(n.room) : null, n.applicationId ? ["knock"] : []);
    case "knock_answer":
      return n.verdict === "admitted" ? row(w.knockYes(house), null, n.house ? ["house"] : []) : row(w.knockNo(house), w.knockNoWhy, n.applicationId ? ["knock"] : []);
  }
}
