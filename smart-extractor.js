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
  return `你是一個專業的記憶提取引擎。你的任務是分析對話內容，並提取值得長期保存的記憶片段。

## 什麼值得記憶？
- 個性化資訊：特定於該使用者的資訊，而非通用領域知識。
- 長期有效性：在未來的對話中仍然有用的資訊。
- 具體且清晰：包含具體細節，而非模糊的概括。

## 什麼「不」值得記憶？
- 任何人都能知道的通用知識。
- 系統/平台元數據 (Metadata)：message IDs, sender IDs, timestamps, channel info, JSON envelopes 等基礎設施雜訊，絕對不要提取。
- 暫時性資訊：一次性的問題或對話。
- 模糊資訊：「使用者對某個功能有疑問」（沒有具體細節）。
- 工具輸出、程式錯誤日誌或樣板文字。
- 運行時框架與編排包裝：如 "[Subagent Context]", "[Subagent Task]", 任務信封或代理指令——這些是執行元數據，絕對不要儲存為記憶。
- 召回查詢/元問題：「你記得 X 嗎？」、「你知道我喜歡什麼嗎？」——這些是檢索請求，不是要儲存的新資訊。
- 退化或不完整的引用：如果使用者含糊地提到某事（「我說過的那件事」），不要捏造細節或建立空洞的記憶。

# 記憶分類與邏輯

| 問題 | 答案 | 分類 (Category) |
|----------|--------|----------|
| 使用者是誰？ | 身分、屬性 | profile |
| 使用者偏好什麼？ | 偏好、習慣 | preferences |
| 這是什麼東西？ | 人物、專案、組織 | entities |
| 發生了什麼事？ | 決定、里程碑 | events |
| 如何解決的？ | 問題 + 解決方案 | cases |
| 流程是什麼？ | 可重複使用的步驟 | patterns |

## 精確定義
- **profile**: 使用者身分（靜態屬性）。測試：「使用者是...」
- **preferences**: 使用者偏好（傾向）。測試：「使用者偏好/喜歡...」
- **entities**: 持續存在的名詞。測試：「XXX 的狀態是...」
- **events**: 發生過的事情。測試：「XXX 做了/完成了...」
- **cases**: 問題 + 解決方案對。測試：包含「問題 -> 解決方案」
- **patterns**: 可重複使用的流程。測試：可用於「類似情況」

## 常見混淆澄清
- 「計畫做 X」 -> events (行動，非實體)
- 「專案 X 狀態：Y」 -> entities (描述實體)
- 「使用者偏好 X」 -> preferences (非 profile)
- 「遇到問題 A，使用方案 B」 -> cases (非 events)
- 「處理某些問題的通用流程」 -> patterns (非 cases)

# 三層結構 (Three-Level Structure)

每條記憶必須包含三個層級：

**abstract (L0)**: 一行索引
- 合併型別 (preferences/entities/profile/patterns): \`[合併鍵]: [描述]\`
- 獨立型別 (events/cases): 具體描述

**overview (L1)**: 結構化的 Markdown 摘要，帶有分類特定的標題。

**content (L2)**: 完整的敘述，包含背景與細節。

# 重要性定義 (Importance)
- **high**: 影響未來決策的關鍵資訊（偏好、重要事實）。
- **medium**: 有用但非關鍵的背景資訊。
- **low**: 瑣碎、不太可能再被需要的資訊。

# Few-shot 範例

## profile
\`\`\`json
{
  "category": "profile",
  "abstract": "使用者基本資訊：AI 開發工程師，3 年 LLM 經驗",
  "overview": "## 背景\\n- 職業：AI 開發工程師\\n- 經驗：3 年 LLM 開發\\n- 技術堆疊：Python, LangChain",
  "content": "使用者是一名 AI 開發工程師，擁有 3 年的 LLM 應用開發經驗。",
  "importance": "high"
}
\`\`\`

## preferences
\`\`\`json
{
  "category": "preferences",
  "abstract": "Python 程式碼風格：不使用類型提示，簡潔直接",
  "overview": "## 偏好領域\\n- 語言：Python\\n- 主題：程式碼風格\\n\\n## 細節\\n- 不使用類型提示 (Type Hints)\\n- 簡潔的函式註釋\\n- 直接的實作方式",
  "content": "使用者偏好不帶類型提示的 Python 程式碼，並要求函式註釋保持簡潔。",
  "importance": "medium"
}
\`\`\`

## cases
\`\`\`json
{
  "category": "cases",
  "abstract": "LanceDB BigInt 數值處理問題",
  "overview": "## 問題\\nLanceDB 0.26+ 版本對數值欄位回傳 BigInt\\n\\n## 解決方案\\n在進行算術運算前使用 Number(...) 強制轉換數值",
  "content": "當 LanceDB 回傳 BigInt 數值時，在執行任何算術運算之前，必須先用 Number() 將其包裝轉換。",
  "importance": "high"
}
\`\`\`

# 輸出格式

請回傳 JSON 格式：
{
  "memories": [
    {
      "category": "profile|preferences|entities|events|cases|patterns",
      "abstract": "一行索引",
      "overview": "結構化 Markdown 摘要",
      "content": "完整敘述",
      "importance": "high|medium|low"
    }
  ]
}

注意：
- 輸出語言應與對話中的主導語言一致（主要為繁體中文）。
- 僅提取真正有價值的個性化資訊。
- 如果沒有值得記錄的內容，回傳 {"memories": []}。
- 每次提取最多 5 條記憶。
- 偏好應按主題聚合。`;
}

