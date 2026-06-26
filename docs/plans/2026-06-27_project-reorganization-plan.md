#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  PROACTIVE PLAN: QVAC Project Reorganization & Reliability Base
// ─────────────────────────────────────────────────────────────────
// Discovered by surveying the live project. Every step is concrete,
// verifiable, and does not depend on guesses.
//
// Usage: work through phases in order. Each phase is independent
// enough that partial progress is safe; none depend on future phases.

/*
┌─────────────────────────────────────────────────────────────────┐
│ CURRENT STATE SUMMARY                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   
│  Issues found by audit (34 files scanned):                        
│  • router/gateway.js ......... 200+ lines of dead Ollama/LocalAI  
│    routing code (still probes ports 11434 & 8080)              
│  • router/router.config.json . 2 dead backend configs             
│  • monitoring/mdns-publish.sh  TXT record lists defunct backends  
│  • .hermes/plans/* ........... 2 stale plan files referencing     
│    dismantled services                                           
│  • npc-datasets/ ............. orphan NPCDialogueManager.cs copy  
│  • No .git repo ( .gitignore exists but no repo)                 
│  • No presets system for model configs                            
│  • No standardized env-variable convention                        
│  • Cognee database lock from concurrent sessions                  
│  • router/ at root — ambiguous with monitoring/                   
│  • No artifacts/ directory structure yet                          
│                                                                   
│  Already clean: AGENTS.md, NPC_DIALOGUE_SYSTEM_README.md,         
│  frontend/*, qvac.config.json, qvac-unified-server.js,            
│  qvac-provider.js, smoke-test.js                                  
└─────────────────────────────────────────────────────────────────┘
*/

// =================================================================
// PHASE A — Remove Stale Code & Dependencies
// =================================================================
// Safest first: eliminate dead Ollama/LocalAI code paths so the
// router doesn't waste startup time probing non-existent backends.

const PHASE_A = [
  {
    id: "A1",
    title: "Simplify router gateway to QVAC-only",
    files: ["router/gateway.js", "router/router.config.json"],
    steps: [
      "Rewrite router.config.json: remove `ollama` and `localai` backend objects entirely",
      "Remove `modelRouting` entries for ollama/localai models (llama3.1:8b, qwen3:14b, gemma-4-12b, etc.)",
      "Keep only `qvac` backend + `default-llm`, `fast-llm`, `quality-llm`, `tiny-llm` routing",
      "Rewrite gateway.js: delete ollamaToOpenAI(), openAIToOllamaChat(), ollamaStreamChunkToOpenAI()",
      "Delete ollama-specific /api/chat and /api/embed branches",
      "Replace byBackend stats object from `{ollama, localai, qvac}` to just `{qvac}`",
      "Update startup banner to show only QVAC backend",
      "Update discoverModels() to iterate only over remaining backends",
    ],
    verification: [
      "node --check router/gateway.js → no syntax errors",
      "grep -c ollama router/gateway.js → 0",
      "grep -c 11434 router/router.config.json → 0",
      "Start router: curl http://localhost:3001/health → servers.qvac only",
    ],
    risk: "low — QVAC auto-discovers models; no user-facing change",
  },
  {
    id: "A2",
    title: "Fix mDNS TXT record",
    files: ["monitoring/mdns-publish.sh"],
    steps: [
      "Change `models=qvac,ollama,localai` → `models=qvac` on the avahi-publish-service line",
    ],
    verification: [
      "grep 'models=' monitoring/mdns-publish.sh → 'models=qvac' only",
    ],
    risk: "trivial",
  },
  {
    id: "A3",
    title: "Archive stale Hermes plans",
    files: [".hermes/plans/2026-06-26_QVAC-frontend-integration-plan.md", ".hermes/plans/2026-06-25_QVAC-model-evaluation-plan.md"],
    steps: [
      "Create .hermes/plans/archive/ directory",
      "Move both stale plan files into archive/",
      "The model-evaluation plan references benchmark data but the architecture has changed",
    ],
    verification: [
      "ls .hermes/plans/archive/ → 2 files present",
      "ls .hermes/plans/ → (empty or only new plans)",
    ],
    risk: "none — plans are historical context only",
  },
  {
    id: "A4",
    title: "Remove orphan NPCDialogueManager.cs copy",
    files: ["npc-datasets/NPCDialogueManager.cs"],
    steps: [
      "Delete npc-datasets/NPCDialogueManager.cs (the real script is in Unity at Assets/Scripts/)",
      "Update NPC_DIALOGUE_SYSTEM_README.md's Files Reference table if needed",
    ],
    verification: [
      "ls npc-datasets/NPCDialogueManager.cs → 'No such file'",
    ],
    risk: "none — file is a copy; Unity has the canonical version",
  },
];

