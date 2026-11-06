# SSH into a room, end to end

*Written 3 Nov 2026 against the code on `house-room-ui`. A study guide for the jury. If it disagrees with the code, the code is right.*

## 1. The story

Awa types `ssh -p 2222 djbrl.sacre-coeur@<host>`. Port 2222 isn't the machine's own SSH: it's our API, speaking SSH through the `ssh2` library. The API reads the name as room `djbrl` in house `sacre-coeur`, looks up who may enter that room (only the person who lives in it), and checks that Awa's key is one of theirs and that she really holds it. Then it asks the house's caretaker, over the WebSocket the caretaker already keeps open, to open a shell. The caretaker runs `docker exec` in the room's running container, so Awa lands inside the project with its user, disk, network and limits, never on the server. Keystrokes go one way, output comes back in small pieces, paced so a fast command can't flood a slow connection. When she leaves, the caretaker hangs up on what she started.

## 2. The hops

```
 laptop: ssh -p 2222 room.house@host
   │  SSH (encrypted), public key only
   ▼
 port 2222 (ufw allows it; deploy/setup.sh)
   ▼
 API · SshGateway (ssh.gateway.ts) ── who may enter? ── SshService ── Postgres (rooms, ssh_keys)
   │  Shell object
   ▼
 API · ShellBroker (agents/shell.broker.ts) ── AgentRegistry.send
   │  WebSocket /agent, JSON: shell_open / shell_input / shell_eof / shell_resize / shell_ack / shell_close
   ▼
 caretaker (apps/agent/src/index.ts → shell.ts, class Shells)
   │  Docker API: exec in the room's running "prod" container
   ▼
 /bin/sh -c ... → bash, or sh, or the one command
   │
   └─ back: shell_output (base64, ≤48 KB a message) and shell_exit (exit code or reason)
      caretaker → API broker → gateway → channel.write → laptop; gateway acks once SSH took the bytes
```

## 3. File by file, in the order a connection passes

