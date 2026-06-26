# QVAC Best Configs for RTX 3060 Laptop (6 GB VRAM)

> Compiled: 2026-06-26
> System: Pop!_OS 24.04 | Node.js v24.16.0 | QVAC SDK v0.13.5
> GPU: NVIDIA RTX 3060 Laptop (6 GB VRAM) — Vulkan 1.4.329, Driver 595.84
> RAM: 32 GB | SSD cache: `/mnt/data/projects/QVAC/.qvac/models`

---

## VRAM Budget

| Component | Usage |
|-----------|-------|
| OS + Display (COSMIC/Wayland) | ~3,405 MiB |
| **Available for models** | **~2,739 MiB** |
| Absolute max before OOM | ~5,900 MiB |

**Key finding:** With 3.4 GB consumed by the OS/desktop, only ~2.7 GB is free at baseline. The QVAC engine + KV cache add overhead beyond the raw GGUF file size. A model file of ~2.5 GB (Qwen3 4B Q4_K_M) consumes ~2,398 MiB VRAM, leaving only ~341 MiB headroom (94.5% utilization).

---

## Text Generation — Model Rankings

| Rank | Model | GGUF Size | VRAM Δ | tok/s (short) | tok/s (medium) | Quality | Recommendation |
|------|-------|-----------|--------|---------------|----------------|---------|---------------|
| 🥇 | **QWEN3_4B_INST_Q4_K_M** | 2,497 MB | 2,398 MiB | 30.9 | 19.9 | ⭐⭐⭐⭐⭐ | **Best quality for 6 GB** |
| 🥈 | **QWEN3_1_7B_INST_Q4** | 1,057 MB | 1,774 MiB | 156.8 | 150.0 | ⭐⭐⭐⭐ | **Best speed/quality balance** |
| 🥉 | **LLAMA_3_2_1B_INST_Q4_0** | 773 MB | 1,138 MiB | 164.6 | 231.8 | ⭐⭐⭐ | **Fastest for simple tasks** |
| 4 | **QWEN3_600M_INST_Q4** | 382 MB | 1,137 MiB | 265.0 | 275.6 | ⭐⭐½ | **Fastest overall, decent for simple Q&A** |
| — | BITNET_1B_INST_TQ2_0 | 835 MB | 1,812 MiB | ❌ | ❌ | — | **Fails — native ctx too small** |
| — | SALAMANDRATA_2B_INST_Q4 | 1,518 MB | 1,918 MiB | 57.6 | 32.7 | ⭐ | **Spanish/Catalan only — poor English** |
| — | LASER_DOLPHIN_2X7B_Q2_K | 4,761 MB | 2,186 MiB | 7.5 | ❌ | ⭐⭐⭐⭐ | **Too slow at gpu_layers=16** |
| — | QWEN3_8B_INST_Q4_K_M | 5,028 MB | 2,184 MiB | 9.4 | ❌ | ⭐⭐⭐⭐⭐ | **Too slow at gpu_layers=16** |

### Recommended Configurations

#### Primary: QWEN3_4B_INST_Q4_K_M — Best Quality
```json
{
  "modelSrc": "QWEN3_4B_INST_Q4_K_M",
  "modelConfig": {
    "ctx_size": 4096,
    "gpu_layers": 99,
    "device": "gpu"
  }
}
```
- **VRAM peak:** 5,803/6,144 MiB (94.5%)
- **Short prompts:** ~31 tok/s, ~15s for 466 tokens (with think block)
- **Long/medium prompts:** ~20 tok/s sustained
- **Quality:** Excellent — coherent, detailed, follows instructions well
- **⚠️ Caveat:** ctx_size=1024 causes context overflow on medium prompts due to Qwen think template overhead. Always use ctx_size ≥ 2048 (4096 recommended).
- **⚠️ Caveat:** Only ~341 MiB headroom — avoid running GPU-heavy apps simultaneously

#### Balanced: QWEN3_1_7B_INST_Q4 — Best Speed/Quality
```json
{
  "modelSrc": "QWEN3_1_7B_INST_Q4",
  "modelConfig": {
    "ctx_size": 4096,
    "gpu_layers": 99,
    "device": "gpu"
  }
}
```
- **VRAM peak:** 5,179/6,144 MiB (84.3%)
- **Short prompts:** ~157 tok/s, ~2s for 300 tokens (with think block)
- **Long prompts:** ~150 tok/s, ~18s for 2,700 tokens
- **VRAM headroom:** ~965 MiB — comfortable
- **Quality:** Very good for a 1.7B model. Qwen3 architecture is strong.
- **Best for:** everyday use, chat, code, moderate reasoning

