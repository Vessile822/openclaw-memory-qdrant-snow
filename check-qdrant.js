import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://192.168.0.163:6333' });

async function checkRecentMemories() {
  try {
    // 取得所有點，但我們特別找尋符合 UUID 格式的 ID
    const results = await client.scroll('memories_tr', {
      limit: 20,
      with_payload: true,
      with_vector: false,
    });

    console.log('--- 掃描記憶資料庫 (前 20 筆) ---');
    let uuidCount = 0;
    let numericCount = 0;

    results.points.forEach((p, i) => {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(p.id.toString());
      if (isUUID) uuidCount++; else numericCount++;

      console.log(`[${i+1}] ID: ${p.id} (${isUUID ? '✅ UUID' : '⚠️ Numeric'})`);
      console.log(`    Content: ${p.payload.content?.substring(0, 50).replace(/\n/g, ' ')}...`);
      console.log(`    Source: ${p.payload.source} | Date: ${p.payload.date}`);
      console.log('---------------------------');
    });
    
    console.log(`統計結果: UUID 格式: ${uuidCount} 筆, 舊式數字格式: ${numericCount} 筆`);
    
    if (results.points.length === 0) {
      console.log('目前 Qdrant 中沒有任何記憶。');
    }
  } catch (e) {
    console.error('查詢失敗:', e.message);
  }
}

checkRecentMemories();
