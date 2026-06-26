# QVAC + LLMUnity NPC Dialogue System

An integrated pipeline for creating personality-rich NPC dialogue in Unity using QVAC's LoRA fine-tuning and LLMUnity's runtime inference.

## Architecture

```
  ┌──────────────────────────────────────────────────┐
  │                   QVAC Server                    │
  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
  │  │ HTTP API │  │  P2P     │  │ LoRA Training  │  │
  │  │ :11435   │  │  iOS     │  │ Pipeline       │  │
  │  └──────────┘  └──────────┘  └───────┬───────┘  │
  │        │                              │          │
  │   ┌────┴────┐                  ┌──────┴──────┐   │
  │   │ 4 LLMs  │                  │ GGUF LoRA   │   │
  │   │loaded   │                  │ Adapters/   │   │
  │   └─────────┘                  │ NPC         │   │
  └──────────────────────────────────┴────────────────┘
                                      │
                           ┌──────────┴──────────┐
                           │     Unity Project     │
                           │  ┌─────────────────┐  │
                           │  │ LLM (base model)│  │
                           │  │ + LoRA adapter  │  │
                           │  │   per NPC       │  │
                           │  ├─────────────────┤  │
                           │  │ LLMAgent        │  │
                           │  │ (personality)   │  │
                           │  ├─────────────────┤  │
                           │  │ RAG (knowledge) │  │
                           │  └─────────────────┘  │
                           └────────────────────────┘
```

## Quick Start

### 1. Start QVAC Unified Server
```bash
cd /mnt/data/projects/QVAC
node monitoring/qvac-unified-server.js
```
Verification: `curl http://localhost:11435/v1/models`

### 2. (Optional) Train LoRA Adapters for NPCs
```bash
# Train all NPCs
node npc-datasets/train-npc-loras.js --all

# Train a single NPC
node npc-datasets/train-npc-loras.js --npc merchant
```
Output: `artifacts/lora/<npc_name>/` — GGUF-compatible LoRA adapters

### 3. Open Unity Scene
Open `Assets/LLMUnity/Samples/KnowledgeBaseGame/KnowledgeBaseGameScene.unity`
in Unity Editor.

### 4. Configure NPCs
Select `NPCDialogueSystem` GameObject → In Inspector:
- **LLM**: Reference to the `LLM` GameObject
- **LLMAgent**: Reference to the `LLMAgent` GameObject
- **RAG**: Reference to the `RAG` GameObject
- **NPCs**: Array of NPC definitions with:
  - Name, display name
  - System prompt (personality)
  - Temperature, top-K, top-P (creativity)
  - LoRA adapter path (optional)
  - RAG category for knowledge retrieval

### 5. Build & Play
Press Play in Unity → NPCs respond with their distinct personalities.

## NPC Datasets

### RPG NPCs (newly created)
| NPC | Personality | Samples | LoRA Rank |
|-----|-------------|---------|-----------|
| **Merchant** (Grimble) | Chatty dwarf shopkeep, loves to barter | 8 train / 2 val | 16 |
| **Guard** (Captain Voss) | Stern, terse, duty-focused | 7 train / 2 val | 16 |
| **Tavern Keep** (Marta) | Warm, motherly, knows all rumors | 6 train / 2 val | 16 |

### KnowledgeBaseGame NPCs (ported from CSV)
| NPC | Personality | Samples | LoRA Rank |
|-----|-------------|---------|-----------|
| **Butler** | Logical, sarcastic, observant | 176 train / 45 val | 8 |
| **Maid** | Polite, helpful, cheerful | 176 train / 45 val | 8 |
| **Chef** | Easily-annoyed, state-machine | 3 train / 1 val | 8 |

### Dataset Format
Each NPC has conversations in JSONL format:
```jsonl
{"messages": [{"role": "user", "content": "Hello!"}, {"role": "assistant", "content": "Welcome to my shop!"}]}
```

Structure:
```
npc-datasets/
├── npc_manifest.json          # System prompts + LoRA configs per NPC
├── train-npc-loras.js         # Training pipeline script
├── merchant/
│   ├── train/conversations.jsonl
│   └── validation/conversations.jsonl
├── guard/
├── tavern_keep/
├── butler/
├── maid/
└── chef/
```

