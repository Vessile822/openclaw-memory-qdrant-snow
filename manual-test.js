import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';

// 這裡我們直接模擬 index.js 裡的 store 邏輯來驗證
async function manualStoreTest() {
  const client = new QdrantClient({ url: 'http://192.168.0.163:6333' });
  const collectionName = 'memories_tr';

  const text = "小靈正在驗證 UUID ID 修復：這是一條測試記憶 🚀 " + new Date().toISOString();
  
  console.log('1. 正在取得 Embedding...');
  const embRes = await fetch('http://127.0.0.1:1234/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-desu-snowflake-arctic-embed-l-v2.0-finetuned-amharic-final'
    })
  });
  const embData = await embRes.json();
  const vector = embData.data[0].embedding;

  console.log('2. 產生 UUID ID...');
  const hashInput = `test-user:turn:999:chunk0:${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
  const hashBytes = crypto.createHash('sha256').update(hashInput).digest();
  const hex = hashBytes.subarray(0, 16).toString('hex');
  const pointId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');

  console.log(`   Generated ID: ${pointId}`);

  console.log('3. 執行 Qdrant Upsert...');
  try {
    await client.upsert(collectionName, {
      points: [{
        id: pointId,
        vector: vector,
        payload: {
          content: text,
          source: 'manual-verify',
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
          turn: 999
        }
      }]
    });
    console.log('✅ 成功！Qdrant 接受了這個 UUID ID。');
  } catch (e) {
    console.error('❌ 失敗！', e.message);
  }
}

manualStoreTest();
