// QVAC Health Check — verifies the project is ready for agent/subagent use
// Run: node examples/00-health-check.js

import {
  loadModel,
  LLAMA_3_2_1B_INST_Q4_0,
  completion,
  unloadModel,
} from "@qvac/sdk";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

let passed = 0;
let failed = 0;

function check(label, ok) {
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

console.log("🔍 QVAC Health Check\n");
console.log("─".repeat(50));

// 1. Project structure
console.log("\n📁 Project Structure:");
check("package.json exists", existsSync("package.json"));
check("type=module", readFileSync("package.json", "utf8").includes('"type": "module"'));
check("@qvac/sdk installed", existsSync("node_modules/@qvac/sdk"));
check("qvac.config.json exists", existsSync("qvac.config.json"));
check("AGENTS.md exists", existsSync("AGENTS.md"));
check("BEST-CONFIGS.md exists", existsSync("BEST-CONFIGS.md"));
check(".gitignore exists", existsSync(".gitignore"));
check("benchmarks/ exists", existsSync("benchmarks/"));
check("examples/ exists", existsSync("examples/"));

// 2. Config validity
console.log("\n⚙️  Config:");
try {
  const cfg = JSON.parse(readFileSync("qvac.config.json", "utf8"));
  check("Valid JSON", true);
  check("SSD cache path", cfg.cacheDirectory?.includes("/mnt/data"));
} catch {
  check("Valid JSON", false);
}

// 3. Cached models
console.log("\n💾 Model Cache:");
const cacheDir = ".qvac/models";
if (existsSync(cacheDir)) {
  const models = execSync(`ls ${cacheDir} 2>/dev/null | wc -l`, { encoding: "utf8" }).trim();
  const size = execSync(`du -sh ${cacheDir} 2>/dev/null | cut -f1`, { encoding: "utf8" }).trim();
  check(`Models cached: ${models} (${size})`, parseInt(models) > 0);
} else {
  check("Cache directory", false);
}

// 4. VRAM
console.log("\n🖥️  GPU:");
try {
  const vram = execSync(
    'nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits',
    { encoding: "utf8", timeout: 5000 }
  ).trim();
  check(`VRAM: ${vram} MiB`, vram.length > 0);
} catch {
  check("VRAM query", false);
}

// 5. SDK import
console.log("\n📦 SDK:");
try {
  const sdkPkg = readFileSync("node_modules/@qvac/sdk/package.json", "utf8");
  const version = JSON.parse(sdkPkg).version;
  check(`@qvac/sdk v${version}`, true);
} catch {
  check("@qvac/sdk version", false);
}

// 6. Smoke test
console.log("\n🧪 Smoke Test:");
try {
  const testOut = execSync("npm test 2>&1", { encoding: "utf8", timeout: 30000 });
  const passCount = (testOut.match(/✓/g) || []).length;
  check(`${passCount}/11 smoke tests pass`, testOut.includes("All tests passed"));
} catch {
  check("smoke tests", false);
}

// 7. Model inference test
console.log("\n🤖 Inference Test:");
try {
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelConfig: { ctx_size: 1024, gpu_layers: 99 },
  });
  check(`Model loaded (${modelId.slice(0, 8)}...)`, true);

  const result = completion({
    modelId,
    history: [{ role: "user", content: "Say OK" }],
    stream: true,
  });
  let output = "";
  for await (const tok of result.tokenStream) { output += tok; }
  await unloadModel({ modelId });
  check(`Inference works: "${output.slice(0, 60)}"`, output.length > 0);
} catch (err) {
  check(`Inference failed: ${err.message.slice(0, 60)}`, false);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}`);

if (failed > 0) process.exit(1);
