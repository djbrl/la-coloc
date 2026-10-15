# La Coloc: how it works

*02 10 2026, revised the same day around the city. The canonical product explanation, written for a teammate with
zero context. Stack: [architecture.md](architecture.md) · Plan: [roadmap.md](roadmap.md).*

> **As of 12 10 2026.** This describes the product we are building, as designed on 02 10. Most of it exists; what doesn't is listed here so the
> text isn't misread. **Not built yet:** team rooms (§4), report and mute, evict and "give notice" (§5, §8), paused rooms for unpaid rent, a per-room
> database (the "kitchen"), payment *links that move money* (the bill, its split and each person's line are real; paying is a mock, §6), priority
> reviews for the tontine's turn and its penalty for skipped reviews (§5, §7; the turn is shown and rotates every fortnight), and the Datacloud server. **Built since this was written:** the walkable lobby
> (the "Later" section at the end happened on 09 10), a tutorial, a list view and a live city. What's left: [TODO.md](../TODO.md).

## In one paragraph
La Coloc is **a city of dev houses**. You log in with GitHub and see the city: every house, its rooms, who lives
there, what they're building, and which rooms are free. You knock on a house with a free room, chat with the
flatmates, and if they vote you in, you move in. A house is **one cloud server rented together**. Each flatmate gets
a **room**: an isolated slice of the server where their own project runs, live the moment they push. The house
**splits the bill** by what each room actually used, and everyone pays part of their rent in **chores**: reviewing
their flatmates' pull requests. Each cycle the house rallies behind **one flatmate's project** (the tontine). Flatmates
can also **team up** to build one project together. Devs exchange reviews, skills and server space: that's the platform.

## Why it answers the CADEV subject: "an African exchange platform built for devs by devs"
- **Exchange:** reviews for hosting, skills for help (design for a landing page, a backend for a mobile app),
  spare server capacity for whoever's launching. The city is where devs find each other to start exchanging.
- **African, by design:** the tontine is a mutual-aid system people already trust, applied to shipping projects.
  Bills in FCFA, paid with Wave / Orange Money links. It fixes what kills African side projects: apps hosted on
  laptops that die with every power cut, free tiers that sleep, a server too expensive for one person.
  Houses run on Datacloud, an African cloud.
- **By devs, for devs:** peers review peers, the house governs itself (votes to admit, rules, evictions),
  and everything plugs into GitHub, where devs already work.

## The problem
- Solo devs in Africa have **nobody to build with**. Finding teammates means Discord servers and WhatsApp groups
  where nobody can see what you've actually shipped.
- Side projects that need to **stay on** (bots, scrapers, APIs, backends) die on free tiers that sleep, or on laptops
  that go down with every power cut.
- Paying for a server alone is expensive in FCFA, and most of it sits idle.
- Solo devs **never get code reviews**, so they don't improve, and their projects stall without anyone to push them.

## The cast
| Who | What they do |
|---|---|
| **Wanderer** | Logged-in dev without a house. Walks the city, reads house profiles, knocks on free rooms |
| **Applicant** | Has knocked on a house. Chats with it in the application thread; the house votes to admit them |
| **Flatmate** | Has a room, deploys their project, reviews others, pays their share, chats in the house channel |
| **Chef de coloc** | Rents the server on their Datacloud account, runs the install command, pays the landlord, can evict |
| **Visitor** | Anyone on the internet using a flatmate's app through its public link |

## The objects
| In the city | In the product | Under the hood |
|---|---|---|
| **The city** | The home page of coloc.dev | A stylised neighbourhood, like a fighting-game lobby (not a geographic map): illustrated houses on streets, rooms lit (lived in), dashed (free) or scaffolded (in the making). Filter by city, stack, "looking for". Live presence: who's online, where |
| **A house profile** | A house's public page, viewable without logging in | Name, city, stack, house rules, floor plan, flatmates (GitHub profiles), projects and their live links, exchange ledger, free rooms. The house channel, chores and bill stay private to flatmates |
| **A flatmate ad** | Listing on a free room | "Room free: looking for a mobile dev." Shown on the map |
| **The doorbell** | Application thread | Applicant ↔ house chat, then a vote. Opens when you knock |
| **The living room** | House channel | One chat per house, for flatmates. Fridge notes show up in it |
| **The building** | The server | A VPS rented on Datacloud (e.g. 4 vCPU, 8 GB) |
| **The letting agency** | coloc.dev | Our website + hub. Manages the city and houses, never owns servers, never holds money |
| **The caretaker** | The agent | Our program on the server. Takes orders from the hub, talks to Docker |
| **A room** | Your hosting space | Docker container(s) on a private network, with fixed RAM/CPU caps and a subdomain |
| **The front door** | Your public link | Traefik proxy: `jib.sacre-coeur.coloc.dev`, automatic HTTPS |
| **The kitchen** | Shared database | One Postgres; each room gets its own database and password, no access to others |
| **Chores** (shown as **Reviews** in the app, since 15 10) | Code reviews | Each PR gets a flatmate reviewer, assigned on a rotation. Each review done takes 500 FCFA off the reviewer's rent |
| **The fridge door** (shown as **News** in the app, since 15 10) | Notifications | Automatic notes pinned on the house's notice board: a new version online, hogging, skipped reviews, thanks, someone moving in |
| **Rent** | Monthly bill | Server cost split by measured usage, paid by Wave/Orange Money link |
| **Guests** | PR previews | A temporary copy of your app for the reviewer to try. *As built: removed as soon as the PR closes (the plan said 24 hours later)* |
| **The tontine** | Turn-based focus | Each cycle, one room's project gets priority reviews and launch-week perks |
| **Teaming up** | A shared project | Two or more flatmates build one project together; it gets a room, all of them deploy to it |
| **The exchange ledger** | Reviews given / received | On every profile and house page: who helped whom. Your reputation in the city |

## The lifecycle

### The first visit: "Your first home" (built 15 10)
Before the city, a newcomer plays a short quest in eight chapters, on a street of its own: **arrive** (walk),
**find a home** (follow a light to L'Atelier, the newcomers' house), **get the keys** (a free room there is theirs, named after
them), **bring a project** (a ready-made "I just moved in" page in one press, or one of their own repos linked from GitHub),
**launch it** (fetching → building → starting → live, with a crane and fireworks), **open it** (their address), **show it off**
(copy, WhatsApp, a QR code) and **meet the house** (flatmates, reviews, news). It ends on "Welcome home", then the city.
Their workshop room stays theirs; a real house comes later, by knocking. Details: [build-notes](build-notes.md).

### 0. Finding a house
1. You log in with GitHub. Your profile is built from it: repos, languages, what you've shipped.
2. You land on **the city**. Houses with free rooms glow; their ads say what they're looking for.
3. You open a house's profile: who lives there, their projects, their exchange ledger, their house rules.
4. You **knock**. That opens the application thread with the house: you say what you'd build in the room.
5. The flatmates vote. Admitted: you move in (step 2). Not this time: the thread closes politely.

Or you start your own house (step 1) and post ads for the rooms you want filled.

### 1. Renting the flat
1. The chef clicks **Rent a flat**.
2. They rent a server on Datacloud, then paste one install command into it. The script installs Docker, Traefik,
   the kitchen and the agent, and turns on Docker's safety settings.
3. The agent calls the hub: "I'm the server of house Sacré-Cœur." The house appears in the city as **online**.
4. The chef picks room sizes. The sizes must add up to at most the server's capacity, so nobody can ever hog the house.

### 2. Moving in
1. The chef invites people **they follow on GitHub**, or admits applicants from the doorbell.
2. A new flatmate picks **one of their own repos** and installs the coloc GitHub App on it.
3. The app gives the house **review access** to that repo, and gives coloc the right to read the code for building.
4. The flatmate sets their secrets (API keys, passwords) on their room's page. They're encrypted and only given to their room.

### 3. Daily life: push → review → live
1. You open a PR in your repo.
2. coloc picks the next reviewer on the rotation and comments: "Corvée: @moussa, your turn. Due tomorrow 18:00."
3. The agent builds a **guest** (preview) at `preview-jib.sacre-coeur.coloc.dev` so Moussa can click around.
4. Moussa reviews in GitHub's normal review screen and approves. The ledger counts it; the house channel gets a 👊.
5. You merge. The agent builds the new version, checks that it starts, switches the front door to it, stops the old
   one. **Zero downtime.** If the new version crashes on start, the old one stays up and you're told why.
6. The PR shows "deployed to jib.sacre-coeur.coloc.dev" (native GitHub deployments).

House rule (switchable): in **strict** mode an unreviewed merge doesn't deploy; in **relaxed** mode it deploys and leaves a fridge note.

### 4. Teaming up
Two flatmates decide to build something together. One of them turns their room into a **team room**: both can
deploy to it, and their PRs are reviewed by the rest of the house, never by each other. Chores still apply to each
of them individually. The house profile shows the team project, so the city can see it.

### 5. When things go wrong
| Situation | What happens |
|---|---|
| Your app eats all its memory | Only **your** room is killed and restarted. Fridge note. Others never notice |
| Your app crashes in a loop | Room marked **down** on the floor plan, logs on your room's page |
| A bad deploy | The old version keeps running; the failed build's logs are shown |
| A reviewer is 24h late | Fridge note. *(The tontine penalty for a second skip is not built.)* A review done late is thanked as "late, but done" |
| Someone runs a crypto miner or hosts illegal content | Chef (or a house vote) **evicts**: room suspended → data export → room removed |
| Someone is abusive in a channel or thread | Flatmates can report; the chef can mute or evict; coloc can ban from the city |
| Unpaid rent | Room **paused**, never deleted. Paying unpauses it |
| The server goes down | Every room is down; the house shows as offline in the city. Code is safe on GitHub, kitchen backed up nightly |

### 6. The monthly cycle
Every 30s the agent records each room's CPU, RAM, disk and bandwidth. At month end coloc computes each
flatmate's share of the server cost, posts the bill on the house page, and generates a payment link per person.
The chef pays Datacloud. coloc never touches the money.

### 7. The tontine cycle
Every [2 weeks], the next room in line gets **its turn**: its PRs jump the review queue, the house profile features it
in the city, and it gets temporary extra resources if the house has spare capacity. Doing your chores is your
contribution to the tontine; skipping them pushes you back in the line.

### 8. Leaving
Give notice on the house page. Your room is removed at the end of the month and becomes a free room on the map.
Your code was always on GitHub; you get an export of your kitchen database. Your exchange ledger stays with you.

## What you can host
Anything that runs in a container from a repo, at side-project scale: websites, APIs, bots, cron jobs, scrapers,
small databases. **Not** ML training, video streaming or anything heavy.

## What it isn't
- **Not a cloud provider.** The server is rented from Datacloud; we manage the flat.
- **Not a payment processor.** We compute who owes what; money moves through Wave/Orange Money.
- **Not a code editor or a Discord replacement.** You code wherever you like and GitHub is the source of truth;
  the house channel and doorbell exist so finding and living with flatmates happens in one place.

## Later: the walkable lobby (Q3 2027, after the contest)
The city map becomes an online lobby, like a fighting-game lobby (Guilty Gear, 2XKO): you have an avatar, walk
through the city, step into a house's living room, emote and chat with whoever's there. Same data as the map
(houses, rooms, presence, channels), new renderer. Costs mostly art (avatars, animations, rooms) and moderation,
not code. For the contest we ship the hint of it: online flatmates shown as small avatars in their rooms, with
meaningful emotes (👊 review approved, ☝️❓ someone knocking).

## The 30-second pitch (peer vote, jury)
"Finding people to build with is hard, your side projects die on free tiers, and nobody reviews your code.
La Coloc is a city of dev houses: find a house with a free room, move in, and your project's live the moment you push.
You split the server bill and pay part of the rent in code reviews."
