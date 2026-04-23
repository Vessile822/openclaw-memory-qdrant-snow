/**
 * Noise Filter — 雜訊過濾器
 *
 * 過濾無記憶價值的訊息（短回覆、招呼語、Agent 否定回應、元問題、系統信封）。
 * 參考 CortexReach/memory-lancedb-pro 的 noise-filter.ts 架構，
 * 並針對繁體中文/簡體中文對話場景加強。
 *
 * @module noise-filter
 */

// ============================================================================
// 極短無意義回覆（中英文）
// ============================================================================

const SHORT_ACK_PATTERNS = [
  /^(ok|okay|k|yes|no|yep|nope|sure|right|yup|nah|cool|fine|thx|thanks|ty|np|gg|lol|lmao|omg|wow)\.?!?$/i,
  /^(好|嗯|恩|對|是|不|可以|沒問題|收到|了解|明白|知道了|懂|行|得|OK|好的|好喔|好哦|好啊|好吧|了|阿|欸|喔|唷|耶|哈|嘿|嗨|讚|棒|酷|爽)$/,
  /^(thank you|thank u|got it|roger|noted|understood|will do|done|same|agree|agreed|indeed|exactly|correct|right|true|false)\.?!?$/i,
];

// ============================================================================
// 招呼語 / 會話樣板
// ============================================================================

const BOILERPLATE_PATTERNS = [
  /^(hi|hello|hey|yo|sup|good morning|good evening|good night|greetings|howdy)[\s,.!?]*$/i,
  /^(你好|哈囉|嗨|早安|午安|晚安|大家好|安安|早啊|嗨嗨|哈嘍)[\s,.!?]*$/,
  /^(fresh session|new session|new chat|start|begin)[\s,.!?]*$/i,
  /^HEARTBEAT$/i,
  /^\/(?:recall|remember|forget|search|store)\b/i,  // slash 指令
];

// ============================================================================
// Agent 否定回應 — Agent 說「我不知道/不記得」
// ============================================================================

const DENIAL_PATTERNS = [
  /i don'?t have (any )?(information|data|memory|record)/i,
  /i'?m not sure about/i,
  /i don'?t recall/i,
  /i don'?t remember/i,
  /it looks like i don'?t/i,
  /i wasn'?t able to find/i,
  /no (relevant )?memories found/i,
  /i don'?t have access to/i,
  /未找到相關記憶/,
  /沒有找到.*記憶/,
  /找不到.*紀錄/,
  /我不太確定/,
  /我沒有.*相關.*資[訊料]/,
];

// ============================================================================
// 元問題 — 關於記憶本身的提問（不應被儲存為記憶）
// ============================================================================

const META_QUESTION_PATTERNS = [
  /\bdo you (remember|recall|know about)\b/i,
  /\bcan you (remember|recall)\b/i,
  /\bdid i (tell|mention|say|share)\b/i,
  /\bhave i (told|mentioned|said)\b/i,
  /\bwhat did i (tell|say|mention)\b/i,
  // 繁體中文
  /你還?記得/,
  /記不記得/,
  /還記得.*嗎/,
  /你[知曉]道.+嗎/,
  /我(?:之前|上次|以前)(?:說|提|講).*(?:嗎|呢|？|\?)/,
  // 簡體中文
  /如果你知道.+只回复/i,
  /如果不知道.+只回复\s*none/i,
  /只回复精确代号/i,
  /只回复\s*none/i,
];

// ============================================================================
// 系統 / 頻道信封雜訊
// ============================================================================

const ENVELOPE_NOISE_PATTERNS = [
  /^<<<EXTERNAL_UNTRUSTED_CONTENT\b/im,
  /^<<<END_EXTERNAL_UNTRUSTED_CONTENT\b/im,
  /^Sender\s*\(untrusted metadata\):/im,
  /^Conversation info\s*\(untrusted metadata\):/im,
  /^Thread starter\s*\(untrusted, for context\):/im,
  /^Forwarded message context\s*\(untrusted metadata\):/im,
  /^\[Queued messages while agent was busy\]/im,
  /^System:\s*\[[\d\-: +GMT]+\]/im,
];

// ============================================================================
// 提取器產出的診斷雜訊
// ============================================================================

const DIAGNOSTIC_ARTIFACT_PATTERNS = [
  /\bquery\s*->\s*(none|no explicit solution|unknown|not found)\b/i,
  /\buser asked for\b.*\b(none|no explicit solution|unknown|not found)\b/i,
  /\bno explicit solution\b/i,
];

// ============================================================================
// 導出函式
// ============================================================================

/**
 * 判斷文字是否為雜訊（應被過濾的無記憶價值內容）。
 *
 * @param {string} text 要檢查的文字
 * @param {object} [options] 可選設定
 * @param {boolean} [options.filterDenials=true] 過濾 Agent 否定回應
 * @param {boolean} [options.filterMetaQuestions=true] 過濾元問題
 * @param {boolean} [options.filterBoilerplate=true] 過濾招呼語/樣板
 * @returns {boolean} 如果是雜訊回傳 true
 */
export function isNoise(text, options = {}) {
  const {
    filterDenials = true,
    filterMetaQuestions = true,
    filterBoilerplate = true,
  } = options;

  if (!text || typeof text !== 'string') return true;

  const trimmed = text.trim();

  // 1. 極短文字（< 5 字元直接丟棄）
  if (trimmed.length < 5) return true;

  // 2. 極短無意義回覆
  if (SHORT_ACK_PATTERNS.some((p) => p.test(trimmed))) return true;

  // 3. 招呼語 / 樣板
  if (filterBoilerplate && BOILERPLATE_PATTERNS.some((p) => p.test(trimmed)))
    return true;

  // 4. Agent 否定回應
  if (filterDenials && DENIAL_PATTERNS.some((p) => p.test(trimmed)))
    return true;

  // 5. 元問題（關於記憶本身的提問）
  if (filterMetaQuestions && META_QUESTION_PATTERNS.some((p) => p.test(trimmed)))
    return true;

  // 6. 系統信封雜訊
  if (ENVELOPE_NOISE_PATTERNS.some((p) => p.test(trimmed))) return true;

  // 7. 診斷產出
  if (DIAGNOSTIC_ARTIFACT_PATTERNS.some((p) => p.test(trimmed))) return true;

  return false;
}

/**
 * 泛型過濾器 — 從陣列中移除雜訊項目。
 *
 * @template T
 * @param {T[]} items 要過濾的項目
 * @param {(item: T) => string} getText 取得文字的函式
 * @param {object} [options] isNoise 的選項
 * @returns {T[]} 過濾後的項目
 */
export function filterNoise(items, getText, options) {
  return items.filter((item) => !isNoise(getText(item), options));
}
