# What's left for Jib

Written 2 Nov 2026, dates updated 3 Nov. Only things Jib has to do or decide: payments, sign-ins, declarations, and anything that needs a person.

## Could end the entry

The rules changed. `docs/contest-rules.md` is the copy of 3 Nov, with what changed at the top. **Submissions close on Sun 15 Nov at 17:00 GMT.** The peer vote runs from 15 Nov at 18:00 to 16 Nov at 23:59, the public vote on 17–20 Nov, the jury on 21–22 Nov, and results on 23 Nov.

1. **Vote in the peer vote, 15 Nov 18:00 to 16 Nov 23:59.** Every member must vote, or the team is out.
2. **Get solo entries confirmed in writing.** The new rules still say teams of 2 to 5 (Art. 4). If the organiser said otherwise, ask them for an email, or keep a teammate on the team.

## Needed to submit

3. **Done: the city runs on Datacloud** (Art. 6). Since 5 Nov it is at https://coloc.194-62-97-180.sslip.io, on `server-djibril-sy-cadev-06` (194.62.97.180, Madrid, 1 core / 2 GB / 30 GB), and the Cadev project page links there. The purchase (`vps-cadev-032`) validated the "Produit Systalink actif" step. The droplet's database moved over whole. Update: `COLOC_SSH="ssh -i ~/.ssh/coloc_datacloud.pem -o IdentitiesOnly=yes" deploy/push.sh 194.62.97.180`.
4. **Make the AI declaration at submission** (tools used, parts concerned). `docs/ai-usage.md` has the content.
5. **Make the ownership declaration at submission:** the project was made outside any job, client or school work.
6. **Check `docs/licences.md` still holds when you submit.** `npm run licences:check` passed today.
7. **Be ready to explain the code to the jury.** "Mastery of the delivered solution, including parts made with AI" is part of the technical grade. Start with `docs/architecture.md`. For SSH, which nobody but me had read, `docs/ssh-walkthrough.md` (3 Nov) is a study guide: the path file by file, the security choices, 14 questions a jury might ask with answers, and a two-minute demo.

## Needed for a good entry

8. **Record the demo video** (about 3 minutes, French with English subtitles).
9. **Have a native speaker read the French.**
10. **Get real people into real rooms.** Today Jib's is the only real account, and it has no house. The demo restart most likely cleared it.

## Code and GitHub

11. **Done: what's live is on GitHub and in `main`.** `main` was fast-forwarded to `paydunya` on 3 Nov, so it now holds everything that went live (now on Datacloud).
12. **Done: merged into `main`** on 3 Nov.
13. **Decide whether the repo goes public.** `Djbrl/la-coloc` is still private. Your teammate said on 15 Oct they'd do it.

## Try on the live site

14. **SSH with your own key.** It's the one step I couldn't test, because it needs your account: rent a room, put a project online, open the room's SSH tab (your GitHub key is added by itself), copy the line, and run it.
15. **The rest with your real account:** GitHub import in a room, GitHub links on people, Try again on your portfolio page, and the two missions still unticked.
16. **Rebuild `42dsy/bount-dev`.** `latest` is arm64 only, so it can't run on this amd64 server. `refonte` now starts, since the disk is writable, but `nuxt dev` only listens on localhost and used 245 of 256 MB, so visitors get a 503. It needs a production build for amd64 that listens on 0.0.0.0, starting with `node .output/server/index.mjs`.

## Decide

17. **Done: a room that nobody can reach no longer says "live".** Since 3 Nov the caretaker checks that the app listens on the room's port where visitors can reach it. If not, the build fails and says why: localhost only (like `refonte`'s `nuxt dev`), another port (it names it), or nothing at all. The old version keeps running.
18. **Is port 2222 fine open to everyone for the demo?** It only accepts registered keys. To close it: `ufw delete allow 2222/tcp`.
19. **Turn off the demo restart before the jury?** It's on (`COLOC_DEMO_RESET=1`), and it most likely cleared your room.
20. **Uptime alarm during the vote and jury?** Nothing tells you if the site goes down. Since 3 Nov the disk check can post to a phone: put `COLOC_ALERT_URL=https://ntfy.sh/<a topic only you know>` in `/etc/coloc/alert.env` and install the ntfy app. A free outside checker (UptimeRobot or similar) on the site's address would cover the site going down; that needs your account.

## When the rehearsal ends

21. **Done: the droplet `la-coloc-rehearsal` is deleted** (5 Nov). Its database moved to Datacloud first; the last copy is in `~/coloc-backups`.
22. **Point the GitHub App's webhook back to smee** for laptop development. This needs your passkey.

## Worth remembering

