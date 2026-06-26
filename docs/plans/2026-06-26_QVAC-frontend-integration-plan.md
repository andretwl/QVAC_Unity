# QVAC Frontend & Integration Plan

> **Date:** 2026-06-26
> **Context:** QVAC SDK v0.13.5 running on RTX 3060 6GB (Pop!_OS 24.04)
> **Servers already running:** LocalAI (:8080), Ollama (:11434), QVAC (:11435), Unity (:8765)

---

## System Overview — Current State

```
This Computer (athar)
├── Ollama :11434          — llama3.1:8b, qwen3:14b
├── LocalAI :8080 (Docker) — gemma-4-12b-it-qat-q4_0
├── QVAC HTTP :11435       — Qwen3 1.7B (preloaded), Llama 3.2 1B, Qwen3 4B, Qwen3 600M
├── Unity :8765            — Game dev
└── iPhone: QVAC iOS App  — On-device models, can connect via P2P
```

## Port Allocation (No Conflicts)

| Port | Service | Status | Notes |
|------|---------|--------|-------|
| 8080 | LocalAI (Docker) | 🟢 Active | gemma-4-12b via CUDA |
| 8765 | Unity Editor | 🟢 Active | Game dev |
| 11434 | Ollama | 🟢 Active | llama3.1:8b, qwen3:14b |
| **11435** | **QVAC HTTP Server** | **🟢 Active** | **Our QVAC models** |
| 3000 | QVAC Dashboard | 🟢 Active | Web UI frontend (Phase 1) |
| 3001 | QVAC API Gateway | 🟢 Active | Unified model router (Phase 2) |

**Rule:** Never use 11434 (Ollama), 8080 (LocalAI), 8765 (Unity). Keep QVAC at 11435.

---

## The Frontend Approach

QVAC does NOT have a built-in GUI. Available frontend patterns:

### Option A: Lightweight Web Dashboard (Recommended — Phase 1)
Pure HTML/CSS/JS dashboard served locally. No build step. Talks to QVAC's OpenAI-compatible API at `:11435`. Shows:
- Which model is loaded / VRAM state
- Model selector (switch between fast-llm, quality-llm, etc.)
- Chat playground with streaming
- Quick test prompts
- System health