// =================================================================
// PHASE B — Reorganize Folder Structure
// =================================================================
// Clean up the root-level sprawl.  Goal: every top-level directory
// has a clear, single responsibility.

const PHASE_B = [
  {
    id: "B1",
    title: "Create canonical directory structure",
    steps: [
      "Create top-level directories:",
      "  services/        — long-running processes (replaces monitoring/ + router/)",
      "  services/router/ — model router gateway",
      "  services/mdns/   — mDNS advertising scripts",
      "  services/ios/    — iOS pairing utilities",
      "  config/          — shared configs and presets (already exists, extend it)",
      "  config/presets/  — model-config presets for quick switching",
      "  config/systemd/  — systemd service files (already here, keep it)",
      "  datasets/        — all training/evaluation data",
      "  datasets/npc/    — NPC dialogue datasets (moved from npc-datasets/)",
      "  datasets/benchmarks/ — benchmark output data",
      "  scripts/         — CLI utilities (training, benchmarks, pairing)",
      "  scripts/train/   — LoRA training pipeline",
      "  scripts/bench/   — benchmark runner",
      "  docs/            — project documentation (READMEs, plans)",
      "  docs/plans/      — Hermes plans (linked to .hermes/plans/)",
      "  artifacts/       — build outputs (LoRA adapters, training summaries)",
      "  artifacts/lora/  — trained LoRA GGUF files per NPC",
      "  artifacts/logs/  — training logs",
      "  frontend/        — dashboard web UI (keep as-is)",
      "  benchmarks/      — benchmark source code (keep as-is)",
    ],
    verification: [
      "ls -d services/ config/presets/ datasets/npc/ scripts/train/ docs/plans/ artifacts/lora/ → all exist",
    ],
    risk: "moderate — need to update import paths in relocated files",
  },
  {
    id: "B2",
    title: "Relocate router",
    steps: [
      "mv router/ services/router/",
      "Update any import/require paths in services/router/gateway.js",
      "Update services/router/router.config.json path references (none expected)",
      "Update server startup log line if it references '../router/'",
      "Update AGENTS.md path references",
    ],
    verification: [
      "node --check services/router/gateway.js → OK",
      "ls router/ → 'No such file'",
    ],
    risk: "low — only dashboard server.js references router via HTTP, not filesystem path",
  },
  {
    id: "B3",
    title: "Relocate monitoring scripts",
    steps: [
      "mv monitoring/qvac-provider.js services/ios/provider.js",
      "mv monitoring/ios-pair.js services/ios/pair.js",
      "mv monitoring/mdns-publish.sh services/mdns/publish.sh",
      "mv monitoring/qvac-unified-server.js services/server.js  (the main entry point)",
      "Remove monitoring/ directory if empty",
      "Update any cross-references in remaining scripts",
    ],
    verification: [
      "ls services/server.js services/ios/ services/mdns/ → all exist",
      "ls monitoring/ → empty or absent",
    ],
    risk: "moderate — unified-server.js startup path changes",
  },
  {
    id: "B4",
    title: "Relocate NPC datasets",
    steps: [
      "mv npc-datasets/* datasets/npc/  (move all NPC dataset dirs + manifest + training script)",
      "Remove empty npc-datasets/ directory",
      "Update training pipeline import path (train-npc-loras.js references __dirname + '../npc-datasets')",
      "Update NPC_DIALOGUE_SYSTEM_README.md file paths",
      "Update AGENTS.md file paths",
    ],
    verification: [
      "ls datasets/npc/ → butler, chef, guard, maid, merchant, tavern_keep, npc_manifest.json, train-npc-loras.js",
      "ls npc-datasets/ → 'No such file'",
    ],
    risk: "moderate — train-npc-loras.js has __dirname-relative paths that change",
  },
  {
    id: "B5",
    title: "Relocate training script → scripts/",
    steps: [
      "mv datasets/npc/train-npc-loras.js scripts/train/npc-loras.js",
      "Update internal paths (__dirname goes from npc-datasets/ to scripts/train/ — recalculate NPCDATA and PROJECT_ROOT)",
      "Update README references",
    ],
    verification: [
      "node --check scripts/train/npc-loras.js → OK",
    ],
    risk: "moderate — path arithmetic changes",
  },
  {
    id: "B6",
    title: "Link docs/plans/ → .hermes/plans/ for Hermes access",
    steps: [
      "Create docs/plans/ directory",
      "Copy (or symlink) current plan files: cp .hermes/plans/archive/* docs/plans/",
      "Note: .hermes/plans/ is Hermes-native; docs/plans/ is for human readers",
    ],
    verification: [
      "ls docs/plans/ → contains plan files",
    ],
    risk: "none",
  },
];

