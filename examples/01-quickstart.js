// QVAC Quickstart Example — based on https://docs.qvac.tether.io/quickstart/
// This is the official quickstart from the docs, adapted for our project config.
// Our project has "type": "module" and qvac.config.json, so no QVAC_CONFIG_PATH needed.

import {
  loadModel,
  LLAMA_3_2_1B_INST_Q4_0,  // Already cached! ~738 MB
  completion,
  unloadModel,
} from "@qvac/sdk";

try {
  console.log("⏳ Loading LLAMA_3_2_1B_INST_Q4_0 (from SSD cache)...");
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelConfig: {
      ctx_size: 4096,
      gpu_layers: 99,
    },
    onProgress: (p) => {
      const mb = (n) => (n / 1e6).toFixed(1);
      const line = `▸ Downloading ${p.percentage.toFixed(0)}% (${mb(p.downloaded)}/${mb(p.total)} MB)`;
      process.stderr.write(process.stderr.isTTY ? `\r${line}` : `${line}\n`);
      if (p.percentage >= 100) process.stderr.write("\n");
    },
  });

  console.log(`✅ Model loaded (ID: ${modelId})`);
  console.log();
  console.log("─".repeat(60));
  console.log("🤖 QVAC says:");
  console.log("─".repeat(60));

  const history = [
    {
      role: "user",
      content: "Explain quantum computing in one sentence",
    },
  ];

  const result = completion({ modelId, history, stream: true });
  let fullText = "";
  for await (const token of result.tokenStream) {
    process.stdout.write(token);
    fullText += token;
  }

  console.log("\n");
  console.log("─".repeat(60));
  console.log(`📊 Stats: ${fullText.split(" ").length} words generated`);
  console.log("─".repeat(60));

  await unloadModel({ modelId });
  console.log("✅ Model unloaded — resources freed.");
} catch (error) {
  console.error("\n✖ Error:", error.message);
  process.exit(1);
}