#### Fast: LLAMA_3_2_1B_INST_Q4_0 — Simple Tasks
```json
{
  "modelSrc": "LLAMA_3_2_1B_INST_Q4_0",
  "modelConfig": {
    "ctx_size": 4096,
    "gpu_layers": 99,
    "device": "gpu"
  }
}
```
- **VRAM peak:** 4,543/6,144 MiB (73.9%)
- **Short prompts:** ~165 tok/s, instant
- **Long prompts:** ~232 tok/s, ~3s for 700 tokens
- **VRAM headroom:** ~1,601 MiB — lots of room for concurrent multitasking
- **Best for:** classification, simple extraction, real-time chat, background tasks

#### Speed King: QWEN3_600M_INST_Q4 — Maximum Throughput
```json
{
  "modelSrc": "QWEN3_600M_INST_Q4",
  "modelConfig": {
    "ctx_size": 4096,
    "gpu_layers": 99,
    "device": "gpu"
  }
}
```
- **VRAM peak:** 4,542/6,144 MiB (73.9%)
- **Short prompts:** 265 tok/s — fastest observed
- **Long prompts:** 276 tok/s — fastest observed
- **Quality:** Decent for a 0.6B model. Qwen think template helps reasoning.
- **Best for:** high-throughput batch processing, simple Q&A, constrained environments

---

## Key Findings

### 1. Context Window Limits
Many models fail at ctx_size=1024 for prompts over ~100 tokens. The Qwen think template (`<think>...</think>`) adds ~50-150 tokens of overhead per prompt. **Always set ctx_size ≥ 2048** for Qwen models.

| Model | Recommended min ctx_size |
|-------|------------------------|
| All Qwen3 models | 4096 (native 32K+ support) |
| Llama 3.2 1B | 4096 (native 8K support) |
| BitNet 1B | 1024 (native limit — avoid) |
| SalamandraTA 2B | 4096 |

### 2. Large Models — Not Practical on 6 GB
Models over 3 GB GGUF file size require `gpu_layers < 99` which forces CPU fallback for most layers. At gpu_layers=16:
- **7-10 tok/s** — 5-10× slower than fully-offloaded models
- **Generation times over 1 minute** for medium responses
- **System RAM used heavily** — 32 GB RAM helps but CPU inference is much slower
- **Recommendation:** Skip 8B+ models on 6 GB VRAM. The Qwen3 4B at full GPU offload gives better quality-per-second than an 8B model at partial offload.

### 3. Model Exclusions
| Model | Reason to Exclude |
|-------|-------------------|
| **BITNET_1B_INST_TQ2_0** | Native context window (1024) is too small — fails even on short prompts. Not practically usable. |
| **SALAMANDRATA_2B_INST_Q4** | Spanish/Catalan focused — English output is broken (translates instead of answering, outputs only 10-18 tokens). |
| **LASER_DOLPHIN_2X7B_INST_Q2_K** | 4.76 GB file + MoE architecture. At gpu_layers=16: only 7.5 tok/s. 2× slower than 4B Qwen with no quality benefit at Q2_K quantization. |
| **QWEN3_8B_INST_Q4_K_M** | 5.03 GB file. At gpu_layers=16: only 9.4 tok/s. Takes 452s to download, then 37s for a short prompt. Not practical. |

