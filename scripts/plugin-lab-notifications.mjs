// The application owns delivery code and database access. This scheduler client
// works with Node 22 and the standalone archive, without development dependencies.
const token = process.env.ENA_PLUGIN_LAB_WORKER_TOKEN;
try {
  if (!token || token.length < 32) throw new Error("unconfigured");
  const origin = new URL(process.env.ENA_PLUGIN_LAB_WORKER_ORIGIN || `http://127.0.0.1:${process.env.PORT || "3000"}`);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if ((!loopback && (origin.protocol !== "https:" || origin.origin !== process.env.OPEN_ENA_PUBLIC_ORIGIN)) || origin.username || origin.password) throw new Error("invalid-origin");
  const response = await fetch(new URL("/api/plugin-lab/notifications/deliver", origin), { method: "POST", headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error("delivery-request-failed");
  const result = await response.json();
  if (![result.claimed, result.sent, result.failed].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("invalid-response");
  console.log(JSON.stringify({ claimed: result.claimed, sent: result.sent, failed: result.failed }));
  if (result.failed) process.exitCode = 1;
} catch { console.error("Plugin Lab delivery run failed; check configuration and the operator inbox."); process.exitCode = 1; }
