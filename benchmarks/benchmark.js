// Phase 1: Text Generation Benchmark — runs standardized prompts across models
// Usage: node benchmarks/benchmark.js [model1] [model2] ...
// Default: runs all models listed below

import {
  loadModel, completion, unloadModel,
  QWEN3_600M_INST_Q4,
  QWEN3_1_7B_INST_Q4,
  QWEN3_4B_INST_Q4_K_M,
  QWEN3_8B_INST_Q4_K_M,
  LLAMA_3_2_1B_INST_Q4_0,
  SALAMANDRATA_2B_INST_Q4,
  BITNET_1B_INST_TQ2_0,
  LASER_DOLPHIN_2X7B_INST_Q2_K,
} from "@qvac/sdk";
import { appendFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// ── Config ──────────────────────────────────────────────────────────────────
const RESULTS_FILE = "benchmarks/phase1-results.md";
const CTX_SIZES = [1024, 4096]; // test each model at these ctx sizes
const SHORT_PROMPT  = "Explain quantum computing in one sentence.";
const MEDIUM_PROMPT = "Write a detailed comparison of RAG (Retrieval-Augmented Generation) vs fine-tuning for domain adaptation of large language models. Cover the strengths, weaknesses, use cases, and how they can complement each other.";
const LONG_PROMPT_LEAD = "Summarize the following text in 3-5 bullet points:\n\n";

// Models to benchmark — each entry: { name, constant, estSize, note }
const MODELS = [
  { name: "QWEN3_600M_INST_Q4",   const: QWEN3_600M_INST_Q4,     size: "~400 MB", note: "Smallest usable LLM" },
  { name: "BITNET_1B_INST_TQ2_0", const: BITNET_1B_INST_TQ2_0,   size: "~400 MB", note: "Extreme compression (ternary)" },
  { name: "LLAMA_3_2_1B_INST_Q4_0", const: LLAMA_3_2_1B_INST_Q4_0, size: "~800 MB", note: "Baseline" },
  { name: "QWEN3_1_7B_INST_Q4",   const: QWEN3_1_7B_INST_Q4,     size: "~1 GB",   note: "1.7B class baseline" },
  { name: "SALAMANDRATA_2B_INST_Q4", const: SALAMANDRATA_2B_INST_Q4, size: "~1.3 GB", note: "2B class" },
  { name: "QWEN3_4B_INST_Q4_K_M", const: QWEN3_4B_INST_Q4_K_M,   size: "~2.5 GB", note: "Sweet spot candidate" },
  { name: "LASER_DOLPHIN_2X7B_INST_Q2_K", const: LASER_DOLPHIN_2X7B_INST_Q2_K, size: "~2 GB", note: "MoE architecture (Q2_K)" },
  { name: "QWEN3_8B_INST_Q4_K_M", const: QWEN3_8B_INST_Q4_K_M,   size: "~5 GB",   note: "Large — may OOM" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function waitVRAMStable(prev, label) {
  // Poll VRAM until stable (no change over 3 samples)
  for (let attempt = 0; attempt < 10; attempt++) {
    const curr = getVRAM();
    if (curr && prev && Math.abs(curr.used - prev.used) < 5) return curr;
    if (curr) prev = curr;
    // sleep ~400ms
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  }
  return getVRAM();
}

// ── Benchmark Runner ────────────────────────────────────────────────────────

async function benchmarkModel(modelDef, ctxSize) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Benchmarking: ${modelDef.name} (ctx_size=${ctxSize})`);
  console.log(`${"=".repeat(60)}`);

  const results = [];
  const vramBefore = getVRAM();
  console.log(`VRAM before: ${vramBefore?.used ?? "?"} / ${vramBefore?.total ?? "?"} MiB`);

  let modelId;
  let loadTimeMs;
  let vramAfterLoad;

  try {
    // ── Load ──
    const loadStart = performance.now();
    modelId = await loadModel({
      modelSrc: modelDef.const,
      modelConfig: { ctx_size: ctxSize, gpu_layers: 99 },
      onProgress: (p) => {
        const mb = (n) => (n / 1e6).toFixed(1);
        if (p.percentage % 10 === 0 || p.percentage >= 100) {
          process.stderr.write(`  ▶ Download ${p.percentage.toFixed(0)}% (${mb(p.downloaded)}/${mb(p.total)} MB)\n`);
        }
      },
    });
    loadTimeMs = performance.now() - loadStart;

    // Wait for VRAM to settle
    vramAfterLoad = waitVRAMStable(vramBefore, `${modelDef.name} load`);
    console.log(`VRAM after load: ${vramAfterLoad?.used ?? "?"} MiB (Δ ${vramAfterLoad && vramBefore ? (vramAfterLoad.used - vramBefore.used).toFixed(0) : "?"} MiB)`);
    console.log(`Load time: ${loadTimeMs.toFixed(0)} ms`);
    console.log(`Model ID: ${modelId}`);

    // ── Run prompts ──
    const prompts = [
      { label: "Short", content: SHORT_PROMPT },
      { label: "Medium", content: MEDIUM_PROMPT },
    ];

    for (const prompt of prompts) {
      console.log(`\n  ▶ Prompt: ${prompt.label}`);
      const vramPreInf = getVRAM();

      const infStart = performance.now();
      const result = completion({
        modelId,
        history: [{ role: "user", content: prompt.content }],
        stream: true,
      });

      let totalTokens = 0;
      let fullText = "";
      for await (const token of result.tokenStream) {
        totalTokens++;
        fullText += token;
      }
      const infDurationMs = performance.now() - infStart;
      const tokPerSec = (totalTokens / (infDurationMs / 1000));

      const final = await result.final;
      const vramPostInf = getVRAM();

      console.log(`    tokens: ${totalTokens} | ${tokPerSec.toFixed(1)} tok/s | ${infDurationMs.toFixed(0)} ms`);
      if (final?.stopReason) console.log(`    stop: ${final.stopReason}`);
      console.log(`    preview: ${fullText.slice(0, 100)}...`);

      results.push({
        prompt: prompt.label,
        ctxSize,
        totalTokens,
        tokPerSec,
        infDurationMs,
        stopReason: final?.stopReason ?? "?",
        quality: "?", // subjective — fill in later
        text: fullText,
        stats: final?.stats ?? null,
      });
    }

    // ── Unload ──
    await unloadModel({ modelId });
    const vramAfterUnload = waitVRAMStable(vramAfterLoad, `${modelDef.name} unload`);
    console.log(`\n  ▶ Unloaded. VRAM after: ${vramAfterUnload?.used ?? "?"} MiB`);

  } catch (err) {
    console.error(`  ✖ Error benchmarking ${modelDef.name}:`, err.message);
    results.push({ prompt: "ERROR", ctxSize, totalTokens: 0, tokPerSec: 0, infDurationMs: 0, stopReason: err.message, quality: "-", text: "", stats: null });
    // Try to unload if partially loaded
    if (modelId) {
      try { await unloadModel({ modelId }); } catch {}
    }
  }

  return {
    model: modelDef.name,
    ctxSize,
    vramBefore,
    vramAfterLoad,
    loadTimeMs,
    results,
  };
}

// ── Report Writer ───────────────────────────────────────────────────────────

function writeReport(allBenchData) {
  let md = `# Phase 1: Text Generation Benchmarks\n\n`;
  md += `**Date:** ${new Date().toISOString().split("T")[0]}\n`;
  md += `**GPU:** NVIDIA RTX 3060 Laptop (6 GB VRAM) | Vulkan 1.4.329 | Driver 595.84\n`;
  md += `**System:** Pop!_OS 24.04 | Node.js v${process.version} | @qvac/sdk ^0.13.5\n`;
  md += `**Cache:** /mnt/data/projects/QVAC/.qvac/models\n\n`;
  md += `---\n\n`;

  for (const bench of allBenchData) {
    md += `## ${bench.model} (ctx_size=${bench.ctxSize})\n\n`;
    md += `- **Load time:** ${bench.loadTimeMs?.toFixed(0) ?? "?"} ms\n`;
    md += `- **VRAM before:** ${bench.vramBefore?.used ?? "?"} MiB\n`;
    md += `- **VRAM after load:** ${bench.vramAfterLoad?.used ?? "?"} MiB`;
    if (bench.vramAfterLoad && bench.vramBefore) {
      md += ` (Δ ${(bench.vramAfterLoad.used - bench.vramBefore.used).toFixed(0)} MiB)`;
    }
    md += `\n- **VRAM total:** ${bench.vramBefore?.total ?? "?"} MiB\n\n`;

    md += `| Prompt | tok/s | tokens | duration (ms) | stop reason |\n`;
    md += `|--------|-------|--------|--------------|-------------|\n`;

    for (const r of bench.results) {
      md += `| ${r.prompt} | ${r.tokPerSec?.toFixed(1) ?? "?"} | ${r.totalTokens} | ${r.infDurationMs?.toFixed(0) ?? "?"} | ${r.stopReason} |\n`;
    }
    md += `\n**Sample output (short prompt):**\n> ${bench.results[0]?.text?.slice(0, 300) ?? "N/A"}\n\n`;
    md += `---\n\n`;
  }

  // Summary table
  md += `## Summary\n\n`;
  md += `| Model | ctx_size | Load ΔVRAM | Short tok/s | Medium tok/s | Notes |\n`;
  md += `|-------|----------|-----------|-------------|--------------|-------|\n`;

  for (const bench of allBenchData) {
    const vramDelta = bench.vramAfterLoad && bench.vramBefore
      ? (bench.vramAfterLoad.used - bench.vramBefore.used).toFixed(0)
      : "?";
    const shortResult = bench.results.find(r => r.prompt === "Short");
    const mediumResult = bench.results.find(r => r.prompt === "Medium");
    const shortTok = shortResult?.tokPerSec?.toFixed(1) ?? "-";
    const mediumTok = mediumResult?.tokPerSec?.toFixed(1) ?? "-";
    const note = bench.results.some(r => r.prompt === "ERROR") ? "⚠️ FAILED" : "";
    md += `| ${bench.model} | ${bench.ctxSize} | ${vramDelta} MiB | ${shortTok} | ${mediumTok} | ${note} |\n`;
  }

  md += `\n---\n*Benchmark generated by QVAC evaluation script*\n`;

  writeFileSync(RESULTS_FILE, md, "utf8");
  console.log(`\n📝 Report written to ${RESULTS_FILE}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Parse CLI args — filter models if specific names provided
  const args = process.argv.slice(2);
  let modelsToRun = MODELS;
  if (args.length > 0) {
    modelsToRun = MODELS.filter(m => args.includes(m.name));
    if (modelsToRun.length === 0) {
      console.error(`No matching models for: ${args.join(", ")}`);
      console.error(`Available: ${MODELS.map(m => m.name).join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`QVAC Phase 1 Benchmark — ${modelsToRun.length} models, ${CTX_SIZES.length} ctx sizes each\n`);
  console.log(`Models: ${modelsToRun.map(m => `${m.name} (${m.size})`).join(", ")}`);
  console.log(`Ctx sizes: ${CTX_SIZES.join(", ")}`);
  if (args.length === 0) console.log("\nTip: run specific models with: node benchmarks/benchmark.js QWEN3_600M_INST_Q4 QWEN3_4B_INST_Q4_K_M\n");

  const allData = [];

  for (const modelDef of modelsToRun) {
    for (const ctxSize of CTX_SIZES) {
      const data = await benchmarkModel(modelDef, ctxSize);
      allData.push(data);

      // Brief pause between models to let VRAM settle
      if (allData.length < modelsToRun.length * CTX_SIZES.length) {
        console.log("\n  ▶ Cooling down (5s)...");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
      }
    }
  }

  writeReport(allData);
  console.log("\n✅ Phase 1 benchmark complete!");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
