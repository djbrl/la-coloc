// The flatmate from hell: serves requests while eating memory until the room's cap kills it.
// Used to prove that one room running out of memory doesn't touch the others.
const http = require("node:http");

const port = Number(process.env.PORT || 3000);
const hoard = [];
http.createServer((req, res) => res.end(`hoarding ${hoard.length * 10} MB\n`)).listen(port, () => {
  console.log(`memory-hog listening on ${port}, starts eating in 8s`);
  // Waits long enough to pass the deploy health check, then misbehaves.
  setTimeout(() => {
    setInterval(() => hoard.push(Buffer.alloc(10 * 1024 * 1024, 1)), 200);
  }, 8000);
});
