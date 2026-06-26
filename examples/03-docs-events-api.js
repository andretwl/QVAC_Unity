// QVAC Docs-Aligned Events API Test
// Mirrors the official docs example at:
// https://docs.qvac.tether.io/ai-capabilities/text-generation/#examples
// Uses the canonical events/final API instead of tokenStream convenience wrappers.

import {
  completion, loadModel, unloadModel,
  QWEN3_600M_INST_Q4,  // smallest model for fast test
} from "@qvac/sdk";

let passed = 0;
let failed = 0;

function check(label, ok) {
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

console.log("📋 Docs Events API Test\n");

try {
  const modelId = await loadModel({
    modelSrc: QWEN3_600M_INST_Q4,
    modelConfig: { ctx_size: 4096 },
    onProgress: (p) => {
      if (p.percentage === 100) console.log(`  ▸ Model cached: ${(p.downloaded/1e6).toFixed(0)} MB`);
    },
  });
  check(`Model loaded (${modelId.slice(0,8)}...)`, true);

  // --- Test 1: events API with contentDelta ---
  console.log("\n  ▸ Streaming with events API (canonical docs approach):");
  let contentText = "";
  let thinkingText = "";
  let gotStats = false;
  let gotDone = false;
  let tokPerSec = 0;

  const result = completion({
    modelId,
    history: [{ role: "user", content: "Say hello in 3 words." }],
    stream: true,
    captureThinking: true,
  });

  for await (const event of result.events) {
    switch (event.type) {
      case "contentDelta":
        contentText += event.text;
        break;
      case "thinkingDelta":
        thinkingText += event.text;
        break;
      case "completionStats":
        gotStats = true;
        tokPerSec = event.stats.tokensPerSecond;
        break;
      case "completionDone":
        gotDone = true;
        break;
    }
  }

  const final = await result.final;
  check("contentDelta events received", contentText.length > 0);
  check("completionStats event received", gotStats);
  check("completionDone event received", gotDone);
  check("final.contentText matches", final.contentText === contentText);
  check("tokensPerSecond reported", tokPerSec > 0);

  // --- Test 2: Thinking capture ---
  console.log("\n  ▸ Thinking capture test (longer prompt):");
  const result2 = completion({
    modelId,
    history: [{ role: "user", content: "Explain why the sky is blue in 2 sentences. Think step by step." }],
    stream: true,
    captureThinking: true,
  });

  let t2_content = "";
  let t2_thinking = "";
  for await (const event of result2.events) {
    if (event.type === "contentDelta") t2_content += event.text;
    if (event.type === "thinkingDelta") t2_thinking += event.text;
  }
  const final2 = await result2.final;
  check("Content was generated", t2_content.length > 20);
  check("Thinking text captured", t2_thinking.length > 0);
  check("final.thinkingText populated", (final2.thinkingText || "").length > 0);
  check("Thinking, content and final all delivered", t2_content.length > 0 && t2_thinking.length > 0);

  // --- Test 3: Raw deltas ---
  console.log("\n  ▸ Raw delta mode:");
  const result3 = completion({
    modelId,
    history: [{ role: "user", content: "Count to 3." }],
    stream: true,
    emitRawDeltas: true,
  });

  let rawCount = 0;
  for await (const event of result3.events) {
    if (event.type === "rawDelta") rawCount++;
  }
  await result3.final;
  check("rawDelta events emitted", rawCount > 0);

  await unloadModel({ modelId, clearStorage: false });
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Events API Test: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));
  if (failed > 0) process.exit(1);
} catch (err) {
  console.error("✖", err);
  process.exit(1);
}
