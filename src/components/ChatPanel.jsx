import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Input, Button, Space, Typography, message, Spin, Tag, Modal, Select, Form } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, PlayCircleOutlined, ClearOutlined, DownloadOutlined, SettingOutlined, ReloadOutlined, LinkOutlined, DownOutlined, RightOutlined, BarChartOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';
import ChartView from './ChartView';
const { chatCompletion, chatCompletionStream, buildSystemPrompt } = window.__ai;

const { Text } = Typography;

// Markdown 渲染组件
function MarkdownContent({ content, t }) {
  if (!content) return null;
  return (
    <div className="markdown-content" style={{ fontSize: 13, lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return <code style={{ background: t.bg.code, color: t.accent, padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>{children}</code>;
            }
            return (
              <pre style={{ background: t.bg.code, color: t.accent, padding: 10, borderRadius: 6, fontSize: 12, overflow: 'auto', margin: '8px 0' }}>
                <code className={className} {...props}>{children}</code>
              </pre>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflow: 'auto', margin: '8px 0' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th style={{ border: `1px solid ${t.border}`, padding: '4px 8px', background: t.bg.panel, textAlign: 'left' }}>{children}</th>;
          },
          td({ children }) {
            return <td style={{ border: `1px solid ${t.border}`, padding: '4px 8px' }}>{children}</td>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: t.info }}>{children}</a>;
          },
          strong({ children }) {
            return <strong style={{ fontWeight: 600 }}>{children}</strong>;
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ol>;
          },
          li({ children }) {
            return <li style={{ margin: '2px 0' }}>{children}</li>;
          },
          p({ children }) {
            return <p style={{ margin: '4px 0' }}>{children}</p>;
          },
          h1({ children }) { return <h1 style={{ fontSize: 15, margin: '8px 0 4px', fontWeight: 600 }}>{children}</h1>; },
          h2({ children }) { return <h2 style={{ fontSize: 14, margin: '8px 0 4px', fontWeight: 600 }}>{children}</h2>; },
          h3({ children }) { return <h3 style={{ fontSize: 13, margin: '6px 0 3px', fontWeight: 600 }}>{children}</h3>; },
          hr() { return <hr style={{ border: `none`, borderTop: `1px solid ${t.border}`, margin: '8px 0' }} />; },
          blockquote({ children }) {
            return <blockquote style={{ borderLeft: `3px solid ${t.accent}`, paddingLeft: 10, margin: '8px 0', color: t.text.secondary }}>{children}</blockquote>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatPanel() {
  const { selectedDb, selectedCollection, documents, totalDocs, aiConfig, activeConnectionId, setBackupOpen, setSelectedDb, setSelectedCollection, setDatabases, doRefresh, triggerReload, setSchemaOpen, setExportOpen, setAiConfig, aiSettingsOpen, setAiSettingsOpen } = useStore();
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
        localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-200)));
      } catch { /* localStorage 满时忽略 */ }
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
  const [openThinking, setOpenThinking] = useState(null);
  const [chartOpen, setChartOpen] = useState(null); // { msgTime, resultIdx }
  const [settingsForm] = Form.useForm();
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const MAX_ROUNDS = 10;
  const MAX_CONTEXT_MSGS = 30;      // 发送给 AI 的上下文上限

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
          schemaFields = Object.keys(schema.validator.$jsonSchema.properties || {});
        }
      } catch {}
    }

    const systemPrompt = buildSystemPrompt({
      dbName: safeSelectedDb, collections: colNames, fieldNames, sampleDocs,
      selectedCollection, totalDocs: totalDocs || 0, schemaFields, memorySummary: buildMemorySummary(),
    });

    // 构建消息历史（含上下文压缩）
    const buildHistory = (extraContent) => {
      // 获取当前消息列表
      let history = [];
      try {
        // 从 React 状态中获取最新消息
        const currentMsgs = messages;
        if (Array.isArray(currentMsgs) && currentMsgs.length > 1) {
          // 过滤掉空的 AI 消息和系统消息
          const validMsgs = currentMsgs.filter(m =>
            m && m.role && (m.content || m.role === 'user')
          );

          if (validMsgs.length > MAX_CONTEXT_MSGS) {
            // 上下文压缩：保留最近的 MAX_CONTEXT_MSGS 条
            // 把最早的消息压缩成一条摘要
            const headCount = validMsgs.length - MAX_CONTEXT_MSGS;
            const headMsgs = validMsgs.slice(0, headCount);
            const tailMsgs = validMsgs.slice(headCount);

            // 统计之前的对话轮次
            const userCount = headMsgs.filter(m => m.role === 'user').length;
            const summary = `[历史对话摘要：此前共 ${userCount} 轮对话，涉及 ${headMsgs.filter(m => m.commands?.length).length} 次数据库操作]`;

            history = [
              { role: 'user', content: summary },
              ...tailMsgs.map(m => ({ role: m.role, content: m.content || '(执行中...)' })),
            ];
          } else {
            history = validMsgs.map(m => ({ role: m.role, content: m.content || '(执行中...)' }));
          }
        }
      } catch {}

      return [
        { role: 'system', content: systemPrompt },
        ...history,
        ...(extraContent ? [{ role: 'user', content: extraContent }] : []),
      ];
    };

    let round = 0;
    let lastInput = userInput;

    // 创建主消息
    const mainMsg = {
      role: 'assistant', content: '',
      commands: [], action: '', actionParams: {},
      time: Date.now(), executed: false, execResults: [], round: 0, totalRounds: '',
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

      // 调用 AI（流式输出）
      let fullReply = '';
      const reply = await chatCompletionStream(
        aiConfig.url, aiConfig.key, aiConfig.model,
        buildHistory(lastInput),
        (chunk) => {
          fullReply += chunk;
          // 流式更新：显示思考进度（不显示原始 JSON）
          setMessages(prev => prev.map(m =>
            m.time === mainMsg.time ? { ...m, content: m.content || '正在思考...', streaming: true } : m
          ));
        }
      );

      // 从 AI 回复中提取 JSON（处理 markdown 代码块包裹情况）
      const extractJSON = (text) => {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const clean = match ? match[1].trim() : text.trim();
        try {
          return JSON.parse(clean);
        } catch {
          // 尝试找到第一个 { 和最后一个 }
          const start = clean.indexOf('{');
          const end = clean.lastIndexOf('}');
          if (start >= 0 && end > start) {
            try {
              return JSON.parse(clean.substring(start, end + 1));
            } catch {}
          }
          throw new Error('Invalid JSON');
        }
      };

      let parsed;
      try {
        parsed = extractJSON(reply);
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
          // 危险操作拦截
          const lower = cmd.toLowerCase();
          const isDangerous =
            lower.includes('dropdatabase') || lower.includes('.drop()') ||
            lower.includes('dropdatabase(') || lower.includes('dropcollection') ||
            lower.includes('deletemany') || lower.includes('deleteone') ||
            lower.includes('remove(') || lower.includes('updateone') || lower.includes('updatemany');

          if (isDangerous) {
            const confirmed = await new Promise((resolve) => {
              Modal.confirm({
                title: '⚠️ 危险操作确认',
                content: `即将执行：\n${cmd}\n\n此操作不可撤销，是否继续？`,
                okText: '确认执行', okType: 'danger', cancelText: '取消',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              });
            });
            if (!confirmed) {
              execResults.push({ success: false, error: '用户已取消' });
              continue;
            }
          }

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
      // 危险操作拦截：需要用户确认
      const lower = command.toLowerCase();
      const isDangerous =
        lower.includes('dropdatabase') || lower.includes('.drop()') ||
        lower.includes('dropdatabase(') || lower.includes('dropcollection') ||
        lower.includes('deletemany') || lower.includes('deleteone') ||
        lower.includes('remove(') || lower.includes('updateone') || lower.includes('updatemany');

      if (isDangerous) {
        const confirmed = await new Promise((resolve) => {
          Modal.confirm({
            title: '⚠️ 危险操作确认',
            content: `即将执行：\n${command}\n\n此操作不可撤销，是否继续？`,
            okText: '确认执行',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) {
          setMessages(prev => prev.map(m => {
            if (m.time !== msgObj.time) return m;
            return { ...m, executed: true, execResults: [...(m.execResults || []), { success: false, error: '已取消' }] };
          }));
          return;
        }
      }

      const result = await window.__mongo.executeShell(activeConnectionId, selectedDb, command);
      setMessages(prev => prev.map(m => {
        if (m.time !== msgObj.time) return m;
        const results = [...(m.execResults || []), result];
        return { ...m, execResults: results, executed: true };
      }));

      // 执行成功后刷新 UI
      if (result.success) {
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

  const renderExecResult = (result, idx, msgTime) => {
    if (!result) return null;
    if (!result.success) {
      return <Text key={idx} type="danger" style={{ fontSize: 12 }}>❌ {result.error}</Text>;
    }
    const data = result.data;
    if (data === undefined || data === null) {
      return <Tag key={idx} color="success">✅ 执行成功</Tag>;
    }
    const isArrayOfObjects = Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null;
    const showChart = chartOpen && chartOpen.msgTime === msgTime && chartOpen.resultIdx === idx;

    if (isArrayOfObjects) {
      return (
        <div key={idx} style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tag color="success">✅ 返回 {data.length} 条</Tag>
            <Button type="link" size="small" icon={<BarChartOutlined style={{ fontSize: 12 }} />}
              onClick={() => setChartOpen(showChart ? null : { msgTime, resultIdx: idx })}
              style={{ fontSize: 11, padding: 0, color: t.text.subtle }}>
              {showChart ? '收起图表' : '可视化'}
            </Button>
          </div>
          {showChart && <ChartView data={data} onClose={() => setChartOpen(null)} />}
          <pre style={{
            background: t.bg.code, color: t.accent, padding: 8, borderRadius: 4,
            maxHeight: showChart ? 100 : 200, overflow: 'auto', fontSize: 12, margin: '4px 0 0',
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

  const loadModels = async (url, key) => {
    if (!url || !key) return;
    setModelsLoading(true);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.data?.length) {
        setModels(data.data.map(m => ({ label: m.id, value: m.id })));
      } else {
        setModels([]);
      }
    } catch { setModels([]); }
    setModelsLoading(false);
  };

  const handleTestConnection = async () => {
    const { url, key, model } = settingsForm.getFieldsValue();
    if (!url || !key) { message.warning('请填写 API 地址和 Key'); return; }
    setTesting(true);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      message.success('连接成功！');
    } catch (err) { message.error('测试失败: ' + err.message); }
    setTesting(false);
  };

  const handleSaveSettings = () => {
    const values = settingsForm.getFieldsValue();
    setAiConfig({ url: values.url || '', key: values.key || '', model: values.model || 'gpt-4o-mini' });
    message.success('设置已保存');
    setAiSettingsOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 设置面板 */}
      {!aiConfig.url && !aiSettingsOpen && (
        <div style={{ padding: '6px 12px', background: `${t.warning}22`, borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: t.warning }}>⚠️ 未配置 API</Text>
          <Button size="small" type="link" icon={<SettingOutlined />} onClick={() => setAiSettingsOpen(true)} style={{ fontSize: 11 }}>去设置</Button>
        </div>
      )}
      {aiSettingsOpen && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, background: t.bg.panel, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ color: t.text.primary, fontSize: 12 }}>API 设置</Text>
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => setAiSettingsOpen(false)} style={{ color: t.text.subtle }} />
          </div>
          <Form form={settingsForm} layout="vertical" size="small" initialValues={{ url: aiConfig.url, key: aiConfig.key, model: aiConfig.model }}>
            <Form.Item name="url" label={<Text style={{ fontSize: 11, color: t.text.secondary }}>API 地址</Text>} style={{ marginBottom: 6 }}>
              <Input placeholder="https://api.openai.com/v1" style={{ fontSize: 12 }} />
            </Form.Item>
            <Form.Item name="key" label={<Text style={{ fontSize: 11, color: t.text.secondary }}>API Key</Text>} style={{ marginBottom: 6 }}>
              <Input.Password placeholder="sk-..." style={{ fontSize: 12 }} />
            </Form.Item>
            <Form.Item name="model" label={<Text style={{ fontSize: 11, color: t.text.secondary }}>模型</Text>} style={{ marginBottom: 6 }}>
              <Select
                placeholder="选择或输入模型"
                options={models}
                showSearch
                style={{ fontSize: 12 }}
                dropdownRender={(menu) => models.length > 0 ? menu : <div style={{ padding: 8, textAlign: 'center', color: '#999', fontSize: 11 }}>暂无列表，可手动输入</div>}
              />
            </Form.Item>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="small" icon={<ReloadOutlined />} loading={modelsLoading} onClick={() => {
                const { url, key } = settingsForm.getFieldsValue();
                loadModels(url, key);
              }}>加载模型</Button>
              <Button size="small" icon={<LinkOutlined />} loading={testing} onClick={handleTestConnection}>测试连接</Button>
              <Button size="small" type="primary" onClick={handleSaveSettings}>保存</Button>
            </div>
          </Form>
        </div>
      )}
      {/* 消息列表 */}
      <div style={{ flex: 1, overflow: 'auto', overflowX: 'hidden', padding: '8px 12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `linear-gradient(135deg, ${t.accent}, ${t.info})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', boxShadow: `0 6px 20px ${t.accent}44`,
            }}>
              <RobotOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div style={{ color: t.text.primary, fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
              AI Agent 已就绪
            </div>
            <div style={{ color: t.text.subtle, fontSize: 12, lineHeight: 2 }}>
              试试对我说：<br />
              <Tag style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => { setInput('查询所有玩家'); }}>📋 查询所有玩家</Tag><br />
              <Tag style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => { setInput('统计一共有多少玩家'); }}>📊 统计玩家数量</Tag><br />
              <Tag style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => { setInput('备份当前数据库'); }}>💾 备份数据库</Tag>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12, animation: 'fadeIn 0.2s ease' }}>
            {/* 用户消息 */}
            {msg.role === 'user' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <div style={{
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accent}dd)`,
                  padding: '8px 14px', borderRadius: '14px 14px 4px 14px',
                  maxWidth: '80%', boxShadow: `0 2px 8px ${t.accent}33`,
                }}>
                  <Text style={{ color: '#fff', fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</Text>
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, marginTop: 2,
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <UserOutlined style={{ color: '#fff', fontSize: 12 }} />
                </div>
              </div>
            )}

            {/* AI 消息 */}
            {msg.role === 'assistant' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, marginTop: 2, flexShrink: 0,
                  background: `linear-gradient(135deg, ${t.info}, ${t.infoLight})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RobotOutlined style={{ color: '#fff', fontSize: 13 }} />
                </div>
                <div style={{
                  background: msg.isSubStep ? t.bg.panel : t.bg.highlightBlue,
                  padding: '8px 14px', borderRadius: '4px 14px 14px 14px',
                  maxWidth: '80%', boxShadow: `0 1px 4px ${t.border}`,
                }}>
                  <div style={{ fontSize: 12, color: t.text.subtle, marginBottom: 4 }}>
                    {msg.round > 0 && <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {msg.totalRounds}
                    </Tag>}
                    {!msg.content && !msg.executed && (
                      <Text style={{ fontSize: 12, color: t.text.subtle }}>⏳ 思考中...</Text>
                    )}
                  </div>
                  {msg.content && (
                    msg.isError || msg.isWarning ? (
                      <Text style={{ color: msg.isError ? t.error : t.warning, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </Text>
                    ) : (
                      <MarkdownContent content={msg.content} t={t} />
                    )
                  )}
                  {msg.commands && msg.commands.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {msg.commands.map((cmd, i) => (
                        <div key={i} style={{ padding: '2px 8px', background: t.bg.code, borderRadius: 4, marginBottom: 2 }}>
                          <Text code style={{ color: t.accent, fontSize: 12 }}>{cmd}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 思考过程展示 */}
                  {msg.steps && msg.steps.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <Button
                        type="link"
                        size="small"
                        icon={openThinking === msg.time ? <DownOutlined /> : <RightOutlined />}
                        onClick={() => setOpenThinking(openThinking === msg.time ? null : msg.time)}
                        style={{ padding: 0, fontSize: 11, color: t.text.subtle }}
                      >
                        思考过程（{msg.steps.length} 步）
                      </Button>
                      {openThinking === msg.time && (
                        <div style={{ marginTop: 4, padding: '6px 10px', background: t.bg.panel, borderRadius: 6, fontSize: 12 }}>
                          {msg.steps.map((step, i) => (
                            <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < msg.steps.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                              <div style={{ color: t.text.subtle, fontSize: 11, marginBottom: 2 }}>第 {step.round} 步</div>
                              <div style={{ color: t.text.secondary, fontSize: 12 }}>{step.reply}</div>
                              {step.commands && step.commands.length > 0 && (
                                <div style={{ marginTop: 2 }}>
                                  {step.commands.map((cmd, j) => (
                                    <div key={j} style={{ padding: '1px 6px', background: t.bg.code, borderRadius: 3, marginTop: 2, fontSize: 11 }}>
                                      <Text code style={{ color: t.accent, fontSize: 11 }}>{cmd}</Text>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {msg.executed && msg.execResults && msg.execResults.map((r, i) => renderExecResult(r, i, msg.time))}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg, ${t.info}, ${t.infoLight})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RobotOutlined style={{ color: '#fff', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spin size="small" />
              {agentRound > 0 && (
                <Text style={{ color: t.text.subtle, fontSize: 11 }}>
                  第 {agentRound} 轮思考中<span style={{ animation: 'blink 1s step-end infinite' }}>▊</span>
                </Text>
              )}
            </div>
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