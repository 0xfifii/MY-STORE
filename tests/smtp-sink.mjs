// Local SMTP server used only by the test suite to verify real email delivery.
// Usage: node tests/smtp-sink.mjs <port> <output-dir>
import { SMTPServer } from "smtp-server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 2525);
const dir = process.argv[3] ?? "./tmp-mail";
mkdirSync(dir, { recursive: true });
let n = 0;

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, cb) {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => {
      writeFileSync(join(dir, `mail-${Date.now()}-${++n}.eml`), Buffer.concat(chunks));
      cb();
    });
  },
});
server.listen(port, "127.0.0.1", () => console.log(`SMTP sink on ${port} -> ${dir}`));
