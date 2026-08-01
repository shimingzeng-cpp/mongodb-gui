# MongoBuddy AI 集成工程审查与改进方案

> 审查人：AI 工程师 | 日期：2026-08-01
> 范围：`src/api/ai.js`、`src/components/ChatPanel.jsx`、`src/components/SettingsModal.jsx`、`electron/preload.js`、`electron/main.js`、`src/api/mongo.js`、`src/store.js`

---

## 一、现状盘点

当前 AI 集成是一个「**单文件 + 组件内循环**」的轻量 Agent 实现：

```
用户输入
  → buildSystemPrompt(数据库上下文 + 能力描述 + 输出格式)
  → chatCompletion(OpenAI 兼容 /chat/completions, temperature=0.3, max_tokens=8192, 30s 超时)
  → 模型返回 JSON { reply, commands[], action, done }
  → ChatPanel 逐条执行 commands(window.__mongo.executeShell)
  → 结果 JSON.stringify 全量回填 → 下一轮(最多 10 轮)
  → done=true 时输出最终 reply
```

已有能力：自然语言查询 / 统计 / 增删改 / 备份恢复引导 / UI 导航(action 协议)、多轮自主循环、错误自愈提示、聊天历史 localStorage 持久化、上下文截断(30 条)、伪记忆(操作记录提取)。

**结论：功能骨架完整，但停留在「能跑」阶段，距离「可靠的 AI 工程产品」有 4 类系统性差距：安全、协议、上下文、可观测性。**

---

## 二、问题分级审查

