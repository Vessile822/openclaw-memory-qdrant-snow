# openclaw-memory-qdrant

OpenClaw 本地語義記憶外掛，基於 Qdrant 和 Transformers.js 實作零配置的語義搜尋。

**📦 ClawHub**: https://clawhub.ai/skills/memory-qdrant

## 特色

- 🧠 **本地語義搜尋** - 使用 Transformers.js 在本地產生嵌入向量 (Embeddings)
- 💾 **記憶體模式** - 零配置，無需外部服務
- 🔄 **自動擷取** - 透過 lifecycle hooks 自動記錄重要訊息
- 🎯 **智慧回想** - 根據上下文自動檢索相關記憶

## 安裝

### 透過 ClawHub（推薦）

```bash
clawhub install memory-qdrant
```

### 手動安裝

```bash
cd ~/.openclaw/plugins
git clone https://github.com/Vessile822/openclaw-memory-qdrant-snow.git memory-qdrant
cd memory-qdrant
npm install
```

### 安裝要求

**首次執行準備：**

1. **Node.js 版本**: 需要 Node.js ≥18.17
   ```bash
   node --version  # 檢查版本
   ```

2. **建構工具**（用於編譯原生相依性）：
   - **Windows**: Visual Studio Build Tools
     ```powershell
     npm install --global windows-build-tools
     ```
   - **macOS**: Xcode Command Line Tools
     ```bash
     xcode-select --install
     ```
   - **Linux**: build-essential
     ```bash
     sudo apt-get install build-essential  # Debian/Ubuntu
     sudo yum groupinstall "Development Tools"  # RHEL/CentOS
     ```

3. **網路連線**:
   - 安裝時需要存取 npmjs.com 下載相依套件
   - 首次執行時會從 huggingface.co 下載嵌入模型（約 25MB）
   - 如果配置了外部 Qdrant 伺服器，需要能連線該伺服器

4. **原生相依性**:
   - `sharp`: 影像處理函式庫（可能需要編譯）
   - `onnxruntime`: ML 推理引擎（可能需要編譯）
   - `undici`: HTTP 用戶端（透過 @qdrant/js-client-rest 引入）

### 推薦安裝方式

```bash
# 使用 npm ci 確保可重現的安裝（推薦用於生產環境）
npm ci

# 或者分步安裝（用於偵錯）
npm install --ignore-scripts  # 跳過 post-install 腳本
npm rebuild                    # 然後重新建構原生模組
```

### 故障排除

**問題：原生模組編譯失敗**
- 確保已安裝對應平台的建構工具
- 嘗試清理快取：`npm cache clean --force`
- 刪除 node_modules 重新安裝：`rm -rf node_modules && npm install`

**問題：模型下載失敗**
- 檢查網路連線和防火牆設定
- 確保能存取 huggingface.co
- 模型會快取在 `~/.cache/huggingface/` 目錄

**問題：Node 版本不相容**
- 升級到 Node.js 18.17 或更高版本
- 使用 nvm 管理多個 Node 版本：`nvm install 18 && nvm use 18`

## 設定

在 OpenClaw 設定檔中啟用外掛：

```json
{
  "plugins": {
    "memory-qdrant": {
      "enabled": true,
      "autoCapture": false,  // 預設關閉，需要時手動開啟
      "autoRecall": true,
      "captureMaxChars": 500
    }
  }
}
```

### 設定選項

- **qdrantUrl** (可選): 外部 Qdrant 服務位址，留空使用記憶體模式
- **autoCapture** (預設 false): 自動記錄對話內容，開啟前請注意隱私
- **autoRecall** (預設 true): 自動將相關記憶注入對話
- **captureMaxChars** (預設 500): 單條記憶最大字元數
- **maxMemorySize** (預設 1000): 記憶體模式下的最大記憶條數
  - 僅在記憶體模式下生效（未配置 qdrantUrl 時）
  - 達到上限時自動刪除最舊的記憶（LRU 汰換策略）
  - 範圍：100-1000000 條
  - 設定為 999999 表示無限制（不會自動刪除舊記憶）
  - ⚠️ 無限制模式可能導致記憶體耗盡，請謹慎使用
  - 外部 Qdrant 模式不受此限制

## 隱私與安全

### 資料儲存

- **記憶體模式**（預設）: 資料僅在程序執行期間保存，重啟後清空
- **Qdrant 模式**: 如果配置了 `qdrantUrl`，資料會發送到該伺服器
  - ⚠️ 僅配置受信任的 Qdrant 伺服器
  - 建議使用本地 Qdrant 實例或專用服務帳戶

### 網路存取

- **首次執行**: Transformers.js 會從 Hugging Face 下載模型檔案（約 25MB）
- **執行時**: 記憶體模式無網路請求；Qdrant 模式會連線設定的伺服器

### 自動擷取

- **autoCapture** 預設關閉，需要手動開啟
- 開啟後會自動記錄對話內容，可能包含敏感資訊
- 建議僅在個人環境使用，避免在共享或生產環境開啟

### 建議

1. 首次使用時在隔離環境測試
2. 審查 `index.js` 了解資料處理邏輯
3. 敏感環境建議鎖定相依版本（`npm ci`）
4. 定期檢查儲存的記憶內容

## 使用方式

外掛提供三個工具：

### memory_store
儲存重要訊息到長期記憶：

```javascript
memory_store({
  text: "使用者喜歡用 Opus 處理複雜任務",
  category: "preference",
  importance: 0.8
})
```

### memory_search
搜尋相關記憶：

```javascript
memory_search({
  query: "工作流程",
  limit: 5
})
```

### memory_forget
刪除特定記憶：

```javascript
memory_forget({
  memoryId: "uuid-here"
})
// 或透過搜尋刪除
memory_forget({
  query: "要刪除的內容"
})
```

## 技術細節

### 架構

- **向量資料庫**: Qdrant (記憶體模式)
- **嵌入模型 (Embedding)**: Xenova/all-MiniLM-L6-v2 (本地執行)
- **模組系統**: ES6 modules

### 關鍵實作

外掛使用**工廠函數模式**匯出工具，確保與 OpenClaw 的工具系統相容：

```javascript
export default {
  name: 'memory-qdrant',
  version: '1.0.0',
  tools: [
    () => ({
      name: 'memory_search',
      description: '...',
      parameters: { ... },
      execute: async (params) => { ... }
    })
  ]
}
```

### 常見問題

**Q: 為什麼要用工廠函數？**

A: OpenClaw 的工具系統會呼叫 `tool.execute()`，直接匯出物件會導致 `tool.execute is not a function` 錯誤。工廠函數確保每次呼叫都回傳新的工具實例。

**Q: 為什麼要用 ES6 modules？**

A: OpenClaw 的外掛載入器期望 ES6 模組格式。需要在 `package.json` 中設定 `"type": "module"`。

**Q: 資料儲存在哪裡？**

A: 記憶體模式下資料僅在程序執行期間保存。重啟後需要重新索引。未來版本會支援持久化儲存。

## 開發

```bash
# 安裝相依性
npm install

# 測試（需要 OpenClaw 環境）
openclaw gateway restart
```

## 授權條款

MIT

## 感謝

- [Qdrant](https://qdrant.tech/) - 向量資料庫
- [Transformers.js](https://huggingface.co/docs/transformers.js) - 本地 ML 推理
- [OpenClaw](https://openclaw.ai/) - AI 助手框架
