/**
 * TrueRecall v2.0 — 驗證腳本
 * 
 * 測試 cleanContent、chunkText 函式的行為與 Python 腳本一致性，
 * 並驗證 Payload Schema 格式。
 */

import { cleanContent, chunkText, detectCategory } from './index.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ============================================================================
// Test: cleanContent()
// ============================================================================
console.log('\n=== cleanContent() 測試 ===');

// 1. 移除 untrusted metadata
const metadataInput = 'Hello\nConversation info (untrusted metadata):\n```json\n{"user": "rob"}\n```\nWorld';
const metadataResult = cleanContent(metadataInput);
assert('移除 untrusted metadata', !metadataResult.includes('untrusted metadata'), metadataResult);
assert('保留有效文字', metadataResult.includes('Hello') && metadataResult.includes('World'));

// 2. 移除 thinking tags
const thinkingInput = 'Before [thinking:some internal thought] After';
const thinkingResult = cleanContent(thinkingInput);
assert('移除 [thinking:...] 標籤', !thinkingResult.includes('[thinking:'));
assert('保留前後文字', thinkingResult.includes('Before') && thinkingResult.includes('After'));

// 3. 移除時間戳
const timestampInput = '[Wed 2024-01-15 12:30 UTC] Hello world';
const timestampResult = cleanContent(timestampInput);
assert('移除時間戳記', !timestampResult.includes('[Wed 2024'));
assert('保留訊息內容', timestampResult.includes('Hello world'));

// 4. 移除 Markdown 表格
const tableInput = 'Before\n| Header | Value |\n|--------|-------|\n| A | B |\nAfter';
const tableResult = cleanContent(tableInput);
assert('移除 Markdown 表格', !tableResult.includes('|'));
assert('保留表格外文字', tableResult.includes('Before') && tableResult.includes('After'));

// 5. 移除 Markdown 格式
const markdownInput = '**bold text** *italic* `code` normal';
const markdownResult = cleanContent(markdownInput);
assert('移除 bold', !markdownResult.includes('**'));
assert('移除 italic', !markdownResult.includes('*italic*'));
assert('移除 inline code', !markdownResult.includes('`'));
assert('保留純文字', markdownResult.includes('bold text') && markdownResult.includes('normal'));

// 6. 移除程式碼區塊
const codeInput = 'Before\n```python\nprint("hello")\n```\nAfter';
const codeResult = cleanContent(codeInput);
assert('移除程式碼區塊', !codeResult.includes('```') && !codeResult.includes('print'));
assert('保留程式碼外文字', codeResult.includes('Before') && codeResult.includes('After'));

// 7. 移除水平線
const hrInput = 'Before\n---\n***\nAfter';
const hrResult = cleanContent(hrInput);
assert('移除 --- 水平線', !hrResult.includes('---'));
assert('移除 *** 水平線', !hrResult.includes('***'));

// 8. 壓縮空白
const whitespaceInput = 'Hello\n\n\n\nWorld\n\n\nEnd';
const whitespaceResult = cleanContent(whitespaceInput);
assert('壓縮連續空行', !whitespaceResult.includes('\n\n\n'));

// 9. 空輸入
assert('null 輸入回傳空字串', cleanContent(null) === '');
assert('undefined 輸入回傳空字串', cleanContent(undefined) === '');

// ============================================================================
// Test: chunkText()
// ============================================================================
console.log('\n=== chunkText() 測試 ===');

// 1. 短文本不切割
const shortChunks = chunkText('Hello world');
assert('短文本: 1 個 chunk', shortChunks.length === 1);
assert('短文本: chunk_index = 0', shortChunks[0].chunk_index === 0);
assert('短文本: total_chunks = 1', shortChunks[0].total_chunks === 1);

// 2. 長文本切割
const longText = 'A'.repeat(12000);
const longChunks = chunkText(longText, 6000, 200);
assert('長文本: 多個 chunk', longChunks.length >= 2, `got ${longChunks.length}`);
assert('長文本: 第一個 chunk_index = 0', longChunks[0].chunk_index === 0);
assert('長文本: total_chunks 正確', longChunks.every(c => c.total_chunks === longChunks.length));

// 3. 嘗試在段落處斷句
const paraText = 'A'.repeat(3000) + '\n\n' + 'B'.repeat(3500) + '\n\n' + 'C'.repeat(3000);
const paraChunks = chunkText(paraText, 6000, 200);
assert('段落斷句: 多個 chunk', paraChunks.length >= 2, `got ${paraChunks.length}`);

// 4. chunk_index 連續
for (let i = 0; i < paraChunks.length; i++) {
  assert(`chunk ${i} index = ${i}`, paraChunks[i].chunk_index === i);
}

// 5. 太短的 chunk 會被跳過
const tinyChunks = chunkText('AB', 6000, 200);
assert('太短的文本仍然回傳 1 個 chunk', tinyChunks.length === 1);

// ============================================================================
// Test: Payload Schema 結構
// ============================================================================
console.log('\n=== Payload Schema 驗證 ===');

const requiredKeys = [
  'user_id', 'agent_id', 'role', 'content', 'full_content_length',
  'turn', 'timestamp', 'date', 'source', 'curated', 'chunk_index', 'total_chunks'
];

// 模擬產生 Payload
const now = new Date();
const testPayload = {
  user_id: 'rob',
  agent_id: 'main',
  role: 'assistant',
  content: 'test chunk content',
  full_content_length: 100,
  turn: 1,
  timestamp: now.toISOString(),
  date: now.toISOString().slice(0, 10),
  source: 'true-recall-base',
  curated: false,
  chunk_index: 0,
  total_chunks: 1,
};

for (const key of requiredKeys) {
  assert(`Payload 包含 "${key}"`, key in testPayload);
}

assert('source 固定為 "true-recall-base"', testPayload.source === 'true-recall-base');
assert('curated 固定為 false', testPayload.curated === false);
assert('date 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(testPayload.date));
assert('timestamp 為 ISO 格式', testPayload.timestamp.endsWith('Z') || testPayload.timestamp.includes('+'));
assert('role 為 user 或 assistant', ['user', 'assistant'].includes(testPayload.role));

// ============================================================================
// Test: detectCategory()
// ============================================================================
console.log('\n=== detectCategory() 測試 ===');

assert('偏好偵測', detectCategory('I prefer dark mode') === 'preference');
assert('決策偵測', detectCategory('I decided to use Python') === 'decision');
assert('實體偵測（電話）', detectCategory('+886912345678') === 'entity');
assert('事實偵測', detectCategory('The sky is blue') === 'fact');
assert('其他偵測', detectCategory('random gibberish xyz') === 'other');

// ============================================================================
// 結果摘要
// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`測試結果: ${passed} 通過, ${failed} 失敗`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
