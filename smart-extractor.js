/**
 * Smart Extractor — LLM 智慧記憶精煉擷取器
 *
 * 使用 LLM（Chat Completion API）從對話中提取結構化記憶片段，
 * 取代原本的全量逐字側錄。
 *
 * Pipeline: conversation → LLM extract → candidates → importance filter → return
 *
 * @module smart-extractor
 */

// ============================================================================
// 常數
// ============================================================================

const VALID_CATEGORIES = new Set([
  'profile',
  'preferences',
  'entities',
  'events',
  'cases',
  'patterns',
]);

const IMPORTANCE_LEVELS = {
  high: 3,
  medium: 2,
  low: 1,
};

/** 預設只保留 medium 以上的記憶 */
const DEFAULT_MIN_IMPORTANCE = 'medium';

const DEFAULT_TIMEOUT_MS = 30000;

// ============================================================================
// Extraction Prompt
// ============================================================================

/**
 * 建構精煉擷取的 System Prompt。
 */
function buildExtractionSystemPrompt() {
  return `你是一個記憶提取引擎。你的任務是從對話中提取有長期記憶價值的資訊。

## 什麼值得記憶？
- 個性化資訊：特定於該使用者的資訊，而非通用領域知識
- 長期有效性：在未來的對話中仍然有用的資訊
- 具體且清晰：包含具體細節，而非模糊的概括

## 什麼「不」值得記憶？
- 任何人都能知道的通用知識
- 系統/平台 metadata：message IDs, sender IDs, timestamps, json envelopes 等基礎設施雜訊，絕對不要提取
- 暫時性資訊：一次性的問題或對話
- 模糊資訊：「使用者對某個功能有疑問」（沒有具體細節）
- 工具輸出、錯誤日誌或樣板文字
- 召回查詢/元問題：「你記得 X 嗎？」、「你知道我喜歡什麼嗎？」——這些是檢索請求，不是要儲存的新資訊

## 核心分類邏輯
- profile - 使用者身分（靜態屬性）。測試：「使用者是...」
- preferences - 使用者偏好（傾向）。測試：「使用者偏好/喜歡...」
- entities - 持續存在的名詞。測試：「XXX的狀態是...」
- events - 發生過的事情。測試：「XXX做了/完成了...」
- cases - 問題 + 解決方案。測試：包含「問題 -> 解決方案」
- patterns - 可重複使用的流程。測試：可用於「類似情況」

常見混淆：
- 「計畫做 X」 -> events (行動，非實體)
- 「專案 X 狀態：Y」 -> entities (描述實體)
- 「遇到問題 A，使用方案 B」 -> cases (非 events)
- 「處理某些問題的通用流程」 -> patterns (非 cases)

## 三層結構 (Three-Level Structure)
每條記憶必須包含三個層級：
- abstract (L0): 一行索引。Merge 型別 (preferences/entities/profile/patterns) 格式為 \`[Merge key]: [Description]\`。獨立型別 (events/cases) 為具體描述。
- overview (L1): 結構化的 Markdown 摘要（帶有特定分類標題）
- content (L2): 完整的敘述，包含背景與細節。

## 重要性定義 (Importance)
- high: 影響未來決策的關鍵資訊（偏好、重要事實）
- medium: 有用但非關鍵的背景資訊
- low: 瑣碎、不太可能再被需要的資訊（提取時會自動被過濾）

## 輸出格式
回傳一個 JSON 物件：
{
  "memories": [
    {
      "category": "profile|preferences|entities|events|cases|patterns",
      "abstract": "一行的索引",
      "overview": "結構化 Markdown 摘要",
      "content": "完整的敘述",
      "importance": "high|medium|low"
    }
  ]
}

如果對話中沒有值得記憶的內容，回傳：
{ "memories": [] }`;
}

/**
 * 建構使用者訊息。
 */
function buildExtractionUserPrompt(conversationText, maxChars = 8000) {
  const truncated =
    conversationText.length > maxChars
      ? conversationText.slice(-maxChars)
      : conversationText;

  return `從以下對話中提取有記憶價值的資訊：

<conversation>
${truncated}
</conversation>

請提取記憶並以 JSON 格式回傳。`;
}

