# openclaw-memory-qdrant (TrueRecall v3.0)

OpenClaw 官方支援的高效能記憶外掛，已全面升級為 **TrueRecall v3.0 智慧記憶精煉系統**。
本外掛提供與 OpenClaw 原生整合的語義記憶庫 (Semantic Memory)，透過 Qdrant 向量資料庫與本地 LM Studio 服務提供企業級的長期記憶能力。

## 🚀 v3.1 核心特色 (New Features)

- **🧠 進階 6 大類別與三層結構**：
  - 根據對話屬性更精確分為 `profile`, `preferences`, `entities`, `events`, `cases`, `patterns`。
  - 將記憶分層：`abstract` (L0 單行索引)、`overview` (L1 結構化摘要)、`content` (L2 完整內文)。
- **💭 自動夢境功能 (Auto Dream)**：
  - 記憶包含引用次數 (`referenceCount`) 與最後調用時間 (`lastReferenced`)。
  - `dream` 定時/手動演算法自動整理：對太久沒被檢索且重要性分數衰減過低的記憶打上 `archived: true` 的標籤。
  - `memory_search` 預設只搜索活躍的記憶，提高精準度。
- **🧠 智慧精煉擷取 (Smart Extraction)**：可選啟用 LLM 精煉，從對話中提取結構化記憶（偏好、決策、事實、實體、反思），低重要性自動丟棄。
- **🚫 雜訊過濾器 (Noise Filter)**：中英文雙語 7 大類別過濾——自動跳過 "ok"、"收到"、招呼語、否定回應、元問題等無記憶價值的訊息。
- **🔧 autoCapture Bug 修復**：v2.0 的 `agent_end` 會重複儲存整個對話歷史（一次 186 chunk）。v3.0 修正為只擷取最後一輪對話。
- **純粹本地端、隱私優先**：依賴本地 LM Studio (OpenAI API 格式) 進行向量化，資料不上雲。
- **TrueRecall 完美繼承**：Payload Schema 與 TrueRecall Python 腳本 100% 向後相容。
- **全自動擷取與語義去重**：對話結束後自動抓取重點並進行相似度校驗 (0.95 threshold)。
- **高效能架構**：外掛原生攔截儲存，不佔用額外背景資源。

---

## 🏗 架構

```
agent_end 事件觸發
    │
    ▼
autoCapture hook (v3.0 修復版)
    ├─► 只取最後一輪訊息（最新的 user + assistant）
    ├─► isNoise() → 過濾雜訊（純規則，零延遲）
    ├─► cleanContent() → Markdown 清洗
    │
    ├─ [smartExtraction: false] ──────┐
    │   └─► chunkText() → embed → dedup → store   (原始全文模式)
    │
    └─ [smartExtraction: true] ───────┐
        └─► LLM extract → 結構化記憶候選
            └─► importance filter → embed → dedup → store (精煉模式)
```

---

## 💻 系統要求與準備

在啟用本外掛前，請確保：

1. **安裝 LM Studio**：
   - 啟動 Local Server（預設 `http://127.0.0.1:1234/v1`）。
   - 載入推薦的 Embedding 模型：`snowflake-arctic-embed-l-v2.0-finetuned-amharic-final` (1024 維度)。
2. **安裝 Qdrant**：
   - 可使用 Docker 快速啟動：`docker run -p 6333:6333 qdrant/qdrant`。
   - 保證伺服器 IP (預設 `http://127.0.0.1:6333`) 是開放的。
3. **(選用) Smart Extraction**：
   - 需要一個 Chat Completion 端點（例如 OpenClaw Gateway）。
   - 預設使用 `http://localhost:18789/v1` + `Doubao-Seed-2.0-Code`。

---

## 📦 安裝方式

### 方法一：專案本地連接 (推薦給開發者)

若您已經將此版本庫 clone 下來，您只需進入資料夾並安裝相依套件：

```bash
cd <您的外掛路徑>/memory-qdrant
npm install
```

