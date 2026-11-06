# What's left for Jib

Updated 6 Nov 2026. Only things Jib has to do or decide: payments, sign-ins, declarations, and anything that needs a person.

The rules are in `docs/contest-rules.md` (copy of 3 Nov). **Submissions close on Sun 15 Nov at 17:00 GMT.** The peer vote runs from 15 Nov at 18:00 to 16 Nov at 23:59, the public vote on 17–20 Nov, the jury on 21–22 Nov, and results on 23 Nov.

## To do

1. **Vote in the peer vote, 15 Nov 18:00 to 16 Nov 23:59 GMT.** Not voting gets the project excluded (Art. 7). It's in Google Calendar, with a reminder two days before.
2. **Get the organiser to unblock solo submission on the platform.** "Soumettre au jury" is greyed out: "Ton équipe doit compter au moins 2 membres pour soumettre le projet (1 actuellement)". Their OK has to show up there too, or the button stays off. Ask cadev@systalink.com before 15 Nov.
3. **Submit on the Cadev page** before 15 Nov 17:00 GMT, when the project is ready. Required: the live link, a YouTube link to the video, the Git repo and the Systalink product (the last two are already filled in). Optional: 3 to 5 screenshots and a pitch file. Once sent, nothing can be changed. The form has no fields for the declarations the rules ask for (ownership, components and licences, AI), so they're in `docs/declaration-soumission.md`, to attach to the project page.
4. **Record the demo video: 2 minutes at most** (the form's limit), French with English subtitles, including a PayDunya sandbox top-up. Put it on YouTube.
5. **Have a native speaker read the French.**
6. **Be ready to explain the code to the jury.** Start with `docs/architecture.md`; for SSH, `docs/ssh-walkthrough.md`.
7. **Ask the organiser what a win means now** (cadev@systalink.com): the article on the prize and handing over the rights is gone from the rules of 3 Nov.
8. **Copy a backup off the server before the jury:** `COLOC_SSH="ssh -i ~/.ssh/coloc_datacloud.pem -o IdentitiesOnly=yes" deploy/pull-backup.sh 194.62.97.180`. The server keeps a nightly dump at 03:30 for 7 days.

## Decided

- **Solo entry:** the organiser said yes (6 Nov), but the platform still blocks it (item 2).
- **The demo restart stays on** (`COLOC_DEMO_RESET=1`).
- **Port 2222 stays open** for SSH into rooms. It only accepts registered keys.
- **The repo is public** (6 Nov), without the risk review that used to be in this list.
- **Images:** most Dockerfiles work as they are. A room only says "live" once visitors can reach its port, and otherwise says why.

## Done

- The city runs on Datacloud since 5 Nov: https://coloc.194-62-97-180.sslip.io (Art. 6, the purchase `vps-cadev-032` validated "Produit Systalink actif").
- `main` holds everything that's live.
- All chat was wiped on 6 Nov before submission; the dump from just before is in `~/coloc-backups`.
- Nightly backups, a disk check every 15 minutes, and an uptime alarm (see `docs/dev.md`).

## After the contest

- **Server mode:** a plain Ubuntu room for several projects in `tmux`.
- **Point the GitHub App's webhook back to smee** for laptop development (needs your passkey).
- **Nest 11 and zod 4:** the last `npm audit` findings, none reachable today.
