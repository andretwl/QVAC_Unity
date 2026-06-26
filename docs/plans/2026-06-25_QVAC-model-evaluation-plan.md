# QVAC Model Evaluation Plan

**Language scope:** English only. Every model selected here is benchmarked for English-language performance. Multilingual, translation, and non-English models are explicitly excluded.

**Hardware:**
| Component | Detail |
|---|---|
| GPU | RTX 3060 Laptop — 6 GB VRAM, NVIDIA 595.84, Vulkan 1.4.329 |
| iGPU | Intel UHD Graphics — Vulkan 1.4.348 (not used for inference) |
| RAM | 32 GB total (~16 GB available) |
| Storage | 894 GB SSD at `/mnt/data` — model cache: `/mnt/data/projects/QVAC/.qvac/models` |
| Runtime | Node.js v24.16.0, QVAC SDK v0.13.5 |

**VRAM constraint:** ~5–5.5 GB usable after compositor/display overhead.
- GGUF < 3 GB → full GPU offloading (`gpu_layers: 99`)
- GGUF 3–5 GB → partial offloading (reduce `gpu_layers` until it fits)
- GGUF > 5 GB → CPU-only inference (too slow; not benchmarked)

**Test workspace:** `/mnt/data/projects/QVAC/`

---

## Model Selection Methodology

Each candidate model is evaluated on three criteria before inclusion:

1. **English language quality** — Is this model's pre-training / fine-tuning English-first? (Models trained primarily on Spanish, Hindi, Chinese, etc. are excluded.)
2. **VRAM fit** — Can this model load on 6 GB at Q4 or better quantization?
3. **Architectural diversity** — Do we cover dense, MoE, and vision-language architectures?

Models are organised into **Tiers** within each phase — start with Tier 1 (highest value, lowest risk) and only proceed downward if results justify it.

---

## Phase 1: Text Generation (Priority: Highest)

### Tier 1 — Primary benchmarks (run all)

| Model constant | Est. GGUF | VRAM | Rationale |
|---|---|---|---|
| `LLAMA_3_2_1B_INST_Q4_0` | ~800 MB | ✅ Full GPU | **Baseline.** Already downloaded from quickstart. Provides the reference tok/s number. |
| `QWEN3_1_7B_INST_Q4` | ~1.0 GB | ✅ Full GPU | Qwen3 is English-first (trained on ~60% English). Slightly larger than Llama 3.2 1B — tests whether +0.7B params meaningfully improve quality at minimal VRAM cost. |
| `QWEN3_4B_INST_Q4_K_M` | ~2.5 GB | ✅ Full GPU | **Expected sweet spot.** Qwen3 4B at Q4_K_M fits entirely in VRAM. This is the model most likely to be the daily-driver — quality, speed, and VRAM intersect here. |

### Tier 2 — Conditional (run only if Tier 1 justifies it)

| Model constant | Est. GGUF | VRAM | Rationale |
|---|---|---|---|
| `QWEN3_600M_INST_Q4` | ~400 MB | ✅ Full GPU | Test if there's a viable ultra-lightweight option. Only worth it if Llama 1B is too slow or VRAM-constrained for some use case (e.g., running alongside TTS). |
| `QWEN3_8B_INST_Q4_K_M` | ~5.0 GB | ⚠️ Very tight | Largest model that might fit. If Qwen3 4B quality is already satisfactory, skip this — the margin over 4B is small and the VRAM risk is high. Load only with reduced `gpu_layers` (try 50, then 70). |
| `DOLPHIN_MIXTRAL_2X7B_MOE_Q2_K` | ~3.0 GB | ✅ Full GPU | MoE architecture (2x7B but ~4B active params). Dolphin is an English fine-tune. At Q2_K quantization, quality is degraded — only test if Qwen3 4B disappoints. |

### Tier 3 — Experimental

| Model constant | Est. GGUF | VRAM | Rationale |
|---|---|---|---|
| `LLAMA_TOOL_CALLING_1B_INST_Q4_K` | ~800 MB | ✅ Full GPU | Fine-tuned variant of Llama 3.2 1B specifically for function calling. Only test in Phase 8 (tool calling) — not a general text-gen contender. |
| `BITNET_1B_INST_TQ2_0` | ~400 MB | ✅ Full GPU | 1-bit ternary architecture (BitNet b1.58). English quality at TQ2_0 is unproven — curiosity only. |

