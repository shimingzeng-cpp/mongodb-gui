const path = require('path');
const mongoPath = path.join(__dirname, '..', 'src', 'api', 'mongo.js');
console.log('[preload] Loading mongo from:', mongoPath);
try {
  window.__mongo = require(mongoPath);
  console.log('[preload] MongoDB API loaded successfully');
  console.log('[preload] Methods:', Object.keys(window.__mongo));
} catch(e) {
  console.error('[preload] Failed to load MongoDB API:', e.message);
}

// 加载 AI 模块
try {
  const aiPath = path.join(__dirname, '..', 'src', 'api', 'ai.js');
  window.__ai = require(aiPath);
  console.log('[preload] AI API loaded successfully');
} catch(e) {
  console.error('[preload] Failed to load AI API:', e.message);
}