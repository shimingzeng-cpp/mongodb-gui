import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Space, Typography, message, Spin, Tag } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, PlayCircleOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';
const { chatCompletion, buildSystemPrompt } = window.__ai;

const { Text } = Typography;

export default function ChatPanel() {
  const { selectedDb, selectedCollection, documents, totalDocs, aiConfig, activeConnectionId, setBackupOpen, setSelectedDb, setSelectedCollection, setDatabases, doRefresh, triggerReload, setSchemaOpen, setExportOpen } = useStore();
  const t = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // 聊天历史持久化 key
  const chatStorageKey = activeConnectionId ? `chat_history_${activeConnectionId}` : null;

  // 加载历史消息
  useEffect(() => {
    if (chatStorageKey) {
      try {
        const saved = localStorage.getItem(chatStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        }
      } catch {}
    }
  }, [chatStorageKey]);

  // 消息变化时自动保存
  useEffect(() => {
    if (chatStorageKey && messages.length > 0) {
      try {
        localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-100)));
      } catch {
        // localStorage 满时忽略
      }
    }
  }, [messages, chatStorageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    if (!aiConfig.url || !aiConfig.key) {
      message.warning('请先配置 API 地址和 Key（点击顶部 ⚙ 设置）');
      return;
    }
    if (!selectedDb) {
      message.warning('请先选择数据库');
      return;
    }

    setInput('');
    const userMsg = { role: 'user', content: text, time: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      await agentLoop(text);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: '抱歉，执行出错: ' + err.message, time: Date.now(), isError: true,
      }]);
    }
    setLoading(false);
  };

  // Agent 多轮自主循环
  const [interrupt, setInterrupt] = useState(false);
  const [agentRound, setAgentRound] = useState(0);
  const MAX_ROUNDS = 10;

  const agentLoop = async (userInput) => {
    try {
      // 整个函数体包在 try 中，以便精确捕获错误
      return await agentLoopImpl(userInput);
    } catch (err) {
      console.error('[AgentLoop Error]', err);
      setMessages(prev => prev.map(m => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '正在思考...') {
          return { ...lastMsg, content: '抱歉，执行出错: ' + err.message, isError: true };
        }
        return m;
      }));
      // 重新抛出给 send 的 catch
      throw err;
    }
  };

  const agentLoopImpl = async (userInput) => {
    setInterrupt(false);
    setAgentRound(0);

    // 安全获取上下文
    const safeDocs = Array.isArray(documents) ? documents : [];
    const safeSelectedDb = selectedDb || '';
    const safeActiveId = activeConnectionId || '';

    let cols = [], colNames = [];
    try {
      cols = safeSelectedDb ? await window.__mongo.listCollections(safeActiveId, safeSelectedDb).catch(() => []) : [];
      colNames = Array.isArray(cols) ? cols.map(c => c && c.name) : [];
    } catch {}

    const fieldNames = safeDocs.length > 0 ? Object.keys(safeDocs[0] || {}) : [];
    const sampleDocs = safeDocs.slice(0, 3);

    let schemaFields = [];
    if (safeSelectedDb && selectedCollection) {
      try {
        const schema = await window.__mongo.getCollectionSchema(safeActiveId, safeSelectedDb, selectedCollection);
        if (schema && schema.validator && schema.validator.$jsonSchema) {
          schemaFields = Object.keys(schema.validator.$jsonSchema.properties || {}).filter(k => k !== '_id');
        }
      } catch {}
    }

    const systemPrompt = buildSystemPrompt({
      dbName: safeSelectedDb, collections: colNames, fieldNames, sampleDocs,
      selectedCollection, totalDocs: totalDocs || 0, schemaFields, memorySummary: buildMemorySummary(),
    });

    // 构建消息历史
    const buildHistory = (extraContent) => [
      { role: 'system', content: systemPrompt },
      ...(extraContent ? [{ role: 'user', content: extraContent }] : []),
    ];

    let round = 0;
    let lastInput = userInput;

    // 创建主消息
    const mainMsg = {
      role: 'assistant', content: '正在思考...',
      commands: [], action: '', actionParams: {},
      time: Date.now(), executed: false, execResults: [], round: 0, totalRounds: '?',
      steps: [],
    };
    setMessages(prev => [...prev, mainMsg]);

    while (round < MAX_ROUNDS) {
      if (interrupt) {
        setMessages(prev => prev.map(m =>
          m.time === mainMsg.time ? { ...m, content: '⏸️ 已中断', totalRounds: '已中断' } : m
        ));
        return;
      }

      round++;
      setAgentRound(round);

      // 调用 AI
      const reply = await chatCompletion(
        aiConfig.url, aiConfig.key, aiConfig.model,
        buildHistory(lastInput)
      );

      let parsed;
      try {
        parsed = JSON.parse(reply);
      } catch {
        parsed = { reply, commands: [], action: '', done: true };
      }

      // 确保 commands 是数组（兼容旧格式和异常值）
      const rawCommands = parsed.commands || (parsed.command ? [parsed.command] : []);
      const commands = Array.isArray(rawCommands) ? rawCommands : [];
      const actionParams = parsed.actionParams || {};
      const done = parsed.done !== false;

      // 处理 action
      handleAction(parsed.action, actionParams);

      // 执行命令
      const execResults = [];
      for (const cmd of commands) {
        if (cmd && typeof cmd === 'string' && cmd.trim()) {
          const result = await window.__mongo.executeShell(safeActiveId, safeSelectedDb, cmd);
          execResults.push(result);
          // 刷新 UI
          if (result.success) {
            const lower = cmd.toLowerCase();
            if (lower.includes('drop') || lower.includes('insert') || lower.includes('update') || lower.includes('delete') || lower.includes('createcollection') || lower.includes('rename') || lower.includes('createindex') || lower.includes('dropindex')) {
              if (lower.includes('database') || lower.includes('drop(') || lower.includes('drop())') || lower.includes('createcollection')) {
                try { const dbs = await window.__mongo.listDatabases(safeActiveId); setDatabases(dbs); } catch {}
              }
              doRefresh();
              triggerReload();
            }
          }
        }
      }

      // 构建步骤
      const step = {
        reply: parsed.reply || reply,
        commands, action: parsed.action,
        execResults, round, done,
      };

      if (done) {
        // 最后一步：更新主消息
        setMessages(prev => prev.map(m =>
          m.time === mainMsg.time ? {
            ...m, content: parsed.reply || reply,
            commands, action: parsed.action, actionParams,
            executed: true, execResults, round, totalRounds: `${round} 轮`,
            steps: [...(m.steps || []), step],
          } : m
        ));
        return;
      } else {
        // 还没完成：更新主消息显示进度，并构建下一步输入
        const resultText = execResults.map((r, i) => {
          const cmd = commands[i] || '';
          if (r.success) return `[命令: ${cmd}] 结果: ${JSON.stringify(r.data)}`;
          return `[命令: ${cmd}] 失败: ${r.error}`;
        }).join('\n');

        lastInput = `[第${round}步结果]\n${resultText}\n\n继续下一步。如果任务完成，请设 done: true 并总结。`;

        // 更新主消息显示进度
        setMessages(prev => prev.map(m =>
          m.time === mainMsg.time ? {
            ...m, content: `正在执行第 ${round} 步：${(parsed.reply || reply).substring(0, 100)}...`,
            commands, action: parsed.action, actionParams,
            executed: true, execResults, round, totalRounds: `第${round}步`,
            steps: [...(m.steps || []), step],
          } : m
        ));
      }
    }

    // 达到最大轮次
    setMessages(prev => prev.map(m =>
      m.time === mainMsg.time ? {
        ...m, content: `⚠️ 已达到最大 ${MAX_ROUNDS} 轮限制，自动结束。如果需要继续，请再说一次。`,
        totalRounds: `已达上限`,
      } : m
    ));
  };

  // 处理 action
  const handleAction = (action, actionParams) => {
    if (action === 'backup' || action === 'restore') {
      setBackupOpen(true);
    } else if (action === 'switch_db' && actionParams?.db) {
      setSelectedDb(actionParams.db);
      doRefresh();
    } else if (action === 'switch_collection' && actionParams?.db && actionParams?.collection) {
      setSelectedDb(actionParams.db);
      setSelectedCollection(actionParams.collection);
      triggerReload();
    } else if (action === 'open_schema') {
      setSchemaOpen(true);
    } else if (action === 'open_export') {
      setExportOpen(true);
    } else if (action === 'open_db' && actionParams?.db) {
      setSelectedDb(actionParams.db);
      doRefresh();
    } else if (action === 'close_db') {
      useStore.getState().closeDb();
      doRefresh();
    } else if (action === 'close_collection') {
      useStore.getState().closeCollection();
    } else if (action === 'refresh') {
      doRefresh();
      triggerReload();
    }
  };

  const executeCommand = async (command, msgObj) => {
    try {
      const result = await window.__mongo.executeShell(activeConnectionId, selectedDb, command);
      setMessages(prev => prev.map(m => {
        if (m.time !== msgObj.time) return m;
        const results = [...(m.execResults || []), result];
        return { ...m, execResults: results, executed: true };
      }));

      // 执行成功后刷新 UI
      if (result.success) {
        const lower = command.toLowerCase();
        const isMutation =
          lower.includes('drop') || lower.includes('insert') ||
          lower.includes('update') || lower.includes('delete') ||
          lower.includes('createcollection') || lower.includes('rename') ||
          lower.includes('createindex') || lower.includes('dropindex');
        if (isMutation) {
          if (lower.includes('database') || lower.includes('drop(') || lower.includes('drop())') || lower.includes('createcollection')) {
            try {
              const dbs = await window.__mongo.listDatabases(safeActiveId);
              setDatabases(dbs);
            } catch {}
          }
          doRefresh();
          triggerReload();
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => {
        if (m.time !== msgObj.time) return m;
        const results = [...(m.execResults || []), { success: false, error: err.message }];
        return { ...m, execResults: results, executed: true };
      }));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (chatStorageKey) {
      try { localStorage.removeItem(chatStorageKey); } catch {}
    }
    message.success('聊天历史已清除');
  };

  // 构建记忆摘要：从历史消息中提取关键操作记录
  const buildMemorySummary = () => {
    try {
      const msgs = Array.isArray(messages) ? messages : [];
      const actions = msgs.filter(m => m && m.role === 'assistant' && m.executed && (m.commands?.length || m.action));
      if (actions.length === 0) return '';
      const recent = actions.slice(-10);
      const lines = recent.map(m => {
        const cmds = Array.isArray(m.commands) ? m.commands.join('; ') : '';
        const act = m.action || '';
        return `[${new Date(m.time).toLocaleTimeString()}] ${act ? `操作:${act}` : ''} ${cmds ? `命令:${cmds}` : ''}`;
      });
      return `\n## 本次会话历史记录（最近操作）\n${lines.join('\n')}\n`;
    } catch { return ''; }
  };

  const renderExecResult = (result, idx) => {
    if (!result) return null;
    if (!result.success) {
      return <Text key={idx} type="danger" style={{ fontSize: 12 }}>❌ {result.error}</Text>;
    }
    const data = result.data;
    if (data === undefined || data === null) {
      return <Tag key={idx} color="success">✅ 执行成功</Tag>;
    }
    if (Array.isArray(data)) {
      return (
        <div key={idx} style={{ marginTop: 4 }}>
          <Tag color="success">✅ 返回 {data.length} 条</Tag>
          <pre style={{
            background: t.bg.code, color: t.accent, padding: 8, borderRadius: 4,
            maxHeight: 200, overflow: 'auto', fontSize: 12, margin: '4px 0 0',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
    }
    return (
      <div key={idx} style={{ marginTop: 4 }}>
        <Tag color="success">✅ 执行成功</Tag>
        <pre style={{
          background: t.bg.code, color: t.accent, padding: 8, borderRadius: 4,
          maxHeight: 200, overflow: 'auto', fontSize: 12, margin: '4px 0 0',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 消息列表 */}
      <div style={{ flex: 1, overflow: 'auto', overflowX: 'hidden', padding: '8px 12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: t.text.muted, padding: 40, fontSize: 13 }}>
            <RobotOutlined style={{ fontSize: 32, marginBottom: 12 }} />
            <div>AI Agent 已就绪，我会记住之前的对话</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              试试对我说：<br />
              "查询所有玩家"<br />
              "新增一个玩家叫张三，20岁"<br />
              "把张三年龄改成25"<br />
              "统计一共有多少玩家"<br />
              "切换到 test 数据库"<br />
              "查看当前集合的 Schema"<br />
              "备份当前数据库"
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {/* 用户消息 */}
            {msg.role === 'user' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <div style={{
                  background: t.bg.highlight, padding: '8px 12px', borderRadius: 12,
                  maxWidth: '80%', borderBottomRightRadius: 4,
                }}>
                  <Text style={{ color: t.text.primary, fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</Text>
                </div>
                <UserOutlined style={{ color: t.accent, marginTop: 4 }} />
              </div>
            )}

            {/* AI 消息 */}
            {msg.role === 'assistant' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <RobotOutlined style={{ color: msg.isSubStep ? t.text.subtle : t.info, marginTop: 4 }} />
                <div style={{
                  background: msg.isSubStep ? t.bg.panel : t.bg.highlightBlue,
                  padding: '8px 12px', borderRadius: 12,
                  maxWidth: '80%', borderBottomLeftRadius: 4,
                  opacity: msg.isSubStep ? 0.9 : 1,
                }}>
                  <div style={{ fontSize: 12, color: t.text.subtle, marginBottom: 4 }}>
                    {msg.round && <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {msg.totalRounds}
                    </Tag>}
                  </div>
                  <Text style={{ color: msg.isError ? t.error : msg.isWarning ? t.warning : t.text.primary, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Text>
                  {msg.commands && msg.commands.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {msg.commands.map((cmd, i) => (
                        <div key={i} style={{ padding: '2px 8px', background: t.bg.code, borderRadius: 4, marginBottom: 2 }}>
                          <Text code style={{ color: t.accent, fontSize: 12 }}>{cmd}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.executed && msg.execResults && msg.execResults.map((r, i) => renderExecResult(r, i))}
                  {msg.commands && msg.commands.length > 0 && !msg.executed && (
                    <Button
                      size="small"
                      type="link"
                      icon={<PlayCircleOutlined />}
                      onClick={async () => {
                        for (const cmd of msg.commands) {
                          if (cmd.trim()) await executeCommand(cmd, msg);
                        }
                      }}
                      style={{ padding: 0, marginTop: 4, fontSize: 12 }}
                    >
                      执行命令
                    </Button>
                  )}
                  {msg.action === 'backup' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="blue" icon={<DownloadOutlined />}>已打开备份面板</Tag>
                    </div>
                  )}
                  {msg.action === 'restore' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="blue" icon={<DownloadOutlined />}>已打开恢复面板</Tag>
                    </div>
                  )}
                  {msg.action === 'switch_db' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="green">已切换到数据库 {msg.actionParams?.db}</Tag>
                    </div>
                  )}
                  {msg.action === 'switch_collection' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="green">已切换到 {msg.actionParams?.db}.{msg.actionParams?.collection}</Tag>
                    </div>
                  )}
                  {msg.action === 'open_schema' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="blue">已打开字段验证面板</Tag>
                    </div>
                  )}
                  {msg.action === 'open_export' && msg.executed && (
                    <div style={{ marginTop: 6 }}>
                      <Tag color="blue">已打开导出面板</Tag>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RobotOutlined style={{ color: t.info, marginTop: 4 }} />
            <Spin size="small" />
            {agentRound > 0 && (
              <Text style={{ color: t.text.subtle, fontSize: 11 }}>
                第 {agentRound} 轮思考中...
              </Text>
            )}
            <Button size="small" danger type="link" onClick={() => setInterrupt(true)}
              style={{ fontSize: 11, padding: 0 }}>
              中断
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入栏 */}
      <div style={{ borderTop: `1px solid ${t.border}`, padding: '8px 12px', display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearChat} title="清空对话" />
        <Input.TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用自然语言描述你想做什么..."
          rows={2}
          style={{
            background: t.bg.code, color: t.text.primary, border: `1px solid ${t.border}`,
            fontSize: 13, borderRadius: 8, resize: 'none',
          }}
          spellCheck={false}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={send}
          loading={loading}
          style={{ alignSelf: 'flex-end', borderRadius: 8 }}
        >
          发送
        </Button>
      </div>
    </div>
  );
}