### ✅ Excluded models (with reason)

| Model | Reason |
|---|---|
| `SALAMANDRATA_2B_INST_Q4` / `_Q8` | Salamandra is a Spanish-first model (BSC's foundational model). English performance is significantly worse than similarly-sized English-first models (Qwen, Llama). |
| `QWEN3_600M_INST_Q4` variants | Not excluded but demoted to Tier 2 — only test if we need an ultra-lightweight fallback. |
| Models over 5 GB (QWEN3_5_9B, GEMMA4_31B, GPT_OSS_120B, WAN2_1_I2V_14B) | Cannot fit in 6 GB VRAM at any usable quantization. |

### Standardised benchmark protocol

Every model in Phase 1 runs this exact suite:

**Prompt 1 — Short (instruction following):**
> "Explain the difference between supervised and unsupervised learning in two sentences."

**Prompt 2 — Medium (reasoning + structure):**
> "Write a detailed comparison of RAG vs fine-tuning for domain adaptation of LLMs. Cover: data requirements, training cost, update frequency, and output quality."

**Prompt 3 — Context retrieval (long context):**
> Load a ~2000-token markdown document, then ask: "Summarise the key technical decisions described in this document."

**Metrics captured per run:**
| Metric | Source |
|---|---|
| `tokensPerSecond` | `result.final.stats.tokensPerSecond` |
| `durationMs` | `result.final.stats.durationMs` |
| VRAM before/after load | `nvidia-smi --query-gpu=memory.used --format=csv,noheader` |
| VRAM during inference | Sampled 3x during generation, take max |
| Quality score (1–5) | Human rating: coherence, instruction following, factual accuracy |
| ctx_size tuning | Run each prompt at ctx_size=1024, 4096, 8192 (where VRAM allows) |

### Scripts
- Create: `benchmarks/text-gen-benchmark.js` — modular runner
- Create: `benchmarks/text-gen-results.md` — results table, updated per model

---

## Phase 2: Embeddings + RAG (Priority: High)

### Models to test

| Model constant | Dims | Size | Rationale |
|---|---|---|---|
| `EMBEDDINGGEMMA_300M_Q8_0` | 768 | ~300 MB | **Primary candidate.** Gemma-based, English-first, fast, widely compatible. Q8 for quality. |
| `EMBEDDINGGEMMA_300M_Q4_0` | 768 | ~150 MB | Compare Q8 vs Q4 quality-speed tradeoff. If quality holds at Q4, use half the RAM. |
| `GTE_LARGE_FP16` | 1024 | ~670 MB | Higher-dimensional embeddings (1024 vs 768). May improve retrieval quality for large document sets. Only test if EmbeddingGemma Q8 is unsatisfactory. |

### ✅ Excluded
- `GTE_LARGE_335M_FP16_SHARD` / `_TENSORS` — same model as GTE_LARGE_FP16, different packaging. Test the single-file version first.
- Any multilingual embedding model — not applicable.

### Test protocol
1. Embed 100 English sentences of varying length (5–200 words)
2. Measure: ms per vector, vectors/sec, VRAM usage
3. RAG pipeline test: ingest 10 documents → embed → search → LLM answer with context
4. Compare chunk sizes: 256, 512, 1024 tokens with 0% / 10% / 20% overlap

### Scripts
- Create: `benchmarks/embed-benchmark.js`
- Create: `benchmarks/rag-pipeline-test.js`
- Create: `benchmarks/phase2-results.md`

---

## Phase 3: Multimodal / Vision (Priority: Medium-High)

### Models to test

| Model constant | Size | VRAM | Rationale |
|---|---|---|---|
| `QWEN3VL_2B_MULTIMODAL_Q4_K` | ~1.5 GB | ✅ Full GPU | **Primary candidate.** Qwen's vision-language model at 2B is well-rated for English image understanding. Single GGUF — no separate projection model needed. |
| `SMOLVLM2_500M_MULTIMODAL_Q8_0` (LLM) + `MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0` (projection) | ~500 MB total | ✅ Full GPU | Ultra-lightweight vision option. Only test if Qwen3VL 2B is too slow or we need a model that co-exists with others in VRAM. |

### ✅ Excluded
- `GEMMA4_2B_MULTIMODAL_Q4_K_M` / `GEMMA4_4B_MULTIMODAL_Q4_K_M` — Excellent models but require a separate `MMPROJ_GEMMA4_*` projection model (~another 300–500 MB). The two-model load pattern doubles complexity and VRAM. If Qwen3VL quality is good, no need. Test only if Qwen3VL disappoints.
- `QWEN3_5_*_MULTIMODAL` — Qwen3.5 multimodal variants are larger (0.8B–27B). The 0.8B and 2B could fit but Qwen3VL 2B is a cleaner test.
- `MMPROJ_*` projection models not listed above — only needed if we test Gemma4.

### Test protocol
1. Load model (single GGUF for Qwen3VL, LLM+projection for SmolVLM2)
2. Test with 3 sample images:
   - **Scene description:** photo of a kitchen → "Describe this image in detail"
   - **Document OCR:** screenshot of a printed page → "Transcribe the text in this image"
   - **Visual QA:** chart/graph → "What is the trend shown in this chart?"
3. Measure: load time, inference speed (tok/s), VRAM peak

### Scripts
- Create: `benchmarks/multimodal-test.js`
- Create: `benchmarks/phase3-results.md`

---

## Phase 4: Transcription / ASR (Priority: Medium)

### Models to test

| Model constant | Size | VRAM | Rationale |
|---|---|---|---|
| `WHISPER_EN_TINY_Q8_0` | ~75 MB | ✅ Tiny | **English-optimised tiny.** Fastest possible transcription (~10x real-time). |
| `WHISPER_EN_BASE_Q8_0` | ~150 MB | ✅ Tiny | **English-optimised base.** Better accuracy than tiny, still very fast. Expected sweet spot. |
| `WHISPER_EN_SMALL_Q8_0` | ~500 MB | ✅ Tiny | **English-optimised small.** Best quality from the English-only Whisper line. |
| `WHISPER_LARGE_V3_TURBO` | ~1.5 GB | ✅ Fits | Most accurate Whisper model. Multilingual by design but English accuracy is state-of-the-art. Use as quality ceiling — only if EN_SMALL is inadequate. |
| `PARAKEET_CTC_0_6B_Q8_0` | ~750 MB | ✅ Fits | NVIDIA's CTC model — English-only, streaming-capable. Compare against Whisper for speed and WER. CTC is designed for streaming use cases. |

### ✅ Excluded
- `WHISPER_TINY_Q8_0` / `WHISPER_BASE_Q8_0` / `WHISPER_SMALL_Q8_0` — multilingual variants. Use `WHISPER_EN_*` instead — English-only models are smaller and more accurate for English speech.
- `WHISPER_EN_BASE` (no suffix) — Q0F16 variant is unquantised. Q8_0 is nearly identical quality at half the size. Use Q8_0.
- `PARAKEET_TDT_0_6B_V3_Q8_0` — multilingual TDT model. For English-only, the CTC variant is superior (faster, more accurate).
- `PARAKEET_SORTFORMER_4SPK_V1_Q8_0` — speaker diarisation (multi-speaker identification). Not relevant unless we need to distinguish who spoke when.
- `PARAKEET_EOU_120M_V1_Q8_0` — end-of-utterance detection for streaming. Only test if we build a duplex voice pipeline.
- Language-specific Whisper models (FRENCH, GERMAN, ITALIAN, JAPANESE, PORTUGUESE, RUSSIAN, SPANISH, NORWEGIAN) — not applicable.

### Test protocol
1. Transcribe a 30-second English speech sample (clean, no background noise)
2. Transcribe a 2-minute English recording (with some background noise)
3. Measure: **real-time factor** (RTF = processing time / audio duration)
4. Compare transcription quality (subjective WER — listen for dropped/inserted words)
5. Test `transcribeStream()` with Parakeet CTC (streaming is its strength)

### Scripts
- Create: `benchmarks/transcription-test.js`
- Create: `benchmarks/phase4-results.md`

---

## Phase 5: Text-to-Speech (Priority: Medium)

### Models to test

| Model constant | Size | VRAM | Rationale |
|---|---|---|---|
| `TTS_T3_TURBO_EN_CHATTERBOX_Q8_0` (T3) + `TTS_S3GEN_EN_CHATTERBOX_Q8_0` (S3Gen companion) | ~400 MB total | ✅ | **Primary candidate.** Chatterbox T3 is the fastest English TTS model. Q8_0 for quality. Requires the S3Gen companion for best results. |
| `TTS_EN_SUPERTONIC_Q8_0` | ~500 MB | ✅ | Higher quality than Chatterbox but slower (full diffusion decoder). Compare: is the quality gap worth the speed cost? |

### ✅ Excluded
- `TTS_MULTILINGUAL_SUPERTONIC2_Q8_0` — multilingual Supertone. For English-only, the English Supertone is better.
- `TTS_T3_MULTILINGUAL_CHATTERBOX_*` / `TTS_S3GEN_MULTILINGUAL*` — multilingual T3/S3Gen. Use English variants.
- Chatterbox variants below Q8_0 (Q4_0, Q5_0) — TTS quality degrades noticeably at lower quantisations. Test Q8_0 first.
- Voice cloning (via `referenceAudioSrc`) — advanced feature. Test only if baseline TTS quality is satisfactory.

### Test protocol
1. Generate speech from a short sentence (~10 words)
2. Generate speech from a medium paragraph (~100 words)
3. Measure: real-time factor (RTF), subjective naturalness (1–5)
4. Compare Chatterbox vs Supertone on same text

### Scripts
- Create: `benchmarks/tts-test.js`
- Create: `benchmarks/phase5-results.md`

---

## Phase 6: Image Generation (Priority: Medium-Low)

### Models to test

| Model constant | Size | VRAM | Rationale |
|---|---|---|---|
| `SD_V2_1_1B_Q8_0` | ~1.0 GB | ✅ Fits easily | Stable Diffusion v2.1 at Q8_0. Fastest generation, good quality for 512×512. Tests whether image gen on 6 GB is practical at all. |
| `FLUX_2_KLEIN_4B_Q4_K_M` | ~3.5 GB | ✅ Fits | FLUX is the current state-of-the-art in open image generation. Q4_K_M is the quantisation sweet spot. Only test if SD v2.1 quality is insufficient. |

### ✅ Excluded
- `SDXL_BASE_1_0_3B_Q8_0` — 3B at Q8_0 is ~3 GB, but SDXL needs higher resolution (1024×1024) which uses significantly more VRAM during denoising. Risk of OOM on 6 GB. If we want XL-quality, FLUX at Q4_K_M is a better use of VRAM.
- `FLUX_2_KLEIN_4B_VAE` — VAE is bundled with the main model in QVAC's FLUX support. If needed, note in results.
- `REALESRGAN_X4PLUS` / `REALESRGAN_X4PLUS_ANIME_6B` / `REALESRNET_X4PLUS` — upscalers. Test only if image gen quality is good but resolution needs a boost.

### Test protocol
1. Text-to-image at 512×512 (SD v2.1) and 768×768 (FLUX)
2. Prompt: "A serene mountain lake at sunset, digital art style"
3. Measure: generation time (seconds), VRAM peak

### Scripts
- Create: `benchmarks/image-gen-test.js`
- Create: `benchmarks/phase6-results.md`

---

## Phase 7: Other Capabilities (Priority: Low — selective only)

### OCR — English text extraction
| Model constant | Size | Rationale |
|---|---|---|
| `OCR_0_6B_MULTIMODAL_Q4_K_M` | ~600 MB | General-purpose OCR. Test with a clean English document screenshot. |
| `OCR_LATIN_RECOGNIZER` / `OCR_LATIN_RECOGNIZER_1` | ~100 MB each | Latin-script text recogniser (covers English). Lighter than the multimodal OCR model. |

**Excluded:** All non-Latin OCR models (Arabic, Bengali, Cyrillic, Devanagari, Japanese, Kannada, Korean, Tamil, Telugu, Thai, Chinese Simplified, Chinese Traditional).

### Image Classification (English labels)
| Model constant | Size | Rationale |
|---|---|---|
| `CLIP_VISION_H` | ~1.5 GB | Zero-shot classification with arbitrary English labels. Niche but useful. |

### ✅ Excluded entirely (not relevant)
- **Translation** — Bergamot models cover 90+ language pairs, none English→English. Marian models are English-Hindi. Not useful.
- **Fine-tuning** — Requires a dataset and significant time. Revisit only after all other phases are complete.
- **BCI** — Requires a neural signal decoder (microelectrode array hardware). Not applicable.
- **VLA** — Vision-Language-Action for robotics. Not applicable.
- **Video generation** — WAN2.1 models are 14B parameters. Cannot fit on 6 GB VRAM at any usable quantisation. Skip.

---

## Phase 8: Advanced Features (Priority: Medium)

### Tool Calling (uses Phase 1 models)
Test `completion()` with tool definitions. Use the best Tier 1 model from Phase 1.
- Evaluate whether the model correctly emits structured tool calls
- Test the follow-up turn pattern (tool result → model synthesises)

### MCP Integration
- Requires `npm i @modelcontextprotocol/sdk`
- Attach an MCP client (e.g., DuckDuckGo search) to `completion()`
- Test multi-turn web search and synthesis

### KV Cache
- Test KV cache reuse for multi-turn conversations
- Measure speedup factor on follow-up turns (expected: 30–50% faster)

### Event Stream + Thinking
- Test `captureThinking: true` with models that emit `<think>` blocks
- Compare `events`/`final` API vs convenience `tokenStream`

### Voice Pipeline (ASR → LLM → TTS)
Only if individual ASR and TTS phases succeed:
- Parakeet CTC streaming → LLM (Qwen3 1.7B) → Chatterbox TTS streaming
- Measure end-to-end latency per user utterance

---

## Execution Order (Prioritised)

```
Phase 1 (text gen — Tier 1 only)
  → Decide: is Qwen3 4B good enough? If yes, skip Tier 2.
  → Write BEST-CONFIGS.md section 1

Phase 2 (embeddings + RAG)
  → Test EmbeddingGemma Q8, then Q4.
  → Write BEST-CONFIGS.md section 2

Phase 3 (multimodal)
  → Test Qwen3VL 2B.
  → Write BEST-CONFIGS.md section 3

Phase 8 (advanced — tool calling, KV cache, thinking)
  → Test with best model from Phase 1.
  → Update BEST-CONFIGS.md

Phase 4 (transcription)
  → Test Whisper EN Base, EN Small, Parakeet CTC.
  → Write BEST-CONFIGS.md section 4

Phase 5 (TTS)
  → Test Chatterbox, then Supertone.
  → Write BEST-CONFIGS.md section 5

Phase 6 (image gen)
  → Test SD v2.1, then FLUX if warranted.
  → Write BEST-CONFIGS.md section 6

Phase 7 (OCR, classification)
  → Only if time permits and use case exists.
```

### Decision gates
Each phase ends with a **go/no-go** for the next phase in its category:
- "Phase 1 quality is good enough → skip Tier 2 models"
- "EmbeddingGemma Q8 quality is fine → skip GTE Large"
- "Whisper EN Small accuracy is acceptable → skip V3 Turbo"

---

## Deliverables

| File | Contents |
|---|---|
| `benchmarks/text-gen-results.md` | Tok/s, VRAM, quality per model + config |
| `benchmarks/phase2-results.md` | Embedding speed, RAG pipeline results |
| `benchmarks/phase3-results.md` | Multimodal accuracy, speed |
| `benchmarks/phase4-results.md` | ASR RTF, quality comparison |
| `benchmarks/phase5-results.md` | TTS RTF, naturalness rating |
| `benchmarks/phase6-results.md` | Image gen time, VRAM peak |
| `BEST-CONFIGS.md` | **Final deliverable** — recommended model + config per use case |

### `BEST-CONFIGS.md` structure
```markdown
# QVAC Best Configs — RTX 3060 6 GB

## Text Generation
| Use case | Model | ctx_size | gpu_layers | Expected tok/s | VRAM |
|---|---|---|---|---|---|

## Embeddings
| Model | Batch size | ms/vector | VRAM |
|---|---|---|---|

## RAG
| Chunk size | Overlap | Embed model | LLM | Retrieval quality |
|---|---|---|---|---|

## Multimodal
...

## Transcription (ASR)
...

## Text-to-Speech
...

## Image Generation
...
```

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| OOM during large ctx_size test | Medium | Start at 1024, increase only if VRAM headroom permits. Kill runaway process with `pkill -f "qvac-worker"` if needed. |
| P2P download failures / slow registry | Medium | Downloads are resumable. If a model fails to download, retry once. If still fails, skip and note it. |
| VRAM leak between benchmarks | Medium | Run `nvidia-smi` and `unloadModel({clearStorage: true})` between each model test. |
| Model quality too subjective to compare | Low | Use standardised prompts (same for all models). Score on 3 axes: coherence, instruction-following, factual accuracy. Average to a single 1–5. |
| `unloadModel()` doesn't free all VRAM | Low | If VRAM doesn't drop, kill the Node process entirely (`process.exit(0)` in test script and restart). |
