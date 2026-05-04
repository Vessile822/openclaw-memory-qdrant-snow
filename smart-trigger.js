/**
 * Smart Trigger — 智慧搜尋意圖觸發器
 *
 * 使用啟發式規則與正則表達式，判斷使用者對話是否展現出「資訊需求意圖」。
 * 藉此取代無腦的全時搜尋 (autoRecall)，降低系統開銷與無謂的 context 污染。
 *
 * @module smart-trigger
 */

/**
 * 判斷文字是否包含需要檢索歷史記憶的意圖
 * @param {string} text 來自使用者的輸入
 * @returns {boolean} 是否需要觸發 Qdrant 記憶搜尋
 */
export function shouldTriggerSearch(input) {
  let text = '';
  if (Array.isArray(input)) {
    text = input.map(m => m.content || '').join('\n');
  } else if (typeof input === 'string') {
    text = input;
  }

  if (!text) return { triggered: false };

  const trimmed = text.trim();

  // 1. 顯式記憶關鍵字 (Explicit Memory Keywords)
  const explicitPatterns = [
    /記得/i, /之前/i, /上次/i, /以前/i, /曾經/i,
    /remember/i, /recall/i, /last time/i, /previously/i
  ];
  for (const p of explicitPatterns) {
    if (p.test(trimmed)) return { triggered: true, reason: '顯式記憶關鍵字', query: trimmed };
  }

  // 2. 資訊需求意圖 (Information Needs + Past Tense/Context)
  const infoPatterns = [
    /(怎麼|如何|哪裡|什麼時候|為什麼|啥時).+(設定|弄|用|寫|解決|發生|做)的/i,
    /how did (we|i) (do|fix|setup|configure|make)/i,
    /what was (that|the)/i,
    /where did (we|i) put/i
  ];
  for (const p of infoPatterns) {
    if (p.test(trimmed)) return { triggered: true, reason: '資訊需求探詢', query: trimmed };
  }

  // 3. 個人化問句 (Personalization Queries)
  const personalPatterns = [
    /你知道(我|我們)/i,
    /(我|我們)的(設定|習慣|偏好|專案|代碼|環境)/i,
    /my (settings|preferences|project|code|environment)/i,
    /do you know (me|us)/i
  ];
  for (const p of personalPatterns) {
    if (p.test(trimmed)) return { triggered: true, reason: '個人化問句', query: trimmed };
  }

  // 4. 專案/技術回顧 (Project / Tech Retrospectives)
  const retroPatterns = [
    /(那個|這個)(專案|設定|配置|環境|腳本)/i,
    /(that|the) (project|setup|configuration|script)/i
  ];
  for (const p of retroPatterns) {
    if (p.test(trimmed)) return { triggered: true, reason: '專案技術回顧', query: trimmed };
  }

  // 5. 否定式探詢 (Negative Probing)
  const negativePatterns = [
    /忘了/i, /不記得/i, /想不起來/i,
    /forgot/i, /don't remember/i, /can't recall/i
  ];
  for (const p of negativePatterns) {
    if (p.test(trimmed)) return { triggered: true, reason: '忘記與探詢', query: trimmed };
  }

  return { triggered: false };
}