// =================================================================
// PHASE C — Standardize Configuration & Presets
// =================================================================
// Make model configs sharable, env vars predictable, and presets
// discoverable.

const PHASE_C = [
  {
    id: "C1",
    title: "Create model presets system",
    steps: [
      "Create config/presets/ directory",
      "For each of the 4 active models, create a preset JSON:",
      "  config/presets/default-llm.json — Qwen3 1.7B @ ctx=4096, gpu_layers=99",
      "  config/presets/fast-llm.json    — Llama 3.2 1B @ ctx=4096, gpu_layers=99",
      "  config/presets/quality-llm.json — Qwen3 4B @ ctx=4096, gpu_layers=99",
      "  config/presets/tiny-llm.json    — Qwen3 600M @ ctx=4096, gpu_layers=99",
      "Each preset contains ONLY model-specific overrides:",
      '  { "model": "QWEN3_1_7B_INST_Q4", "ctx_size": 4096, "gpu_layers": 99, "device": "gpu" }',
      "Create config/presets/README.md documenting the format",
    ],
    verification: [
      "ls config/presets/*.json | wc -l → 4",
      "node -e \"JSON.parse(require('fs').readFileSync('config/presets/default-llm.json'))\" → OK",
    ],
    risk: "none — additive, no existing code depends on presets yet",
  },
  {
    id: "C2",
    title: "Standardize environment variable conventions",
    steps: [
      "Define these env vars (document in AGENTS.md):",
      "  QVAC_HOME=${QVAC_HOME:-/mnt/data/projects/QVAC}",
      "  QVAC_MODELS=${QVAC_HOME}/.qvac/models",
      "  QVAC_PORT=${QVAC_PORT:-11435}",
      "  QVAC_ROUTER_PORT=${QVAC_ROUTER_PORT:-3001}",
      "  QVAC_DASHBOARD_PORT=${QVAC_DASHBOARD_PORT:-3000}",
      "  QVAC_CACHE=${QVAC_CACHE:-${QVAC_HOME}/.qvac/cache}",
      "  QVAC_DEFAULT_MODEL=${QVAC_DEFAULT_MODEL:-default-llm}",
      "  QVAC_HYPERSWARM_SEED  (already defined for iOS P2P identity)",
      "Update config/presets/loader.js utility (to be created) to read from env with fallbacks",
      "Document in AGENTS.md under 'Environment Variables'",
    ],
    verification: [
      "grep 'QVAC_HOME' AGENTS.md → line found",
      "grep 'QVAC_DEFAULT_MODEL' AGENTS.md → line found",
    ],
    risk: "low — additive, no existing code hardcodes these (yet)",
  },
  {
    id: "C3",
    title: "Create config loader utility",
    steps: [
      "Create scripts/lib/config.js with:",
      "  export function resolveModelPreset(alias) → loads config/presets/<alias>.json",
      "  export function env(key, defaultVal) → reads env with fallback",
      "  export function projectRoot() → resolves ${QVAC_HOME} or detects from __dirname",
      "This becomes the single source of truth for all paths/configs",
    ],
    verification: [
      "node -e \"import('./scripts/lib/config.js').then(m => console.log(Object.keys(m)))\" → ['resolveModelPreset', 'env', 'projectRoot']",
    ],
    risk: "low — additive, existing files don't import it yet",
  },
];

