// What each notification says under the bell, and what you can do about it. Pure, so it's tested: Bell.vue only
// draws the rows. One short line (who did what), a quieter line under it, and at most two actions.
import type { Notice } from "../../types";
import { monthName } from "../lobby/house/exchange";
import { fcfa } from "../lobby/house/server";
import { friendWords as fw } from "../list/words";
import { bellWords as w } from "./words";

// accept / decline: answer an invitation (to a house, to rent together, to a chat). house: open the house it's about. knock: open the knock's thread.
// plot: walk to an empty plot (renting together). chat: open where it was said (the post, the city's room, the Arena).
// credit: open your credit, to top up (rent you were short of).
export type NoticeAction = "accept" | "decline" | "house" | "knock" | "plot" | "chat" | "credit";

export interface NoticeRow {
  title: string;
  sub: string | null;
  actions: NoticeAction[];
  // The accept button's word: "Move in" for a house, "I'm in" for renting together, "Let in" for a chat.
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
      return row(w.buildFailed(who), n.room ? w.roomIn(n.room, house) : null, n.house ? ["house"] : []);
    // Rent, taken from your credit when you moved in and every month since: one line, the amount and the house. Short
    // of credit, it waits: topping up pays it.
    case "rent_paid":
      return row(w.rentPaid(fcfa(n.amount ?? 0), house, monthName(n.month ?? "")), null);
    case "rent_due":
      return row(w.rentDue(fcfa(n.amount ?? 0), house, monthName(n.month ?? "")), w.rentDueWhy, ["credit"]);
    // A full house's group chat: a flatmate lets someone from outside in, and they hear how it went.
    case "guest_ask":
      if (n.state === "open") return row(w.guestAsk(who, house), null, ["accept", "decline"], w.letIn);
      if (n.state === "accepted") return row(w.guestAsk(who, house), w.guestIn);
      return row(w.guestAsk(who, house), n.state === "declined" ? w.youSaidNo : w.lapsed);
    case "guest_accepted":
      return row(w.guestYes(house), null, n.house ? ["house"] : []);
    case "guest_declined":
      return row(w.guestNo(house), null);
    // Words meant for you. The line is about the latest one; the next one updates it until you've read it.
    case "post_reply": {
      const post = n.chat?.post;
      if (!post) return row(w.alsoReplied(who), w.postGone);
      return row(post.mine ? w.replied(who) : w.alsoReplied(who), w.postTitle(post.title), ["chat"]);
    }
    case "mention": {
      const c = n.chat;
      if (!c) return row(w.mentionedBoard(who), w.postGone);
      if (c.place === "post") return row(w.mentionedBoard(who), c.post ? w.postTitle(c.post.title) : null, ["chat"]);
      return row(c.place === "arena" ? w.mentionedArena(who, c.city) : w.mentionedCity(who, c.city), null, ["chat"]);
    }
    // Friends: a request, answered like an invitation, and the yes coming back.
    case "friend_request":
      if (n.state === "open") return row(fw.request(who), null, ["accept", "decline"], fw.add);
      if (n.state === "accepted") return row(fw.request(who), fw.youreFriends);
      return row(fw.request(who), n.state === "declined" ? w.youSaidNo : n.state === "withdrawn" ? w.takenBack : w.lapsed);
    case "friend_accepted":
      return row(fw.accepted(who), null);
    default:
      // A kind this page doesn't know yet (a newer API): who it's from, and nothing to do.
      return row(who, null);
  }
}
