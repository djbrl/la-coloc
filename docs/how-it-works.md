# How La Coloc works

*Rewritten 16 Oct 2026 against the code, updated 6 Nov 2026. The product's ideas in plain words. Words in bold are
in the [glossary](glossary.md). How the pieces fit: [architecture.md](architecture.md).*

## In one paragraph

La Coloc is **a city of dev houses**. You walk a 3D city, find a **house** with a free **room**, and move in. A house
is one server rented together. Your room is your own walled-off part of it, where your GitHub project is built and
put online. The house splits the server's **bill**, and every code **review** you do for a flatmate takes money off
your share. Developers trade reviews, help and server space: that is the "exchange" in the contest's subject, *an
African exchange platform built for devs by devs*.

## The problem it answers

- Side projects that must stay on (bots, APIs, scrapers) die on free tiers that sleep, or on laptops that go off in
  every power cut.
- One server is expensive for one person, and mostly idle.
- Solo developers rarely get their code reviewed, and have nobody to build with.

## The city

- Each city (Dakar, Lomé, Abidjan, Douala, Kigali, Tunis, Marrakech, Cotonou) is a walkable street with its own look.
  "Where to?" is a map of Africa to travel between them.
- It is always daytime in the city.
- A house shows its rooms as windows: lit when a project runs, empty when the room is free. A crane appears while
  something builds, and fireworks when it goes live.
- **The city shows what happens.** A finished review flies as an envelope from the reviewer to the author, with a coin
  for the rent it saved. A room whose app crashes flashes red while its neighbours stay lit (the isolation demo, seen
  from the street). Smoke from a roof grows with the house's CPU use. Lines said in the city's room, or in your own
  house's channel, appear as bubbles over whoever said them.
- Made-up **passers-by** walk the streets so it feels alive. Their handles have an underscore, which GitHub never
  allows, so none can be a real person's. Eight of the nine seeded houses are **examples** with made-up people, and
  say so. Sacré-Cœur (Dakar) and the houses people rent run real projects.
- People show as `@login`, examples by their name. A real account's card has a key to their GitHub profile.
- Your first login puts you in the city nearest the country you're in (looked up on our own server, not stored).
- A **minimap** sits in the corner; M opens the big map, where picking a house takes you to its door.
- Everything is something you can use: walk up and press E, or click it. The arrows walk; **?** lists the keys.
  Windows open one at a time, and Esc or a click on the city closes them.
- Five **city missions** in a small card give a newcomer things to try, and go once they're done.
- Settings can show the city as a **Dashboard** instead: one screen with your rooms, the free rooms, your friends and
  your conversations, no 3D.

## Houses and rooms

- The **chef** starts a house on an empty plot ("Start a coloc"), picks a server size (small, medium or large:
  7 000, 12 000 or 22 000 FCFA a month) and pays the first month from their **credit**.
- La Coloc then starts the house's **caretaker**, our small program that runs its rooms, on its own server, standing
  in for a hosting provider. When it phones in, the house goes live. (The API can still give a one-line install
  command for a server of your own, used in tests and on a laptop.)
- Each room has a fixed amount of memory and CPU. If one project eats all its memory, only that room restarts; its
  neighbours never notice.
- A room is a small server of your own. Your project can reach the internet, but not the other rooms or the server
  itself, and it can't send email directly. It has 1 GB of disk, and `/home/your-room` adds 1 GB that survives new versions.
  Builds take turns, one at a time per house.
- A room's code comes from a GitHub repo (`https://` only). Only the flatmate who lives there chooses which repo,
  branch and folder, since the build gets the room's secret keys; the chef can still update or restart it. Deploys
  by hand have a brake: one at a time per room, five per person in ten minutes.
- Every project gets its own address, `<room>.<the house's domain>`: on the server under the city's own domain, with
  HTTPS, and on a laptop such as `jib.coloc.localhost:8000`, which only opens on that laptop.
- A house picks a rule: **strict** (a merged pull request goes live only if a flatmate approved it) or **relaxed**
  (it goes live anyway, with a note).

## Moving in

There are two ways in.

1. **Apply** (a *knock* in the code). Walk to a house with a free room and apply, saying what you would build. The
   house sees your public repos and reviews. Flatmates vote in the application's thread; more than half decides, yes
   or no.
2. **Be invited.** Click a person in the city. Next to Chat, their card offers what fits who you both are:
   - they live in a house: **See their house**;
   - your house has a free room: **Invite to my house**, even if they live somewhere already (saying yes moves them
     in, exactly like a yes vote, and they keep their other rooms);
   - you have no house, or yours is full: **Share a house** (saying yes tells the other person; one of you then
     starts a house and invites the other).

   You can't invite yourself, an example person, someone who already lives in your house, or into a full, example or
   workshop house. One open invitation per person, not again the day they said no, ten a day. An invitation lapses
   after a week.

