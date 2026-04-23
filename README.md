# openclaw-memory-qdrant (TrueRecall v2.0)

OpenClaw 官方支援的高效能記憶外掛，已全面升級為 **TrueRecall v2.0 架構**。
本外掛提供與 OpenClaw 原生整合的語義記憶庫 (Semantic Memory)，透過 Qdrant 向量資料庫與本地 LM Studio 服務提供企業級的長期記憶能力，完全取代舊版耗能的 Python 監聽腳本！

## 🚀 核心特色

- **純粹本地端、隱私優先**：依賴本地 LM Studio (OpenAI API 格式) 進行向量化，資料不上雲。
- **TrueRecall 完美繼承**：內建智能文本清理 (移除思維標籤、Markdown、時間戳記) 以及智慧分塊 (Chunking) 技術。
- **全自動擷取與語義去重**：對話結束後自動抓取重點並進行相似度校驗，確保記憶乾淨不重複。
- **高效能架構**：捨棄舊版輪詢腳本機制，改以外掛原生攔截儲存，不佔用額外背景資源。
- **精準跨會話記憶**：支援自動遞增 Turn ID 邏輯，保留連續交談中的完整時序。

---

## 💻 系統要求與準備

在啟用本外掛前，請確保：

1. **安裝 LM Studio**：
   - 啟動 Local Server（預設 `http://127.0.0.1:1234/v1`）。
   - 載入推薦的 Embedding 模型：`snowflake-arctic-embed-l-v2.0-finetuned-amharic-final` (1024 維度)。
2. **安裝 Qdrant**：
   - 可使用 Docker 快速啟動：`docker run -p 6333:6333 qdrant/qdrant`。
   - 保證伺服器 IP (預設 `http://127.0.0.1:6333`) 是開放的。

---

## 📦 安裝方式

### 方法一：專案本地連接 (推薦給開發者)

若您已經將此版本庫 clone 下來，您只需進入資料夾並安裝相依套件：

```bash
cd c:\Users\Vess\.openclaw\workspace\skills\memory-qdrant
npm install
```

接著，您需要將路徑註冊到 `openclaw.json` (詳見後續設定)。

---

## ⚙️ OpenClaw 設定與啟動

請在您的 OpenClaw 全域設定檔（通常位在 `~/.openclaw/openclaw.json`），將此記憶外掛掛上。

請參考以下範例：

```json5
{
  "plugins": {
    "allow": [
      "memory-qdrant" // 將您的外掛名稱加到允許列表中
    ],
    "slots": {
      "memory": "memory-qdrant" // 讓系統使用 qdrant 做為主要的預設記憶模組
    },
    "entries": {
      "memory-qdrant": {
        "enabled": true,
        "config": {
          "qdrantUrl": "http://192.168.0.163:6333", // 您的 Qdrant 位址
          "collectionName": "memories_tr", // 1024 維度的專屬集合
          "embeddingBaseUrl": "http://127.0.0.1:1234/v1", // LM Studio 位址
          "embeddingModel": "text-embedding-desu-snowflake-arctic-embed-l-v2.0-finetuned-amharic-final",
          "defaultUserId": "Vess", 
          "defaultAgentId": "main",
          "autoCapture": true, // 自動重點記憶
          "autoRecall": true   // 自動背景提取
        }
      }
    }
  }
}
```

設定完成後，重啟 OpenClaw 環境即可生效：

```bash
openclaw gateway restart
# 或是直接啟動您的 dashboard
```

---

## 🛠 技術規格與實作細節

### Payload Schema 一致性
此 v2 開發版本 100% 向後相容 TrueRecall Python 的儲存格式。寫入 Qdrant 的每一筆 Point 結構如下，確保您舊有外掛的記憶無縫銜接：

- `user_id`: 使用者識別碼
- `agent_id`: Agent 識別碼
- `role`: user 或 assistant
- `content`: 清潔後的分塊內容
- `full_content_length`: 原文長度
- `turn`: 跨會話計數器
- `timestamp` / `date`: 寫入時間
- `source`: `"true-recall-base"`
- `curated`: `false`
- `chunk_index` / `total_chunks`: 智能分塊資訊

### API 工具介面 ( MCP相容 )

本外掛向 OpenClaw 註冊下列能力 (Agent 會自動觸發)：
1. **`memory_store`**: 寫入特定新記憶
2. **`memory_search`**: 提供高精準語義查詢
3. **`memory_forget`**: 透過精準比對刪除

---

## 💡 常見問題

**Q：為什麼啟動外掛卻抱錯「fetch failed」？**
A：通常是因為您的 LM Studio Local Server 尚未開啟。請先去 LM Studio 啟動 Server 再啟動 OpenClaw。

**Q：寫入時遇到維度不匹配的問題（例如 expected length 384, got 1024）？**
A：這是舊版 Qdrant Collection (`openclaw_memories` 預設是 384 維度) 衝突所致。升級後請改用全新的 Collection (如 `memories_tr`)，以容納 1024 維度的向量。

**Q：需要開著 Python 背景監聽腳本 (`realtime_qdrant_watcher.py`) 嗎？**
A：**完全不用！** 升級 v2.0 之後這個外掛會原生自動處理攔截、清理、寫入。請徹底停用原本的 Python 輪詢腳本，以免記憶被重複寫入 2 遍！

## 授權條款

MIT
