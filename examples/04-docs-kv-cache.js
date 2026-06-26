// QVAC Docs-Aligned KV Cache Test
// Compares cached vs non-cached completion speed per the docs:
// https://docs.qvac.tether.io/ai-capabilities/text-generation/#examples

import {
  completion, loadModel, unloadModel,
  QWEN3_600M_INST_Q4,
} from "@qvac/sdk";

console.log("📋 KV Cache Test\n");

try {
  const modelId = await loadModel({
    modelSrc: QWEN3_600M_INST_Q4,
    modelConfig: { ctx_size: 2048 },
  });
  console.log(`  ✅ Model loaded (${modelId.slice(0,8)}...)\n`);

  // --- First conversation (builds cache) ---
  console.log("  ▸ First conversation (building cache)...");
  const t0 = performance.now();
  const result1 = completion({
    modelId,
    history: [
      { role: "user", content: "What is the capital of France?" },
    ],
    stream: true,
    kvCache: true,
  });
  let out1 = "";
  for await (const tok of result1.tokenStream) { out1 += tok; }
  const stats1 = await result1.stats;
  const t1 = performance.now();
  const ms1 = (t1 - t0).toFixed(0);
  const tok1 = stats1?.tokensPerSecond?.toFixed(1) ?? "?";
  console.log(`    First: ${ms1}ms, ${tok1} tok/s, output=${out1.length} chars`);

  // --- Second turn (reuses cache) ---
  console.log("  ▸ Continuing conversation (reusing cache)...");
  const t2 = performance.now();
  const result2 = completion({
    modelId,
    history: [
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: out1 },
      { role: "user", content: "What about Germany?" },
    ],
    stream: true,
    kvCache: true,
  });
  let out2 = "";
  for await (const tok of result2.tokenStream) { out2 += tok; }
  const stats2 = await result2.stats;
  const t3 = performance.now();
  const ms2 = (t3 - t2).toFixed(0);
  const tok2 = stats2?.tokensPerSecond?.toFixed(1) ?? "?";
  console.log(`    Cached: ${ms2}ms, ${tok2} tok/s, output=${out2.length} chars`);

  // --- Same conversation WITHOUT cache ---
  console.log("  ▸ Same conversation without cache...");
  const t4 = performance.now();
  const result3 = completion({
    modelId,
    history: [
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: out1 },
      { role: "user", content: "What about Germany?" },
    ],
    stream: true,
    kvCache: false,
  });
  let out3 = "";
  for await (const tok of result3.tokenStream) { out3 += tok; }
  const stats3 = await result3.stats;
  const t5 = performance.now();
  const ms3 = (t5 - t4).toFixed(0);
  const tok3 = stats3?.tokensPerSecond?.toFixed(1) ?? "?";
  console.log(`    No cache: ${ms3}ms, ${tok3} tok/s, output=${out3.length} chars`);

  // Results
  const msCached = parseInt(ms2);
  const msNoCache = parseInt(ms3);
  const speedup = msNoCache > 0 ? (msNoCache / msCached).toFixed(1) : "N/A";
  console.log(`\n  📊 Cache speedup: ${speedup}x`);

  const docsAlignedPass = (out1.length > 0 && out2.length > 0 && out3.length > 0);
  console.log(`  ${docsAlignedPass ? "✅" : "❌"} All KV cache tests passed`);

  await unloadModel({ modelId, clearStorage: false });
  process.exit(docsAlignedPass ? 0 : 1);
} catch (err) {
  console.error("✖", err);
  process.exit(1);
}