接著，將路徑註冊到 `openclaw.json` (詳見後續設定)。

---

## ⚙️ OpenClaw 設定與啟動

### 基本設定（原文模式 + Noise Filter）

```json5
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
          "qdrantUrl": "http://192.168.0.163:6333",
          "collectionName": "memories_tr",
          "embeddingBaseUrl": "http://127.0.0.1:1234/v1",
          "embeddingModel": "text-embedding-desu-snowflake-arctic-embed-l-v2.0-finetuned-amharic-final",
          "defaultUserId": "your-user-id",
          "defaultAgentId": "main",
          "autoCapture": true,
          "autoRecall": false
        }
      }
    }
  }
}
```

### 進階設定（啟用 LLM 智慧精煉）

```json5
{
  "plugins": {
    "entries": {
      "memory-qdrant": {
        "config": {
          // ... 基本設定同上 ...
          "smartExtraction": true,                    // 啟用 LLM 精煉
          "extractionLlmBaseUrl": "http://localhost:18789/v1",  // OpenClaw Gateway
          "extractionLlmModel": "Doubao-Seed-2.0-Code",         // 火山引擎模型
          "extractionMaxChars": 8000,                 // 送入 LLM 的最大字元數
          "extractionMinImportance": "medium"          // 低於 medium 自動丟棄
        }
      }
    }
  }
}
```

設定完成後，重啟 OpenClaw 環境即可生效：

```bash
openclaw gateway restart
```

---

## 🧠 Smart Extraction 記憶分類

| 分類 | 說明 | 重要性 |
|------|------|--------|
| `preference` | 使用者偏好、習慣、風格 | high |
| `decision` | 明確做出的決定 | high |
| `fact` | 關於使用者或專案的事實 | medium |
| `entity` | 重要的名稱、ID、帳號 | medium |
| `reflection` | 學到的教訓、Bug 根因 | high |
| `other` | 有價值但不屬上述分類的資訊 | varies |

---

## 🚫 Noise Filter 過濾規則

| 類別 | 範例 |
|------|------|
| 極短無意義回覆 | ok、好、收到、嗯、thx |
| 招呼語 / 樣板 | hello、你好、HEARTBEAT |
| Agent 否定回應 | I don't remember、未找到相關記憶 |
| 元問題 | 你還記得嗎、do you remember |
| 系統信封雜訊 | `<<<EXTERNAL_UNTRUSTED_CONTENT` |
| Slash 指令 | `/recall`、`/remember` |
| 診斷產出 | query -> none |

---

## 🛠 技術規格

### Payload Schema 一致性
v3.0 向後相容 TrueRecall Python 的儲存格式。Smart Extraction 模式新增 `category` 和 `importance` 欄位，`source` 標記為 `smart-extraction`。

標準欄位：
- `user_id`, `agent_id`, `role`, `content`, `full_content_length`
- `turn`, `timestamp`, `date`, `source`, `curated`
- `chunk_index`, `total_chunks`
- (v3.0 新增) `category`, `importance`

### API 工具介面 (MCP 相容)

1. **`memory_store`**: 寫入特定新記憶
2. **`memory_search`**: 提供高精準語義查詢
3. **`memory_forget`**: 透過精準比對刪除

---

## 💡 常見問題

**Q：v3.0 升級後需要重建 Collection 嗎？**
A：不用！v3.0 完全向後相容 v2.0 的 Collection，新增的 `category` 和 `importance` 欄位是可選的。

**Q：啟動外掛卻報錯「fetch failed」？**
A：通常是因為 LM Studio Local Server 尚未開啟。請先啟動 LM Studio Server。

**Q：Smart Extraction 開不開差在哪？**
A：關閉時（預設），使用原文Chunking +語義去重模式。開啟後，對話會先經過 LLM 精煉，提取結構化記憶，低重要性自動丟棄。

**Q：需要開著 Python 背景監聽腳本嗎？**
A：**完全不用！** v2.0 起已完全取代 Python 輪詢腳本。

## 授權條款

MIT
