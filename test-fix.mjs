import { batchExtract } from './smart-extractor.js';

const testConvo = [
  "使用者: 我今天在蝦皮上架了 3 個新商品，定價策略是成本加 30% 利潤",
  "助理: 了解！我幫你記下了。3 個新商品，成本加 30% 的定價策略。請問是哪些商品類別？",
  "使用者: 都是手機殼，iPhone 16 系列的",
].join('\n');

console.log('Testing batchExtract with LM Studio...');
console.log('Model: qwen3.6-35b-a3b-uncensored-heretic-apex');
console.log('Endpoint: http://127.0.0.1:1234/v1\n');

try {
  const results = await batchExtract(testConvo, {
    llmBaseUrl: 'http://127.0.0.1:1234/v1',
    llmModel: 'qwen3.6-35b-a3b-uncensored-heretic-apex',
    timeoutMs: 60000,
    maxChars: 8000,
    minImportance: 'medium',
    log: (msg) => console.log('[LOG]', msg),
  });
  
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nExtracted', results.length, 'memories');
} catch (err) {
  console.error('ERROR:', err.message);
}
