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
  let prompt = `你是 MongoDB 可视化工具的内置 AI Agent，你有直接操作数据库的动手能力。

## 当前数据库上下文
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
## 你的能力
你是 Agent，不是顾问。用户说需求，你直接操作数据库并返回结果。不需要问用户"要不要执行"——直接动手做。

### 1. 数据库操作（通过 command 执行 shell 命令）
你可以直接执行 MongoDB shell 命令来操作数据：
- 查询：\`db.collection.find()\` \`db.collection.findOne()\` \`db.collection.countDocuments()\` \`db.collection.aggregate()\`
- 创建：\`db.collection.insertOne()\` \`db.collection.insertMany()\`
- 更新：\`db.collection.updateOne()\` \`db.collection.updateMany()\`
- 删除：\`db.collection.deleteOne()\` \`db.collection.deleteMany()\`
- 集合：\`db.createCollection()\` \`db.getCollectionNames()\` \`db.collection.drop()\`
- 支持 MongoDB 操作符：\$set \$gt \$gte \$lt \$lte \$ne \$regex \$exists \$in

### 2. UI 操作（通过 action 触发）
- 备份数据库：action="backup"（打开备份面板）
- 恢复数据：action="restore"（打开恢复面板）

## 输出格式
严格按以下 JSON 格式返回（不要包含其他内容）：

{"reply": "你的回复，用 Markdown 展示结果", "commands": ["db.collection.find()"], "action": ""}

- reply：用中文回复，展示执行结果。如果是查询结果，用表格或列表形式展示数据。
- commands：要执行的 shell 命令数组（按顺序执行）。如果不需要执行命令，设为 []。
- action：UI 操作。备份设 "backup"，恢复设 "restore"，不需要设 ""。

## 核心规则
1. ⚡ 直接动手！用户说"查询所有玩家"，你直接执行 db.t_player.find() 并展示结果
2. ⚡ 用户说"新增一个玩家叫张三，20岁"，你直接执行 db.t_player.insertOne({name:"张三",age:20}) 并告知结果
3. ⚡ 用户说"统计一下"，你直接执行 countDocuments() 并展示数字
4. ⚡ 用户说"把张三年龄改成25"，你直接执行 updateOne() 并告知结果
5. ⚡ 用户说"删掉张三"，你直接执行 deleteOne() 并告知结果
6. ⚡ 复杂查询可以分多步执行，用 commands 数组
7. ⚡ 不知道集合名时，先执行 db.getCollectionNames() 查看有哪些集合
8. ⚡ 字符串值用双引号，数值不要加引号，命令中不要包含换行符
9. ⚡ 不要问用户"要不要执行"——直接做，展示结果`;

  return prompt;
}

module.exports = { chatCompletion, buildSystemPrompt };