// QVAC Dashboard Server
// Serves the web UI on port 3000 + provides health/VRAM endpoint
// Run: node frontend/server.js

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PORT = 3000;
const QVAC_API = "http://localhost:11435/v1";
const FRONTEND_DIR = new URL(".", import.meta.url).pathname;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// ─── Helpers ─────────────────────────────────────────────

function getVRAM() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu,utilization.memory --format=csv,noheader,nounits',
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const [total, used, free, temp, gpuUtil, memUtil] = out.split(", ").map(Number);
    const percent = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
    return { total, used, free, temp: temp || 0, percent: Number(percent), gpuUtil, memUtil };
  } catch {
    return { total: 0, used: 0, free: 0, temp: 0, percent: 0, gpuUtil: 0, memUtil: 0, error: "nvidia-smi not available" };
  }
}

async function pingServer(url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res.ok ? "up" : "error";
  } catch {
    return "down";
  }
}

// Collect request body
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// Proxy a request to a backend with optional streaming passthrough
async function proxy(req, res, targetUrl, method = null) {
  const m = method || req.method;
  try {
    const body = ["POST", "PUT", "PATCH"].includes(m) ? await readBody(req) : undefined;
    const headers = { "Content-Type": "application/json" };
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    const backendRes = await fetch(targetUrl, {
      method: m,
      headers,
      body,
    });

    const contentType = backendRes.headers.get("content-type") || "";

    // Stream SSE responses (chat completions with stream=true)
    if (contentType.includes("text/event-stream")) {
      res.writeHead(backendRes.status, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      for await (const chunk of backendRes.body) {
        res.write(chunk);
      }
      res.end();
      return;
    }

    // JSON or other
    const text = await backendRes.text();
    res.writeHead(backendRes.status, {
      "Content-Type": contentType || "application/json",
    });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─── HTTP Server ─────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS for everything
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ── API: Provider Identity (P2P sync key for iOS) ──
    if (pathname === "/api/provider-identity") {
      const providerPath = path.resolve(FRONTEND_DIR, "..", ".qvac-provider-identity.json");
      try {
        const data = JSON.parse(fs.readFileSync(providerPath, "utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Provider not running. Start with: QVAC_HYPERSWARM_SEED=<seed> node monitoring/qvac-provider.js" }));
      }
      return;
    }

    // ── API: Health + VRAM ────────────────────────────
    if (pathname === "/api/health") {
      const [qvac, router] = await Promise.all([
        pingServer(`${QVAC_API}/models`),
        pingServer(`http://localhost:3001/health`),
      ]);
      const vram = getVRAM();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ servers: { qvac, router }, vram, timestamp: Date.now() }));
      return;
    }

    // ── API: Proxy to Model Router ──────────────────────
    if (pathname.startsWith("/api/router/")) {
      const rPath = pathname.replace("/api/router", "");
      return proxy(req, res, `http://localhost:3001${rPath}${url.search}`);
    }

    // ── API: Proxy to QVAC ────────────────────────────
    if (pathname.startsWith("/api/qvac/")) {
      const qvacPath = pathname.replace("/api/qvac", "");
      return proxy(req, res, `${QVAC_API}${qvacPath}${url.search}`);
    }

    // ── Serve static files ────────────────────────────
    let filePath = path.join(FRONTEND_DIR, pathname === "/" ? "index.html" : pathname);
    const ext = path.extname(filePath);

    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    } catch {}

    // Fallback to index.html
    filePath = path.join(FRONTEND_DIR, "index.html");
    try {
      const content = fs.readFileSync(filePath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  } catch (err) {
    console.error("Server error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗\n║   QVAC Dashboard Server                  ║\n║   http://localhost:${PORT}                  ║\n║                                          ║\n║   Proxies to:                           ║\n║     QVAC  :11435  /api/qvac/*           ║\n║     Router :3001   /api/router/*         ║\n╚══════════════════════════════════════════╝\n  `);
});