23. **Ask what a win means now.** The old Art. 8 (5 000 000 FCFA, and handing La Coloc's rights to Systalink) is gone from the rules of 3 Nov, and nothing replaces it, though the rules still mention a prize. Ask the organiser (cadev@systalink.com) what the prize is and whether a winner still gives up the rights.

## Next for rooms

24. **Server mode.** Project mode is live: a room runs a project and has internet, a writable disk and kept files. Server mode is the other half of what you described: a plain Ubuntu container that nothing replaces, for several projects in `tmux`, plus a way to choose which port the room's address shows. Not built.

## Risk review: for later

Rooms now have internet, a writable disk and root inside. These are the risks that opens up, or that I noticed while building it. None is fixed unless it says so.

### Before strangers get rooms

25. **Abuse from the server's address** (high). A room can now scan or attack others, or host a phishing page, and the host could suspend the whole server, not just that room. Only outgoing email is blocked. To do: limit new connections and bandwidth per room in the firewall, watch outgoing traffic, and add a way to stop one room quickly.
26. **Free credit makes abuse cost nothing** (high). Any GitHub account gets a room for free. To do: consider a minimum GitHub account age, or approving people during the demo.
27. **One bad room can blacklist the whole domain** (high). Rooms live under the city's domain, so a phishing page can get all of it flagged by browsers, the main site included. To do: serve rooms from a separate domain, and have a way to take a room down.
28. **No rules for what people may host** (medium). There are no terms of use, and no process for complaints. The contest also requires the project to be free of illegal content, so ask whether that covers what visitors host.
29. **A hacked app can now send its secrets out** (medium). The sealed network used to stop this. Say so plainly on the Secrets tab, or let a room turn its internet off.

### Could take the city down

30. **The database shares a disk with everything else** (high). Rooms are limited, but images and build cache aren't, and the database lives on the same 59 GB disk. If it fills, the database stops and the whole city with it. Since 3 Nov, every 15 minutes `coloc-disk-check` looks at both disks: at 80% it logs a warning (`journalctl -p warning -u coloc-disk-check`) and clears build cache older than a day and images nothing uses. With `COLOC_ALERT_URL` set it also posts to a phone (item 20). Build cache older than a week goes every Sunday. Still to do: the database on its own disk.
31. **No backups** (high). The database and everyone's `/home/your-room` are in one file on one server. Since 3 Nov, `coloc-backup` dumps the database every night at 03:30 into `/var/backups/coloc` on the root disk, outside Docker's, and keeps 7. A copy only leaves the server when you run `COLOC_SSH="ssh -i ~/.ssh/coloc_datacloud.pem -o IdentitiesOnly=yes" deploy/pull-backup.sh 194.62.97.180` from your laptop (restore line in that file): do it before the jury. Still to do: tell people `/home/your-room` isn't backed up, and copy dumps off the server by themselves.
32. **Dependencies with known holes** (was high, now checked). On 3 Nov, `ws`, `body-parser`, `qs` and `multer` were raised to fixed versions through npm overrides (same major versions, all tests pass). `npm audit --omit=dev` still lists 9, none reachable here: `@nestjs/core`'s is in server-sent events' `type` and `id`, which are fixed words in our code. `zod` 3's needs a huge array, and requests stop at 100 kB. `uuid` (inside `dockerode`) needs a buffer we never pass, and `file-type` (inside `@nestjs/common`) is only used for file uploads, which we don't take. Fixing those for good means Nest 11 and zod 4: after the contest.
33. **Done: the setup ran on Datacloud too** (5 Nov, Docker's disk 21 GB there). Moving Docker onto XFS needs a kernel with XFS and loop mounts. Since 3 Nov `deploy/setup.sh` checks these first and stops before changing anything, one sentence per missing piece: root, systemd, a real VM (not a container), apt, ufw, OpenSSH, XFS, a loop device, and at least 20 GB for Docker's disk. It passed on both servers.

### Stronger walls

34. **Rooms share one kernel** (medium). A kernel bug could let one room reach the others. Root and seven rights inside a room mean more to attack than the old nobody with none, though root there is an ordinary user on the machine. To do: try gVisor, or separate small servers for strangers.
35. **Mining and heavy use** (medium). CPU is capped per room, but several rooms can still slow a server down, and mining may break the host's terms. To do: watch for rooms running flat out.
36. **Docker Hub limits** (low). Anonymous image pulls are limited per server address, so many pulls could fail with a confusing message. To do: log in to Docker Hub or use a mirror.

### Small gaps

37. **Who did what** (low). Logins are logged with the person and the room, but not their address, and shell contents aren't logged on purpose. After an abuse report you'd know who logged in, not what they ran. Decide whether that's enough.
38. **A room can't see its disk use** (low). `df` on `/home/your-room` shows the whole pool rather than 1 GB, though the limit holds. The room page's Inside tab shows the real use of that folder, not of the rest of the disk.
39. **A lease that ends while the server is off** (low). If the containers are already gone too, the old files stay on disk until someone empties that room again. The next tenant can't see them, but they use space and should go. To do: report kept volumes in the caretaker's snapshot.
40. **Laptop and server now differ** (low). A laptop's rooms stay sealed and read-only, so something can pass locally and behave differently on the server, or the other way round.
41. **Small SSH gaps** (low), found while writing `docs/ssh-walkthrough.md`. The SSH door lets in rooms of an example house as long as the room itself isn't marked as an example; the room page hides SSH there (`ssh.service.ts:107` vs `rooms.service.ts:110`). Anyone holding someone's public key, which GitHub publishes, can test which rooms it opens, since the server says "sign with this" before any signature: that's how SSH works. A connection that opens a session but never a shell has no idle limit. Removing a key doesn't end a shell that's already open; the 60-second check only looks at who lives there.