**`deploy/setup.sh`** opens 2222 (`:24-25`; the server's own sshd stays on 22, keys only, `:27`), makes an ed25519 host key once in `/etc/coloc` (`:116-118`) and writes `COLOC_SSH_PORT`, `COLOC_SSH_HOST`, `COLOC_SSH_HOST_KEY_FILE` (`:138-140`).

**`apps/api/src/ssh/ssh.gateway.ts`** is the door. `onModuleInit` (`:45-50`) starts it only if port and key file are set; `listen` (`:53-63`). `welcome` (`:69-112`) drops over-limit connections (`:71`), gives 20 s to log in (`:77`), and closes a login with no session after 2 min (`:100`). `check` (`:118-130`) does the key test. `session` (`:132-153`) takes `pty`, `window-change`, `shell`, `exec` and refuses `subsystem` (sftp). `run` (`:155-229`) opens the shell, enforces 4 per person / 40 per server (`:173`), the 30 min idle timer (`:177-185`), acks output (`:192`), turns reasons into messages (`:194-203`) and re-checks access every 60 s (`:207-217`).

**`apps/api/src/ssh/ssh.service.ts`** decides who. `parseLogin` (`:37-42`) splits `room.house`. `occupant` (`:102-108`): the person who lives in the room, and nobody else; nobody for an empty or example (`demo`) room. `keysFor` (`:111-115`) returns their keys; `mayStay` (`:118-120`) is the 60 s re-check. Also key management: `parsePublicKey` (`:27-34`), `add` (`:59-66`, refuses private keys), `importGithub` (`:69-81`), 10 keys a person (`:86`).

**`ssh.controller.ts`** is `/api/me/ssh-keys`: list (`:25-28`), add (`:31-36`), GitHub import for real GitHub accounts only (`:39-44`), delete (`:47-51`). **`ssh.module.ts`** wires them.

**`apps/api/src/agents/shell.broker.ts`** is the middle. `open` (`:35-64`) gives the shell a random UUID, sends `shell_open`, and returns a `Shell` with `input` (cut into 48 KB slices, `:51-55`), `eof`, `resize`, `ack`, `close`. `output`/`exit` (`:80-87`) only accept messages from the house the shell belongs to. `houseGone` (`:90-92`) ends every shell of a house whose line dropped. `inRoom` (`:67-70`) is who's in, in memory.

**`apps/api/src/agents/agent.registry.ts`** `send` (`:29-33`) throws when the caretaker is offline: the gateway says "The house's server is offline." **`agents.gateway.ts`** checks the caretaker's secret on `hello` (`:98-113`), routes `shell_output`/`shell_exit` to the broker (`:117-122`) and calls `houseGone` when the line closes (`:76-85`). The messages are zod schemas in `packages/protocol/src/index.ts:101-122,227-231`.

**`apps/agent/src/link.ts`** is the caretaker's outgoing WebSocket; it drops `shell_output`/`shell_exit` while offline instead of queuing them (`:62`). **`apps/agent/src/index.ts`** passes the six shell commands to `Shells` (`:43-61`), closes every shell when a new line opens (`:126-129`) and calls `sweep` at start (`:131-132`).

**`apps/agent/src/shell.ts`** opens the shell. `start` (`:53-89`) finds the running prod container, `exec`s `shellCommand` (`:19-22`) with `HOME` set to the room's kept folder and the terminal size. The command first writes its process number to `/tmp/.coloc-shell-<id>` (`pidFile`, `:23`). Input sent before the shell is ready waits (`when`, `:104-108`). `relay` (`:158-194`) sends output in 48 KB base64 pieces, pauses at 1 MB unacknowledged (`:172`); `ack` (`:110-115`) resumes below 256 KB. `close` (`:123-131`) and `finish` (`:196-209`) run `stopCommand`, a `kill -HUP` on that process group (`:25-31`). `sweep` (`:139-147`) does it for every leftover shell after a crash.

**Web.** `rooms.service.ts:101-106` puts `ssh: { host, port, user }` in the room page for its occupant only, never the chef, another flatmate, or an example room or house; `rooms.controller.ts:99-104` adds who's in. `room.ts:71` `sshLine` builds the command. `RoomOverview.vue:157-169` is the tile with faces; `RoomSsh.vue` is the tab: the line, Copy, your keys, paste, "Use my GitHub keys", and a GitHub import the first time it opens (`:77-84`).

## 4. Security decisions, and why

- **Public keys only.** `check` refuses every other method (`ssh.gateway.ts:119`). A key matches first (`:124`), then its signature is verified (`:127-128`), so the person must hold the private key.
- **Who may enter.** The occupant only (`ssh.service.ts:102-108`). Nobody else gets the address from La Coloc either: if someone else should have it, the occupant gives it to them. The chef can restart a flatmate's project but has no business in its files. Example rooms open to nobody. Re-checked every 60 s, so someone who moved out is out within a minute.
- **Identical refusals.** Unknown room, wrong key, bad name, password: all `ctx.reject(["publickey"])` (`:89`, `:93`), so `Permission denied (publickey)` looks the same.
- **No real server login.** A person only ever gets a `docker exec` inside the room; the machine's own sshd on 22 is separate.
- **Backpressure.** Each output piece is acked only when the SSH channel has taken it (`ssh.gateway.ts:192`). The caretaker pauses Docker's stream at 1 MB unacked and resumes below 256 KB. A slow laptop slows the command; nothing piles up in the API.
- **Caps.** 200 connections, 30 new a minute per address, 20 s to log in, 2 min without a session, 30 min idle, 4 shells a person, 40 a server (`ssh.gateway.ts:12-22`). Input that the command doesn't read past 16 MB closes the shell (`shell.ts:94`).
- **No forwarding, no sftp.** `subsystem` is rejected (`:152`); ssh2 refuses requests nobody handles.

**Not protected:**
- Someone holding only your *public* key (GitHub publishes it) can learn whether it opens `room.house`: the server says "you may sign with this" before any signature (`ssh.gateway.ts:126`). Response times also differ a little between an unknown room and a known one.
- Removing a key stops new logins, not an open session: the 60 s check is about the person, not the key.
- Input isn't paced end to end, only capped at 16 MB on the caretaker.
- A shell sees what the project sees, including its environment variables (`room-spec.ts:120`).
- Limits and who's in live in one API process's memory; a restart forgets them.
- The host key file has no passphrase; anyone with root or the `coloc` group can read it.

## 5. Questions a jury might ask

1. **Why not a real sshd in each container?** Rooms run any image; `docker exec` only needs `/bin/sh`. No port per room, keys in one database, access checked live.
2. **Why 2222?** 22 is the machine's own SSH for admins. Two programs can't share a port.
3. **Two people at once?** Each gets their own `docker exec` and shell id, in the same container and files. Both show on the Overview tile.
4. **What happens on a restart?** API restart: every SSH connection drops; the caretaker reconnects and hangs up the old shells. Caretaker restart: the API tells the person "The line to the house's server dropped.", and the new caretaker sweeps leftover shells.
5. **And a redeploy?** The shell lives in the old container; when it goes, the stream ends and the session closes.
6. **How is the host key kept?** Made once by `setup.sh` in `/etc/coloc`, mode 640, owner root, group coloc, never regenerated, so `known_hosts` never warns. Not in git.
7. **Can a room reach another room?** No: each room has its own Docker network (`architecture.md`, "A room has its own network"). A shell is inside that network.
8. **What if a key is stolen?** The thief gets the rooms that person may enter, inside the containers only. Delete the key in the SSH tab; an open session lasts until it idles 30 min or they leave.
9. **What does `nohup` do here?** Leaving sends HUP to the shell's group; `nohup` and `tmux` ignore it and run until the next deploy.
10. **Where do keys come from?** Pasted, or `github.com/<login>.keys`, fetched automatically once (`users.ssh_keys_chosen`), so a removed key stays removed.
11. **Is anything logged?** Who came in to which room (`ssh.gateway.ts:97`) and that a shell opened (`apps/agent/src/index.ts:44`). The bytes aren't kept (`shell.ts:1-3`).
12. **Is it encrypted all the way?** SSH ends at the API. API to caretaker is the WebSocket; on our server both are on the same machine (`ws://127.0.0.1:4100`).
13. **One command?** `ssh ... ls` becomes an `exec`; the exit code comes back.
14. **Can a caretaker hijack another house's shell?** No: the broker checks the house on every output and exit message.

## 6. Two-minute demo

1. (20 s) A live room I live in, SSH tab: "one line, and my keys, from my GitHub."
2. (20 s) Copy, paste in a terminal. "The API checks my key against this room's people." Show `whoami`, `pwd`, `ls project`.
3. (20 s) Back in the browser, the Overview tile shows my face: "it knows who's in."
4. (20 s) `ssh -p 2222 nope.sacre-coeur@<host>`: `Permission denied (publickey)`. "Same answer for a room that doesn't exist and a key that's wrong."
5. (20 s) `sftp -P 2222 <room>.<house>@<host>`: refused. "Shell only."
6. (20 s) `seq 1 10000000` then Ctrl-C. "Output is paced: the caretaker pauses above 1 MB." `exit`: "what I started stops, unless `nohup`."

## Doc mismatches

- `architecture.md` says example rooms have no way in; the page also hides SSH in example *houses* (`rooms.service.ts:110`), but the door only checks `room.demo` (`ssh.service.ts:107`), not `house.demo`.
- "Every refusal reads the same, so nobody can use it to find out which rooms exist": true for refusals, but the "you may sign" answer (`ssh.gateway.ts:126`) and timing can reveal it to someone holding a public key.
- "A login that opens no shell closes after 2 min": the timer stops when a *session* opens (`ssh.gateway.ts:104`), even if no shell or command is ever asked for. Such a session then has no idle limit.
- `agents/shell.broker.ts` is at `apps/api/src/agents/shell.broker.ts`.
