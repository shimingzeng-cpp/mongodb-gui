import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Space, Typography, message, Spin, Tag } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, PlayCircleOutlined, ClearOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';
const { chatCompletion, buildSystemPrompt } = window.__ai;

const { Text } = Typography;

export default function ChatPanel() {
  const { selectedDb, documents, aiConfig, activeConnectionId } = useStore();
  const t = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

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
      // 获取当前数据库上下文
      const cols = selectedDb ? await window.__mongo.listCollections(activeConnectionId, selectedDb).catch(() => []) : [];
      const colNames = cols.map(c => c.name);
      const fieldNames = documents.length > 0 ? Object.keys(documents[0]) : [];
      const sampleDocs = documents.slice(0, 3);

      const systemPrompt = buildSystemPrompt(selectedDb, colNames, fieldNames, sampleDocs);

      const reply = await chatCompletion(
        aiConfig.url,
        aiConfig.key,
        aiConfig.model,
        [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: text },
        ]
      );

      // 解析 AI 回复
      let parsed;
      try {
        parsed = JSON.parse(reply);
      } catch {
        // 如果不是 JSON，当作纯文本回复
        parsed = { reply: reply, command: '' };
      }

      const aiMsg = {
        role: 'assistant',
        content: parsed.reply || reply,
        command: parsed.command || '',
        time: Date.now(),
        executed: false,
      };
      setMessages(prev => [...prev, aiMsg]);

      // 自动执行命令
      if (parsed.command && parsed.command.trim()) {
        await executeCommand(parsed.command, aiMsg);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，请求失败: ' + err.message,
        time: Date.now(),
        isError: true,
      }]);
    }
    setLoading(false);
  };

  const executeCommand = async (command, msgObj) => {
    try {
      const result = await window.__mongo.executeShell(activeConnectionId, selectedDb, command);
      const idx = messages.findIndex(m => m.time === msgObj.time);
      if (idx >= 0) {
        const updated = [...messages];
        updated[idx] = {
          ...updated[idx],
          executed: true,
          execResult: result,
        };
        setMessages(updated);
      }
    } catch (err) {
      const idx = messages.findIndex(m => m.time === msgObj.time);
      if (idx >= 0) {
        const updated = [...messages];
        updated[idx] = {
          ...updated[idx],
          executed: true,
          execResult: { success: false, error: err.message },
        };
        setMessages(updated);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => setMessages([]);

  const renderExecResult = (result) => {
    if (!result) return null;
    if (!result.success) {
      return <Text type="danger" style={{ fontSize: 12 }}>❌ {result.error}</Text>;
    }
    const data = result.data;
    if (data === undefined || data === null) {
      return <Tag color="success">✅ 执行成功</Tag>;
    }
    if (Array.isArray(data)) {
      return (
        <div style={{ marginTop: 4 }}>
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
      <div style={{ marginTop: 4 }}>
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
            <div>AI 助手已就绪</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              试着问我：<br />
              "查询所有玩家"<br />
              "新增一个玩家"<br />
              "统计玩家数量"
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
                <RobotOutlined style={{ color: t.info, marginTop: 4 }} />
                <div style={{
                  background: t.bg.highlightBlue, padding: '8px 12px', borderRadius: 12,
                  maxWidth: '80%', borderBottomLeftRadius: 4,
                }}>
                  <Text style={{ color: msg.isError ? t.error : t.text.primary, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Text>
                  {msg.command && (
                    <div style={{ marginTop: 6, padding: '4px 8px', background: t.bg.code, borderRadius: 4 }}>
                      <Text code style={{ color: t.accent, fontSize: 12 }}>{msg.command}</Text>
                    </div>
                  )}
                  {msg.executed && renderExecResult(msg.execResult)}
                  {msg.command && !msg.executed && (
                    <Button
                      size="small"
                      type="link"
                      icon={<PlayCircleOutlined />}
                      onClick={() => executeCommand(msg.command, msg)}
                      style={{ padding: 0, marginTop: 4, fontSize: 12 }}
                    >
                      执行命令
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <RobotOutlined style={{ color: t.info, marginTop: 4 }} />
            <Spin size="small" />
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