// =================================================================
// PHASE D — Storage, Container Strategy & Skills
// =================================================================
// Make paths predictable, create reusable skills so agents don't
// rediscover everything from scratch.

const PHASE_D = [
  {
    id: "D1",
    title: "Standardize storage hierarchy on /mnt/data",
    steps: [
      "Already established: /mnt/data/projects/QVAC/.qvac/models/ for GGUF cache",
      "Document in AGENTS.md that ALL model files live under .qvac/models/",
      "TODO: if Unity needs access, ln -s /mnt/data/projects/QVAC/.qvac/models Unity/StreamingAssets/models",
      "Standardize also:",
      "  /mnt/data/projects/QVAC/artifacts/     — training outputs",
      "  /mnt/data/projects/QVAC/artifacts/lora/ — LoRA adapters",
      "  /mnt/data/projects/QVAC/artifacts/logs/ — training logs",
    ],
    verification: [
      "ls -la /mnt/data/projects/QVAC/.qvac/models/ → .gguf files",
      "grep '.qvac/models' AGENTS.md → documented",
    ],
    risk: "none",
  },
  {
    id: "D2",
    title: "Create Hermes skill for QVAC context",
    steps: [
      "Create skill named 'qvac' (skill_manage action='create') with:",
      "  Frontmatter: name=qvac, category=mlops/models",
      "  Content: summary of QVAC project structure, key commands, common workflows",
      "  Include: startup commands, NPC training, benchmark commands",
      "  Include: path to AGENTS.md for full context",
      "Save (via skill_manage) so every new session has immediate context",
    ],
    verification: [
      "skill_view(name='qvac') → returns SKILL.md content",
    ],
    risk: "none",
  },
  {
    id: "D3",
    title: "Fix Cognee database lock + establish QVAC project context",
    steps: [
      "The Cognee lock issue is from concurrent sessions accessing the same graph DB",
      "Fix: run this to clear stale locks:",
      "  rm -f /home/athar/.hermes/cognee/system/databases/cognee_graph_ladybug.wal",
      "  rm -f /home/athar/.hermes/cognee/system/databases/cognee_graph_ladybug",
      "After clearing, re-store QVAC facts:",
      "  cognee_set_project(project='qvac')",
      "  cognee_conclude(conclusion='QVAC project at /mnt/data/projects/QVAC. Unified server on :11435. No Ollama/LocalAI. 4 models. NPC dialogue system with 6 NPCs. Dashboard :3000.')",
      "Set up cron job for periodic health check:",
      "  cronjob(action='create', schedule='every 30m', prompt='Check QVAC server health and log any issues...')",
    ],
    verification: [
      "cognee_profile(project='qvac') → returns project context",
    ],
    risk: "low — Cognee graph DB recreates on first write",
  },
  {
    id: "D4",
    title: "Standardize Unity project access paths",
    steps: [
      "The Unity project is at /mnt/data/Projects_SSD/Unity_Projects/Unity_Linux_LLM/",
      "  — outside the QVAC workspace, accessed via GladeKit MCP",
      "Create a manifest file documenting the bridge:",
      "  docs/unity-bridge.md with GladeKit MCP tool reference",
      "Document the shared model path: Unity can access .qvac/models/ via symlink or copy",
      "Add to AGENTS.md: Unity project path + GladeKit usage pattern",
    ],
    verification: [
      "ls docs/unity-bridge.md → exists",
      "grep 'GladeKit' AGENTS.md → documented",
    ],
    risk: "none",
  },
];

// =================================================================
// PHASE E — Reliability Base
// =================================================================
// Infrastructure for production-readiness.

