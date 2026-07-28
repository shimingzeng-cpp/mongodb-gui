import React, { useState } from 'react';
import { Input, Button, Space, Typography, message, Spin, Tabs } from 'antd';
import { PlayCircleOutlined, ClearOutlined, CaretRightOutlined, RobotOutlined, CodeOutlined } from '@ant-design/icons';
import useStore from '../store';
import ChatPanel from './ChatPanel';

const { TextArea } = Input;
const { Text } = Typography;

function ShellTab() {
  const { selectedDb, setSelectedCollection, setPage } = useStore();
  const [command, setCommand] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const execute = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    if (!selectedDb) { message.warning('请先选择数据库'); return; }
    setLoading(true);
    setHistory([...history, cmd]);
    setHistoryIdx(-1);
    try {
      const res = await window.__mongo.executeShell(selectedDb, cmd);
      setResult(res);
      if (res.success && (cmd.includes('insert') || cmd.includes('update') || cmd.includes('delete') || cmd.includes('drop'))) {
        const colMatch = cmd.match(/db\.(\w+)\./);
        if (colMatch) { setSelectedCollection(colMatch[1]); setPage(1); }
      }
    } catch (err) { setResult({ success: false, error: err.message }); }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); execute(); return; }
    const textarea = e.target;
    const isAtStart = textarea.selectionStart === 0;
    const isAtEnd = textarea.selectionEnd === textarea.value.length;
    if (e.key === 'ArrowUp' && isAtStart && history.length > 0) {
      e.preventDefault();
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx); setCommand(history[idx]); return;
    }
    if (e.key === 'ArrowDown' && isAtEnd && history.length > 0) {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx + 1;
      if (idx >= history.length) { setHistoryIdx(-1); setCommand(''); }
      else { setHistoryIdx(idx); setCommand(history[idx]); }
    }
  };

  const renderResult = (res) => {
    if (!res) return null;
    if (!res.success) return <Text type="danger" style={{ whiteSpace: 'pre-wrap' }}>❌ {res.error}</Text>;
    const data = res.data;
    if (data === undefined || data === null) return <Text type="success">✅ 执行成功</Text>;
    if (typeof data === 'object') {
      return <pre style={{ background: '#1a1a1a', color: '#00b96b', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(data, null, 2)}</pre>;
    }
    return <Text style={{ color: '#00b96b' }}>{String(data)}</Text>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 8px 8px', flexShrink: 0 }}>
        <TextArea value={command} onChange={e => setCommand(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={`db.t_player.find()\ndb.t_player.findOne({id: 1})\ndb.t_player.insertOne({id: 2, name: "test"})`}
          rows={4}
          style={{ background: '#0d0d0d', color: '#00b96b', border: '1px solid #333', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, borderRadius: 6, resize: 'vertical' }}
          spellCheck={false} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Ctrl+Enter 执行 | ↑↓ 历史</Text>
          <Space>
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => { setCommand(''); setResult(null); }}>清空</Button>
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={loading} onClick={execute}>执行</Button>
          </Space>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : renderResult(result)}
      </div>
    </div>
  );
}

export default function ShellPanel() {
  const { selectedDb } = useStore();
  const [activeTab, setActiveTab] = useState('shell');

  const tabItems = [
    {
      key: 'shell',
      label: <Space size={4}><CodeOutlined />Shell</Space>,
      children: <ShellTab />,
    },
    {
      key: 'ai',
      label: <Space size={4}><RobotOutlined />AI 助手</Space>,
      children: <ChatPanel />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid #333' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
        tabBarStyle={{ marginBottom: 0, padding: '0 12px', background: '#1a1a1a' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      />
    </div>
  );
}