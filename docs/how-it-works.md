# How La Coloc works

*Rewritten 16 Oct 2026 against the code, updated 17 Oct 2026. The product's ideas in plain words. Words in bold are
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
- It is always daytime in the city. The day / night switch in settings only changes the panels.
- A house shows its rooms as windows: lit when a project runs, empty when the room is free. A crane appears while
  something builds, and fireworks when it goes live.
- **The city shows what happens.** A finished review flies as an envelope from the reviewer to the author, with a coin
  for the rent it saved. A room whose app crashes flashes red while its neighbours stay lit (the isolation demo, seen
  from the street). Smoke from a roof grows with the house's CPU use. Lines said in the city's room, or in your own
  house's channel, appear as bubbles over whoever said them.
- Made-up **passers-by** walk the streets so it feels alive. Their handles have an underscore, which GitHub never
  allows, so none can be a real person's. Eight of the nine houses are **examples** with made-up people, and say so.
  Only Sacré-Cœur (Dakar) runs real projects today.
- A **minimap** sits in the corner; M opens the big map, where picking a house takes you to its door.
- Everything is something you can use: walk up and press E, click it, or press Tab to pick it. **?** lists the keys.
- A list view (in settings) shows the same city as plain pages.

## Houses and rooms

- The **chef** starts a house on an empty plot ("Start a coloc here"), picks a server size (small, medium or large:
  7 000, 12 000 or 22 000 FCFA a month) and gets a one-line install command for their server.
- The command installs the **caretaker**, our small program on the server. When it phones in, the house goes live.
- Each room has a fixed amount of memory and CPU. If one project eats all its memory, only that room restarts; its
  neighbours never notice.
- A room is a small server of your own. Your project can reach the internet, but not the other rooms or the server
  itself, and it can't send email directly. It has 1 GB of disk, and `/home/your-room` adds 1 GB that survives new versions.
  Builds take turns, one at a time per house.
- A room's code comes from a GitHub repo (`https://` only). Only the flatmate who lives there chooses which repo,
  branch and folder, since the build gets the room's secret keys; the chef can still update or restart it. Deploys
  by hand have a brake: one at a time per room, five per person in ten minutes.
- Every project gets its own address, such as `jib.coloc.localhost:8000` on a laptop. On a laptop that address only
  opens on that laptop.
- A house picks a rule: **strict** (a merged pull request goes live only if a flatmate approved it) or **relaxed**
  (it goes live anyway, with a note).

## Moving in

There are two ways in.

1. **Knock.** Walk to a house with a free room and knock, saying what you would build. The house sees your GitHub
   repos and reviews. Flatmates vote in the knock's thread; more than half decides, yes or no.
2. **Be invited.** Click a person in the city. Their card offers one thing, depending on who you both are:
   - they live in a house: **See their house**;
   - they have no house and yours has a free room: **Invite to my house** (saying yes moves them in, exactly like a
     yes vote);
   - neither of you has a house: **Rent a place together** (saying yes tells the other person; one of you then starts
     a house and invites the other).

   You can't invite yourself, an example person, someone who already has a house, or into a full house. One open
   invitation per person, not again the day they said no, ten a day. An invitation lapses after a week.

## Living together

- **The channel:** one group chat per house, flatmates only, plus one thread per knock.
- **News:** notes the house posts by itself (a project went live, a room ran out of memory, a review was late,
  someone moved in, someone linked repos). Only public repos are named; private ones are only counted ("+2"). Called
  the "fridge" in the code.
- **Your room's page:** build settings, secret keys (stored encrypted), logs, restart and update.
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

Each review done this month takes **500 FCFA** off the reviewer's line of the bill. The app calls them "Reviews";
the code calls them "chores".

## The bill

- The house's monthly cost is split between flatmates: 60 % by room size (like rent), 40 % by the CPU each room
  really used. The caretaker measures usage every 30 seconds.
- Your review credits come off your line.
- Each country's usual ways to pay are named (Wave and Orange Money in Senegal, MTN MoMo in Côte d'Ivoire…).
- **Paying is a mock today:** "Pay your share" marks your line paid and moves no money.

## The tontine

A tontine is a savings circle many people in West Africa already trust. In La Coloc it is a turn: every two weeks the
next flatmate in line has the house's focus, and their face is shown on the house. Newcomers join the back of the
line. The perks that should come with a turn (reviews first, extra resources) are **not built yet**.

## The first visit: "Your first home"

A newcomer plays a short **quest** on a quiet street before seeing the city. A tracker at the top shows eight
chapters, and each one moves on by itself when the game sees it done:

1. **Arrive:** walk.
2. **Find a home:** follow a light to La Coloc, the newcomers' **workshop** house.
3. **Get the keys:** a free room there becomes yours, named after you.
4. **Bring a project:** a ready-made "I just moved in" page in one press, or one of your own repos, picked from a list
   once the GitHub App is installed.
5. **Launch it:** fetching, building, starting, live; then fireworks.
6. **Open it:** your page's address.
7. **Show it off:** copy the link, share on WhatsApp, or scan a QR code. For an address that only opens on the demo
   machine (`*.coloc.localhost`), the quest says so and only offers to copy it.
8. **Meet the house:** flatmates, reviews, news.

It ends on "Welcome home", then the city. You can leave and come back: it remembers your chapter. Settings can
restart it. The workshop room stays yours; a real house comes later, by knocking or an invitation.

## Talking: messages, the city's room and its board

A chat key in the top bar opens a card over the city (you never leave the game). Its tabs:

- **Messages:** one-to-one conversations. "Message" on someone's card starts one (real people only; an example
  person's key is greyed out, with why). Newest first, with how many you haven't read; the key in the top bar counts
  them. A new message arrives live.
- **City:** one public room per city, the last hundred messages. Anyone can read, visitors too; you write once logged in.
- **Board:** the city's small forum. A post has a tag (looking for a house, looking for flatmates, starting a
  project, help, other), a title and a few lines; replies go under it, and the most recently active post comes
  first. Only its author, or an admin, can delete a post or a reply. "Message" writes to the author. The chores board
  on the market square, and a key in the city's corner, open it too.
- **House:** your house's channel, the same as in its window, flatmates only.

Keeping it safe: **block** someone (no messages either way, and you stop seeing what they write anywhere);
**report** a message or a post (the admins get a copy); a **brake** of five messages in ten seconds and five posts an
hour; messages up to 1 000 characters; everything is shown as plain text, links included.

## Notifications: the bell

GitHub can't message people for us, so La Coloc has a **bell** in the top bar. It holds invitations (Move in or No
thanks), a knock on your house, the answer to your knock, and whether your invitation was taken or turned down. A
nudge on the lobby's live connection updates it without reloading.

## Languages

The site speaks English and French. It starts in English, and the switch is the first row of
settings. The French says "vous" and still needs a native speaker's read. House news, the house's lines in a knock's
thread, the example city's texts (taglines, project lines, free rooms' ads) and the refusals people meet (chat, board,
knocks, invitations, deploys, the quest) read in French too: the API sends a kind or a `code`, and the site picks the
words. Other API error messages and the comments on GitHub are still in English. What people write stays as written.

## When the database is down

The site doesn't break. You stay in the city, a small key in the top row says Offline and retries by itself, and everything
comes back without a reload when the database returns.

## SSH into your room

A room's SSH tab gives you one line to copy. It opens a shell inside your running project, so you can look at what went wrong and fix it there: edit a file, install a tool, restart something. `nohup` and `tmux` keep things running after you log out.

Putting a new version online ends the shell and resets everything except `/home/your-room`, which is where you arrive and where `~` points. `project` in there is a link to the running code, replaced by each deploy. The room page's Inside tab shows that folder and what's running without going in, and can put something you started on a port at the room's address. Files there stay yours until you end the lease, when they're deleted. So a fix that should last belongs in your code.

It opens with your SSH keys: a GitHub account starts with the ones GitHub lists, or you paste one. Only the room's occupant can get in, and only they see the line. The chef can't, since a room is its occupant's own.

## Not built yet

- Payments that move money (Stripe test mode, then a mobile-money sandbox, are planned).
- The real server on Datacloud, HTTPS, and a production GitHub App.
- Leaving a house, or evicting someone (the chef can only empty a room). Reports have no admin screen yet.
- Tontine perks, and a penalty for skipped reviews.
- A database per room, and backups.
- GitHub's own "deployed to" panel (a merged pull request gets a comment instead).

## The 30-second pitch

"Your side projects die on free tiers, a server is too expensive alone, and nobody reviews your code. La Coloc is a
city of dev houses: move into a room, push, and your project is online. You split the server bill and pay part of the
rent in code reviews."

## Questions a juror may ask

- *Why not a shared server and branch protection?* You could, but nobody sets up the walls between rooms, the bill
  split, the review rotation and the reminders. That is the product.
- *What stops a crypto-miner?* Each room has hard memory and CPU limits, so it can only slow itself; the chef can
  empty the room.
- *Who pays the provider if a flatmate doesn't?* The chef pays the provider; the bill shows who owes what. Real
  payments are not built yet.
- *What did the AI write, and can you explain it?* See [ai-usage.md](ai-usage.md) and the [build notes](build-notes.md).