const PHASE_E = [
  {
    id: "E1",
    title: "Initialize Git repository",
    steps: [
      "cd /mnt/data/projects/QVAC && git init",
      "Ensure .gitignore covers: node_modules/, .qvac/models/, .qvac/tmp/, .env, artifacts/lora/",
      "git add -A && git commit -m 'Initial: QVAC project base — unified server, dashboard, NPC system'",
    ],
    verification: [
      "git status → 'nothing to commit, working tree clean'",
      "git log --oneline → 1 commit",
    ],
    risk: "none — .gitignore already exists, no secrets exposed",
  },
  {
    id: "E2",
    title: "Add startup health check script",
    steps: [
      "Create scripts/health.js with:",
      "  1. Check QVAC :11435 /v1/models responds",
      "  2. Check Router :3001 /health responds",
      "  3. Check Dashboard :3000 /api/health responds",
      "  4. Check VRAM available (nvidia-smi)",
      "  5. Verify at least one model accessible",
      "Return pass/fail per check + summary",
    ],
    verification: [
      "node scripts/health.js → structured JSON with per-check status",
      "Exit code 0 = all healthy, non-zero = warnings/errors",
    ],
    risk: "low",
  },
  {
    id: "E3",
    title: "Update systemd service files for new paths",
    steps: [
      "Update config/systemd/qvac-mdns.service to point to services/mdns/publish.sh",
      "Create config/systemd/qvac-server.service for services/server.js",
      "Create config/systemd/qvac-router.service for services/router/gateway.js",
      "Each service file: WorkingDirectory=/mnt/data/projects/QVAC, ExecStart=node <path>",
    ],
    verification: [
      "ls config/systemd/*.service → 3 files",
      "grep 'WorkingDirectory' config/systemd/qvac-server.service → /mnt/data/projects/QVAC",
    ],
    risk: "low — not auto-installed, user must systemctl enable manually",
  },
  {
    id: "E4",
    title: "Add smoke test for NPC training pipeline syntax",
    steps: [
      "Add to smoke-test.js:",
      "  `node --check scripts/train/npc-loras.js` (after relocation)",
      "  Check npc_manifest.json is valid JSON",
      "  Check all datasets/npc/*/train/conversations.jsonl are valid",
      "This ensures `npm test` catches dataset or pipeline regressions",
    ],
    verification: [
      "npm test → passes, includes dataset validation",
    ],
    risk: "low",
  },
];

// =================================================================
// EXECUTION ORDER
// =================================================================
// ┌──────────────────────────────────────────────────────────┐
// │ Phase A (low risk, high impact) → Phase B (moderate      │
// │ risk) → Phase C (additive) → Phase D (additive) →        │
// │ Phase E (infrastructure)                                 │
// │                                                          │
// │ Safe to stop after any phase — no cascading failures.    │
// └──────────────────────────────────────────────────────────┘

// =================================================================
// VERIFICATION COMMANDS (run after all phases)
// =================================================================
const FINAL_VERIFICATION = [
  "npm test → 11+ assertions pass (including dataset validation)",
  "node scripts/health.js → all services healthy",
  "git status → clean",
  "find . -path ./node_modules -prune -o -name '*.js' -print | xargs node --check 2>&1 | grep -c error → 0",
  "grep -r '11434\\|8080' --include='*.js' --include='*.json' --include='*.sh' --include='*.md' . | grep -v node_modules | grep -v '.git' | grep -v 'REMOVED' | wc -l → 0",
  "ls services/ config/presets/ datasets/npc/ scripts/train/ docs/plans/ artifacts/lora/ → all exist",
  "skill_view(name='qvac') → returns skill content",
];

// =================================================================
// EXPORT
// =================================================================
export { PHASE_A, PHASE_B, PHASE_C, PHASE_D, PHASE_E, FINAL_VERIFICATION };

console.log(`
╔══════════════════════════════════════════════════════════════╗
║             QVAC REORGANIZATION PLAN — READY                ║
║                                                            ║
║  Phase A: Remove stale code     (4 steps, low risk)        ║
║  Phase B: Reorganize folders    (6 steps, moderate risk)   ║
║  Phase C: Standardize config    (3 steps, additive)        ║
║  Phase D: Storage & skills      (4 steps, additive)        ║
║  Phase E: Reliability base      (4 steps, additive)        ║
║                                                            ║
║  Total: 21 steps across 5 phases                           ║
╚══════════════════════════════════════════════════════════════╝
`);
