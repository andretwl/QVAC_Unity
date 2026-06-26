# QVAC Project — Agent Context File
# This file helps Hermes agents/subagents understand the project
# and prevents redundant probing when entering this workspace.

## Project Identity
- **Name:** QVAC
- **Path:** /mnt/data/projects/QVAC
- **Purpose:** On-device AI stack using QVAC SDK v0.13.5 for LLM serving, LoRA fine-tuning, and Unity NPC dialogue integration
- **Cache:** /mnt/data/projects/QVAC/.qvac/models (SSD, ~14 GB used)
- **Node.js:** v24.16.0 (ESM mode — "type": "module" in package.json)
- **Architecture principle:** All inference runs natively via QVAC's llama.cpp backend — no Ollama, no LocalAI proxies

## Hardware
- GPU: NVIDIA RTX 3060 Laptop (6 GB VRAM, Vulkan 1.4.329, Driver 595.84)
- OS: Pop!_OS 24.04 (COSMIC/Wayland)
- RAM: 32 GB
- Storage: 894 GB SSD at /mnt/data (230 GB used, 641 GB free)
- Vulkan: 1.4.329 for NVIDIA, 1.4.348 for Intel UHD (via Mesa 26.1.3)

## URIs & Ports
| Service | Port | Command |
|---------|------|---------|
| QVAC Unified HTTP API | **11435** | `node monitoring/qvac-unified-server.js` |
| Web Dashboard | **3000** | Auto-started by unified server (HTTP) |
| Model Router | **3001** | Auto-started by unified server (HTTP) |
| Pear Runtime Bridge | **64349** | Auto-started (GUI for iOS P2P) |
| mDNS | _qvac._tcp | Auto-advertised by unified server |
| ~~Ollama~~ | ~~11434~~ | **REMOVED** — dismantled, not in use |
| ~~LocalAI~~ | ~~8080~~ | **REMOVED** — dismantled, not in use |

## SDK
- Package: @qvac/sdk ^0.13.5
- Config: qvac.config.json (cacheDirectory on SSD, console logging enabled)
- Test: `npm test` runs smoke-test.js (11 assertions)
- Quickstart: node quickstart.js
- Benchmark: node benchmarks/benchmark.js <MODEL_NAME>
- Finetune API: `import { finetune } from "@qvac/sdk"` (LoRA training)

## VRAM Baseline
- OS + COSMIC + USB monitors: ~3,405 MiB baseline
- Available for models: ~2,739 MiB
- Absolute max before OOM: ~5,900 MiB

## Configured Models (qvac.config.json)
| Alias | Model | Size | tok/s | Use Case |
|-------|-------|------|-------|----------|
| `default-llm` | QWEN3_1_7B_INST_Q4 | 1,057 MB | ~160 | Best speed/quality balance (default) |
| `fast-llm` | LLAMA_3_2_1B_INST_Q4_0 | 773 MB | ~256 | Fastest for simple/realtime tasks |
| `quality-llm` | QWEN3_4B_INST_Q4_K_M | 2,497 MB | ~31 | Best quality (94.5% VRAM) |
| `tiny-llm` | QWEN3_600M_INST_Q4 | 382 MB | ~203 | Speed king, simple Q&A |

See: BEST-CONFIGS.md for full benchmark data with raw numbers.

## Key Technical Findings
- Qwen models need ctx_size ≥ 4096 due to think template overhead
- BITNET_1B native ctx=1024 too small — don't use
- SALAMANDRATA_2B is Spanish/Catalan only — skip for English
- 8B+ models too slow at partial GPU offload (~9 tok/s) — skip
- Model constants are Objects, not strings — pass directly to modelSrc

## Unified Server (Current Architecture)

### Startup
```bash
# Single command starts all services
cd /mnt/data/projects/QVAC && node monitoring/qvac-unified-server.js
```
This spawns: HTTP inference API (:11435), P2P Peer provider (for iOS), mDNS advertising (Bonjour), Pear Runtime GUI, Web Dashboard (:3000), Model Router (:3001).

### Components

**QVAC API** (:11435) — llama.cpp-based HTTP inference server. Exposes OpenAI-compatible endpoints:
```bash
curl http://localhost:11435/v1/models
curl http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "default-llm", "messages": [{"role": "user", "content": "Hello"}]}'
```

**Web Dashboard** (:3000) — Clean UI showing only:
- Server status: **QVAC** (:11435) and **Router** (:3001) badges
- Unified model list (auto-discovered via router)
- VRAM gauge with GPU temp/utilization
- Streaming chat playground with model selector
- Quick test prompts + embeddings/VRAM tests
- iOS setup page at /ios.html (P2P sync key + QR)

