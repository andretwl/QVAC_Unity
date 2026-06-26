# Model Presets

Each JSON file defines overrides for a single model alias.
These are the canonical configs used across all QVAC services.

## Format
```json
{
  "model": "QWEN3_1_7B_INST_Q4",   // QVAC model constant name
  "ctx_size": 4096,                  // Context window (tokens)
  "gpu_layers": 99,                  // GPU offload layers
  "device": "gpu",                   // Compute device
  "description": "..."               // Human-readable summary
}
```

## Available Presets
- **default-llm**: Best speed/quality balance (~160 tok/s on RTX 3060)
- **fast-llm**: Fastest for simple/realtime tasks (~256 tok/s)
- **quality-llm**: Best quality (~31 tok/s, 94.5% VRAM)
- **tiny-llm**: Speed king for simple Q&A (~203 tok/s)

## Usage
Presets are loaded by `scripts/lib/config.js` via `resolveModelPreset(alias)`.
They are the single source of truth — update here, not in qvac.config.json directly.
