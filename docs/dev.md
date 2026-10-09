# Local development

## 1. Start everything

```bash
npm install && npm run build
npm run dev:proxy                         # Traefik (the front door) on http://*.coloc.localhost:8000
npm run start -w @coloc/api               # API + hub on http://127.0.0.1:4100
COLOC_HOUSE_ID=sacre-coeur \
COLOC_AGENT_SECRET=dev-secret-change-me \
COLOC_USAGE_INTERVAL_MS=5000 \
COLOC_ALLOW_LOCAL_REPOS=1 \
  npm run start -w @coloc/agent           # the caretaker; connects out to the API
npm run dev:web                           # http://localhost:5173
```

The API seeds one house, `sacre-coeur`, with three rooms: `jib` and `awa` (256 MB, 0.5 CPU) and `moussa` (128 MB).
`*.localhost` resolves to your machine in browsers and curl, so no DNS setup is needed.

## 2. Move into a room

From the house page, or with curl. The agent clones with git, so a local repo works via `file://`
(it must be committed; the agent clones `main`):

```bash
curl -X POST http://127.0.0.1:4100/api/houses/sacre-coeur/rooms/jib/deploy \
  -H 'Content-Type: application/json' \
  -d '{"repo":"file:///ABSOLUTE/PATH/TO/app","path":"examples/hello"}'

curl http://jib.coloc.localhost:8000
```

## 3. The isolation demo (the jury's favourite)

```bash
# Moussa moves in with an app that eats memory until its 128 MB cap kills it
curl -X POST http://127.0.0.1:4100/api/houses/sacre-coeur/rooms/moussa/deploy \
  -H 'Content-Type: application/json' \
  -d '{"repo":"file:///ABSOLUTE/PATH/TO/app","path":"examples/memory-hog"}'

# Jib's room keeps answering the whole time
while true; do curl -s -m 2 http://jib.coloc.localhost:8000 || echo DOWN; sleep 1; done
```

Moussa's container gets OOM-killed and restarted (Docker's restart policy), the fridge door says so,
and Jib's loop never prints DOWN. `scripts/isolation-demo.sh` runs this automatically.

## Production notes (not done yet)
- **Traefik has no Docker socket**, even in production: the agent writes its routes to `COLOC_PROXY_CONFIG_DIR`
  (default `/tmp/coloc-agent/proxy`, mounted read-only into Traefik by `dev/docker-compose.yml`).
- **`COLOC_ALLOW_LOCAL_REPOS=1` is for development only.** Without it the agent refuses `file://` repos, which would
  let a flatmate build an image from any folder on the house server.
- **The agent refuses to connect to a remote hub over plain `ws://`**: its first message carries the house secret.
- **userns-remap:** set in the Docker daemon by `install.sh`, so root in a room isn't root on the host.
- **Agent secret:** hashed in the database; shown once at house creation.
