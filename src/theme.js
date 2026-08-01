import useStore from './store';

// ============ 暗色模式 ============
const dark = {
  bg: {
    primary: '#141414',      // 顶部栏
    sidebar: '#1a1a1a',      // 侧边栏/面板背景
    panel: '#1e1e1e',        // 内容面板/tab 栏
    code: '#0d0d0d',         // 代码编辑器/Shell 输入区
    highlight: '#0d3320',    // 选中高亮（暗绿）
    highlightBlue: '#0d1f3a',// AI 消息气泡（暗蓝）
    hover: '#262626',        // 悬停状态
    errorBg: '#2a1a1a',      // 错误容器
    warning: '#2a2410',      // 警告横幅
    card: '#1f1f1f',         // 卡片背景
    input: '#0d0d0d',        // 输入框背景
  },
  text: {
    primary: '#e8e8e8',      // 主文字
    secondary: '#a8a8a8',    // 次要文字/标签
    subtle: '#787878',       // 弱化文字/图标
    muted: '#555',           // 空状态/禁用
    listItem: '#d0d0d0',     // 集合名称
    inverse: '#fff',         // 深色背景上的白色文字
    code: '#00b96b',         // 代码文字颜色
  },
  border: '#2a2a2a',
  divider: '#2a2a2a',

  // 语义色
  accent: '#00b96b',
  accentLight: '#00e676',
  error: '#ff4d4f',
  warning: '#faad14',
  info: '#4fc3f7',
  infoLight: '#80deea',
  muted: '#555',

  // 阴影
  shadow: '0 4px 16px rgba(0,0,0,0.4)',
  shadowSm: '0 2px 8px rgba(0,0,0,0.3)',
};

// ============ 亮色模式 ============
const light = {
  bg: {
    primary: '#ffffff',      // 顶部栏
    sidebar: '#f7f7f8',      // 侧边栏/面板背景
    panel: '#fafafa',        // 内容面板/tab 栏
    code: '#f5f5f5',         // 代码编辑器/Shell 输入区
    highlight: '#e6f7ed',    // 选中高亮（浅绿）
    highlightBlue: '#e6f7ff',// AI 消息气泡（浅蓝）
    hover: '#f0f0f0',        // 悬停状态
    errorBg: '#fff0f0',      // 错误容器
    warning: '#fff8e6',      // 警告横幅
    card: '#ffffff',         // 卡片背景
    input: '#ffffff',        // 输入框背景
  },
  text: {
    primary: '#1a1a1a',      // 主文字
    secondary: '#666',        // 次要文字/标签
    subtle: '#999',           // 弱化文字/图标
    muted: '#bbb',            // 空状态/禁用
    listItem: '#333',         // 集合名称
    inverse: '#fff',          // 深色背景上的白色文字
    code: '#00b96b',          // 代码文字颜色
  },
  border: '#e8e8e8',
  divider: '#e8e8e8',

  // 语义色
  accent: '#00b96b',
  accentLight: '#00e676',
  error: '#ff4d4f',
  warning: '#faad14',
  info: '#4fc3f7',
  infoLight: '#80deea',
  muted: '#bbb',

  // 阴影
  shadow: '0 4px 16px rgba(0,0,0,0.08)',
  shadowSm: '0 2px 8px rgba(0,0,0,0.05)',
};

// ============ useTheme Hook ============
export function useTheme() {
  const theme = useStore((s) => s.theme);
  return theme === 'dark' ? dark : light;
}

export { dark, light };