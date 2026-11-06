# Glossary

*16 Oct 2026. One plain sentence per word. The ideas behind them: [how-it-works.md](how-it-works.md).*

## House words

| Word | What it means |
|---|---|
| **City** | The walkable 3D map of one town (Dakar, Lomé, Kigali…) where every house stands. |
| **House** (a *coloc*) | One server that a group of developers rent together. |
| **Room** | One flatmate's own space on the house's server: a container with a memory and CPU limit and its own web address. |
| **Chef** (*chef de coloc*) | The flatmate who rents the server, installs the caretaker on it, and pays the provider. |
| **Flatmate** | Someone who lives in a house and has a room there. |
| **Caretaker** | Our small program on each house server: it builds each room's project with Docker and runs it. In the code it is called the *agent*. |
| **Knock** | Asking to move into a house's free room; the flatmates then vote, and a majority decides. |
| **Invite** | A flatmate offering their house's free room to someone who has no house; saying yes moves them in. |
| **Review** (a *chore* in the code) | Reading a flatmate's pull request on GitHub; La Coloc picks the reviewer in turn. |
| **Bill** | The house's monthly server cost, split between flatmates by room size and CPU used. |
| **Rent credit** | Each review you do takes 500 FCFA off your line of the bill. |
| **Rent** | Your line of the bill, taken from your credit when you move in and then every month, with a line under the bell each time. |
| **Tontine** | A turn that passes from flatmate to flatmate every two weeks, so the house rallies behind one project at a time. |
| **News** (the *fridge* in the code) | Short notes the house posts by itself: a project went live, a room ran out of memory, someone moved in. |
| **Channel** | The house's group chat, for flatmates only; a knock has its own thread. |
| **Message** (a *DM* in the code) | A conversation between two people, started from someone's card. |
| **City room** | A city's public chat: anyone reads it, logged-in people write. |
| **Board** | A city's small forum: tagged posts (looking for a house, flatmates, a project, help) with replies. Not the market's chores board, which lists reviews waiting. |
| **Block** | Stops direct messages both ways with someone, and hides what they write from you. |
| **Workshop** | L'Atelier, a hidden practice house in Dakar where newcomers get a first room during the quest. |
| **Quest** | "Your first home": the eight-chapter first visit that ends with your own page online. |
| **Bell** | The icon in the top bar that holds your invitations and news about your knocks. |
| **Passer-by** | A made-up person walking the streets so the city feels alive; you can't invite them. |
| **Example house / person** | Seeded demo data, marked as an example in the city; nothing runs in it. |
| **Preview** | A temporary copy of a project built from an open pull request, so the reviewer can try it. |
| **Strict / relaxed** | A house rule: in a strict house a merged pull request only goes live if a flatmate approved it. |

## Tech words

| Word | What it means |
|---|---|
| **Monorepo** | One Git repository holding all our programs and shared packages. |
| **API** | Our server program (NestJS) that the website and the caretakers talk to. |
| **Docker / container** | A tool that runs a program in a sealed box with its own files and limits; each room is one container. |
| **Traefik** | The front door on a house server: it sends each visitor to the right room by the address they typed. |
| **Route file** | A small file the caretaker writes to tell Traefik which container answers which address. |
| **Zero-downtime swap** | The new version starts and is checked before visitors are moved to it; then the old one stops. |
| **GitHub App** | Our app on GitHub: people install it on a repo so we can log them in, read the code and comment on pull requests. |
| **Webhook** | A message GitHub sends to our API when something happens, like a pull request being opened. |
| **smee** | A relay that brings GitHub's webhooks to a laptop in development (`npm run dev:webhooks`). |
| **WebSocket** | A connection that stays open so both sides can send messages at any time; used for the lobby's live line and for caretakers. |
| **Server-sent events (SSE)** | A one-way stream from the API to the page, used to update a house or the city live. |
| **Live line** | The lobby's WebSocket: who is walking where, waves, and "look at your bell". |
| **Ticket** | A one-minute, single-use pass that lets a page on another host (Vercel) open the live line. |
| **Tunnel** | A Cloudflare link that gives the API on a laptop a public web address, used by `npm run share`. |
| **Vercel** | A host for websites; `npm run share` puts the built site there. |
| **Postgres** | The database that holds people, houses, rooms, reviews and notifications. |
| **PGlite** | Postgres compiled to run inside Node, in memory, so the tests need no Docker. |
| **Drizzle** | The library we use to describe the database tables and write migrations. |
| **Migration** | A numbered SQL file that changes the database's shape; the API applies new ones when it starts. |
| **zod** | A library that checks data is the right shape where it enters a program. |
| **Core down** | The database is unreachable; the API answers "503 core_down" and the site waits and retries instead of breaking. |
| **userns-remap** | A Docker setting that makes "root" inside a room an ordinary user on the server. |
| **Copyleft** | Licences such as GPL that force derived code to stay open; the contest forbids them. |