## Unity Scripts

### `Assets/Scripts/NPCDialogueManager.cs`
The central NPC dialogue manager. Attached to the `NPCDialogueSystem` GameObject.

**Public API:**
```csharp
// Switch NPC (updates system prompt, LoRA, settings)
dm.SwitchToNPC("Merchant");

// Send player message — streams response via UnityEvent
dm.SendMessage("What do you sell?");

// Subscribe to events
dm.onNPCChanged.AddListener(name => Debug.Log("Now talking to: " + name));
dm.onResponseComplete.AddListener((npc, response) => Debug.Log(npc + " says: " + response));
```

**UnityEvents:**
- `onNPCChanged(string displayName)` — when NPC is switched
- `onResponseStart(string playerMessage)` — when LLM starts responding
- `onResponseComplete(string npcName, string response)` — when response is done
- `onError(string message)` — on any error

**RAG Integration:**
```csharp
// Add knowledge programmatically
await dm.AddNPCKnowledge("Merchant", "The Steelbiter sword was forged in Mount Thunder.");

// Save embeddings for persistence
dm.SaveRAGEmbeddings();
```

## Dashboard (QVAC)

The web dashboard at **http://localhost:3000** now shows only:
- **QVAC server** status (:11435)
- **Model Router** status (:3001)
- **Unified model list** (from router, which auto-discovers QVAC models)
- **Chat playground** with model selection, streaming responses
- **VRAM gauge** (GPU memory, temp, utilization)
- **Quick tests** (embeddings, model list, VRAM check)

Ollama and LocalAI have been removed to avoid confusion — only QVAC (llama.cpp-based) remains.

## Integration Workflow

```
1. WRITE NPC dialogues → 2. TRAIN LoRA adapters → 3. COPY to Unity
                                                → 4. CONFIGURE NPC in Inspector
                                                → 5. PLAY & iterate
```

### End-to-End Example

```bash
# Terminal 1: Start QVAC server
cd /mnt/data/projects/QVAC && node monitoring/qvac-unified-server.js

# Terminal 2: Train a merchant NPC LoRA
node npc-datasets/train-npc-loras.js --npc merchant

# Terminal 3: Copy adapter to Unity StreamingAssets
cp artifacts/lora/merchant/*.gguf /path/to/Unity/StreamingAssets/loras/

# In Unity: Set LLM._lora = "StreamingAssets/loras/merchant.gguf"
```

## Performance Targets

- **Response time**: < 2s per reply (with fast-llm: Llama 3.2 1B @ 256 tok/s)
- **VRAM usage**: < 4GB (Qwen3 1.7B + LoRA adapter)
- **LoRA load time**: < 1s per NPC switch
- **Training time per NPC**: ~5-10 minutes (for 8-50 samples, 3-5 epochs)

## Troubleshooting

**"LLM._lora/AddLora doesn't exist"**
→ LLMUnity v2.0.5's `LLM.AddLora(path, weight)` requires the model NOT to be started yet. Call before first chat or after model reload.

**"NPCDialogueManager script won't compile"**
→ Verify `// Assembly-CSharp` has `LLMUnity` as a Reference in Assembly Definition References (it should auto-reference from the same project).

**"Model not found"**
→ Verify the GGUF model path in LLM Inspector matches a file in `StreamingAssets/` or the QVAC model cache.

---

## Files Reference

| File | Purpose |
|------|---------|
| `monitoring/qvac-unified-server.js` | HTTP API + P2P provider (single process) |
| `frontend/server.js` | Dashboard web server (port 3000) |
| `frontend/index.html` | Dashboard UI (QVAC + Router only) |
| `frontend/app.js` | Dashboard frontend logic |
| `npc-datasets/train-npc-loras.js` | NPC LoRA training pipeline |
| `npc-datasets/npc_manifest.json` | NPC definitions (system prompts, LoRA configs) |
| `npc-datasets/<npc>/{train,validation}/` | Conversation datasets per NPC |
| `artifacts/lora/<npc>/` | Trained LoRA adapter output |
| `Assets/Scripts/NPCDialogueManager.cs` | Unity NPC manager script |
