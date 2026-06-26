#!/usr/bin/env node
// NPC LoRA Training Pipeline
// Trains personality-specific LoRA adapters for NPCs using QVAC's finetune() API.
//
// Usage: node scripts/train/npc-loras.js [--all | --npc merchant]
//
// Workflow:
//   1. Loads NPC manifest (system prompt, LoRA config)
//   2. For each NPC, runs QVAC finetune() on their dialogue dataset
//   3. Outputs a .gguf LoRA adapter per NPC
//   4. Logs loss curves for quality assessment

import { finetune } from "@qvac/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const NPCDATA = resolve(PROJECT_ROOT, "datasets", "npc");
const ARTIFACTS = resolve(PROJECT_ROOT, "artifacts", "lora");
const MANIFEST_PATH = resolve(NPCDATA, "npc_manifest.json");

// ─── Config ────────────────────────────────────────────────
const DEFAULT_MODEL = "default-llm";  // must be loaded in QVAC server

// ─── Parse args ────────────────────────────────────────────
const args = process.argv.slice(2);
const npcFilter = args.includes("--all") ? null : getArgValue("--npc");

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

// ─── Helpers ──────────────────────────────────────────────
function log(msg, level = "INFO") {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log(`
╔══════════════════════════════════════════════╗
║   NPC LoRA Training Pipeline                 ║
║   QVAC finetune() + GGUF adapter export     ║
╚══════════════════════════════════════════════╝
  `);

  // 1. Load manifest
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const npcNames = Object.keys(manifest).sort();
  log(`Loaded manifest: ${npcNames.length} NPCs defined`);

  const toTrain = npcFilter
    ? npcNames.filter(n => n === npcFilter)
    : npcNames;

  if (toTrain.length === 0) {
    log(`No NPCs to train (filter: ${npcFilter || "none"})`, "WARN");
    console.log(`\nAvailable NPCs: ${npcNames.join(", ")}`);
    console.log(`Usage: node scripts/train/npc-loras.js --all`);
    console.log(`       node scripts/train/npc-loras.js --npc merchant\n`);
    process.exit(0);
  }

  if (!existsSync(ARTIFACTS)) mkdirSync(ARTIFACTS, { recursive: true });

  // 2. Train each NPC
  for (const npc of toTrain) {
    const config = manifest[npc];
    const trainDir = resolve(NPCDATA, npc, "train");
    const valDir = resolve(NPCDATA, npc, "validation");
    const outputDir = resolve(ARTIFACTS, npc);

    if (!existsSync(trainDir)) {
      log(`Dataset not found: ${trainDir} — skipping ${npc}`, "WARN");
      continue;
    }

    log(`\n━━━ Training: ${npc} ━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`System prompt: ${config.system_prompt.slice(0, 60)}...`);
    log(`Train dir: ${trainDir}`);
    log(`LoRA rank: ${config.lora_config.rank}, alpha: ${config.lora_config.alpha}`);
    log(`Epochs: ${config.lora_config.epochs}, lr: ${config.lora_config.learning_rate}`);

    const options = {
      modelId: config.model_alias || DEFAULT_MODEL,
      options: {
        trainDatasetDir: trainDir,
        validation: { type: "split", fraction: 0.05 },
        outputParametersDir: outputDir,
        numberOfEpochs: config.lora_config.epochs,
        learningRate: config.lora_config.learning_rate,
        loraRank: config.lora_config.rank,
        loraAlpha: config.lora_config.alpha,
        loraModules: config.lora_config.modules,
        checkpointSaveSteps: 50,
      },
    };

    if (existsSync(valDir)) {
      const valFiles = readdirSync(valDir).filter(f => f.endsWith(".jsonl"));
      if (valFiles.length > 0) {
        options.options.validation = { type: "split", fraction: 0.05 };
      }
    }

    try {
      const handle = finetune(options);
      const losses = [];

      for await (const progress of handle.progressStream) {
        const step = progress.global_steps ?? 0;
        const loss = progress.loss ?? "?";
        losses.push({ step, loss });
        log(`  Step ${String(step).padStart(4)}: loss=${loss}`);
      }

      const result = await handle.result;
      log(`✅ ${npc} LoRA training complete!`, "DONE");
      log(`   Status: ${result.status}`);
      log(`   Output: ${outputDir}`);

      const summary = {
        npc,
        system_prompt: config.system_prompt,
        lora_config: config.lora_config,
        trained_at: new Date().toISOString(),
        epochs_completed: config.lora_config.epochs,
        loss_curve: losses,
        output_path: outputDir,
      };
      writeFileSync(
        resolve(ARTIFACTS, `${npc}-training-summary.json`),
        JSON.stringify(summary, null, 2)
      );

    } catch (err) {
      log(`❌ ${npc} training failed: ${err.message}`, "ERROR");
      console.error(err);
    }
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Training Complete                      ║`);
  console.log(`║   Artifacts: ${ARTIFACTS}                ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  log(`\nNext: Copy LoRA adapters to Unity StreamingAssets/`);
  log(`      or configure LLM.AddLora path in Unity.`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