/**
 * 建構去重決策 Prompt。
 */
function buildDedupPrompt(candidateAbstract, candidateOverview, candidateContent, existingMemories) {
  return `請判斷如何處理這條候選記憶。

**候選記憶**:
摘要 (Abstract): ${candidateAbstract}
概覽 (Overview): ${candidateOverview}
內容 (Content): ${candidateContent}

**現有的相似記憶**:
${existingMemories}

請做出決定：
- **SKIP**: 候選記憶與現有記憶重複，無需儲存。如果候選記憶包含的資訊少於關於同一主題的現有記憶（資訊退化），也請選擇 SKIP。
- **CREATE**: 這是現有記憶未涵蓋的全新資訊，應建立。
- **MERGE**: 候選記憶為現有記憶增加了真正的新細節，應進行合併。
- **SUPERSEDE**: 候選記憶表明同一個可變事實隨時間發生了變化。將舊記憶保留為歷史但不再是當前狀態，並建立一條新的當前記憶。
- **SUPPORT**: 候選記憶在特定情境下強化/確認了現有記憶（例如「晚上仍然偏好喝茶」）。
- **CONTEXTUALIZE**: 候選記憶為現有記憶增加了情境細節（例如現有：「喜歡咖啡」，候選：「晚上偏好喝茶」——同一主題，不同情境）。
- **CONTRADICT**: 候選記憶在特定情境下與現有記憶直接矛盾（例如現有：「週末跑步」，候選：「停止在週末跑步」）。

重要規則：
- "events" 和 "cases" 分類是獨立記錄——它們不支援 MERGE/SUPERSEDE/SUPPORT/CONTEXTUALIZE/CONTRADICT。對於這些分類，僅使用 SKIP 或 CREATE。
- 如果候選記憶似乎源於召回問題（例如「你記得 X 嗎？」），且現有記憶已涵蓋主題 X 且細節相等或更多，則必須選擇 SKIP。
- 資訊量少於同一主題現有記憶的候選記憶絕不應 CREATE 或 MERGE——始終 SKIP。
- 對於 "preferences" 和 "entities"，當候選記憶取代了當前事實而非增加細節或情境時，請使用 SUPERSEDE。
- 對於 SUPPORT/CONTEXTUALIZE/CONTRADICT，必須從以下詞彙中提供一個 context_label：general, morning, evening, night, weekday, weekend, work, leisure, summer, winter, travel。

請回傳 JSON 格式：
{
  "decision": "skip|create|merge|supersede|support|contextualize|contradict",
  "match_index": 1,
  "reason": "決定原因",
  "context_label": "evening"
}

- 如果決定是 "merge"/"supersede"/"support"/"contextualize"/"contradict"，請將 "match_index" 設置為現有記憶的編號（從 1 開始）。
- 僅在 decision 為 support/contextualize/contradict 時包含 "context_label"。`;
}

/**
 * 建構合併 Prompt。
 */
function buildMergePrompt(existingAbstract, existingOverview, existingContent, newAbstract, newOverview, newContent, category) {
  return `將以下記憶合併為一條包含三個層級的連貫記錄。

** 分類 (Category) **: ${category}

** 現有記憶:**
    摘要 (Abstract): ${existingAbstract}
    概覽 (Overview):
${existingOverview}
    內容 (Content):
${existingContent}

** 新資訊:**
    摘要 (Abstract): ${newAbstract}
    概覽 (Overview):
${newOverview}
    內容 (Content):
${newContent}

  要求：
  - 移除重複資訊。
  - 保留最新的細節。
  - 保持敘述連貫。
  - 當程式碼標識符 / URI / 模型名稱是專有名詞時，保持不變。

請回傳 JSON：
  {
    "abstract": "合併後的一行摘要",
    "overview": "合併後的結構化 Markdown 概覽",
    "content": "合併後的完整內容"
  } `;
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

    let response;
      try {
        response = await fetch(url, {
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
           throw new Error('API Error: ' + response.status + ' ' + response.statusText);
        }
      } catch (err) {
        console.warn('⚠️ LM Studio 模型調用失敗，嘗試 Fallback 到 Gemini API: ', err.message);
        
        // Fallback 到 Gemini API
        try {
          const cfgStr = require('fs').readFileSync('C:\\Users\\Vess\\.openclaw\\openclaw.json', 'utf8');
          const apiKey = JSON.parse(cfgStr).models.providers.google.apiKey;
          
          const gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               system_instruction: { parts: { text: systemPrompt } },
               contents: [{ parts: [{ text: userPrompt }] }],
               generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
             }),
             signal: controller.signal,
          });
          
          if (!gRes.ok) throw new Error('Gemini Fallback 失敗');
          const gData = await gRes.json();
          let rawContent = gData.candidates[0].content.parts[0].text.trim();
          
          return JSON.parse(rawContent);
        } catch (fbErr) {
          console.error('❌ Fallback 也失敗: ', fbErr.message);
          return null;
        }
      }

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
 * @returns {Promise<Array<{category: string, abstract: string, overview: string, content: string, importance: string}>>}
 */
