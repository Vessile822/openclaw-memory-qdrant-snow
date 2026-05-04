---
name: memory-qdrant
description: "TrueRecall v3.2: A symbiotic long-term memory system for OpenClaw. It integrates with OpenClaw's native Dreaming mode to ingest consolidated insights and uses a Smart Trigger to conditionally inject relevant historical context. Use this skill whenever the user mentions memory, history, past conversations, 'recall', or when the agent needs to maintain long-term awareness of user preferences and project details. This skill is critical for any task requiring continuity across different chat sessions."
version: 3.2.0
author: Vessile822
homepage: https://github.com/Vessile822/openclaw-memory-qdrant-snow
tags: [memory, semantic-search, qdrant, lm-studio, embeddings, local-ai, vector-db, true-recall, dreaming]
metadata:
  openclaw:
    requires:
      bins: [node, npm]
---

# memory-qdrant (TrueRecall v3.2)

A robust, privacy-first semantic memory plugin built for OpenClaw. It transforms the way AI agents handle long-term context by moving away from blind "auto-capture" to a reactive, symbiosis-based model that leverages OpenClaw's native "Dreaming" feature.

## 🧠 Architectural Principles

This plugin operates on three core pillars: **Reactive Ingestion**, **Intent-Based Retrieval**, and **Noise-Free Storage**.

### 1. The Symbiosis Workflow (Dream Ingestor)
Unlike traditional memory plugins that summarize conversations locally, `memory-qdrant` acts as a **passive consumer** of OpenClaw's native Dreaming engine.
- **Monitoring**: The plugin watches `~/.openclaw/workspace/MEMORY.md` and `short-term-recall.json`.
- **Ingestion**: When OpenClaw "dreams" (consolidates session logs), this plugin captures the output, refines it using the **Smart Extractor**, and embeds the result.
- **Efficiency**: No redundant processing; the plugin only wakes up when new consolidated data is written by the system.

### 2. Smart Trigger Logic (Agent Context Injection)
To save tokens and prevent context pollution, memory is **not** injected into every turn.
- **Intent Detection**: Every user message is scanned for "recall intent" (e.g., "What did we decide last time?", "Remember that project?", "Find my API key").
- **Dynamic Injection**: If a trigger is detected, the plugin performs a vector search in Qdrant and appends relevant memories directly to the `systemInstruction` (System Prompt) before the agent generates a response.

### 3. Noise Filter & Signal Quality
- **Filter**: A bilingual (English/Chinese) regex-based filter strips out "Greetings", "Acknowledgements" (OK, Received), and "System Errors" before they ever reach the database.
- **Deduplication**: Every incoming memory segment is checked for cosine similarity against existing records. If similarity is > 0.95, it is discarded as a duplicate.

---

## 📦 Environmental Requirements

To ensure the system works locally and privately, the following services must be configured:

| Component | Requirement | Configuration Detail |
| :--- | :--- | :--- |
| **Node.js** | ≥ 18.x | Runtime for the plugin logic. |
| **Qdrant** | Docker or Cloud | `docker run -p 6333:6333 qdrant/qdrant` |
| **LM Studio** | Local API | Enable "Local Server" on Port 1234. |
| **Embedding Model** | `snowflake-arctic-embed-v2.0` | Set context length to 8192 for best results. |
| **Extraction LLM** | e.g. `Doubao-Seed-2.0` | Used for structured fact extraction during ingestion. |

---

## ⚙️ OpenClaw Configuration

Add the following to your `~/.openclaw/openclaw.json` under the `plugins` section:

```json
{
  "plugins": {
    "allow": ["memory-qdrant"],
    "slots": { "memory": "memory-qdrant" },
    "entries": {
      "memory-qdrant": {
        "enabled": true,
        "config": {
          "qdrantUrl": "http://127.0.0.1:6333",
          "collectionName": "memories_tr",
          "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
          "embeddingModelId": "snowflake-arctic-embed-v2.0",
          "smartExtraction": true,
          "extractionLlmBaseUrl": "http://localhost:18789/v1",
          "extractionLlmModel": "Doubao-Seed-2.0-Code"
        }
      }
    }
  }
}
```

---

## 📚 Agent Tools (Capabilities)

When this plugin is active, the following tools are available for the AI Agent to interact with the memory system:

### `memory_search`
Perform semantic search across the entire memory database. Use this when the Smart Trigger didn't automatically find what you need but you suspect the answer is in history.

### `memory_store`
Manually commit a specific fact or preference to long-term memory. Use this when the user says something like "Remember this: my preferred API port is 8080".

### `memory_list_by_date`
Retrieve full conversation trajectories for a specific date range. Perfect for generating "Daily Summaries" or "Weekly Reports".

### `memory_forget_by_id`
Delete a specific memory entry if it is outdated or incorrect.

---

## 🔐 Privacy & Security
- **Local-First**: All data is stored in your local Qdrant instance.
- **Zero-Data-Leak**: Embeddings are calculated locally in LM Studio.
- **Transparent**: The `source` field in Qdrant identifies exactly how a memory was captured (`true-recall-base`).

---
`License: MIT`
