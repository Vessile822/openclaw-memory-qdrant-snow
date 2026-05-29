import Plugin from './index.js';
const p = new Plugin({ logger: console, config: { get: () => ({ qdrantUrl: 'http://127.0.0.1:6333', defaultUserId: 'test', smartExtraction: true }) }, events: { on: () => {} } });
try {
    await p.init();
    console.log('init successful');
} catch (e) {
    console.error('init failed:', e);
}
