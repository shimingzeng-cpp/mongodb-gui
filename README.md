# 国产开源MongoDB可视化工具

本地 MongoDB 桌面管理工具，基于 Electron + React + Ant Design 构建。

## 功能

- 🔌 **连接管理**：支持多连接管理，保存常用连接，一键连接/断开
- 📂 **数据库浏览**：树形展示数据库和集合，支持新建/删除
- 📄 **文档管理**：表格展示、增删改查、双击编辑、分页、筛选
- 🔍 **智能筛选**：可视化字段+操作符筛选，支持多条件 AND 组合，显示对应 Shell 命令
- 💻 **Shell 命令行**：支持 MongoDB shell 语法执行，结果以表格展示，支持展开全屏查看
- 🤖 **AI 助手**：右侧独立面板，支持自然语言操作数据库（需配置 API Key）
- 🎨 **暗色/亮色模式**：支持主题切换，自动保存偏好
- 📤 **导出/导入**：支持 JSON/CSV 格式导出导入，追加/覆盖模式
- 🔄 **多库同步**：跨连接、跨数据库同步集合结构和数据
- ⚡ **大数据量**：虚拟滚动，支持万级数据流畅浏览

## 技术栈

- **Electron** 桌面框架
- **React 18** + Vite
- **Ant Design 5** 组件库
- **Zustand** 状态管理
- **MongoDB Node.js Driver v6**

## 安装

### 方式一：直接下载安装包（推荐）

从 [Releases](https://github.com/shimingzeng-cpp/mongodb-gui/releases) 页面下载最新版本，双击安装即可使用，**无需安装 Node.js 或 npm**。

### 方式二：源码运行（开发者）

#### 前置要求

- Node.js 18+
- npm 9+

#### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/shimingzeng-cpp/mongodb-gui.git
cd mongodb-gui

# 2. 安装依赖
npm install

# 3. 启动开发模式（前端 + Electron）
npm run dev

# 4. 打包为桌面应用
npm run build
```

#### 打包后文件位置

- Windows：`release/` 目录下生成 `MongoDB GUI Setup *.exe` 安装包

#### 发布新版本

```bash
# 1. 更新版本号
# 修改 package.json 中的 version 字段

# 2. 打包
npm run release

# 3. 创建 GitHub Release
# 手动在 https://github.com/shimingzeng-cpp/mongodb-gui/releases 创建新版本
# 上传 release/ 目录下的 exe 文件
```

## 配置 AI 助手

1. 点击顶栏 ⚙ 设置
2. 填写 API 地址和 Key
3. 点击「测试连接」验证配置
4. 点击「从 API 加载模型列表」自动获取可用模型
5. 支持的模型：OpenAI、DeepSeek、Ollama 等兼容接口

## 使用技巧

- **双击编辑**：表格中双击单元格可快速编辑字段值
- **筛选查询**：点击「筛选」按钮展开条件筛选，支持多条件组合
- **Shell 命令**：底部 Shell 面板支持 Tab 补全、↑↓ 历史记录
- **右键操作**：左侧数据库/集合支持右键菜单快速操作
- **主题切换**：点击顶部 ☀️/🌙 按钮切换主题

## 截图

（待补充）

## License

MIT