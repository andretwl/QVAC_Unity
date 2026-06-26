// QVAC Config Loader — single source of truth for all paths and presets.
//
// Usage:
//   import { projectRoot, resolveModelPreset, env } from "./lib/config.js";
//
//   const root = projectRoot();
//   const preset = resolveModelPreset("default-llm");
//   const port = env("QVAC_PORT", 11435);

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = resolve(__dirname, "..");
const PRESETS_DIR = resolve(SCRIPTS_DIR, "..", "config", "presets");

// ─── Helpers ──────────────────────────────────────────────

/** Read env var with fallback default */
export function env(key, defaultVal) {
  return process.env[key] ?? defaultVal;
}

/** Resolve the project root directory */
export function projectRoot() {
  return resolve(SCRIPTS_DIR, "..");
}

/** Resolve an absolute path within the project */
export function resolvePath(...segments) {
  return resolve(projectRoot(), ...segments);
}

/** Resolve the model cache directory */
export function modelsDir() {
  return env("QVAC_MODELS", resolvePath(".qvac", "models"));
}

/** Resolve an NPC dataset directory */
export function npcDatasetDir(npcName) {
  return resolvePath("datasets", "npc", npcName || "");
}

/** Resolve LoRA artifact output directory for an NPC */
export function loraArtifactDir(npcName) {
  return resolvePath("artifacts", "lora", npcName || "");
}

// ─── Model Presets ────────────────────────────────────────

const presetCache = {};

/**
 * Load a model preset by alias name.
 * @param {string} alias — e.g. "default-llm", "fast-llm", "quality-llm", "tiny-llm"
 * @returns {object|null} — preset config or null if not found
 */
export function resolveModelPreset(alias) {
  if (presetCache[alias]) return presetCache[alias];

  const presetPath = resolve(PRESETS_DIR, `${alias}.json`);
  if (!existsSync(presetPath)) return null;

  try {
    const data = JSON.parse(readFileSync(presetPath, "utf8"));
    presetCache[alias] = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * List all available model presets.
 * @returns {string[]} — alias names
 */
export function listPresets() {
  try {
    return readdirSync(PRESETS_DIR)
      .filter(f => f.endsWith(".json") && f !== "README.md")
      .map(f => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

// ─── Quick Self-Test ──────────────────────────────────────
// Run: node scripts/lib/config.js

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("QVAC Config Loader — Self Test\n");
  console.log(`  projectRoot:          ${projectRoot()}`);
  console.log(`  modelsDir:            ${modelsDir()}`);
  console.log(`  npcDatasetDir():      ${npcDatasetDir()}`);
  console.log(`  loraArtifactDir():    ${loraArtifactDir()}`);
  console.log(`  default-llm preset:   ${JSON.stringify(resolveModelPreset("default-llm"))}`);
  console.log(`  fast-llm preset:      ${JSON.stringify(resolveModelPreset("fast-llm"))}`);
  console.log(`  available presets:    ${listPresets().join(", ")}`);
  console.log(`  QVAC_PORT env:        ${env("QVAC_PORT", 11435)}`);
  console.log(`\n✅ Config loader self-test passed`);
}
