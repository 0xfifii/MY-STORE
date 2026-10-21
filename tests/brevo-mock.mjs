// Fake Brevo API used only by the test suite. Records each sent email as JSON in <dir>.
// Usage: node tests/brevo-mock.mjs <port> <dir>
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const port = Number(process.argv[2] ?? 2527);
const dir = process.argv[3] ?? "./tmp-brevo";
mkdirSync(dir, { recursive: true });
let n = 0;
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const key = req.headers["api-key"];
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (key !== "xkeysib-test-good") return send(401, { code: "unauthorized", message: "Key not found" });
    if (req.url === "/v3/account") return send(200, { email: "owner@velvet.test" });
    if (req.url === "/v3/senders") return send(200, { senders: [{ email: "store@velvet.test", active: true }] });
    if (req.url === "/v3/smtp/email" && req.method === "POST") {
      const m = JSON.parse(body);
      if (m.sender?.email !== "store@velvet.test") return send(400, { code: "invalid_parameter", message: "Sender is not valid" });
      writeFileSync(join(dir, `brevo-${Date.now()}-${++n}.json`), body);
      return send(201, { messageId: `<mock-${n}@brevo>` });
    }
    send(404, { message: "not found" });
  });
}).listen(port, "127.0.0.1", () => console.log(`Brevo mock on ${port} -> ${dir}`));
