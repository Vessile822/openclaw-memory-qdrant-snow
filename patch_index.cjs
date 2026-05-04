const fs = require('fs');

let content = fs.readFileSync('index.js', 'utf8');

// 1. Replace the agent_end hook
const agentEndStart = content.indexOf("api.on('agent_end', async (event) => {");
const agentEndEnd = content.indexOf("  // ==========================================================================\n  // 自動整理機制 (Auto Dream)");

if (agentEndStart !== -1 && agentEndEnd !== -1) {
  const newAgentEnd = `api.on('agent_end', async (event) => {
      if (!event.success || !event.messages || event.messages.length === 0)
        return;

      try {
        let currentTurn;
        try {
          currentTurn = (await db.getMaxTurn()) + 1;
        } catch (_) {
          currentTurn = 1;
        }

        const now = new Date();
        let totalStored = 0;
        let totalSkipped = 0;
        let totalNoiseFiltered = 0;

        const lastTurnMessages = extractLastTurnMessages(event.messages);
        if (lastTurnMessages.length === 0) return;

        for (const msg of lastTurnMessages) {
          if (!msg || typeof msg !== 'object') continue;

          const role = msg.role;
          if (!role || !['user', 'assistant'].includes(role)) continue;

          let rawContent = '';
          if (typeof msg.content === 'string') {
            rawContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block && typeof block === 'object' && block.type === 'text' && block.text) {
                rawContent += block.text;
              }
            }
          }

          if (!rawContent || rawContent.length < 5) continue;

          if (rawContent.includes('<relevant-memories>')) {
            rawContent = rawContent.replace(/<relevant-memories>[\\s\\S]*?<\\/relevant-memories>/gi, '').trim();
          }

          if (!rawContent || rawContent.length < 5) continue;

          if (isNoise(rawContent)) {
            totalNoiseFiltered++;
            api.logger.debug(\`memory-qdrant: 跳過雜訊: \${rawContent.slice(0, 50)}\`);
            continue;
          }

          const cleaned = cleanContent(rawContent);
          if (!cleaned || cleaned.length < 5) continue;

          const chunks = chunkText(cleaned);

          for (const chunk of chunks) {
            try {
              const vector = await embeddings.embed(chunk.text);

              const existing = await db.search(vector, 1, SIMILARITY_THRESHOLDS.DUPLICATE);
              if (existing.length > 0) {
                totalSkipped++;
                continue;
              }

              const payload = {
                user_id: defaultUserId,
                agent_id: defaultAgentId,
                role,
                content: chunk.text,
                abstract: '',
                overview: '',
                full_content_length: cleaned.length,
                turn: currentTurn,
                timestamp: now.toISOString(),
                date: now.toISOString().slice(0, 10),
                source: 'true-recall-base',
                curated: false,
                category: detectCategory(chunk.text),
                importance: 'medium',
                chunk_index: chunk.chunk_index,
                total_chunks: chunk.total_chunks,
                referenceCount: 0,
                lastReferenced: now.toISOString(),
                archived: false,
                status: 'staging'
              };

              await db.storeTrueRecall({ vector, payload });
              totalStored++;
            } catch (err) {
              api.logger.warn(\`memory-qdrant: autoCapture chunk 失敗: \${err.message}\`);
            }
          }
          currentTurn++;
        }

        if (totalStored > 0 || totalNoiseFiltered > 0) {
          api.logger.info(\`memory-qdrant: 擷取完成 — 儲存 \${totalStored} 個 staging chunk，跳過 \${totalSkipped} 個重複，過濾 \${totalNoiseFiltered} 個雜訊\`);
        }
      } catch (err) {
        api.logger.warn(\`memory-qdrant: autoCapture 失敗: \${err.message}\`);
      }
    });
  }

`;
  content = content.substring(0, agentEndStart) + newAgentEnd + content.substring(agentEndEnd);
}

// 2. Add runBatchExtractionPipeline and setInterval
const autoDreamEnd = content.indexOf("  // ==========================================================================\n  // CLI 命令");

