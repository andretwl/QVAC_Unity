# Unity ↔ QVAC Bridge

The Unity project lives at a separate path from the QVAC project and is accessed via **GladeKit MCP** (the `mcp_gladekit_mcp_*` tool set).

## Unity Project Location
```
/mnt/data/Projects_SSD/Unity_Projects/Unity_Linux_LLM/
```

This is outside the QVAC workspace — GladeKit MCP bridges the gap.

## GladeKit MCP Workflow

### Inspect Scene
```csharp
// List all GameObjects
mcp_gladekit_mcp_get_scene_hierarchy()

// Find components
mcp_gladekit_mcp_find_game_objects(hasComponent: "LLMAgent")

// Read object details
mcp_gladekit_mcp_get_gameobject_info(gameObjectPath: "LLM")

// Read components
mcp_gladekit_mcp_get_gameobject_components(gameObjectPath: "NPCDialogueSystem")
```

### Create/Edit Scripts
```csharp
// Create new script → auto-compiles
mcp_gladekit_mcp_create_script(scriptPath: "Scripts/NewScript.cs", scriptContent: "...")

// Modify existing script
mcp_gladekit_mcp_modify_script(scriptPath: "Scripts/Existing.cs", scriptContent: "...")

// Check compilation
mcp_gladekit_mcp_compile_scripts()
```

### Add Components to Scene
```csharp
// Add component (must compile first)
mcp_gladekit_mcp_add_component(componentType: "NPCSystem.NPCDialogueManager", gameObjectPath: "GameObjectName")

// Wire references
mcp_gladekit_mcp_set_object_reference(targetGameObject: "...", componentType: "...", fieldName: "llm", sourceGameObject: "LLM", sourceType: "LLM")
```

## LLMUnity Components (in scene `KnowledgeBaseGameScene`)
| GameObject | Component | Purpose |
|------------|-----------|---------|
| `LLM` | LLM | Base model (GGUF) + LoRA adapter |
| `LLMAgent` | LLMAgent | System prompt, chat, streaming |
| `RAG` | RAG | Knowledge base with NPC-specific categories |
| `NPCDialogueSystem` | NPCDialogueManager | NPC management, LoRA switching, RAG enrichment |

## NPCDialogueManager API
```csharp
dm.SwitchToNPC("Merchant");       // Hot-swap system prompt + LoRA
dm.SendMessage("Hello!");         // Send player message → streams response

// Events
dm.onNPCChanged.AddListener(name => { });
dm.onResponseComplete.AddListener((npc, response) => { });
```

## LoRA Adapter Workflow
1. Train: `node scripts/train/npc-loras.js --npc merchant`
2. Output: `artifacts/lora/merchant/*.gguf`
3. Copy to Unity: `cp artifacts/lora/merchant/*.gguf <Unity>/StreamingAssets/loras/`
4. In Unity: call `llm.AddLora("StreamingAssets/loras/merchant.gguf", 0.8f)`
