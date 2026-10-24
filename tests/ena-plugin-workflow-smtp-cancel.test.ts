import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createSecureContext, TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { sendPluginLabVerificationEmail } from "../lib/plugin-lab/mail";

const run = promisify(execFile);
const fixtureFlag = "--owned-smtp-cancel-fixture";

// Run the real Nodemailer transport in a child so its trust store includes only
// this test's extra CA without modifying the application or the parent process.
async function runFixture(certPath: string, keyPath: string) {
  const context = createSecureContext({ cert: await readFile(certPath), key: await readFile(keyPath) });
  const sockets = new Set<Socket>();
  let recipientSocket: Socket | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let encrypted = false;
  let reachedRecipient = false;
  let dataCommands = 0;
  let completedMessages = 0;
  const server = createServer((raw) => {
    sockets.add(raw);
    raw.once("close", () => sockets.delete(raw));
    raw.on("error", () => undefined);
    function serve(socket: Socket, secured: boolean) {
      let input = "";
      let receivingData = false;
      const onData = (chunk: Buffer) => {
        input += chunk.toString("utf8");
        for (;;) {
          if (receivingData) {
            const end = input.indexOf("\r\n.\r\n");
            if (end < 0) return;
            input = input.slice(end + 5);
            completedMessages += 1;
            receivingData = false;
            socket.write("250 message accepted\r\n");
            continue;
          }
          const end = input.indexOf("\r\n");
          if (end < 0) return;
          const line = input.slice(0, end);
          input = input.slice(end + 2);
          if (line.startsWith("EHLO")) {
            socket.write(secured ? "250-localhost\r\n250 AUTH PLAIN\r\n" : "250-localhost\r\n250 STARTTLS\r\n");
          } else if (line === "STARTTLS" && !secured) {
            socket.removeListener("data", onData);
            socket.write("220 begin TLS\r\n");
            const tls = new TLSSocket(socket, { isServer: true, secureContext: context });
            sockets.add(tls);
            tls.once("close", () => sockets.delete(tls));
            tls.on("error", () => undefined);
            serve(tls, true);
            return;
          } else if (line.startsWith("AUTH PLAIN")) {
            encrypted = secured;
            socket.write("235 authentication accepted\r\n");
          } else if (line.startsWith("MAIL FROM")) {
            socket.write("250 sender accepted\r\n");
          } else if (line.startsWith("RCPT TO")) {
            reachedRecipient = true;
            recipientSocket = socket;
            // An unfinished multiline reply keeps the connection active. This
            // defeats an inactivity-only timeout without accepting the message.
            socket.write("250-still evaluating recipient\r\n");
            keepalive = setInterval(() => {
              if (!socket.destroyed) socket.write("250-still evaluating recipient\r\n");
            }, 100);
          } else if (line === "DATA") {
            dataCommands += 1;
            receivingData = true;
            socket.write("354 send message\r\n");
          } else if (line === "QUIT") {
            socket.end("221 goodbye\r\n");
          } else {
            socket.write("500 unexpected command\r\n");
          }
        }
      };
      socket.on("data", onData);
    }
    serve(raw, false);
    raw.write("220 localhost synthetic SMTP fixture\r\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const startedAt = Date.now();
  let error = "";
  try {
    try {
      await sendPluginLabVerificationEmail({ email: "reader@example.org", code: "012345", locale: "en" }, {
        ENA_PLUGIN_LAB_SMTP_HOST: "127.0.0.1", ENA_PLUGIN_LAB_SMTP_PORT: String(port),
        ENA_PLUGIN_LAB_SMTP_USER: "synthetic", ENA_PLUGIN_LAB_SMTP_PASSWORD: "synthetic",
        ENA_PLUGIN_LAB_MAIL_FROM: "sender@example.org", ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org",
        OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
      });
    } catch (caught) { error = caught instanceof Error ? caught.message : "unknown"; }
    const elapsed = Date.now() - startedAt;
    if (keepalive) clearInterval(keepalive);
    // Permit close propagation, then try to resume SMTP. A rejected promise
    // alone would leave this socket open and deliver the email after timeout.
    await delay(100);
    const activeSocketClosed = recipientSocket?.destroyed === true;
    if (recipientSocket && !recipientSocket.destroyed) recipientSocket.write("250 recipient accepted\r\n");
    await delay(150);
    return { error, elapsed, encrypted, reachedRecipient, activeSocketClosed, dataCommands, completedMessages };
  } finally {
    if (keepalive) clearInterval(keepalive);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (process.argv[2] === fixtureFlag) {
  console.log(JSON.stringify(await runFixture(process.argv[3], process.argv[4])));
} else {
  test("the absolute SMTP deadline closes an active TLS socket and prevents late delivery", { timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "ena-plugin-smtp-cancel-test-"));
    const cert = join(directory, "localhost-cert.pem");
    const key = join(directory, "localhost-key.pem");
    try {
      await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert,
        "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { timeout: 5_000 });
      const { stdout } = await run(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), fixtureFlag, cert, key], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, timeout: 22_000,
      });
      const result = JSON.parse(stdout.trim());
      assert.equal(result.encrypted, true, "authentication happened after real STARTTLS");
      assert.equal(result.reachedRecipient, true, "the fixture stalled an active SMTP exchange");
      assert.match(result.error, /timed out/u);
      assert.ok(result.elapsed >= 14_500 && result.elapsed < 19_000, "the real absolute deadline bounds SMTP activity");
      assert.equal(result.activeSocketClosed, true, "timeout must close the socket, not only reject the promise");
      assert.equal(result.dataCommands, 0, "no message body may start after the deadline");
      assert.equal(result.completedMessages, 0, "resuming SMTP must not cause a late delivery");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