### Option B: Electron Desktop App
Follow the [QVAC Electron tutorial](https://docs.qvac.tether.io/tutorials/electron/) to build a full desktop app with React + Tailwind. More polished, heavier setup.

### Option C: @qvac/ai-sdk-provider + Vercel AI SDK
Use the [@qvac/ai-sdk-provider](https://www.npmjs.com/package/@qvac/ai-sdk-provider) (v0.2.2) for a React-based frontend with streaming, tool calling, and all QVAC capabilities.

### Option D: Use existing OpenAI-compatible tools
Point tools like Open WebUI, LibreChat, or Continue.dev at `http://localhost:11435/v1`. Zero frontend code needed.

---

## Phase 1: Web Dashboard (Days 1-2)

### 1.1 Create the Dashboard
Single-page HTML app (`frontend/index.html`) that:
- Fetches `GET /v1/models` to list available models
- Shows which model is currently loaded + VRAM usage
- Chat playground with streaming
- Preset test prompts for each capability
- Server health info

Tech: Vanilla HTML/CSS/JS → zero build, served by a simple Node.js http server on port 3000.

### 1.2 Add Health Endpoint
A QVAC script (`frontend/health.js`) that exposes:
- VRAM status (nvidia-smi query)
- Which models are actually in GPU memory
- Server uptime

### 1.3 Serve the Dashboard
Simple Node.js static file server on port 3000.

---

## Phase 2: Unified Model Router (Days 3-5)

Your system has 3 AI backends. Build a smart router that:

### 2.1 Model Discovery
Auto-discovers models from all 3 backends:
- `GET /api/tags` from Ollama :11434
- `GET /v1/models` from LocalAI :8080  
- `GET /v1/models` from QVAC :11435

### 2.2 Unified API Gateway (:3001)
A lightweight Node.js proxy that:
- Exposes one OpenAI-compatible endpoint
- Routes requests to the correct backend by model name
- Falls back gracefully on failure
- Tracks which backend served what

### 2.3 Smart Routing Logic
```
Request for "llama3.1:8b"       → Ollama :11434
Request for "gemma-4-12b"       → LocalAI :8080
Request for "default-llm"       → QVAC :11435 (preloaded)
Request for "fast-llm"          → QVAC :11435 (cold-start)
Request for "quality-llm"       → QVAC :11435 (cold-start)
Fallback/default               → QVAC :11435 (preloaded)
```

---

## Phase 3: iOS Integration ✅ (Complete)

### 3.1 QVAC iOS App Capabilities
The QVAC iOS app (on the iPhone "workbench"):
- Runs models on-device (iPhone GPU/Neural Engine)
- Can connect to remote QVAC servers via P2P
- Can delegate inference to/from the desktop
- Participates in QVAC's blind relay network

### 3.2 P2P Setup for Desktop ↔ iPhone
QVAC supports **Delegated Inference** — P2P mechanisms where:
- Desktop can delegate inference to iPhone
- iPhone can delegate inference to desktop
- Both share model cache and compute

This requires:
1. Setting up P2P identity on the desktop
2. Configuring the iOS app with the desktop's network address
3. Testing delegated inference

### 3.3 Network Connectivity
For the iPhone to reach the desktop server:
- **Same LAN:** Use desktop's local IP (192.168.x.x:11435) — simplest
- **Remote:** Tailscale/ZeroTier VPN for encrypted tunnel
- **QVAC P2P:** May handle this transparently through blind relays

---

## Phase 4: Automation & Monitoring (Day 8+)

### 4.1 Systemd Service
Create `/etc/systemd/system/qvac-server.service`:
```
Runs: qvac serve openai --cors --docs --port 11435
Auto-restart: on-failure
Health check: /v1/models every 30s
```

### 4.2 VRAM Monitor
Background script that polls nvidia-smi every 30s, logs usage, alerts near OOM (>5,500 MiB).

### 4.3 Daily Cron Health Report
Summarize all 3 AI servers' status, VRAM, cached models — delivered to you.

---

## File Structure

```
/mnt/data/projects/QVAC/
├── frontend/
│   ├── index.html          ← Dashboard UI
│   ├── style.css           ← Dashboard styling
│   ├── app.js              ← Dashboard logic (API calls + streaming)
│   └── server.js           ← Static file server (port 3000)
├── router/
│   ├── gateway.js          ← Unified API gateway (port 3001)
│   └── router.config.json  ← Model routing rules
├── monitoring/
│   ├── health-server.js    ← Health endpoint for VRAM/system info
│   └── vram-monitor.js     ← Background VRAM polling + logging
├── config/
│   └── systemd/
│       └── qvac-server.service
├── AGENTS.md               ← Updated
├── qvac.config.json        ← Current (has all 4 models)
└── examples/
    ├── 04-model-router.js  ← API gateway example
    ├── 05-ios-p2p.js       ← P2P delegate inference example
    └── 06-vram-monitor.js  ← Monitoring script example
```

---

## Dashboard Features (in detail)

The frontend dashboard (`index.html`) will have:

1. **Server Status Bar** — Green/yellow/red indicators for QVAC, Ollama, LocalAI
2. **Model Panel** — Cards listing all available models across all servers, with size and quantization info
3. **Loaded Model Indicator** — Shows which model is currently in GPU memory + VRAM bar
4. **Model Selector** — Dropdown to switch active model (triggers load if needed)
5. **Chat Playground** — Full conversation with streaming, message history, clear/export
6. **Quick Test Buttons** — 8 preset prompts: summarize, write code, explain, translate, etc.
7. **Capability Test** — Dropdown to test non-LLM features: embeddings, image gen
8. **System Health** — VRAM gauge, GPU temp, uptime, last server restart

---

## API Reference Used

QVAC OpenAI-compatible endpoints (server at :11435):
- `GET /v1/models` — List models
- `POST /v1/chat/completions` — Text generation (streaming supported)
- `POST /v1/embeddings` — Text embeddings
- `POST /v1/images/generations` — Image generation
- `POST /v1/audio/speech` — TTS (requires ffmpeg)
- `POST /v1/audio/transcriptions` — Transcription (requires ffmpeg)

Custom health endpoints (added via health-server.js):
- `GET /health/vram` — Current VRAM usage
- `GET /health/servers` — All AI servers status (ping test)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| VRAM OOM when switching models | Unload current model first (DELETE /v1/models/:id), show VRAM bar |
| Dashboard port conflict | Use port 3000 (confirmed free via ss -tlnp) |
| iOS connectivity across network | Start with same LAN, then Tailscale for remote |
| Model router latency | Simple pass-through proxy — <1ms overhead |
| QVAC server crash | Systemd auto-restart + health check |
| All 3 servers competing for VRAM | One model at a time per backend; dashboard shows global VRAM |
| QVAC iOS app being redesigned | RVCE team — support channel;

---

## Success Criteria

1. ✅ Dashboard loads at localhost:3000 showing model status
2. ✅ Can select any QVAC model and run a streaming test prompt
3. ✅ VRAM monitor shows real-time GPU memory usage
4. ✅ Model router proxies requests to correct backend (Ollama/LocalAI/QVAC)
5. ✅ iPhone QVAC app can connect to desktop server (LAN test)
6. ✅ All existing servers (Ollama, LocalAI, Unity) remain unaffected
7. ✅ Systemd service keeps QVAC server alive across reboots
8. ✅ Daily health report delivered to chat
