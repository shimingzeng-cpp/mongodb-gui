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

    // 启动 Agent 循环
    await agentLoop([...messages, userMsg], text);

    setLoading(false);
  };

  // Agent 多轮自主循环
  const [interrupt, setInterrupt] = useState(false);
  const [agentRound, setAgentRound] = useState(0);
  const MAX_ROUNDS = 10;

  const agentLoop = async (currentMessages, userInput) => {
    setInterrupt(false);
    setAgentRound(0);

    // 收集上下文
    const cols = selectedDb ? await window.__mongo.listCollections(activeConnectionId, selectedDb).catch(() => []) : [];
    const colNames = cols.map(c => c.name);
    const fieldNames = documents.length > 0 ? Object.keys(documents[0]) : [];
    const sampleDocs = documents.slice(0, 3);

    let schemaFields = [];
    if (selectedDb && selectedCollection) {
      try {
        const schema = await window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection);
        if (schema.validator && schema.validator.$jsonSchema) {
          schemaFields = Object.keys(schema.validator.$jsonSchema.properties || {}).filter(k => k !== '_id');
        }
      } catch {}
    }

    const systemPrompt = buildSystemPrompt({
      dbName: selectedDb, collections: colNames, fieldNames, sampleDocs,
      selectedCollection, totalDocs, schemaFields, memorySummary: buildMemorySummary(),
    });

    // 构建消息历史（system + 历史 + 当前用户输入）
    const buildHistory = (extraContent) => [
      { role: 'system', content: systemPrompt },
      ...currentMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
      ...(extraContent ? [{ role: 'user', content: extraContent }] : []),
    ];

    let lastReply = userInput;
    let round = 0;

    while (round < MAX_ROUNDS) {
      if (interrupt) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: '⏸️ 已中断', time: Date.now(), isInterrupt: true,
        }]);
        return;
      }

      round++;
      setAgentRound(round);

      try {
        const reply = await chatCompletion(
          aiConfig.url, aiConfig.key, aiConfig.model, buildHistory(lastReply)
        );

        let parsed;
        try {
          parsed = JSON.parse(reply);
        } catch {
          parsed = { reply, commands: [], action: '' };
        }

        const commands = parsed.commands || (parsed.command ? [parsed.command] : []);
        const actionParams = parsed.actionParams || {};
        const done = parsed.done !== false; // 默认 true（兼容旧格式）

        if (round === 1) {
          // 第一轮：创建 AI 消息并显示
          const aiMsg = {
            role: 'assistant',
            content: parsed.reply || reply,
            commands, action: parsed.action || '', actionParams,
            time: Date.now(), executed: false, execResults: [], round, totalRounds: '?',
          };

          // 先处理 action
          handleAction(parsed.action, actionParams);

          // 执行命令
          if (commands.length > 0) {
            for (const cmd of commands) {
              if (cmd.trim()) await executeCommand(cmd, aiMsg);
            }
          }

          // 更新轮次标记
          setMessages(prev => prev.map(m =>
            m.time === aiMsg.time ? { ...m, totalRounds: done ? round : `>${round}` } : m
          ));

          if (done) return; // 一轮完成

          // 构建后续输入：命令执行结果
          const results = aiMsg.execResults || [];
          const resultText = results.map((r, i) => {
            const cmd = commands[i] || '';
            if (r.success) return `[命令: ${cmd}] 执行结果: ${JSON.stringify(r.data)}`;
            return `[命令: ${cmd}] 执行失败: ${r.error}`;
          }).join('\n');

          lastReply = `以上命令的执行结果：\n${resultText}\n\n请根据这些结果继续下一步。如果任务完成，请设 done: true 并总结。`;

        } else {
          // 后续轮次：追加到上一条消息，展示为子步骤
          const stepMsg = {
            role: 'assistant',
            content: `**[第${round}步]** ${parsed.reply || reply}`,
            commands, action: parsed.action || '', actionParams,
            time: Date.now() + round, // 确保唯一 time
            executed: false, execResults: [], round, totalRounds: done ? round : `>${round}`,
            isSubStep: true,
          };
          setMessages(prev => [...prev, stepMsg]);

          // 处理 action
          handleAction(parsed.action, actionParams);

          // 执行命令
          if (commands.length > 0) {
            for (const cmd of commands) {
              if (cmd.trim()) await executeCommand(cmd, stepMsg);
            }
          }

          // 更新轮次
          setMessages(prev => prev.map(m =>
            m.time === stepMsg.time ? { ...m, totalRounds: done ? round : `>${round}` } : m
          ));

          if (done) return;

          const results = stepMsg.execResults || [];
          const resultText = results.map((r, i) => {
            const cmd = commands[i] || '';
            if (r.success) return `[命令: ${cmd}] 执行结果: ${JSON.stringify(r.data)}`;
            return `[命令: ${cmd}] 执行失败: ${r.error}`;
          }).join('\n');

          lastReply = `以上命令的执行结果：\n${resultText}\n\n请根据这些结果继续下一步。如果任务完成，请设 done: true 并总结。`;
        }
      } catch (err) {
        // 错误时继续尝试
        lastReply = `执行出错: ${err.message}。请尝试其他方式继续，或设 done: true 结束。`;
      }
    }

    // 达到最大轮次
    setMessages(prev => [...prev, {
      role: 'assistant', content: `⚠️ 已达到最大 ${MAX_ROUNDS} 轮限制，自动结束。如果需要继续，请再说一次。`,
      time: Date.now(), isWarning: true,
    }]);
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
              const dbs = await window.__mongo.listDatabases(activeConnectionId);
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
    const actions = messages.filter(m => m.role === 'assistant' && m.executed && (m.commands?.length || m.action));
    if (actions.length === 0) return '';
    const recent = actions.slice(-10);
    const lines = recent.map(m => {
      const cmds = m.commands?.join('; ') || '';
      const act = m.action || '';
      return `[${new Date(m.time).toLocaleTimeString()}] ${act ? `操作:${act}` : ''} ${cmds ? `命令:${cmds}` : ''}`;
    });
    return `\n## 本次会话历史记录（最近操作）\n${lines.join('\n')}\n`;
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
                      {msg.round}/{msg.totalRounds}
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