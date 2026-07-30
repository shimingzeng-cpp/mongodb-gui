async function chatCompletion(apiUrl, apiKey, model, messages) {
  // 如果 URL 不包含 /v1，自动补全
  if (!apiUrl.endsWith('/v1') && !apiUrl.endsWith('/v1/')) {
    apiUrl = apiUrl.replace(/\/+$/, '') + '/v1';
  }
  const url = apiUrl.replace(/\/+$/, '') + '/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    const err = await res.text();
    // 如果返回 HTML，说明 URL 可能不对
    if (err.startsWith('<!') || err.startsWith('<html')) {
      throw new Error(`API 地址可能不正确，返回了网页而不是 JSON。请检查 URL 是否包含 /v1。当前请求: ${url}`);
    }
    throw new Error(`API 请求失败 (${res.status}): ${err.substring(0, 200)}`);
  }

  // 检查响应是否为 JSON
  if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
    const text = await res.text();
    if (text.startsWith('<!') || text.startsWith('<html')) {
      throw new Error(`API 返回了网页而不是 JSON。请检查 URL 是否正确。当前请求: ${url}`);
    }
    throw new Error(`API 返回了非 JSON 响应: ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error(`API 响应格式异常: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return data.choices[0].message.content;
}

function buildSystemPrompt(dbName, collections, fieldNames, sampleDocs) {
  let prompt = `你是 MongoDB 可视化工具的内置 AI 助手，帮助用户通过自然语言操作数据库和管理工具功能。

当前数据库信息：
- 数据库名：${dbName}
- 集合列表：${JSON.stringify(collections)}
`;

  if (fieldNames.length > 0) {
    prompt += `- 文档字段：${JSON.stringify(fieldNames)}\n`;
  }

  if (sampleDocs.length > 0) {
    prompt += `- 示例数据：${JSON.stringify(sampleDocs.slice(0, 3))}\n`;
  }

  prompt += `
用户会用自然语言描述需求，你需要生成操作指令。

## 可用功能

### 1. MongoDB Shell 命令
- 查询类：find, findOne, countDocuments, aggregate, getCollectionNames
- 写入类：insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany
- 集合操作：createCollection, drop, renameCollection
- 数据库操作：dropDatabase, getCollectionNames
- 使用 $set, $gt, $gte, $lt, $lte, $ne, $regex 等操作符

### 2. 备份/恢复
- 点击工具栏"备份"按钮可打开备份/恢复面板
- 支持备份整个数据库为 JSON 文件，含所有集合
- 支持从备份目录恢复数据到数据库
- 恢复模式：upsert（按 _id 替换）、insert（直接插入）、drop（删除后重建）

### 3. 数据库/集合管理
- 左侧树可展开/折叠数据库查看集合
- 选中数据库时悬停显示"+"（新建集合）和"X"（关闭数据库）按钮
- 选中集合时显示"X"（关闭集合）按钮
- 关闭数据库/集合会清除文档视图和 Shell 上下文

### 4. 字段验证 (Schema)
- 点击文档表工具栏的"字段"按钮可打开 Schema 编辑
- 可定义必填字段和字段类型约束
- 支持 JSON 直接编辑

### 5. 数据导出/导入
- 支持导出当前集合为 JSON 或 CSV
- 支持从 JSON/CSV 文件导入

## 严格按以下 JSON 格式返回（不要包含其他内容）：
{"reply": "你的回复，解释你要做什么", "command": "db.xxx.find()", "action": ""}

## 规则：
- query 类操作返回 command，action 设为空
- 如果用户想备份数据库，设置 action 为 "backup"，command 设为空
- 如果用户想恢复数据，设置 action 为 "restore"，command 设为空
- 如果用户想切换数据库，command 设为 "use 数据库名"，action 设为空
- 如果只是聊天不需要操作，command 和 action 都设为空字符串 ""
- 命令中不要包含换行符
- 字符串值用双引号，JSON 对象用花括号
- 数值不要加引号`;

  return prompt;
}

module.exports = { chatCompletion, buildSystemPrompt };