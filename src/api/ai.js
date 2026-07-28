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
  let prompt = `你是 MongoDB 助手，帮助用户通过自然语言操作数据库。

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
用户会用自然语言描述需求，你需要生成 MongoDB shell 命令来操作数据库。

严格按以下 JSON 格式返回（不要包含其他内容）：
{"reply": "你的回复，解释你要做什么", "command": "db.xxx.find()"}

规则：
- 查询类操作：find, findOne, countDocuments, aggregate, getCollectionNames
- 写入类操作：insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany
- 如果只是聊天不需要操作数据库，command 设为空字符串 ""
- 命令中不要包含换行符
- 字符串值用双引号，JSON 对象用花括号
- 数值不要加引号
- 使用 $set, $gt, $gte, $lt, $lte, $ne, $regex 等 MongoDB 操作符`;

  return prompt;
}

module.exports = { chatCompletion, buildSystemPrompt };