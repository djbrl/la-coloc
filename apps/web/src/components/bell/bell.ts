// What each notification says under the bell, and what you can do about it. Pure, so it's tested: Bell.vue only
// draws the rows. One short line (who did what), a quieter line under it, and at most two actions.
import type { Notice } from "../../types";
import { bellWords as w } from "./words";

// accept / decline: answer an invitation (to a house, to rent together, to team up). house: open the house it's about. knock: open the knock's thread.
// plot: walk to an empty plot (renting together).
export type NoticeAction = "accept" | "decline" | "house" | "knock" | "plot";

export interface NoticeRow {
  title: string;
  sub: string | null;
  actions: NoticeAction[];
  // The accept button's word: "Move in" for a house, "I'm in" for renting together, "Team up" for a team.
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
    case "build_failed":
      return row(w.buildFailed(who), n.room ? w.teamRoom(n.room, house) : null, n.house ? ["house"] : []);
    // Teaming up on one room's project, between flatmates. An invitation onto their project, or an ask to join yours,
    // is answered like an invitation; then the sender hears how it went.
    case "team_invite":
    case "team_ask": {
      const title = n.kind === "team_invite" ? w.teamInvite(who) : w.teamAsk(who);
      const where = n.room ? w.teamRoom(n.room, house) : null;
      if (n.state === "open") return row(title, where, ["accept", "decline"], w.teamUp);
      if (n.state === "accepted") return row(w.teamedWith(who), where, n.house ? ["house"] : []);
      return row(title, n.state === "declined" ? w.youSaidNo : n.state === "withdrawn" ? w.takenBack : w.lapsed);
    }
    case "team_accepted":
      return row(w.teamedWith(who), n.room ? w.teamRoom(n.room, house) : null, n.house ? ["house"] : []);
    case "team_declined":
      return row(w.teamNo(who), w.teamNoWhy);
    // A full house's group chat: a flatmate lets someone from outside in, and they hear how it went.
    case "guest_ask":
      if (n.state === "open") return row(w.guestAsk(who, house), null, ["accept", "decline"], w.letIn);
      if (n.state === "accepted") return row(w.guestAsk(who, house), w.guestIn);
      return row(w.guestAsk(who, house), n.state === "declined" ? w.youSaidNo : w.lapsed);
    case "guest_accepted":
      return row(w.guestYes(house), null, n.house ? ["house"] : []);
    case "guest_declined":
      return row(w.guestNo(house), null);
    default:
      // A kind this page doesn't know yet (a newer API): who it's from, and nothing to do.
      return row(who, null);
  }
}