export async function batchExtract(conversationText, options = {}) {
  const {
    llmBaseUrl,
    llmModel,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxChars = 8000,
    minImportance = DEFAULT_MIN_IMPORTANCE,
    log = () => { },
  } = options;

  if (!llmBaseUrl || !llmModel) {
    throw new Error('batchExtract: 必須提供 llmBaseUrl 和 llmModel');
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
 * 決定如何處理候選記憶。
 */
export async function decideMerge(candidate, similarMemories, client) {
  if (!similarMemories || similarMemories.length === 0) {
    return { decision: 'create' };
  }

  const existingMemoriesText = similarMemories.map((m, i) => {
    return `[${i + 1}] Category: ${m.category}\nAbstract: ${m.abstract}\nOverview: ${m.overview}\nContent: ${m.content}`;
  }).join('\n\n');

  const prompt = buildDedupPrompt(candidate.abstract, candidate.overview, candidate.content, existingMemoriesText);

  try {
    const result = await client.completeJson(prompt, "請根據上述資訊做出決定。");
    if (result && result.decision) {
      return result;
    }
  } catch (err) {
    console.error("decideMerge error:", err);
  }

  return { decision: 'create' };
}

/**
 * 合併記憶。
 */
export async function mergeMemories(existing, candidate, category, client) {
  const prompt = buildMergePrompt(
    existing.abstract, existing.overview, existing.content,
    candidate.abstract, candidate.overview, candidate.content,
    category
  );

  try {
    const result = await client.completeJson(prompt, "請合併這兩條記憶。");
    if (result && result.abstract && result.content) {
      return result;
    }
  } catch (err) {
    console.error("mergeMemories error:", err);
  }

  // Fallback: just use candidate if merge fails
  return {
    abstract: candidate.abstract,
    overview: candidate.overview,
    content: candidate.content
  };
}

/**
 * 處理批次記憶提取與合併。
 * @param {string} conversationText 
 * @param {function} searchCuratedFn async (text) => [{ id, category, abstract, overview, content }]
 * @param {object} options 
 * @returns {Promise<Array<{type: string, payload: object, id?: string}>>}
 */
export async function processBatch(conversationText, searchCuratedFn, options = {}) {
  const {
    llmBaseUrl,
    llmModel,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    log = () => { },
  } = options;

  const client = new LLMClient(llmBaseUrl, llmModel, timeoutMs);
  const candidates = await batchExtract(conversationText, options);
  const operations = [];

  for (const candidate of candidates) {
    // 尋找相似的已整理記憶
    const similarMemories = await searchCuratedFn(candidate.content);

    const decisionResult = await decideMerge(candidate, similarMemories, client);
    const decision = (decisionResult.decision || 'create').toLowerCase();

    log(`Decision for candidate "${candidate.abstract}": ${decision}`);

    if (decision === 'skip') {
      continue;
    } else if (decision === 'create') {
      operations.push({ type: 'CREATE', payload: candidate });
    } else if (['merge', 'supersede', 'support', 'contextualize', 'contradict'].includes(decision)) {
      const matchIndex = decisionResult.match_index ? decisionResult.match_index - 1 : 0;
      const targetMemory = similarMemories[matchIndex];

      if (!targetMemory) {
        operations.push({ type: 'CREATE', payload: candidate });
        continue;
      }

      if (decision === 'merge' || decision === 'support' || decision === 'contextualize') {
        const merged = await mergeMemories(targetMemory, candidate, candidate.category, client);
        operations.push({
          type: 'UPDATE',
          id: targetMemory.id,
          payload: {
            ...candidate,
            abstract: merged.abstract,
            overview: merged.overview,
            content: merged.content
          }
        });
      } else if (decision === 'supersede' || decision === 'contradict') {
        // Supersede: archive old, create new
        operations.push({ type: 'ARCHIVE', id: targetMemory.id });
        operations.push({ type: 'CREATE', payload: candidate });
      }
    }
  }

  return operations;
}

/**
 * 建立 LLM Client 實例（供外部測試 / 健康檢查用）。
 */
export function createLLMClient(baseUrl, model, timeoutMs) {
  return new LLMClient(baseUrl, model, timeoutMs);
}
