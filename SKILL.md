---
name: memory-qdrant
description: "TrueRecall v3.1: 智慧記憶精煉系統。支援 Qdrant + 本地 LM Studio，結合 Noise Filter 與 Smart Extraction (LLM)，自動萃取、分類並管理對話記憶。"
version: 3.1.0
author: Vessile822
homepage: https://github.com/Vessile822/openclaw-memory-qdrant-snow
tags: [memory, semantic-search, qdrant, lm-studio, embeddings, local-ai, vector-db, true-recall]
metadata:
  openclaw:
    requires:
      bins: [node, npm]
---

# memory-qdrant (TrueRecall v3.1)

**推薦使用時機**：當你希望 OpenClaw 能跨對話記住使用者的習慣、決策與重要數據，並且期望有智慧篩選機制去除招呼語等雜訊時。

這是 OpenClaw 高效能語義記憶外掛，已升級為 **TrueRecall v3.1**。結合本地 **LM Studio (OpenAI 格式)** 進行 1024-dim 向量 Embedding，並具備智慧雜訊過濾與 LLM 精煉能力。

## 🌟 亮點功能

- **🧠 智慧精煉擷取 (Smart Extraction)**：可選啟用 LLM 精煉，從對話中提取結構化記憶，低重要性自動丟棄。支援 6 大分類與 L0~L2 三層記憶結構。
- **🚫 雜訊過濾器 (Noise Filter)**：中英文雙語 7 大類別過濾——自動跳過 "ok"、"收到"、招呼語、否定回應、元問題等無記憶價值的訊息，零延遲。
- **💭 自動夢境功能 (Auto Dream)**：定時清理過期記憶，自動打上 `archived` 標籤，保持記憶庫活躍度。
- **本地 Embedding**：串接本地 LM Studio，零雲端依賴，保障隱私。
- **語義去重**：AutoCapture 後對每個 chunk 做相似度比對（cosine ≥ 0.95 則跳過），保持向量庫乾淨。

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
git clone https://github.com/Vessile822/openclaw-memory-qdrant-snow.git memory-qdrant
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

- GitHub: https://github.com/Vessile822/openclaw-memory-qdrant-snow
- 問題回報: https://github.com/Vessile822/openclaw-memory-qdrant-snow/issues
