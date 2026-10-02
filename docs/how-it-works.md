# La Coloc: how it works

*02 10 2026. The canonical product explanation, written for a teammate with zero context.
Stack: [architecture.md](architecture.md) · Plan: [roadmap.md](roadmap.md).*

## In one paragraph
A group of devs rents **one cloud server together**, like flatmates renting a flat. Each person gets a **room**:
an isolated slice of the server where their own project runs. You push to your own GitHub repo, and your app goes
live in your room. The house **splits the bill** by what each room actually used. In exchange for the cheap,
always-on hosting, everyone does **chores**: reviewing their flatmates' pull requests. Each cycle, the house rallies
behind **one flatmate's project** (the tontine). Skip your chores and you lose your turn.

## The problem
- Side projects that need to **stay on** (bots, scrapers, APIs, backends) die on free tiers that sleep, or on laptops
  that go down with every power cut.
- Paying for a server alone is expensive in FCFA, and most of it sits idle.
- Solo devs **never get code reviews**, so they don't improve, and their projects stall without anyone to push them.

## The cast
| Who | What they do |
|---|---|
| **Chef de coloc** | Rents the server on their Datacloud account, runs the install command, pays the landlord, can evict |
| **Flatmate** | Has a room, deploys their project, reviews others, pays their share |
| **Applicant** | Answers a flatmate listing; the house votes to admit them |
| **Visitor** | Anyone on the internet using a flatmate's app through its public link |

## The objects
| In the flat | In the product | Under the hood |
|---|---|---|
| **The building** | The server | A VPS rented on Datacloud (e.g. 4 vCPU, 8 GB) |
| **The letting agency** | coloc.dev | Our website + hub. Manages houses, never owns servers, never holds money |
| **The caretaker** | The agent | Our program on the server. Takes orders from the hub, talks to Docker |
| **A room** | Your hosting space | Docker container(s) on a private network, with fixed RAM/CPU caps and a subdomain |
| **The front door** | Your public link | Traefik proxy: `jib.sacre-coeur.coloc.dev`, automatic HTTPS |
| **The kitchen** | Shared database | One Postgres; each room gets its own database and password, no access to others |
| **Chores** | Code reviews | Each PR gets a flatmate reviewer, assigned on a rotation |
| **The fridge door** | Notifications | Automatic notes on the house page: hogging, skipped reviews, thanks |
| **Rent** | Monthly bill | Server cost split by measured usage, paid by Wave/Orange Money link |
| **Guests** | PR previews | A temporary copy of your app for the reviewer to try. Leaves 24h after the PR closes |
| **The tontine** | Turn-based focus | Each cycle, one room's project gets priority reviews and launch-week perks |
| **A flatmate ad** | Listings | "Room free: looking for a mobile dev." Solo devs find a house |

## The lifecycle

### 1. Renting the flat
1. The chef logs into coloc.dev with GitHub and clicks **Rent a flat**.
2. They rent a server on Datacloud, then paste one install command into it. The script installs Docker, Traefik,
   the kitchen and the agent, and turns on Docker's safety settings.
3. The agent calls the hub: "I'm the server of house Sacré-Cœur." The house page shows the flat as **online**.
4. The chef picks room sizes. The sizes must add up to at most the server's capacity, so nobody can ever hog the house.

### 2. Moving in
1. The chef invites people **they follow on GitHub**, or posts a **listing** for strangers.
2. A new flatmate accepts, picks **one of their own repos**, and installs the coloc GitHub App on it.
3. The app gives the house **review access** to that repo, and gives coloc the right to read the code for building.
4. The flatmate sets their secrets (API keys, passwords) on their room's page. They're encrypted and only given to their room.

### 3. Daily life: push → review → live
1. You open a PR in your repo.
2. coloc picks the next reviewer on the rotation and comments: "Corvée: @moussa, your turn. Due tomorrow 18:00."
3. The agent builds a **guest** (preview) at `pr-42.jib.sacre-coeur.coloc.dev` so Moussa can click around.
4. Moussa reviews in GitHub's normal review screen and approves.
5. You merge. The agent builds the new version, checks that it starts, switches the front door to it, stops the old
   one. **Zero downtime.** If the new version crashes on start, the old one stays up and you're told why.
6. The PR shows "deployed to jib.sacre-coeur.coloc.dev" (native GitHub deployments).

House rule (switchable): in **strict** mode an unreviewed merge doesn't deploy; in **relaxed** mode it deploys and leaves a fridge note.

### 4. When things go wrong
| Situation | What happens |
|---|---|
| Your app eats all its memory | Only **your** room is killed and restarted. Fridge note. Others never notice |
| Your app crashes in a loop | Room marked **down** on the floor plan, logs on your room's page |
| A bad deploy | The old version keeps running; the failed build's logs are shown |
| A reviewer is 24h late | Fridge note. A second skip pushes their tontine turn back |
| Someone runs a crypto miner or hosts illegal content | Chef (or a house vote) **evicts**: room suspended → data export → room removed |
| Unpaid rent | Room **paused**, never deleted. Paying unpauses it |
| The server goes down | Every room is down; the house page shows the flat as offline. Code is safe on GitHub, kitchen backed up nightly |

### 5. The monthly cycle
Every 30s the agent records each room's CPU, RAM, disk and bandwidth. At month end coloc computes each
flatmate's share of the server cost, posts the bill on the house page, and generates a payment link per person.
The chef pays Datacloud. coloc never touches the money.

### 6. The tontine cycle
Every [2 weeks], the next room in line gets **its turn**: its PRs jump the review queue, the house page features it,
and it gets temporary extra resources if the house has spare capacity. Doing your chores is your contribution to
the tontine; skipping them pushes you back in the line.

### 7. Leaving
Give notice on the house page. Your room is removed at the end of the month. Your code was always on GitHub; you
get an export of your kitchen database.

## What you can host
Anything that runs in a container from a repo, at side-project scale: websites, APIs, bots, cron jobs, scrapers,
small databases. **Not** ML training, video streaming or anything heavy.

## What it isn't
- **Not a cloud provider.** The server is rented from Datacloud; we manage the flat.
- **Not a payment processor.** We compute who owes what; money moves through Wave/Orange Money.
- **Not a code editor.** You code wherever you like; GitHub is the source of truth.

## The 30-second pitch (peer vote, jury)
"Your side projects die on free tiers, and nobody reviews your code. La Coloc: rent a server with your friends,
each gets a room, push to deploy, split the bill, and pay rent in code reviews."
