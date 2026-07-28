# 国产开源MongoDB可视化工具

本地 MongoDB 桌面管理工具，基于 Electron + React + Ant Design 构建。

## 功能

- 🔌 连接管理：支持本地/远程 MongoDB 连接
- 📂 数据库浏览：树形展示数据库和集合，支持新建/删除
- 📄 文档管理：表格展示、增删改查、分页、筛选
- 🔍 智能筛选：可视化字段+操作符筛选，支持多条件 AND 组合
- 💻 Shell 命令行：支持 MongoDB shell 语法执行增删改查
- 🤖 AI 助手：支持自然语言操作数据库（需配置 API Key）
- 🎨 暗色主题：舒适的深色界面

## 技术栈

- **Electron** 桌面框架
- **React 18** + Vite
- **Ant Design 5** 组件库
- **Zustand** 状态管理
- **MongoDB Node.js Driver v6**

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 打包
npm run build
```

## 配置 AI 助手

1. 点击顶栏 ⚙ 设置
2. 填写 API 地址和 Key
3. 支持的模型：OpenAI、DeepSeek、Ollama 等兼容接口

## 截图

（待补充）

## License

MIT