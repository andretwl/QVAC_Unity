// Phase 1b: Large model benchmark — tests with reduced GPU layers
// These models exceed 6 GB VRAM at full offload, so we test with gpu_layers=16

import {
  loadModel, completion, unloadModel,
  LASER_DOLPHIN_2X7B_INST_Q2_K,
  QWEN3_8B_INST_Q4_K_M,
} from "@qvac/sdk";
import { writeFileSync, appendFileSync } from "fs";
import { execSync } from "child_process";

const RESULTS_FILE = "benchmarks/phase1-results.md";
const CTX_SIZE = 4096;
const SHORT_PROMPT = "Explain quantum computing in one sentence.";
const MEDIUM_PROMPT = "Write a detailed comparison of RAG vs fine-tuning for domain adaptation of large language models. Cover the strengths, weaknesses, use cases, and how they can complement each other.";

function getVRAM() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits',
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const [total, used, free] = out.split(", ").map(Number);
    return { total, used, free };
  } catch { return null; }
}

async function testModel(name, modelConst, gpuLayers, ctxSize) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Testing: ${name} (gpu_layers=${gpuLayers}, ctx=${ctxSize})`);
  console.log(`${"=".repeat(60)}`);

  const vramBefore = getVRAM();
  console.log(`VRAM before: ${vramBefore?.used ?? "?"} / ${vramBefore?.total ?? "?"} MiB`);

  let modelId;
  let success = false;
  let shortResult = null;
  let mediumResult = null;

  try {
    const loadStart = performance.now();
    modelId = await loadModel({
      modelSrc: modelConst,
      modelConfig: { ctx_size: ctxSize, gpu_layers: gpuLayers },
      onProgress: (p) => {
        const mb = (n) => (n / 1e6).toFixed(1);
        if (p.percentage % 25 === 0 || p.percentage >= 100) {
          process.stderr.write(`  ▶ Download ${p.percentage.toFixed(0)}% (${mb(p.downloaded)}/${mb(p.total)} MB)\n`);
        }
      },
    });
    const loadTimeMs = performance.now() - loadStart;
    const vramAfter = getVRAM();
    const vramDelta = vramAfter && vramBefore ? (vramAfter.used - vramBefore.used).toFixed(0) : "?";
    console.log(`Load: ${(loadTimeMs/1000).toFixed(1)}s | VRAM: ${vramAfter?.used ?? "?"} MiB (Δ ${vramDelta} MiB)`);

    if (vramAfter && vramAfter.used > 5900) {
      console.log(`⚠️  VRAM critically high (${vramAfter.used}/6144). Model may be unstable.`);
    }

    // Short prompt
    console.log(`\n  ▶ Short prompt...`);
    const sStart = performance.now();
    const sResult = completion({ modelId, history: [{ role: "user", content: SHORT_PROMPT }], stream: true });
    let sTokens = 0, sText = "";
    for await (const tok of sResult.tokenStream) { sTokens++; sText += tok; }
    const sDur = performance.now() - sStart;
    const sTokps = sTokens / (sDur / 1000);
    console.log(`    ${sTokens} tokens | ${sTokps.toFixed(1)} tok/s | ${sDur.toFixed(0)} ms`);
    shortResult = { tokens: sTokens, tokps: sTokps, durMs: sDur, text: sText.slice(0, 150) };

    // Medium prompt
    console.log(`  ▶ Medium prompt...`);
    const mStart = performance.now();
    const mResult = completion({ modelId, history: [{ role: "user", content: MEDIUM_PROMPT }], stream: true });
    let mTokens = 0, mText = "";
    for await (const tok of mResult.tokenStream) { mTokens++; mText += tok; }
    const mDur = performance.now() - mStart;
    const mTokps = mTokens / (mDur / 1000);
    console.log(`    ${mTokens} tokens | ${mTokps.toFixed(1)} tok/s | ${mDur.toFixed(0)} ms`);
    mediumResult = { tokens: mTokens, tokps: mTokps, durMs: mDur, text: mText.slice(0, 150) };

    success = true;
    await unloadModel({ modelId });
    console.log(`  ▶ Unloaded. VRAM after: ${getVRAM()?.used ?? "?"} MiB`);
  } catch (err) {
    console.error(`  ✖ Failed: ${err.message}`);
    if (modelId) { try { await unloadModel({ modelId }); } catch {} }
  }

  // Append to results file
  const row = `\n## ${name} (gpu_layers=${gpuLayers}, ctx=${ctxSize})\n\n` +
    `- **Status:** ${success ? "✅" : "❌"}\n` +
    `- **VRAM before:** ${vramBefore?.used ?? "?"} MiB\n` +
    `- **VRAM peak:** ${getVRAM()?.used ?? "?"} MiB\n` +
    (success ? (
      `- **Short prompt:** ${shortResult.tokens} tok, ${shortResult.tokps.toFixed(1)} tok/s, ${shortResult.durMs.toFixed(0)} ms\n` +
      `- **Medium prompt:** ${mediumResult.tokens} tok, ${mediumResult.tokps.toFixed(1)} tok/s, ${mediumResult.durMs.toFixed(0)} ms\n` +
      `- **Short output:** > ${shortResult.text}\n`
    ) : "");

  appendFileSync(RESULTS_FILE, row, "utf8");
  return success;
}

async function main() {
  const args = process.argv.slice(2);
  const models = [];

  if (args.includes("dolphin") || args.length === 0) {
    models.push({ name: "LASER_DOLPHIN_2X7B_INST_Q2_K", const: LASER_DOLPHIN_2X7B_INST_Q2_K, layers: 16 });
    models.push({ name: "LASER_DOLPHIN_2X7B_INST_Q2_K", const: LASER_DOLPHIN_2X7B_INST_Q2_K, layers: 32 });
  }
  if (args.includes("qwen8b") || args.length === 0) {
    // 8B is 5 GB file, try very conservative gpu_layers
    models.push({ name: "QWEN3_8B_INST_Q4_K_M", const: QWEN3_8B_INST_Q4_K_M, layers: 16 });
  }

  let attempted = 0, passed = 0;
  for (const m of models) {
    attempted++;
    const ok = await testModel(m.name, m.const, m.layers, CTX_SIZE);
    if (ok) passed++;
    if (attempted < models.length) {
      console.log("\n  ▶ Cooling down (10s)...");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
    }
  }
  console.log(`\n✅ Large model benchmarks: ${passed}/${attempted} passed`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