// ============================================================================
// LLM Client
// ============================================================================

class LLMClient {
  /**
   * @param {string} baseUrl API 基底網址
   * @param {string} model 模型名稱
   * @param {number} timeoutMs 超時時間（毫秒）
   */
  constructor(baseUrl, model, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 呼叫 Chat Completion API 並回傳 JSON 物件。
   * @param {string} systemPrompt 系統提示
   * @param {string} userPrompt 使用者提示
   * @returns {Promise<object|null>} 解析後的 JSON 物件，失敗回傳 null
   */
  async completeJson(systemPrompt, userPrompt) {
    const url = `${this.baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`LLM API 失敗 (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) return null;

      // 嘗試解析 JSON（處理 markdown 包裝的情況）
      let jsonStr = content.trim();
      // 移除 ```json ... ``` 包裝
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      return JSON.parse(jsonStr);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`LLM 請求超時 (${this.timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ============================================================================
// Smart Extractor 主函式
// ============================================================================

/**
 * 從對話文字中提取結構化記憶片段。
 *
 * @param {string} conversationText 要精煉的對話文字
 * @param {object} options 設定
 * @param {string} options.llmBaseUrl LLM API 端點
 * @param {string} options.llmModel LLM 模型名稱
 * @param {number} [options.timeoutMs=30000] LLM 超時時間
 * @param {number} [options.maxChars=8000] 送入 LLM 的最大對話長度
 * @param {string} [options.minImportance='medium'] 最低重要性等級
 * @param {function} [options.log] 日誌函式
 * @returns {Promise<Array<{category: string, content: string, importance: string}>>}
 */
export async function smartExtract(conversationText, options = {}) {
  const {
    llmBaseUrl,
    llmModel,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxChars = 8000,
    minImportance = DEFAULT_MIN_IMPORTANCE,
    log = () => {},
  } = options;

  if (!llmBaseUrl || !llmModel) {
    throw new Error('smartExtract: 必須提供 llmBaseUrl 和 llmModel');
  }

  const client = new LLMClient(llmBaseUrl, llmModel, timeoutMs);

  const systemPrompt = buildExtractionSystemPrompt();
  const userPrompt = buildExtractionUserPrompt(conversationText, maxChars);

  let result;
  try {
    result = await client.completeJson(systemPrompt, userPrompt);
  } catch (err) {
    log(`smart-extractor: LLM 呼叫失敗: ${err.message}`);
    return [];
  }

  if (!result || !Array.isArray(result.memories)) {
    log('smart-extractor: LLM 回傳格式異常，無有效記憶');
    return [];
  }

  // 過濾、驗證、標準化
  const minLevel = IMPORTANCE_LEVELS[minImportance] || 2;
  const validMemories = [];

  for (const raw of result.memories) {
    if (!raw || typeof raw !== 'object') continue;

    // 驗證 category
    const category = (raw.category || 'other').toLowerCase();
    if (!VALID_CATEGORIES.has(category)) continue;

    // 驗證 abstract, overview, content
    const abstract = (raw.abstract || '').trim();
    const overview = (raw.overview || '').trim();
    const content = (raw.content || '').trim();
    if (!content || content.length < 5) continue;

    // 驗證 importance
    const importance = (raw.importance || 'medium').toLowerCase();
    const level = IMPORTANCE_LEVELS[importance] || 1;

    // 低重要性自動丟棄
    if (level < minLevel) {
      log(
        `smart-extractor: 丟棄低重要性 [${category}/${importance}]: ${abstract || content.slice(0, 60)}`
      );
      continue;
    }

    validMemories.push({
      category,
      abstract,
      overview,
      content,
      importance,
    });
  }

  log(`smart-extractor: 提取 ${validMemories.length} 條有效記憶（丟棄 ${result.memories.length - validMemories.length} 條）`);

  return validMemories;
}

/**
 * 建立 LLM Client 實例（供外部測試 / 健康檢查用）。
 */
export function createLLMClient(baseUrl, model, timeoutMs) {
  return new LLMClient(baseUrl, model, timeoutMs);
}
