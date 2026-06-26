# Phase 1: Text Generation Benchmarks

**Date:** 2026-06-26
**GPU:** NVIDIA RTX 3060 Laptop (6 GB VRAM) | Vulkan 1.4.329 | Driver 595.84
**System:** Pop!_OS 24.04 | Node.js v24.16.0 | @qvac/sdk ^0.13.5
**Cache:** /mnt/data/projects/QVAC/.qvac/models

---

## Results Summary

| Model | GGUF Size | ctx_size | Load ΔVRAM | Short tok/s | Medium tok/s | Quality | Verdict |
|-------|-----------|----------|-----------|-------------|--------------|---------|---------|
| **QWEN3_600M_INST_Q4** | 382 MB | 4096 | 1,137 MiB | 265.0 | 275.6 | ⭐⭐½ | Speed king |
| **BITNET_1B_INST_TQ2_0** | 835 MB | 4096 | 1,812 MiB | ❌ | ❌ | — | Native ctx too small |
| **LLAMA_3_2_1B_INST_Q4_0** | 773 MB | 4096 | 1,138 MiB | 164.6 | 231.8 | ⭐⭐⭐ | Simple tasks |
| **QWEN3_1_7B_INST_Q4** | 1,057 MB | 4096 | 1,774 MiB | 156.8 | 150.0 | ⭐⭐⭐⭐ | Best balance |
| **SALAMANDRATA_2B_INST_Q4** | 1,518 MB | 4096 | 1,918 MiB | 57.6 | 32.7 | ⭐ | Spanish-only |
| **QWEN3_4B_INST_Q4_K_M** | 2,497 MB | 4096 | 2,398 MiB | 30.9 | 19.9 | ⭐⭐⭐⭐⭐ | Best quality |
| **LASER_DOLPHIN_2X7B_Q2_K** | 4,761 MB | 4096* | 2,186 MiB | 7.5 | ❌ | — | Too slow |
| **QWEN3_8B_INST_Q4_K_M** | 5,028 MB | 4096* | 2,184 MiB | 9.4 | ❌ | — | Too slow |

*\* gpu_layers=16 for models > 4 GB (full offload not possible)*

---

## Detailed Results

### QWEN3_600M_INST_Q4

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 4,196 MiB | 791 MiB | Short | 84.8 | 172 | 2,028 | Think template uses ~50 tok overhead |
| 1024 | — | — | Medium | ❌ | — | — | Context overflow — ctx too small |
| 4096 | 4,542 MiB | 1,137 MiB | Short | 265.0 | 190 | 717 | Fastest short-prompt result |
| 4096 | 4,542 MiB | 1,137 MiB | Medium | 275.6 | 1,801 | 6,534 | Fastest medium-prompt result |

### BITNET_1B_INST_TQ2_0

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 4,478 MiB | 1,073 MiB | Short | ❌ | — | — | Context overflow immediately |
| 4096 | 5,217 MiB | 1,812 MiB | Short | ❌ | — | 68,579 | Took 68s to fail — native ctx too small |

### LLAMA_3_2_1B_INST_Q4_0

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 4,443 MiB | 1,038 MiB | Short | 174.2 | 38 | 218 | Clean output, no think template |
| 1024 | — | — | Medium | ❌ | — | — | Context overflow |
| 4096 | 4,543 MiB | 1,138 MiB | Short | 164.6 | 35 | 213 | Very fast, concise answers |
| 4096 | 4,543 MiB | 1,138 MiB | Medium | 231.8 | 700 | 3,019 | Good structured output |

### QWEN3_1_7B_INST_Q4

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 4,843 MiB | 1,438 MiB | Short | 145.5 | 149 | 1,024 | Think template active |
| 1024 | — | — | Medium | ❌ | — | — | Context overflow |
| 4096 | 5,179 MiB | 1,774 MiB | Short | 156.8 | 301 | 1,920 | Good reasoning |
| 4096 | 5,179 MiB | 1,774 MiB | Medium | 150.0 | 2,697 | 17,977 | Very detailed, quality output |

### SALAMANDRATA_2B_INST_Q4

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 5,251 MiB | 1,846 MiB | Short | 40.4 | 17 | 421 | English output broken — translates |
| 1024 | — | — | Medium | 48.9 | 10 | 204 | Only 10 tokens, nonsensical |
| 4096 | 5,323 MiB | 1,918 MiB | Short | 57.6 | 18 | 313 | Spanish/Catalan focused model |
| 4096 | 5,323 MiB | 1,918 MiB | Medium | 32.7 | 10 | 306 | Not suitable for English tasks |

### QWEN3_4B_INST_Q4_K_M

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 1024 | 5,803 MiB | 2,398 MiB | Short | 28.1 | 317 | 11,267 | Think template + slow generation |
| 1024 | — | — | Medium | ❌ | — | — | Context overflow |
| 4096 | 5,803 MiB | 2,398 MiB | Short | 30.9 | 466 | 15,067 | Best quality output |
| 4096 | 5,803 MiB | 2,398 MiB | Medium | 19.9 | 2,261 | 113,437 | Very detailed, high quality |

### LASER_DOLPHIN_2X7B_INST_Q2_K (gpu_layers=16)

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 4096 | 5,591 MiB | 2,186 MiB | Short | 7.5 | 109 | 14,546 | Very slow — partial GPU offload |
| 4096 | — | — | Medium | ❌ | — | — | Timed out (>600s) |

### QWEN3_8B_INST_Q4_K_M (gpu_layers=16)

| ctx | VRAM after | ΔVRAM | Prompt | tok/s | tokens | ms | Notes |
|-----|-----------|-------|--------|-------|--------|----|-------|
| 4096 | 5,589 MiB | 2,184 MiB | Short | 9.4 | 345 | 36,658 | Very slow, high quality output |
| 4096 | — | — | Medium | ❌ | — | — | Timed out (>600s) |

---

## Key Takeaways

1. **VRAM is the hard limit** — OS/display takes ~3.4 GB of 6 GB, leaving ~2.7 GB for models
2. **QWEN3_4B is the quality sweet spot** at 94.5% VRAM utilization (~2,398 MiB delta)
3. **QWEN3_1_7B is the practical winner** — great speed (150+ tok/s), good quality, 84% VRAM
4. **Models >3 GB need gpu_layers <99** — partial CPU offload drops to 7-10 tok/s (unusable)
5. **ctx_size must be ≥ 4096** for Qwen models due to think template overhead
6. **BitNet and SalamandraTA are not useful for English tasks** on this system

*See `BEST-CONFIGS.md` for recommended configurations and usage guidelines.*
