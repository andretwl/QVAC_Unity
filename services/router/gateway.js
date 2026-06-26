// QVAC Unified Model Router — Gateway on port 3001
// Proxies OpenAI-compatible requests to QVAC's llama.cpp backend.
// Run: node router/gateway.js
//
// This is a simplified single-backend proxy. Models are auto-discovered
// from QVAC (:11435) and enriched with config-defined aliases.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "router.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const PORT = config.port;

// The only active backend
const QVAC = config.backends.qvac;

// ─── Backend Client ───────────────────────────────────────

async function fetchBackend(endpoint, options = {}) {
  const url = `${QVAC.baseUrl}${endpoint}`;
  const { method = "GET", body, headers = {}, timeout = config.compatibility.timeoutMs } = options;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (options.raw) return res;

    const text = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch { return { ok: res.ok, status: res.status, data: text }; }
  } catch (err) {
    clearTimeout(tid);
    if (err.name === "AbortError") throw new Error(`Timeout after ${timeout}ms`);
    throw err;
  }
}

// ─── Model Discovery ──────────────────────────────────────

let discoveredModels = [];
let routerModelMap = {};
let backendModels = {};

async function discoverModels() {
  let models = [];
  try {
    const res = await fetchBackend(QVAC.listEndpoint);
    if (res.ok) {
      models = (res.data.data || []).map(m => m.id);
    }
  } catch { models = []; }

  // Apply manual routing aliases (always visible)
  const aliasModels = Object.keys(config.modelRouting);
  const all = [...new Set([...aliasModels, ...models])];

  discoveredModels = all;
  routerModelMap = Object.fromEntries(all.map(m => [m, "qvac"]));
  backendModels = { qvac: models };

  return { all, byBackend: { qvac: models }, map: routerModelMap };
}

// ─── Request Helpers ──────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─── Stats ────────────────────────────────────────────────

const stats = {
  totalRequests: 0,
  byBackend: { qvac: 0 },
  byModel: {},
  errors: 0,
  startedAt: Date.now(),
};

// ─── HTTP Server ──────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    // ── Health ───────────────────────────────────────
    if (pathname === "/health" || pathname === "/v1/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        uptime: Math.floor((Date.now() - stats.startedAt) / 1000),
        backends: { qvac: backendModels.qvac || [] },
        stats: {
          totalRequests: stats.totalRequests,
          byBackend: stats.byBackend,
          errors: stats.errors,
        },
      }));
      return;
    }

    // ── Discovery (force refresh) ────────────────────
    if (pathname === "/v1/discover") {
      const result = await discoverModels();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    // ── List Models ─────────────────────────────────
    if (pathname === "/v1/models" && method === "GET") {
      const data = discoveredModels.map((name, i) => ({
        id: name,
        object: "model",
        created: Math.floor(Date.now() / 1000) - i * 100,
        owned_by: "qvac",
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data }));
      return;
    }

    // ── Chat Completions ────────────────────────────
    if (pathname === "/v1/chat/completions" && method === "POST") {
      stats.totalRequests++;
      const body = JSON.parse(await readBody(req));
      const model = body.model || config.defaultBackend;
      const stream = body.stream !== false;

      stats.byBackend.qvac++;
      stats.byModel[model] = (stats.byModel[model] || 0) + 1;

      const targetUrl = `${QVAC.baseUrl}${QVAC.apiPrefix}/chat/completions`;

      if (stream) {
        const backendRes = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!backendRes.ok) {
          const errText = await backendRes.text();
          res.writeHead(backendRes.status, { "Content-Type": "application/json" });
          res.end(errText);
          return;
        }

        // Stream passthrough
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        for await (const chunk of backendRes.body) {
          res.write(chunk);
        }
        res.end();
      } else {
        const result = await fetchBackend(`${QVAC.apiPrefix}/chat/completions`, {
          method: "POST",
          body,
        });
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.data));
      }
      return;
    }

    // ── Embeddings ──────────────────────────────────
    if (pathname === "/v1/embeddings" && method === "POST") {
      stats.totalRequests++;
      const body = JSON.parse(await readBody(req));
      const result = await fetchBackend(QVAC.embedEndpoint, {
        method: "POST",
        body,
      });
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.data));
      return;
    }

    // ── Generic proxy for any other /v1/* endpoint ──
    if (pathname.startsWith("/v1/")) {
      const targetUrl = `${QVAC.baseUrl}${QVAC.apiPrefix}${pathname.replace("/v1", "")}${url.search}`;
      const body = ["POST", "PUT", "PATCH"].includes(method) ? await readBody(req) : undefined;
      const backendRes = await fetch(targetUrl, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body,
      });
      res.writeHead(backendRes.status, { "Content-Type": backendRes.headers.get("content-type") || "application/json" });
      const text = await backendRes.text();
      res.end(text);
      return;
    }

    // ── Stats ───────────────────────────────────────
    if (pathname === "/v1/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ...stats,
        uptime: Math.floor((Date.now() - stats.startedAt) / 1000),
        modelMap: routerModelMap,
        discoveredModels,
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found", path: pathname }));

  } catch (err) {
    stats.errors++;
    console.error("Gateway error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// ─── Startup ──────────────────────────────────────────────

async function startup() {
  console.log(`
╔══════════════════════════════════════════╗
║   QVAC Model Router                      ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   Backend: QVAC :11435 (llama.cpp)       ║
╚══════════════════════════════════════════╝
  `);

  console.log("🔍 Discovering models...");
  const result = await discoverModels();
  console.log(`   QVAC:   ${result.byBackend.qvac.length} models`);
  console.log(`   Total:  ${result.all.length} routed models`);

  // Periodic discovery every 60s
  setInterval(async () => {
    try { await discoverModels(); } catch {}
  }, 60000);

  server.listen(PORT);
}

startup().catch(console.error);
