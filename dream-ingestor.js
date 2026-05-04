import fs from 'fs';
import path from 'path';

/**
 * Dream Ingestor — 夢境記憶吸收器
 *
 * 負責監聽 OpenClaw 產生的 MEMORY.md 和 short-term-recall.json，
 * 讀取新增的內容，並透過分類萃取後寫入 Qdrant 向量引擎。
 *
 * @module dream-ingestor
 */

export class DreamIngestor {
  constructor(api, db, embeddings, options) {
    this.api = api;
    this.db = db;
    this.embeddings = embeddings;
    this.options = options || {};
    this.workspacePath = process.env.OPENCLAW_WORKSPACE || path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'workspace');
    
    this.memoryMdPath = path.join(this.workspacePath, 'MEMORY.md');
    this.shortTermRecallPath = path.join(this.workspacePath, 'memory', '.dreams', 'short-term-recall.json');
    this.checkpointPath = path.join(this.workspacePath, 'memory', '.dreams', 'qdrant-checkpoint.json');

    this.debounceMs = this.options.debounceMs || 15000;
    this.ingestTimeout = null;
    this.checkpoints = this.loadCheckpoints();
  }

  loadCheckpoints() {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        return JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
      }
    } catch (e) {
      this.api.logger.warn(`dream-ingestor: 無法讀取 checkpoint: ${e.message}`);
    }
    return { memoryMdPos: 0, shortTermKeys: [] };
  }

  saveCheckpoints() {
    try {
      const dir = path.dirname(this.checkpointPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.checkpointPath, JSON.stringify(this.checkpoints, null, 2));
    } catch (e) {
      this.api.logger.warn(`dream-ingestor: 無法儲存 checkpoint: ${e.message}`);
    }
  }

  start() {
    if (this.options.enabled === false) return;

    const watchOptions = { interval: 5000 };

    if (fs.existsSync(this.memoryMdPath)) {
      fs.watchFile(this.memoryMdPath, watchOptions, (curr, prev) => {
        if (curr.mtime > prev.mtime) this.debounceIngest();
      });
      this.api.logger.info(`dream-ingestor: 正在監聽 ${this.memoryMdPath}`);
    }

    if (fs.existsSync(this.shortTermRecallPath)) {
      fs.watchFile(this.shortTermRecallPath, watchOptions, (curr, prev) => {
        if (curr.mtime > prev.mtime) this.debounceIngest();
      });
      this.api.logger.info(`dream-ingestor: 正在監聽 ${this.shortTermRecallPath}`);
    }

    // 初次啟動時也執行一次檢查
    this.debounceIngest();
  }

  stop() {
    if (this.ingestTimeout) clearTimeout(this.ingestTimeout);
    if (fs.existsSync(this.memoryMdPath)) fs.unwatchFile(this.memoryMdPath);
    if (fs.existsSync(this.shortTermRecallPath)) fs.unwatchFile(this.shortTermRecallPath);
  }

  debounceIngest() {
    if (this.ingestTimeout) clearTimeout(this.ingestTimeout);
    this.ingestTimeout = setTimeout(() => {
      this.ingestAll().catch(e => this.api.logger.error(`dream-ingestor: 吸收失敗: ${e.message}`));
    }, this.debounceMs);
  }

  async ingestAll() {
    let hasChanges = false;
    let combinedText = '';

    // 1. 讀取 MEMORY.md
    try {
      if (fs.existsSync(this.memoryMdPath)) {
        const stats = fs.statSync(this.memoryMdPath);
        if (stats.size > this.checkpoints.memoryMdPos) {
          // 只讀取新增的部分，但如果是被重建(大小縮小)，就從頭讀。簡單起見，讀全部並過濾已經讀過的大小。
          const content = fs.readFileSync(this.memoryMdPath, 'utf8');
          // 我們這裡簡化處理：如果 MEMORY.md 被完全覆寫(Dreaming 通常是這樣)，位置歸零重新讀取
          // 或者 Dreaming 是 appending？如果是 appending，就讀新部分。
          // 為了安全，我們抓取整個內容。因為 Qdrant 的 processBatch 帶有 dedup 機制。
          // 但是傳太多會很慢。
          // 更好的方式：讀取內容，並只取比舊長度多出來的部分
          const newContent = stats.size < this.checkpoints.memoryMdPos 
            ? content 
            : content.substring(this.checkpoints.memoryMdPos);
          
          if (newContent.trim().length > 10) {
            combinedText += '\n[MEMORY.md]\n' + newContent;
            hasChanges = true;
          }
          this.checkpoints.memoryMdPos = stats.size;
        } else if (stats.size < this.checkpoints.memoryMdPos) {
          // 檔案被截斷/重置
          this.checkpoints.memoryMdPos = 0;
        }
      }
    } catch (err) {
      this.api.logger.warn(`dream-ingestor: 處理 MEMORY.md 失敗: ${err.message}`);
    }

    // 2. 讀取 short-term-recall.json
    try {
      if (fs.existsSync(this.shortTermRecallPath)) {
        const data = JSON.parse(fs.readFileSync(this.shortTermRecallPath, 'utf8'));
        if (data && data.entries) {
          const keys = Object.keys(data.entries);
          const newKeys = keys.filter(k => !this.checkpoints.shortTermKeys.includes(k));
          
          if (newKeys.length > 0) {
            const snippets = newKeys.map(k => data.entries[k].snippet).filter(Boolean);
            if (snippets.length > 0) {
              combinedText += '\n[Recent Conversations]\n' + snippets.join('\n');
              hasChanges = true;
            }
            
            // 更新 checkpoint，最多保留 5000 個 key 避免檔案過大
            this.checkpoints.shortTermKeys = [...this.checkpoints.shortTermKeys, ...newKeys].slice(-5000);
          }
        }
      }
    } catch (err) {
      this.api.logger.warn(`dream-ingestor: 處理 short-term-recall.json 失敗: ${err.message}`);
    }

    if (!hasChanges || combinedText.trim().length < 10) {
      this.saveCheckpoints();
      return;
    }

    this.api.logger.info(`🌟 [Dreaming] 偵測到新夢境記憶，準備進行分類存取...`);

    // 交給 processBatch
    const { processBatch } = await import('./smart-extractor.js');
    
    const searchCuratedFn = async (text) => {
      const vector = await this.embeddings.embed(text);
      const results = await this.db.search(vector, 3, 0.7);
      return results.filter(r => r.entry.status !== 'staging').map(r => r.entry);
    };

    const operations = await processBatch(combinedText, searchCuratedFn, {
      llmBaseUrl: this.options.llmBaseUrl,
      llmModel: this.options.llmModel,
      maxChars: 8000,
      log: (msg) => this.api.logger.debug(`dream-ingestor: ${msg}`)
    });

    let created = 0;
    let updated = 0;
    const now = new Date();
    
    let currentTurn;
    try {
      currentTurn = (await this.db.getMaxTurn()) + 1;
    } catch (_) {
      currentTurn = 1;
    }

    for (const op of operations) {
      if (op.type === 'CREATE') {
        const vector = await this.embeddings.embed(op.payload.content);
        const payload = {
          user_id: this.options.defaultUserId || 'default',
          agent_id: this.options.defaultAgentId || 'main',
          role: 'assistant',
          content: op.payload.content,
          abstract: op.payload.abstract,
          overview: op.payload.overview,
          full_content_length: op.payload.content.length,
          turn: currentTurn++,
          timestamp: now.toISOString(),
          date: now.toISOString().slice(0, 10),
          source: 'dreaming-promotion',
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
        await this.db.storeTrueRecall({ vector, payload });
        created++;
      } else if (op.type === 'UPDATE') {
        const vector = await this.embeddings.embed(op.payload.content);
        const allMemories = await this.db.scrollAll();
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
            status: 'curated',
            source: 'dreaming-promotion' // 標記為最近由 dreaming 更新
          };
          delete payload.id;
          await this.db.updateTrueRecall(op.id, { vector, payload });
          updated++;
        }
      } else if (op.type === 'ARCHIVE') {
        // supersede / contradict
        const allMemories = await this.db.scrollAll();
        const target = allMemories.find(m => m.id === op.id);
        if (target) {
          const payload = { ...target, archived: true };
          delete payload.id;
          // vector 不變
          // 取出舊的 vector: 這個 API 需要處理，如果不改 vector 可以略過或再次 embed
          const vector = await this.embeddings.embed(target.content);
          await this.db.updateTrueRecall(op.id, { vector, payload });
        }
      }
    }

    this.saveCheckpoints();
    this.api.logger.info(`🌟 [Dreaming] 記憶吸收完成！建立 ${created} 筆，更新 ${updated} 筆。`);
  }
}
