# What's left for Jib

Written 2 Nov 2026, dates updated 3 Nov. Only things Jib has to do or decide: payments, sign-ins, declarations, and anything that needs a person.

## Could end the entry

The rules changed. `docs/contest-rules.md` is the copy of 3 Nov, with what changed at the top. **Submissions close on Sun 15 Nov at 17:00 GMT.** The peer vote runs from 15 Nov at 18:00 to 16 Nov at 23:59, the public vote on 17–20 Nov, the jury on 21–22 Nov, and results on 23 Nov.

1. **Vote in the peer vote, 15 Nov 18:00 to 16 Nov 23:59.** Every member must vote, or the team is out.
2. **Get solo entries confirmed in writing.** The new rules still say teams of 2 to 5 (Art. 4). If the organiser said otherwise, ask them for an email, or keep a teammate on the team.

## Needed to submit

3. **Deploy on Datacloud with at least one product bought there** (Art. 6). Without that, the entry isn't admissible. The 40% promo code applies until submissions close, but not to a VPS outside Dakar (Art. 8). `deploy/` should work on any fresh Ubuntu 24.04 server, but it has only run on the DigitalOcean rehearsal. I can do the deploy once there's a server and SSH access.
4. **Make the AI declaration at submission** (tools used, parts concerned). `docs/ai-usage.md` has the content.
5. **Make the ownership declaration at submission:** the project was made outside any job, client or school work.
6. **Check `docs/licences.md` still holds when you submit.** `npm run licences:check` passed today.
7. **Be ready to explain the code to the jury.** "Mastery of the delivered solution, including parts made with AI" is part of the technical grade. Start with `docs/architecture.md`. Nobody but me has read the SSH code yet.

## Needed for a good entry

8. **Record the demo video** (about 3 minutes, French with English subtitles).
9. **Have a native speaker read the French.**
10. **Get real people into real rooms.** Today Jib's is the only real account, and it has no house. The demo restart most likely cleared it.

## Code and GitHub

11. **What's live is on GitHub.** `paydunya` holds everything on the droplet: `house-room-ui` plus buying credit with PayDunya. `landing-polish` is on GitHub too, but behind.
12. **Merge `paydunya` into `main`** after that.
13. **Decide whether the repo goes public.** `Djbrl/la-coloc` is still private. Your teammate said on 15 Oct they'd do it.

## Try on the live site

14. **SSH with your own key.** It's the one step I couldn't test, because it needs your account: rent a room, put a project online, open the room's SSH tab (your GitHub key is added by itself), copy the line, and run it.
15. **The rest with your real account:** GitHub import in a room, GitHub links on people, Try again on your portfolio page, and the two missions still unticked.
16. **Rebuild `42dsy/bount-dev`.** `latest` is arm64 only, so it can't run on this amd64 server. `refonte` now starts, since the disk is writable, but `nuxt dev` only listens on localhost and used 245 of 256 MB, so visitors get a 503. It needs a production build for amd64 that listens on 0.0.0.0, starting with `node .output/server/index.mjs`.

## Decide

17. **A room that fails without exiting still says "live".** La Coloc only checks that the container stays up for 5 seconds, and your `refonte` image does exactly this: "live" with a 503 for visitors. I left a suggested task for this. It matters if a juror's project does the same, so I'd do it soon.
18. **Is port 2222 fine open to everyone for the demo?** It only accepts registered keys. To close it: `ufw delete allow 2222/tcp`.
19. **Turn off the demo restart before the jury?** It's on (`COLOC_DEMO_RESET=1`), and it most likely cleared your room.
20. **Uptime alarm during the vote and jury?** Nothing tells you if the site goes down.

## When the rehearsal ends

21. **Delete the droplet `la-coloc-rehearsal`.** It costs $24 a month until deleted.
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

30. **The database shares a disk with everything else** (high). Rooms are limited, but images and build cache aren't, and the database lives on the same 59 GB disk. If it fills, the database stops and the whole city with it. To do: an alarm at 80%, regular image and build-cache cleanup, and the database on its own disk.
31. **No backups** (high). The database and everyone's `/home/your-room` are in one file on one server. To do: a nightly database dump off the server, and tell people `/home/your-room` isn't backed up.
32. **Dependencies with known holes** (high, unchecked). `npm audit --omit=dev` lists 13 today, 5 high, in `@nestjs/core`, `body-parser`, `multer`, `uuid` and `zod`. I haven't checked whether they can be exploited here. To do: go through them before the public vote.
33. **The setup has only run on DigitalOcean** (medium). Moving Docker onto XFS needs a kernel with XFS and loop mounts. Check it on Datacloud early, since that deployment is mandatory.

### Stronger walls

34. **Rooms share one kernel** (medium). A kernel bug could let one room reach the others. Root and seven rights inside a room mean more to attack than the old nobody with none, though root there is an ordinary user on the machine. To do: try gVisor, or separate small servers for strangers.
35. **Mining and heavy use** (medium). CPU is capped per room, but several rooms can still slow a server down, and mining may break the host's terms. To do: watch for rooms running flat out.
36. **Docker Hub limits** (low). Anonymous image pulls are limited per server address, so many pulls could fail with a confusing message. To do: log in to Docker Hub or use a mirror.

### Small gaps

37. **Who did what** (low). Logins are logged with the person and the room, but not their address, and shell contents aren't logged on purpose. After an abuse report you'd know who logged in, not what they ran. Decide whether that's enough.
38. **A room can't see its disk use** (low). `df` on `/home/your-room` shows the whole pool rather than 1 GB, though the limit holds. The room page's Inside tab shows the real use of that folder, not of the rest of the disk.
39. **A lease that ends while the server is off** (low). If the containers are already gone too, the old files stay on disk until someone empties that room again. The next tenant can't see them, but they use space and should go. To do: report kept volumes in the caretaker's snapshot.
40. **Laptop and server now differ** (low). A laptop's rooms stay sealed and read-only, so something can pass locally and behave differently on the server, or the other way round.

