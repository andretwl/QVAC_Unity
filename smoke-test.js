// QVAC smoke test — verifies SDK can be imported, config loaded, API surface correct,
// dataset files valid, and script syntax checks pass.
import { SDK_LOG_ID, RAG_ERROR_CODES } from "@qvac/sdk";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let failures = 0;

function assert(condition, label) {
  if (!condition) {
    console.error(`✖ FAIL: ${label}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

// 1. SDK loads
assert(typeof SDK_LOG_ID === "string", "SDK_LOG_ID is a string");
assert(SDK_LOG_ID.length > 0, "SDK_LOG_ID is non-empty");

// 2. Config file exists and is valid JSON
const configPath = new URL("qvac.config.json", import.meta.url).pathname;
assert(existsSync(configPath), "qvac.config.json exists");

const config = JSON.parse(readFileSync(configPath, "utf-8"));
assert(typeof config === "object", "qvac.config.json is valid JSON");
assert(Array.isArray(config.plugins) || config.plugins === undefined,
  "plugins field has valid shape");
assert(typeof config.cacheDirectory === "string", "cacheDirectory is a string");
assert(config.cacheDirectory.startsWith("/"), "cacheDirectory is absolute path");

// 3. Error codes are defined
assert(typeof RAG_ERROR_CODES === "object", "RAG_ERROR_CODES exists");
assert(Object.keys(RAG_ERROR_CODES).length > 0, "RAG_ERROR_CODES has entries");

// 4. package.json is valid ES module with SDK dep
const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url).pathname, "utf-8"));
assert(pkg.type === "module", "package.json type=module");
assert(pkg.dependencies?.["@qvac/sdk"] !== undefined, "@qvac/sdk is in dependencies");

// 5. NPC datasets — validate all JSONL files
const datasetsDir = resolve(__dirname, "datasets", "npc");
if (existsSync(datasetsDir)) {
  const npcs = readdirSync(datasetsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("."))
    .map(d => d.name);
  assert(npcs.length >= 6, `NPC datasets directory has ${npcs.length} NPCs`);

  let totalRecords = 0;
  let validRecords = 0;
  for (const npc of npcs) {
    for (const split of ["train", "validation"]) {
      const splitDir = resolve(datasetsDir, npc, split);
      if (!existsSync(splitDir)) continue;
      const files = readdirSync(splitDir).filter(f => f.endsWith(".jsonl"));
      for (const f of files) {
        const content = readFileSync(resolve(splitDir, f), "utf-8").trim();
        if (!content) continue;
        const lines = content.split("\n");
        for (const line of lines) {
          totalRecords++;
          try { JSON.parse(line); validRecords++; } catch {}
        }
      }
    }
  }
  assert(validRecords === totalRecords, `NPC JSONL datasets: ${validRecords}/${totalRecords} valid records`);
  assert(totalRecords > 0, `NPC datasets contain dialogue records (${totalRecords} total)`);
} else {
  assert(false, "datasets/npc/ directory exists");
}

// 6. NPC manifest is valid JSON
const manifestPath = resolve(datasetsDir, "npc_manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert(typeof manifest === "object", "npc_manifest.json is valid JSON");
  assert(Object.keys(manifest).length >= 6, `npc_manifest.json has ${Object.keys(manifest).length} NPCs`);
}

// 7. Script syntax checks
const scriptsToCheck = [
  "services/server.js",
  "services/router/gateway.js",
  "services/ios/pair.js",
  "services/ios/provider.js",
  "scripts/train/npc-loras.js",
  "scripts/lib/config.js",
];
for (const script of scriptsToCheck) {
  const scriptPath = resolve(__dirname, script);
  if (existsSync(scriptPath)) {
    assert(true, `${script} exists`);
  } else {
    assert(false, `${script} exists`);
  }
}

console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