> **环境约束(2026-08-01 用户确认)：LLM 端点与 MongoDB 均在局域网内运行，数据不出公网。LLM 走公司统一 AI 网关(OpenAI 兼容，背后模型不透明)。**
> 优先级影响：凡涉及「数据出域」的问题(P0#4、P2 注入项)降为 P2；凡涉及「本地误操作 / 任意代码执行 / 本机攻击面」的问题(#1/#2/#3)**优先级不变，仍为 P0**——误删库和渲染层 RCE 与网络环境无关。
> 网关形态带来的额外约束：鉴权可能非标准 Bearer(需支持自定义 header/签名)；背后模型对 `tools` 的支持需**探测验证**；网关常有团队共享速率限制，重试退避必要性上升。

### 🔴 P0 — 安全红线(建议立即修复)

| # | 问题 | 证据 | 风险 |
|---|------|------|------|
| 1 | **AI 可无确认执行破坏性操作** | `executeShell` 直接执行 LLM 生成的命令；`dropDatabase / deleteMany / drop() / updateMany` 无任何二次确认 | 一句话误删整个库，不可逆（与网络无关，局域网下同样致命） |
| 2 | **`new Function` 执行任意代码** | `mongo.js:754` 将 LLM 输出拼进 `new Function('db','ObjectId',...)` 执行；LLM 输出不可信，等于把任意 JS 交给运行时 | 任意集合操作、绕过前端的 shell（与网络无关） |
| 3 | **Electron 渲染进程 Node 权限全开** | `main.js:15-17` `nodeIntegration:true + contextIsolation:false + sandbox:false`；整个 `__mongo` 驱动直接 require 进渲染层 | 渲染层任何 XSS(如文档内容渲染)即等于本机 RCE（与网络无关） |
| 4 | **数据库内容未脱敏发送给 LLM** | `sampleDocs`、查询结果、schema 全量 JSON.stringify 进 system prompt | 局域网内仍可被内网其他用户/服务看到；**若未来切外网中转，升级回 P0**。当前按 P2 处理 |

### 🟠 P1 — 可靠性(Agent 能否稳定干活)

| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| 5 | **依赖模型手写 JSON，无 function calling** | `ChatPanel.jsx:208` `JSON.parse(reply)`，整个 agent 协议靠 prompt 约束 | 模型输出带注释/截断即整个循环失败；协议脆弱 |
| 6 | **无流式输出** | `chatCompletion` 一次性 await | 10 轮循环里用户只能看「思考中...」转圈，最长 30s/轮无反馈 |
| 7 | **命令结果全量回传模型，无 token 预算** | `ChatPanel.jsx:264` `JSON.stringify(r.data)` 全量回填；`find()` 无 limit 会拉全量 | context 爆炸、成本失控、超时；一次大查询可能烧掉整次对话预算 |
| 8 | **无重试 / 退避 / 错误分类** | `fetch` 失败直接 throw | 429 / 5xx / 网络抖动即失败，无自愈 |
| 9 | **30s 固定超时** | `ai.js:20` `AbortSignal.timeout(30000)` | 大查询/慢模型/多轮累计必超时 |

### 🟡 P2 — 工程质量

| # | 问题 | 证据 | 说明 |
|---|------|------|------|
| 10 | 上下文压缩是「伪摘要」 | `ChatPanel.jsx:158` 最早消息替换成「此前共 N 轮」 | 不保留任何语义，长对话等于失忆 |
| 11 | memorySummary 是「伪记忆」 | `buildMemorySummary` 仅提取操作时间线 | 无结构化记忆，无法跨会话沉淀知识 |
| 12 | Agent 循环 200 行全在 React 组件内 | `agentLoopImpl` 在 `ChatPanel.jsx` | 无法单测、无法复用、UI 与逻辑强耦合 |
| 13 | `executeCommand` 引用未定义变量 `safeActiveId` | `ChatPanel.jsx:340`(组件作用域无此变量) | 点「执行命令」按钮时 `listDatabases` 静默失败(被 catch 吞) |
| 14 | 消息列表用 `key={i}` | `ChatPanel.jsx:451` | 增删消息时 React diff 错位 |
| 15 | system prompt 硬编码在代码里 | `buildSystemPrompt` | 改 prompt 要发版，无版本管理 |

### ⚪ P3 — 优化项

- 无模型路由：简单查询用小模型、复杂分析用大模型，省成本
- 无可观测性：无 token 消耗统计、延迟、失败率、成本估算
- temperature / max_tokens 硬编码，无成本配额
- 无 prompt 注入防护：数据库内容可能含「忽略以上指令」类恶意文本
- API Key 明文存 localStorage(可用 Electron `safeStorage` 加密)

---

## 三、改进方案(分阶段落地)

### Phase 1 — 安全红线(1~2 天，必须做)

1. **危险操作拦截 + UI 确认**
   - 在主进程 `executeShell` 入口加危险操作黑名单：`dropDatabase / drop / deleteMany / updateMany / remove / renameCollection / eval / $where` 等
   - 命中时返回 `{ needConfirm: true, reason }`，前端弹确认框，用户确认后带 `confirmed: true` 再执行
2. **命令结构化解析替代 `new Function`**
   - 把「命令」从 JS 代码改为**操作 DSL**：`{ op: 'find'|'count'|'aggregate'|'insert'|'update'|'delete'|'drop'|..., collection, filter, update, options }`
   - 主进程按 op 白名单路由到 `mongo.js` 已有方法，**彻底移除 `new Function`**
3. **Electron 安全基线**
   - `contextIsolation: true, sandbox: true, nodeIntegration: false`
   - preload 只暴露最小 API；所有数据库/文件操作走 IPC，主进程校验参数
4. **数据脱敏(局域网环境降级为可选)**
   - 发送前对 sampleDocs / 查询结果做字段级脱敏(配置敏感字段如 `password, token, secret`)
   - 局域网内可默认关闭；**若未来接入外网中转，必须开启**并恢复 P0
   - 结果强制截断(见 Phase 2)不受环境影响，始终启用

### Phase 2 — Agent 工程化(3~5 天)

5. **function calling 重构协议**(收益最大)
   - 用 OpenAI 兼容 `tools` 定义三个工具，替代手写 JSON：
     - `execute_mongo(op, collection, filter, update, options)`
     - `perform_action(action, params)`(复用现有 action 协议)
     - `reply(markdown)`(最终回复)
   - 前端按 `tool_calls` 解析，天然结构化，不再依赖 `JSON.parse(reply)`；同时支持 `response_format: { type: 'json_object' }` 兜底
   - ⚠️ **网关模型兼容性**：公司网关背后模型不透明。落地时先发**探测请求**(带 `tools` 参数调一次，看响应是否含 `tool_calls`)，支持则用 function calling；不支持则退回「JSON 模式」。两种模式共用同一结构化解析层，切换零成本
   - **鉴权适配**：SettingsModal 配置需支持自定义 headers(网关常见 appid/appkey/签名)，不能假设只有 `Bearer sk-xxx`；`/models` 拉取失败时保持手动输入
6. **SSE 流式输出**
   - `fetch` 读 `stream: true`，解析 `data:` 行，边生成边渲染；多轮之间保留「第 N 轮」进度指示
   - 内网服务普遍支持 stream；不支持时自动降级为非流式
7. **结果截断 + context 预算**
   - `execute_mongo` 强制默认 `limit: 50`(可显式覆盖)；返回前按 **字符数(如 8000)** 截断；`aggregate` 输出同样截断
   - 每轮累计预算(如 60k token)，超预算强制 `done: true` 并提示
   - 内网 LLM 免费，预算目的从「省钱」转为「防 context 爆炸 / 防超时」，两者都成立
8. **重试 / 退避 / 错误分类**
   - 429 → 指数退避(1s/2s/4s)；5xx → 重试 2 次；4xx → 不重试，错误分类提示
   - 超时改为可配置(默认 60s)，并按轮次累计
9. **上下文语义摘要**
   - 超过阈值时，把最早一段对话交给模型压缩成真正的内容摘要，替换原文(而非计数)

### Phase 3 — 架构演进(1~2 周)

10. **Agent service 抽离**
    - `src/services/agent.js`：纯逻辑层(协议解析、循环、预算、记忆)，UI 只渲染
    - 可单测：mock LLM 返回，验证循环/截断/拦截逻辑
11. **可观测性**
    - 轻量指标：每请求 token 数、延迟、轮次、失败率、成本估算，本地面板展示
12. **记忆系统**
    - 按连接/库/集合存结构化记忆(常用集合结构、业务含义、已执行操作)
    - 支持开关，默认仅本地
13. **模型路由 + 成本控制**
    - 简单任务(查个数/列表)→ 小模型；复杂分析 → 大模型；显示每次调用 token/成本

---

## 四、关键实现模式

### 4.1 危险操作拦截(主进程，mongo.js)

```js
const DANGEROUS = [
  { re: /\b(dropDatabase|drop)\s*\(/i, reason: '删除数据库/集合' },
  { re: /\b(deleteMany|remove)\s*\(/i, reason: '批量删除文档' },
  { re: /\b(updateMany)\s*\(/i,       reason: '批量更新文档' },
  { re: /\beval\s*\(/i,               reason: '服务端脚本执行' },
];

async function executeShell(connectionId, dbName, command, { confirmed = false } = {}) {
  const hit = DANGEROUS.find(d => d.re.test(command));
  if (hit && !confirmed) {
    return { success: false, needConfirm: true, reason: hit.reason, command };
  }
  // ...原逻辑
}
```

前端收到 `needConfirm` → `Modal.confirm` → 带 `confirmed: true` 重发。

### 4.2 命令 DSL 替代 new Function

```js
// 模型输出 (function calling 已结构化，无需解析)
{ op: 'find', collection: 'players', filter: { level: { $gt: 10 } }, limit: 50 }
{ op: 'count', collection: 'players', filter: {} }

// 主进程白名单路由
const OP_HANDLERS = {
  find:      (db, a) => db.collection(a.collection).find(a.filter || {}).limit(a.limit || 50).toArray(),
  count:     (db, a) => db.collection(a.collection).countDocuments(a.filter || {}),
  aggregate: (db, a) => db.collection(a.collection).aggregate(a.pipeline || []).toArray(),
  insert:    (db, a) => db.collection(a.collection).insertMany(a.docs),
  update:    (db, a) => db.collection(a.collection).updateOne(a.filter, { $set: a.update }),
  delete:    (db, a) => db.collection(a.collection).deleteOne(a.filter), // 危险，需确认
  // ...不再有自由 JS 执行
};
```

### 4.3 function calling 定义(前端协议)

```js
const TOOLS = [
  { type: 'function', function: {
      name: 'execute_mongo',
      description: '对当前数据库的集合执行查询/统计/增删改操作',
      parameters: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['find','count','aggregate','insert','update','delete'] },
          collection: { type: 'string' },
          filter: { type: 'object' },
          update: { type: 'object' },
          docs: { type: 'array' },
          limit: { type: 'number', default: 50 },
        },
        required: ['op', 'collection'],
      },
    } },
  { type: 'function', function: {
      name: 'perform_action',
      description: '触发 UI 操作：备份/恢复/切换库/打开面板等',
      parameters: { type: 'object', properties: {
          action: { type: 'string', enum: ['backup','restore','switch_db','switch_collection','open_schema','open_export','refresh'] },
          params: { type: 'object' },
        }, required: ['action'] },
    } },
  { type: 'function', function: {
      name: 'reply',
      description: '任务完成，输出最终回复(需用 markdown 展示结果)',
      parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
    } },
];
```

### 4.4 结果截断器

```js
const MAX_RESULT_CHARS = 8000;
function truncateResult(data) {
  const json = JSON.stringify(data);
  if (json.length <= MAX_RESULT_CHARS) return data;
  return {
    truncated: true,
    originalSize: json.length,
    preview: JSON.parse(json.slice(0, MAX_RESULT_CHARS) + ']'.repeat(...)), // 或直接返回前 N 条 + 计数
  };
}
```

---

## 五、优先级矩阵

| 象限 | 事项 | 投入 | 收益 |
|------|------|------|------|
| 立即(安全) | 危险操作拦截 + 确认 | 0.5 天 | 消除「误删库」最坏情况(局域网下同样致命) |
| 立即(安全) | 移除 new Function，DSL 路由 | 1 天 | 消除任意代码执行 |
| 立即(安全) | Electron contextIsolation | 0.5 天 | 消除渲染层 RCE 面 |
| 本周 | function calling 协议(需先验证内网模型支持) | 1~2 天 | 循环成功率显著提升，协议可维护 |
| 本周 | 结果截断 + context 预算 | 0.5 天 | 防 context 爆炸/超时 |
| 本周 | 重试退避 + 流式 | 1 天 | 体验与稳定性双提升 |
| 下周 | Agent service 抽离 + 单测 | 2 天 | 可测试、可扩展 |
| 持续 | 可观测性 / 记忆 / 模型路由 | 渐进 | 能力沉淀、内网模型资源利用最大化 |

---

## 六、总结

**一句话：功能能跑，但「LLM 直接执行任意 JS + 无确认 + 渲染层全权限」这三个点叠加，当前实现只适合本地个人使用。局域网环境消除了「数据出域」担忧(P0#4 降为 P2)，但误删库、任意代码执行、渲染层 RCE 这三个 P0 与网络无关，必须修。**

建议执行顺序：**Phase 1(安全) → Phase 2 的第 5、7 项(协议 + 预算) → 其余按需**。其中 function calling 重构(第 5 项)是投入产出比最高的一步——但落地前先验证内网 LLM 的 tools 支持，不支持就退 JSON 模式，保持解析层统一。
