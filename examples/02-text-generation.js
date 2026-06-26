// QVAC Text Generation Example
// Uses QWEN3_1_7B_INST_Q4 — our best speed/quality balanced model

import {
  loadModel,
  QWEN3_1_7B_INST_Q4,       // ~1,057 MB, already cached
  completion,
  unloadModel,
} from "@qvac/sdk";

async function main() {
  console.log("⏳ Loading QWEN3_1_7B_INST_Q4...");
  const modelId = await loadModel({
    modelSrc: QWEN3_1_7B_INST_Q4,
    modelConfig: {
      ctx_size: 4096,          // Must be ≥4096 for Qwen models!
      gpu_layers: 99,          // Full GPU offload
    },
    onProgress: (p) => {
      if (p.percentage % 25 === 0) {
        process.stderr.write(`  ▸ ${p.percentage.toFixed(0)}% (${(p.downloaded/1e6).toFixed(0)}/${(p.total/1e6).toFixed(0)} MB)\n`);
      }
    },
  });

  console.log(`✅ Model loaded: ${modelId}\n`);

  // Single turn example
  const result = completion({
    modelId,
    history: [
      { role: "user", content: "Write a haiku about machine learning." },
    ],
    stream: true,
  });

  for await (const token of result.tokenStream) {
    process.stdout.write(token);
  }

  console.log("\n");
  await unloadModel({ modelId });
  console.log("✅ Unloaded.");
}

main().catch(console.error);
