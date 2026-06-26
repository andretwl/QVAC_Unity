// Shared benchmark utilities — VRAM tracking, timing, result logging

import { execSync } from "child_process";

/**
 * Get current NVIDIA GPU VRAM usage in MiB.
 * Returns { total, used, free } or null if nvidia-smi unavailable.
 */
export function getVRAM() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits',
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const [total, used, free] = out.split(", ").map(Number);
    return { total, used, free };
  } catch {
    return null;
  }
}

/**
 * Human-friendly bytes to MiB
 */
export function toMiB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Simple timer — returns { start, elapsedMs }.
 * Call start() to begin, elapsed() to read ms.
 */
export function createTimer() {
  const start = performance.now();
  return {
    start,
    elapsedMs: () => performance.now() - start,
  };
}

/**
 * Format benchmark result for Markdown table row
 */
export function formatResult(label, { modelId, tokPerSec, durationMs, vramBefore, vramAfter, ctxSize, totalTokens, stopReason, quality }) {
  const vramDelta = vramAfter && vramBefore ? (vramAfter.used - vramBefore.used).toFixed(0) : "?";
  return [
    `| ${label}`,
    `${tokPerSec?.toFixed(1) ?? "?"}`,
    `${totalTokens ?? "?"}`,
    `${durationMs?.toFixed(0) ?? "?"}`,
    `${vramDelta}`,
    `${stopReason ?? "?"}`,
    `${quality ?? "?"}`,
  ].join(" | ");
}

/**
 * Markdown table header for results
 */
export const RESULTS_HEADER = `| Model | tok/s | tokens | ms | VRAM Δ (MiB) | stop reason | quality (1-5) |
|-------|-------|--------|----|-------------|-------------|---------------|`;

/**
 * Record a benchmark row to a results file
 */
export function appendResult(filePath, row) {
  const { appendFileSync } = require("fs");
  appendFileSync(filePath, row + "\n", "utf8");
}
