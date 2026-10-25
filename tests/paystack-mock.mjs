// Stand-in for the Paystack API during tests: initialize returns a fake checkout URL, verify reports the
// payment as successful (or failed, for references marked via POST /test/fail/<reference>).
import { createServer } from "node:http";
const port = Number(process.argv[2] ?? 2528);
const payments = new Map();
const failed = new Set();
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (!/^Bearer sk_(test|live)_/.test(req.headers.authorization ?? "") && !req.url.startsWith("/test/")) return send(401, { status: false, message: "Invalid key" });
    if (req.method === "POST" && req.url === "/transaction/initialize") {
      const b = JSON.parse(body || "{}");
      payments.set(b.reference, b);
      return send(200, { status: true, data: { authorization_url: `http://127.0.0.1:${port}/pay/${b.reference}`, reference: b.reference } });
    }
    const v = req.url.match(/^\/transaction\/verify\/(.+)$/);
    if (req.method === "GET" && v) {
      const ref = decodeURIComponent(v[1]);
      const p = payments.get(ref);
      if (!p) return send(404, { status: false, message: "Transaction reference not found" });
      return send(200, { status: true, data: { status: failed.has(ref) ? "failed" : "success", amount: p.amount, currency: "NGN", reference: ref } });
    }
    const f = req.url.match(/^\/test\/fail\/(.+)$/);
    if (req.method === "POST" && f) { failed.add(decodeURIComponent(f[1])); return send(200, { ok: true }); }
    send(404, { status: false, message: "not found" });
  });
}).listen(port, "127.0.0.1", () => console.log(`paystack mock on ${port}`));
