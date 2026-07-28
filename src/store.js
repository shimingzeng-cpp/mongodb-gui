import { create } from 'zustand';

// 从 localStorage 加载 AI 配置
const loadAiConfig = () => {
  try {
    const saved = localStorage.getItem('aiConfig');
    return saved ? JSON.parse(saved) : { url: '', key: '', model: 'gpt-4o-mini' };
  } catch { return { url: '', key: '', model: 'gpt-4o-mini' }; }
};

const useStore = create((set) => ({
  // 连接状态
  connected: false,
  uri: 'mongodb://localhost:27017',
  setConnected: (val) => set({ connected: val }),
  setUri: (val) => set({ uri: val }),

  // 数据库列表
  databases: [],
  setDatabases: (val) => set({ databases: val }),

  // 当前选中的数据库和集合
  selectedDb: null,
  selectedCollection: null,
  setSelectedDb: (val) => set({ selectedDb: val, selectedCollection: null }),
  setSelectedCollection: (val) => set({ selectedCollection: val }),

  // 文档数据
  documents: [],
  totalDocs: 0,
  page: 1,
  pageSize: 50,
  setDocuments: (docs, total) => set({ documents: docs, totalDocs: total }),
  setPage: (val) => set({ page: val }),

  // 查询条件
  filter: '',
  setFilter: (val) => set({ filter: val, page: 1 }),

  // 刷新信号
  refreshKey: 0,
  doRefresh: () => set(s => ({ refreshKey: s.refreshKey + 1 })),

  // 编辑状态
  editingDoc: null,
  editingMode: null, // 'create' | 'edit' | null
  setEditingDoc: (doc, mode) => set({ editingDoc: doc, editingMode: mode }),

  // AI 配置
  aiConfig: loadAiConfig(),
  setAiConfig: (config) => {
    localStorage.setItem('aiConfig', JSON.stringify(config));
    set({ aiConfig: config });
  },

  // 设置弹窗
  settingsOpen: false,
  setSettingsOpen: (val) => set({ settingsOpen: val }),
}));

export default useStore;