Someone who already lives in a house can take another of its free rooms, up to three rooms a person. A full house's
channel can still be joined as a guest: ask, and a flatmate answers under the bell.

Ending a lease frees the room at once (its project, repo link, secrets and kept files go); the money follows at the
end of the month. Settings can also delete your account, or remove the GitHub App from your repos.

## Living together

- **The channel:** one group chat per house, flatmates only, plus one thread per application.
- **News:** notes the house posts by itself (a project went live, a room ran out of memory, a review was late,
  someone moved in, someone linked repos). Only public repos are named; private ones are only counted ("+2"). Called
  the "fridge" in the code.
- **Your room's page:** its state and next step first, then build settings, secret keys (stored encrypted), logs,
  history, what's inside, SSH, the lease, restart and update. A build can be cancelled.
- **Your room is yours:** only you manage it, open a shell in it or see its SSH address (the chef can update and
  restart it). To work with a flatmate, ask them for a review. The review rotation never picks you for your own
  project, and reviewing your own project takes nothing off your rent.
- **Sharing a house:** the share key in a house's panel copies its link or sends it on WhatsApp; the link shows the
  house's name, a line about it and a picture of its city.

## Reviews pay part of the rent

1. You open a pull request in your repo, which is linked to your room through our **GitHub App**.
2. La Coloc picks the next flatmate on a rotation, asks them on GitHub to review it within 24 hours, and builds a
   **preview** of your change for them to try.
3. When they review, the review counts for them. Late ones get a note ("late, but done" when it comes).
4. You merge. The caretaker builds the new version, checks it starts, then switches visitors to it. If it fails, the
   old version keeps running and you see why.

Each review done this month takes **500 FCFA** off the reviewer's line of the bill, and adds 500 FCFA to their credit.
The app calls them "Reviews"; the code calls them "chores".

## The bill

- The house's monthly cost is split between flatmates: 60 % by room size (like rent), 40 % by the CPU each room
  really used. The caretaker measures usage every 30 seconds.
- Your review credits come off your line. Whoever let a review go late pays for them first, up to 500 FCFA a late
  review; the house's pool covers the rest. A first place in the Arena also comes off the winner's line.
- Each country's usual ways to pay are named (Wave and Orange Money in Senegal, MTN MoMo in Côte d'Ivoire…).
- **Rent goes by itself:** your line is taken from your credit when you move in and then each month, with a line under
  the bell. Short of credit, nothing goes below zero: the month stays unpaid and is taken once you have the credit.
- **Credit** is fake money in FCFA. Everyone starts with 15 000. It pays a server's first month, rent and a project's
  first time online (1 000), and reviews and the Arena earn more. It can be bought with PayDunya (mobile money or
  card), in its test mode: no real money moves.

## The tontine

A tontine is a savings circle many people in West Africa already trust. In La Coloc it is a turn: every two weeks the
next flatmate in line has the house's focus, and their face is shown on the house. Newcomers join the back of the
line. The perks that should come with a turn (reviews first, extra resources) are **not built yet**.

## The first visit: "Your first home"

A newcomer plays a short **quest** on a quiet street before seeing the city. A tracker at the top shows eight
chapters, and each one moves on by itself when the game sees it done:

1. **Arrive:** the camera shows you the house down the street, and you walk there, learning the arrows.
2. **Find a home:** go into La Coloc, the newcomers' **workshop** house. Each newcomer sees it as their own: no
   other people, and a spotlight on what to click.
3. **Get the keys:** a free room there becomes yours, named after you.
4. **Bring a project:** a ready-made "I just moved in" page in one press, or one of your own repos, picked from a list
   once the GitHub App is installed.
5. **Launch it:** fetching, building, starting, live; then fireworks.
6. **Open it:** your page's address.
7. **Show it off:** copy the link, share on WhatsApp, or scan a QR code. For an address that only opens on the demo
   machine (`*.coloc.localhost`), the quest says so and only offers to copy it.
8. **Meet the house:** flatmates, reviews, news.

It ends on "Welcome home", then the city. You can leave and come back: it remembers your chapter, and a key in the
corner skips it. Settings can restart it. The workshop room stays yours; a real house comes later, by applying, an
invitation or renting a server. Before the quest, a first login picks a look for your character and hands out your
credit.

## Talking: messages, the city board and its room

A chat key in the top bar opens a card over the city (you never leave the game), for your own conversations:

- **Messages:** one-to-one conversations. "Chat" on someone's card starts one (real people only; an example
  person's key is greyed out, with why). Newest first, with how many you haven't read; the key in the top bar counts
  them. A new message arrives live.
- **House:** your house's channel, the same as in its window, flatmates only.

