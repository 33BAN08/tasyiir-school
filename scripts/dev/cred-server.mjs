// Local-only helper for browser tests. Serves the TEST_* fixture credentials
// from .env.local to a script running on the app's origin, so passwords are
// never typed, printed or committed. Binds to 127.0.0.1 only.
//   node --env-file=.env.local scripts/dev/cred-server.mjs [origin]
// In the page: fetch("http://127.0.0.1:4599/?u=TEST_DIRECTOR_B")
import { createServer } from "node:http";

const ORIGIN = process.argv[2] ?? "http://localhost:3000";
const ALLOWED = new Set(["TEST_DIRECTOR", "TEST_DIRECTOR_B", "TEST_STAFF_B"]);

createServer((req, res) => {
  const who = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("u") ?? "";
  if (req.headers.origin !== ORIGIN || !ALLOWED.has(who) || !process.env[`${who}_PASSWORD`]) {
    res.writeHead(403).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": ORIGIN });
  res.end(JSON.stringify({ email: process.env[`${who}_EMAIL`], password: process.env[`${who}_PASSWORD`] }));
}).listen(4599, "127.0.0.1", () => console.log(`credential helper for ${ORIGIN} on 127.0.0.1:4599`));