if (autoDreamEnd !== -1) {
  const batchPipelineCode = `
  // ==========================================================================
  // 批次精煉機制 (Batch Extraction)
  // ==========================================================================
  
  async function runBatchExtractionPipeline() {
    if (!useSmartExtraction) return;
    
    api.logger.info('memory-qdrant: 正在執行 Batch Extraction 批次精煉...');
    try {
      const allMemories = await db.scrollAll();
      const stagingMemories = allMemories.filter(m => m.status === 'staging' && !m.archived);
      
      if (stagingMemories.length === 0) {
        api.logger.info('memory-qdrant: 沒有需要精煉的 staging 記憶。');
        return;
      }

      // 組合對話
      stagingMemories.sort((a, b) => (a.turn || 0) - (b.turn || 0));
      let conversationText = '';
      for (const mem of stagingMemories) {
        conversationText += \`[\${mem.role}]: \${mem.content}\\n\\n\`;
      }

      const searchCuratedFn = async (text) => {
        const vector = await embeddings.embed(text);
        const results = await db.search(vector, 3, 0.7);
        return results.filter(r => r.entry.status !== 'staging').map(r => r.entry);
      };

      const { processBatch } = await import('./smart-extractor.js');
      
      const operations = await processBatch(conversationText, searchCuratedFn, {
        llmBaseUrl: extractionLlmBaseUrl,
        llmModel: extractionLlmModel,
        maxChars: extractionMaxChars,
        minImportance: extractionMinImportance,
        log: (msg) => api.logger.debug(\`memory-qdrant: \${msg}\`),
      });

      let created = 0;
      let updated = 0;
      let archived = 0;

      const now = new Date();
      let currentTurn;
      try {
        currentTurn = (await db.getMaxTurn()) + 1;
      } catch (_) {
        currentTurn = 1;
      }

      for (const op of operations) {
        if (op.type === 'CREATE') {
          const vector = await embeddings.embed(op.payload.content);
          const payload = {
            user_id: defaultUserId,
            agent_id: defaultAgentId,
            role: 'assistant',
            content: op.payload.content,
            abstract: op.payload.abstract,
            overview: op.payload.overview,
            full_content_length: op.payload.content.length,
            turn: currentTurn++,
            timestamp: now.toISOString(),
            date: now.toISOString().slice(0, 10),
            source: 'smart-extraction',
            curated: true,
            category: op.payload.category,
            importance: op.payload.importance,
            chunk_index: 0,
            total_chunks: 1,
            referenceCount: 0,
            lastReferenced: now.toISOString(),
            archived: false,
            status: 'curated'
          };
          await db.storeTrueRecall({ vector, payload });
          created++;
        } else if (op.type === 'UPDATE') {
          const vector = await embeddings.embed(op.payload.content);
          const target = allMemories.find(m => m.id === op.id);
          if (target) {
            const payload = {
              ...target,
              content: op.payload.content,
              abstract: op.payload.abstract,
              overview: op.payload.overview,
              full_content_length: op.payload.content.length,
              referenceCount: (target.referenceCount || 0) + 1,
              lastReferenced: now.toISOString(),
              status: 'curated'
            };
            delete payload.id;
            await db.updateTrueRecall(op.id, { vector, payload });
            updated++;
          }
        } else if (op.type === 'ARCHIVE') {
          await db.archivePoints([op.id]);
          archived++;
        }
      }

      // 刪除 staging 記憶
      const stagingIds = stagingMemories.map(m => m.id);
      await db.deletePoints(stagingIds);

      api.logger.info(\`memory-qdrant: Batch Extraction 完成。建立 \${created} 筆，更新 \${updated} 筆，歸檔 \${archived} 筆，刪除 \${stagingIds.length} 筆 staging 記憶。\`);
    } catch (err) {
      api.logger.warn(\`memory-qdrant: Batch Extraction 失敗: \${err.message}\`);
    }
  }

  // 每分鐘檢查一次，如果是 00:00, 03:00, 06:00... 則觸發
  setInterval(() => {
    const now = new Date();
    if (now.getHours() % 3 === 0 && now.getMinutes() === 0) {
      runBatchExtractionPipeline();
    }
  }, 60000);

`;
  content = content.substring(0, autoDreamEnd) + batchPipelineCode + content.substring(autoDreamEnd);
}

// 3. Update smartExtract import to batchExtract, processBatch
content = content.replace("import { smartExtract } from './smart-extractor.js';", "import { batchExtract, processBatch } from './smart-extractor.js';");

fs.writeFileSync('index.js', content);
console.log('Patched index.js');