### 4. Download & Cache Performance
- **Download speed:** ~150-200 Mbps via P2P registry (QVAC's BlobStore)
- **Initial download:** 382 MB (Qwen 600M) = 27s / 2.5 GB (Qwen 4B) = 166s / 5 GB (Qwen 8B) = 451s
- **Cached loads:** 2-5 seconds for all models (from SSD)
- **SSD cache path:** `/mnt/data/projects/QVAC/.qvac/models` (on `/mnt/data` SSD)
- **Total cache used:** ~14 GB (all 8 models)

---

## Phase 1 Benchmark Data (Raw)

### QWEN3_600M_INST_Q4
| ctx | VRAM Δ | Short tok/s | Short tokens | Short ms | Medium tok/s | Medium tokens | Medium ms |
|-----|--------|-------------|-------------|----------|--------------|--------------|-----------|
| 1024 | 791 MiB | 84.8 | 172 | 2,028 | ❌ overflow | — | — |
| 4096 | 1,137 MiB | 265.0 | 190 | 717 | 275.6 | 1,801 | 6,534 |

### BITNET_1B_INST_TQ2_0
| ctx | VRAM Δ | Short | Medium |
|-----|--------|-------|--------|
| 1024 | 1,073 MiB | ❌ overflow | — |
| 4096 | 1,812 MiB | ❌ overflow (68s to fail) | — |

### LLAMA_3_2_1B_INST_Q4_0
| ctx | VRAM Δ | Short tok/s | Short tokens | Short ms | Medium tok/s | Medium tokens | Medium ms |
|-----|--------|-------------|-------------|----------|--------------|--------------|-----------|
| 1024 | 1,038 MiB | 174.2 | 38 | 218 | ❌ overflow | — | — |
| 4096 | 1,138 MiB | 164.6 | 35 | 213 | 231.8 | 700 | 3,019 |

### QWEN3_1_7B_INST_Q4
| ctx | VRAM Δ | Short tok/s | Short tokens | Short ms | Medium tok/s | Medium tokens | Medium ms |
|-----|--------|-------------|-------------|----------|--------------|--------------|-----------|
| 1024 | 1,438 MiB | 145.5 | 149 | 1,024 | ❌ overflow | — | — |
| 4096 | 1,774 MiB | 156.8 | 301 | 1,920 | 150.0 | 2,697 | 17,977 |

### SALAMANDRATA_2B_INST_Q4
| ctx | VRAM Δ | Short tok/s | Short tokens | Short ms | Medium tok/s | Medium tokens | Medium ms |
|-----|--------|-------------|-------------|----------|--------------|--------------|-----------|
| 1024 | 1,846 MiB | 40.4 | 17 | 421 | 48.9 | 10 | 204 |
| 4096 | 1,918 MiB | 57.6 | 18 | 313 | 32.7 | 10 | 306 |

### QWEN3_4B_INST_Q4_K_M
| ctx | VRAM Δ | Short tok/s | Short tokens | Short ms | Medium tok/s | Medium tokens | Medium ms |
|-----|--------|-------------|-------------|----------|--------------|--------------|-----------|
| 1024 | 2,398 MiB | 28.1 | 317 | 11,267 | ❌ overflow | — | — |
| 4096 | 2,398 MiB | 30.9 | 466 | 15,067 | 19.9 | 2,261 | 113,437 |

### LASER_DOLPHIN_2X7B_INST_Q2_K (gpu_layers=16, ctx=4096)
| VRAM Δ | Short tok/s | Short tokens | Short ms | Medium |
|--------|-------------|-------------|----------|--------|
| 2,186 MiB | 7.5 | 109 | 14,546 | ❌ timed out (>600s) |

### QWEN3_8B_INST_Q4_K_M (gpu_layers=16, ctx=4096)
| VRAM Δ | Short tok/s | Short tokens | Short ms | Medium |
|--------|-------------|-------------|----------|--------|
| 2,184 MiB | 9.4 | 345 | 36,658 | ❌ timed out (>600s) |

---

## Notes for Future Phases

- **For embeddings + RAG (Phase 2):** Embedding models are tiny (~300 MB). Expect fast performance. Cache them alongside LLMs in the SSD cache.
- **For multimodal (Phase 3):** Gemma4 2B multimodal is ~1.5 GB — should fit well. The LLM + projection model pattern means loading two models, which may push VRAM. Consider using SmolVLM2 500M first.
- **For transcription (Phase 4):** Whisper Tiny/Base are very small (<200 MB). Should work easily.
- **For TTS (Phase 5):** GGML TTS models are small (<500 MB). Chatterbox T3 + S3Gen companion may need ~1 GB total.
- **For image gen (Phase 6):** SD v2.1 1B Q8_0 (~1 GB) at full GPU offload should work. SDXL (~3 GB) will be tight.
- **System RAM is plentiful (32 GB):** CPU fallback layers for large models use system RAM, which is fine. The bottleneck is GPU VRAM.
