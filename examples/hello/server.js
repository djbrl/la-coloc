// A tiny app to move into a room.
const http = require("node:http");
const os = require("node:os");

const port = Number(process.env.PORT || 3000);
http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ hello: "from my room", container: os.hostname(), at: new Date().toISOString() }));
  })
  .listen(port, () => console.log(`hello listening on ${port}`));