The city's conversation is on the big **city board** in the market square (walk up and press E, or click it). Its
window has these tabs, each with a red dot when something is new:

- **City:** one public room per city, the last hundred messages. Anyone can read, visitors too; you write once logged in.
- **Board:** the city's small forum. A post has a tag (looking for a house, looking for flatmates, starting a
  project, help, other), a title and a few lines; replies go under it, and the most recently active post comes
  first. Only its author, or an admin, can delete a post or a reply.
- **Reviews:** only while houses in the city have code reviews waiting, one row per house.

Each chat has a header with a back key and a ⋯ menu to add a friend, mute, block or report. Keeping it safe:
**block** someone (no messages, invitations or friend requests either way, and you stop seeing what they write
anywhere); **mute** a person or a group chat (no bell, no unread dot, their words still show); **report** a person, a
message, a post or a group chat (each admin gets a copy under their bell); a **brake** of five messages in ten seconds
and five posts an hour; messages up to 1 000 characters; everything is shown as plain text, links included. Settings
lists who you blocked or muted. `@login` rings that person's bell, and a reply under your post rings yours.

## Friends

Ask someone from their card, or by login in the friends list; they answer under the bell. Your friends list shows who
is online, idle or away, and in which city, with a message one click away. The list also offers a link for people who
aren't here yet.

## The Arena

Each city has an Arena, a stadium where one challenge runs per week: a bug bounty, a hackathon or a coding challenge,
in a public GitHub repo. You join, fork it, and send pull requests; the judges merge and label them, which gives points.
At the week's end the podium gets badges worn next to their name, and first place a prize in credit. Players wear an
Arena tag on their house, and the bell says when one of their pull requests is merged or closed. Details:
[arena.md](arena.md).

## Notifications: the bell

GitHub can't message people for us, so La Coloc has a **bell** in the top bar. It holds invitations (Move in or No
thanks), friend requests, someone applying to your house or asking into its chat, the answer to yours, whether your
invitation was taken or turned down, a flatmate's failed build, replies and @mentions, rent taken or due, Arena
results and, for admins, reports. A nudge on the lobby's live connection updates it without reloading.

## Languages

The site speaks English and French. It starts in English, and the switch is the first row of
settings. The French says "vous" and still needs a native speaker's read. House news, the house's lines in an
application's thread, the example city's texts (taglines, project lines, free rooms' ads) and the refusals people meet
(chat, board, applications, invitations, deploys, the quest) read in French too: the API sends a kind or a `code`, and the site picks the
words. Other API error messages and the comments on GitHub are still in English. What people write stays as written.

## When the database is down

The site doesn't break. You stay in the city, a small key in the top row says Offline and retries by itself, and everything
comes back without a reload when the database returns.

## SSH into your room

A room's SSH tab gives you one line to copy. It opens a shell inside your running project, so you can look at what went wrong and fix it there: edit a file, install a tool, restart something. `nohup` and `tmux` keep things running after you log out.

Putting a new version online ends the shell and resets everything except `/home/your-room`, which is where you arrive and where `~` points. `project` in there is a link to the running code, replaced by each deploy. The room page's Inside tab shows that folder and what's running without going in, and can put something you started on a port at the room's address. Files there stay yours until you end the lease, when they're deleted. So a fix that should last belongs in your code.

It opens with your SSH keys: a GitHub account starts with the ones GitHub lists, or you paste one. Only the room's occupant can get in, and only they see the line. The chef can't, since a room is its occupant's own.

## Not built yet

- Payments that move real money: PayDunya runs in its test mode, and paying for a server is simulated.
- A real hosting provider: a paid house's caretaker runs on La Coloc's own server.
- Evicting someone (the chef can only empty a room). Reports have no admin screen beyond the bell.
- Tontine perks.
- A database per room, and backups of the rooms' kept files (the database is dumped every night).
- GitHub's own "deployed to" panel (a merged pull request gets a comment instead).

## The 30-second pitch

"Your side projects die on free tiers, a server is too expensive alone, and nobody reviews your code. La Coloc is a
city of dev houses: move into a room, push, and your project is online. You split the server bill and pay part of the
rent in code reviews."

## Questions a juror may ask

- *Why not a shared server and branch protection?* You could, but nobody sets up the walls between rooms, the bill
  split, the review rotation and the reminders. That is the product.
- *What stops a crypto-miner?* Each room has hard memory, CPU, process and disk limits, so it can only slow itself;
  the chef can empty the room.
- *Who pays the provider if a flatmate doesn't?* Rent is taken from each flatmate's credit; an unpaid month stays
  unpaid and the bill shows who owes what. Real money is not built yet.
- *What did the AI write, and can you explain it?* See [ai-usage.md](ai-usage.md) and the [build notes](build-notes.md).