**Model Router** (:3001) — Unified API gateway that auto-discovers models from QVAC backend:
```bash
curl http://localhost:3001/v1/models
curl http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "default-llm", "messages": [{"role": "user", "content": "Hello"}]}'
curl http://localhost:3001/health
```

### iOS Integration (P2P)
QVAC's iOS P2P integration uses the **Pear Runtime** peer-to-peer protocol — NOT HTTP URL connections. The desktop runs a Pear provider that pairs with the iOS QVAC app via:
- mDNS/Bonjour advertising (discoverable as `QVAC Server on pop-os`)
- P2P sync key derived from `QVAC_HYPERSWARM_SEED` env var
- Pairing via iOS app's "Sync with another device" flow
- QR code and pairing guide at: http://localhost:3000/ios.html

LAN IPs: `192.168.0.6` (Ethernet), `192.168.0.9` (Wi-Fi)
mDNS: `pop-os.local`

## NPC Dialogue System (New)

A full pipeline for personality-rich NPC dialogue using QVAC LoRA + Unity LLMUnity:

### Datasets
6 NPCs with training/validation conversation data:
| NPC | Style | Train/Val |
|-----|-------|-----------|
| **Merchant** (Grimble) | Chatty dwarf shopkeep | 8/2 |
| **Guard** (Captain Voss) | Stern, duty-focused | 7/2 |
| **Tavern Keep** (Marta) | Warm, motherly | 6/2 |
| **Butler** | Sarcastic AI butler | 176/45 |
| **Maid** | Cheerful AI maid | 176/45 |
| **Chef** | Angry AI chef (state machine) | 3/1 |

### Training Pipeline
```bash
node npc-datasets/train-npc-loras.js --all
```
Uses QVAC `finetune()` API to produce GGUF LoRA adapters per NPC.

### Unity Integration
- **Script:** `Assets/Scripts/NPCDialogueManager.cs` — compiles clean, manages NPC switching, LoRA loading, RAG enrichment
- **Scene hook:** `NPCDialogueSystem` GameObject in KnowledgeBaseGameScene, wired to existing LLM/LLMAgent/RAG
- **LoRA loading:** Uses `LLM.AddLora(path, weight)` for hot-swap per NPC
- **RAG:** Knowledge base retrieval enriches NPC responses

### Quick Reference
```bash
# Train NPC LoRAs
node npc-datasets/train-npc-loras.js --npc merchant

# Copy to Unity StreamingAssets
cp artifacts/lora/merchant/*.gguf /path/to/Unity/StreamingAssets/loras/
```

## Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `QVAC_HOME` | `/mnt/data/projects/QVAC` | Project root |
| `QVAC_PORT` | `11435` | Inference API port |
| `QVAC_ROUTER_PORT` | `3001` | Model router port |
| `QVAC_DASHBOARD_PORT` | `3000` | Dashboard port |
| `QVAC_DEFAULT_MODEL` | `default-llm` | Default model alias |
| `QVAC_HYPERSWARM_SEED` | *(none)* | P2P identity seed for iOS pairing |
| `QVAC_MODELS` | `${QVAC_HOME}/.qvac/models` | Model cache directory |
| `QVAC_CACHE` | `${QVAC_HOME}/.qvac/cache` | General cache directory |

Config presets: `config/presets/<alias>.json` — the canonical model config source.
Config loader: `scripts/lib/config.js` — resolves paths from env with fallbacks.

## Conventions
- All tests use `npm test` (smoke-test.js, 11 assertions)
- `npm run build` not used — scripts run directly with `node`
- Model configs: qvac.config.json
- Benchmark results: benchmarks/phase1-results.md and BEST-CONFIGS.md
- NPC dataset structure: npc-datasets/<npc>/{train,validation}/conversations.jsonl
- LoRA artifacts: artifacts/lora/<npc>/
- Integration plan: LLM-UNITY-INTEGRATION-PLAN.md
- NPC system docs: NPC_DIALOGUE_SYSTEM_README.md
- Hermes plans: .hermes/plans/
- Agent memories: stored via hermes memory tool + cognee

## Useful Commands
```bash
# Start everything
node monitoring/qvac-unified-server.js

# Quick test
npm test

# Check VRAM
nvidia-smi --query-gpu=memory.used,memory.total,temperature.gpu,utilization.gpu --format=csv,noheader,nounits

# List cached models
ls .qvac/models/

# Run benchmark
node benchmarks/benchmark.js QWEN3_4B_INST_Q4_K_M

# Train NPC LoRA
node npc-datasets/train-npc-loras.js --all
```
