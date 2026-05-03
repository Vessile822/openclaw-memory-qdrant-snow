---
name: memory-qdrant
description: "TrueRecall v2.0: Qdrant-backed semantic memory with local LM Studio embeddings. Auto-capture, deduplication, smart chunking. Replaces the Python watcher script entirely."
version: 2.0.0
author: zuiho-kai
homepage: https://github.com/zuiho-kai/openclaw-memory-qdrant
tags: [memory, semantic-search, qdrant, lm-studio, embeddings, local-ai, vector-db, true-recall]
metadata:
  openclaw:
    requires:
      bins: [node, npm]
---

# memory-qdrant (TrueRecall v2.0)

**推薦使用時機**：當你希望 OpenClaw 能跨對話記住使用者的習慣、決策與重要數據，又不希望資料流到雲端或佔用額外資源時。

這是 OpenClaw 高效能語義記憶外掛，已升級為 **TrueRecall v2.0**。捨棄舊版 `Transformers.js` 與耗能的 Python 輪詢腳本，改用本地 **LM Studio (OpenAI 格式)** 進行 1024-dim 向量 Embedding，並原生整合 OpenClaw lifecycle hooks。

## 🌟 亮點功能

- **本地 Embedding**：串接本地 LM Studio（預設 `http://127.0.0.1:1234/v1`），零雲端依賴
- **智慧清理與分塊**：將 Python 端的 `clean_content` / `chunk_text` 邏輯原生移植至 Plugin，自動過濾 Markdown、`[thinking]` 標籤、時間戳記
- **語義去重**：AutoCapture 後對每個 chunk 做相似度比對（cosine ≥ 0.95 則跳過），保持向量庫乾淨
- **Turn ID 連續性**：寫入前自動查詢 Qdrant 最大 turn 值，跨會話保持連續計數，格式與舊版 Python 腳本 100% 相容

## 📦 前置需求

啟用前請確保下列服務已就緒：

| 服務 | 說明 |
|------|------|
| **Node.js ≥ 18** | `node --version` 確認 |
| **LM Studio** | 啟動 Local Server，載入 `snowflake-arctic-embed-l-v2.0`（1024-dim）Embedding 模型 |
| **Qdrant** | 本地啟動（`docker run -p 6333:6333 qdrant/qdrant`）或遠端 Qdrant 服務 |

## 📦 安裝方式

### 方式一：透過 ClawHub（發布後推薦）

```bash
clawhub install memory-qdrant
```

### 方式二：手動安裝（開發者適用）

```bash
# 將版本庫 clone 至 OpenClaw workspace 的 skills 目錄
cd ~/.openclaw/workspace/skills
git clone https://github.com/zuiho-kai/openclaw-memory-qdrant.git memory-qdrant
cd memory-qdrant
npm install
```

## ⚙️ OpenClaw 設定

請在 `~/.openclaw/openclaw.json` 的 `plugins` 區塊加入以下設定：

```json
{
  "plugins": {
    "allow": ["memory-qdrant"],
    "slots": {
      "memory": "memory-qdrant"
    },
    "entries": {
      "memory-qdrant": {
        "enabled": true,
        "config": {
          "qdrantUrl": "http://127.0.0.1:6333",
          "collectionName": "memories_tr",
          "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
          "embeddingModel": "text-embedding-desu-snowflake-arctic-embed-l-v2.0-finetuned-amharic-final",
          "defaultUserId": "your-user-id",
          "defaultAgentId": "main",
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

設定完成後重啟 Gateway：

```bash
openclaw gateway restart
```

> ⚠️ **重要**：若您之前有執行 `realtime_qdrant_watcher.py`，請立刻停用！v2.0 已原生處理記憶擷取，繼續執行會導致**重複寫入**。

## 📚 可用工具

此外掛向 OpenClaw 暴露三個工具（Agent 會自動按需呼叫）：

| 工具 | 說明 |
|------|------|
| `memory_store` | 寫入指定內容到語義記憶庫 |
| `memory_search` | 以自然語言查詢，回傳最相關的歷史記憶 |
| `memory_forget` | 透過 ID 或語義比對刪除特定記憶 |

## 🔐 隱私說明

- 所有 Embedding 在本地 LM Studio 完成，不傳送至外部服務
- `autoCapture` 開啟後，對話內容會在清洗後寫入本地（或你設定的遠端）Qdrant
- 每筆記憶的 `source` 固定標示為 `true-recall-base`，可透過 Qdrant Dashboard 追蹤

## 🔗 相關連結

- GitHub: https://github.com/zuiho-kai/openclaw-memory-qdrant
- 問題回報: https://github.com/zuiho-kai/openclaw-memory-qdrant/issues
