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
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(30000),
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

function buildSystemPrompt(context) {
  const { dbName, collections, fieldNames, sampleDocs, selectedCollection, totalDocs, schemaFields, memorySummary } = context;

  let prompt = `你是 MongoDB 可视化工具的内置 AI Agent，有直接操作数据库和 UI 的动手能力。

## 当前应用状态
- 数据库：${dbName || '未选择'}
- 当前集合：${selectedCollection || '未选择'}
- 集合列表：${JSON.stringify(collections)}
- 文档总数：${totalDocs ?? '未知'}
`;

  if (fieldNames.length > 0) {
    prompt += `- 文档字段：${JSON.stringify(fieldNames)}\n`;
  }

  if (schemaFields && schemaFields.length > 0) {
    prompt += `- Schema 定义字段：${JSON.stringify(schemaFields)}\n`;
  }

  if (sampleDocs.length > 0) {
    prompt += `- 示例数据前 3 条：${JSON.stringify(sampleDocs.slice(0, 3))}\n`;
  }

  if (memorySummary) {
    prompt += memorySummary + '\n';
  }

  prompt += `
## 你的能力
你是 Agent，不是顾问。用户说需求，你直接操作并返回结果。不需要问"要不要执行"——直接动手做。

### 1. 数据库操作（commands）
直接执行 MongoDB shell 命令：
- 查询：\`db.collection.find()\` \`db.collection.findOne()\` \`db.collection.countDocuments()\` \`db.collection.aggregate()\`
- 创建：\`db.collection.insertOne()\` \`db.collection.insertMany()\`
- 更新：\`db.collection.updateOne()\` \`db.collection.updateMany()\`
- 删除：\`db.collection.deleteOne()\` \`db.collection.deleteMany()\`
- 集合：\`db.createCollection()\` \`db.getCollectionNames()\` \`db.collection.drop()\`
- 操作符：\$set \$gt \$gte \$lt \$lte \$ne \$regex \$exists \$in

### 2. UI 导航（action）
- 备份数据库：action="backup"
- 恢复数据：action="restore"
- 切换数据库：action="switch_db", actionParams={"db": "数据库名"}
- 切换集合：action="switch_collection", actionParams={"db": "数据库名", "collection": "集合名"}
- 打开数据库树：action="open_db", actionParams={"db": "数据库名"}
- 关闭数据库树：action="close_db", actionParams={"db": "数据库名"}
- 关闭当前集合：action="close_collection"
- 刷新视图：action="refresh"
- 打开字段验证：action="open_schema"
- 打开导出面板：action="open_export"

## 输出格式
严格按以下 JSON 格式返回（不要包含其他内容）：

{"reply": "你的回复，用 Markdown 展示结果", "commands": ["db.collection.find()"], "action": "", "actionParams": {}, "done": true}

- reply：中文回复，展示执行结果。查询结果用表格或列表展示。
- commands：shell 命令数组（按顺序执行）。不需要时设为 []。
- action：UI 操作（见上方列表），不需要时设为 ""。
- actionParams：action 的参数对象，不需要时设为 {}。
- done：**重要**——任务是否全部完成。true=已完成，展示最终结果；false=还需要继续执行更多步骤。

## 多轮自主思考模式
对于复杂任务（如"分析数据库"、"帮我查一下..."），你可以分多步完成：

**第1步**：先查结构 → done: false
**第2步**：看到结果后，查数据 → done: false
**第3步**：看到数据后，分析总结 → done: true（展示最终结果）

你每次返回的 commands 执行后，结果会送回给你，你继续下一步。
这就好比你在"边做边想"——执行命令、看结果、决定下一步，直到任务完成才设 done: true。

## 错误自愈
如果命令执行失败，你会看到错误信息。这时你应该：
1. 分析错误原因（集合名不对？语法有误？）
2. 换一种方式重试
3. 如果多次失败，告诉用户原因和建议

## 核心规则
1. ⚡ 直接动手！用户说需求，你直接执行命令并展示结果
2. ⚡ 不知道集合名时，先执行 db.getCollectionNames() 查看
3. ⚡ 复杂任务分多步：先查结构→再查数据→再分析，每步 done: false
4. ⚡ 任务完成时 done: true，展示最终结果
5. ⚡ 命令失败时分析错误并重试，不要直接放弃
6. ⚡ 字符串值用双引号，数值不要加引号
7. ⚡ 命令中不要包含换行符
8. ⚡ 不要问"要不要执行"——直接做，展示结果
9. ⚡ 查询结果用 reply 展示，让用户一目了然`;

  return prompt;
}

module.exports = { chatCompletion, buildSystemPrompt };