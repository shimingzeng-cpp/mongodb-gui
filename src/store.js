import { create } from 'zustand';

// 从 localStorage 加载主题配置
const loadTheme = () => {
  try {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'dark' ? saved : 'light';
  } catch { return 'light'; }
};

// 从 localStorage 加载 AI 配置
const loadAiConfig = () => {
  try {
    const saved = localStorage.getItem('aiConfig');
    return saved ? JSON.parse(saved) : { url: '', key: '', model: 'gpt-4o-mini' };
  } catch { return { url: '', key: '', model: 'gpt-4o-mini' }; }
};

// 从 localStorage 加载连接列表
const loadConnections = () => {
  try {
    const saved = localStorage.getItem('connections');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

// 生成简单 ID
let _idCounter = Date.now();
const genId = () => `conn_${(_idCounter++).toString(36)}`;

const useStore = create((set) => ({
  // ========== 连接管理 ==========
  connected: false,
  uri: 'mongodb://localhost:27017',
  setConnected: (val) => set({ connected: val }),
  setUri: (val) => set({ uri: val }),

  connections: loadConnections(),
  activeConnectionId: null,
  connectionLoading: false,
  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
  setConnectionLoading: (val) => set({ connectionLoading: val }),

  addConnection: (config) => {
    const newConn = { ...config, id: genId(), createdAt: Date.now(), updatedAt: Date.now() };
    const state = useStore.getState();
    const connections = [...state.connections, newConn];
    localStorage.setItem('connections', JSON.stringify(connections));
    useStore.setState({ connections });
    return newConn.id;
  },

  updateConnection: (id, updates) => set((state) => {
    const connections = state.connections.map(c =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    localStorage.setItem('connections', JSON.stringify(connections));
    return { connections };
  }),

  deleteConnection: (id) => set((state) => {
    const connections = state.connections.filter(c => c.id !== id);
    localStorage.setItem('connections', JSON.stringify(connections));
    const isActive = state.activeConnectionId === id;
    // 如果删除的是当前连接的连接，同步清理连接状态
    if (isActive) {
      // 异步断开 MongoDB 连接
      try { window.__mongo?.disconnect(id); } catch {}
      return {
        connections,
        activeConnectionId: null,
        connected: false,
        databases: [],
        selectedDb: null,
        selectedCollection: null,
        documents: [],
        totalDocs: 0,
        page: 1,
        filter: '',
      };
    }
    return { connections };
  }),

  duplicateConnection: (id) => set((state) => {
    const orig = state.connections.find(c => c.id === id);
    if (!orig) return state;
    const dup = {
      ...orig,
      id: genId(),
      name: `${orig.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const connections = [...state.connections, dup];
    localStorage.setItem('connections', JSON.stringify(connections));
    return { connections };
  }),

  // ========== 数据库列表 ==========
  databases: [],
  setDatabases: (val) => set({ databases: val }),

  // ========== 当前选中的数据库和集合 ==========
  selectedDb: null,
  selectedCollection: null,
  setSelectedDb: (val) => set({ selectedDb: val, selectedCollection: null }),
  setSelectedCollection: (val) => set({ selectedCollection: val }),

  // ========== 文档数据 ==========
  documents: [],
  totalDocs: 0,
  page: 1,
  pageSize: 50,
  setDocuments: (docs, total) => set({ documents: docs, totalDocs: total }),
  setPage: (val) => set({ page: val }),
  setPageSize: (val) => set({ pageSize: val, page: 1 }),

  // ========== 查询条件 ==========
  filter: '',
  setFilter: (val) => set({ filter: val, page: 1 }),

  // ========== 数据刷新信号 ==========
  reloadKey: 0,
  triggerReload: () => set(s => ({ reloadKey: s.reloadKey + 1 })),

  // 刷新信号
  refreshKey: 0,
  doRefresh: () => set(s => ({ refreshKey: s.refreshKey + 1 })),

  // ========== 编辑状态 ==========
  editingDoc: null,
  editingMode: null, // 'create' | 'edit' | null
  setEditingDoc: (doc, mode) => set({ editingDoc: doc, editingMode: mode }),

  // ========== AI 配置 ==========
  aiConfig: loadAiConfig(),
  setAiConfig: (config) => {
    localStorage.setItem('aiConfig', JSON.stringify(config));
    set({ aiConfig: config });
  },

  aiOpen: false,
  setAiOpen: (val) => set({ aiOpen: val }),

  // ========== 主题 ==========
  theme: loadTheme(),
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    return { theme: next };
  }),

  // ========== 弹窗开关 ==========
  settingsOpen: false,
  setSettingsOpen: (val) => set({ settingsOpen: val }),

  helpOpen: false,
  setHelpOpen: (val) => set({ helpOpen: val }),

  schemaOpen: false,
  setSchemaOpen: (val) => set({ schemaOpen: val }),

  indexOpen: false,
  setIndexOpen: (val) => set({ indexOpen: val }),

  exportOpen: false,
  setExportOpen: (val) => set({ exportOpen: val }),

  // ========== 同步弹窗 ==========
  syncOpen: false,
  setSyncOpen: (val) => set({ syncOpen: val }),

  syncSource: null, // { connId, db, collection }
  syncTarget: null, // { connId, db, collection }
  setSyncSource: (val) => set((state) => ({
    syncSource: typeof val === 'function' ? val(state.syncSource) : val,
  })),
  setSyncTarget: (val) => set((state) => ({
    syncTarget: typeof val === 'function' ? val(state.syncTarget) : val,
  })),

  syncOptions: { type: 'both', dataMode: 'upsert' },
  setSyncOptions: (val) => set(s => ({ syncOptions: { ...s.syncOptions, ...val } })),

  syncProgress: null, // { total, current, status }
  syncResult: null,   // { success, summary }
  setSyncProgress: (val) => set({ syncProgress: val }),
  setSyncResult: (val) => set({ syncResult: val }),
}));

export default useStore;