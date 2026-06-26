// QVAC Health Check — validates all services are running and healthy.
// Usage: node scripts/health.js [--watch]
// Returns structured JSON with per-check status. Exit code 0 = all healthy.

const http = require("http");

const CHECKS = [
  { name: "QVAC API", url: "http://localhost:11435/v1/models", expectJson: true },
  { name: "Model Router", url: "http://localhost:3001/health", expectJson: true },
  { name: "Dashboard", url: "http://localhost:3000/api/health", expectJson: true },
];

async function checkHealth({ name, url, expectJson }) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { name, status: "FAIL", detail: `HTTP ${res.status}` };

    if (expectJson) {
      const body = await res.json();
      return { name, status: "PASS", detail: body };
    }
    return { name, status: "PASS", detail: "ok" };
  } catch (err) {
    return { name, status: "FAIL", detail: err.message };
  }
}

async function run() {
  const results = await Promise.all(CHECKS.map(checkHealth));
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const hasModels = results.find(r => r.name === "QVAC API")?.detail?.data?.length > 0;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: `${passed} passed, ${failed} failed`,
    all_ok: failed === 0 && hasModels,
    checks: results,
    has_models: hasModels,
  }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
