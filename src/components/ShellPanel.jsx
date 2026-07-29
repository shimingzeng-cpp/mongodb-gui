import React, { useState, useRef } from 'react';
import { Input, Button, Space, Typography, message, Spin, Tabs } from 'antd';
import { PlayCircleOutlined, ClearOutlined, RobotOutlined, CodeOutlined } from '@ant-design/icons';
import useStore from '../store';
import ChatPanel from './ChatPanel';

const { TextArea } = Input;
const { Text } = Typography;

const SHELL_SUGGESTIONS = [
  { label: 'db.collection.find()', value: 'db.{collection}.find()', desc: '查询文档' },
  { label: 'db.collection.find({})', value: 'db.{collection}.find({})', desc: '条件查询' },
  { label: 'db.collection.findOne({})', value: 'db.{collection}.findOne({})', desc: '查询单条' },
  { label: 'db.collection.insertOne({})', value: 'db.{collection}.insertOne({})', desc: '插入单条' },
  { label: 'db.collection.insertMany([])', value: 'db.{collection}.insertMany([])', desc: '批量插入' },
  { label: 'db.collection.updateOne({}, {$set: {}})', value: 'db.{collection}.updateOne({}, {$set: {}})', desc: '更新单条' },
  { label: 'db.collection.updateMany({}, {$set: {}})', value: 'db.{collection}.updateMany({}, {$set: {}})', desc: '批量更新' },
  { label: 'db.collection.deleteOne({})', value: 'db.{collection}.deleteOne({})', desc: '删除单条' },
  { label: 'db.collection.deleteMany({})', value: 'db.{collection}.deleteMany({})', desc: '批量删除' },
  { label: 'db.collection.countDocuments()', value: 'db.{collection}.countDocuments()', desc: '统计数量' },
  { label: 'db.collection.aggregate([])', value: 'db.{collection}.aggregate([])', desc: '聚合管道' },
  { label: 'db.collection.drop()', value: 'db.{collection}.drop()', desc: '删除集合' },
  { label: 'db.collection.find().sort({})', value: 'db.{collection}.find().sort({})', desc: '排序查询' },
  { label: 'db.collection.find().limit()', value: 'db.{collection}.find().limit()', desc: '限制数量' },
  { label: 'db.getCollectionNames()', value: 'db.getCollectionNames()', desc: '查看所有集合' },
  { label: '$set', value: '$set', desc: '设置字段值' },
  { label: '$gt', value: '$gt', desc: '大于' },
  { label: '$gte', value: '$gte', desc: '大于等于' },
  { label: '$lt', value: '$lt', desc: '小于' },
  { label: '$lte', value: '$lte', desc: '小于等于' },
  { label: '$ne', value: '$ne', desc: '不等于' },
  { label: '$regex', value: '$regex', desc: '正则匹配' },
  { label: '$exists', value: '$exists', desc: '字段是否存在' },
  { label: '$in', value: '$in', desc: '在列表中' },
];

function ShellTab() {
  const { selectedDb, selectedCollection, setSelectedCollection, setPage, activeConnectionId } = useStore();
  const [command, setCommand] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugg, setSelectedSugg] = useState(0);
  const textareaRef = useRef(null);

  const getCurrentWord = (text, cursorPos) => {
    const before = text.substring(0, cursorPos);
    const match = before.match(/[\w.$]+$/);
    return match ? match[0] : '';
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setCommand(val);
    // 匹配最后输入的词（以空格、换行、开头为分隔）
    const words = val.split(/[\s\n]+/);
    const lastWord = words[words.length - 1] || '';
    if (lastWord.length >= 1) {
      const filtered = SHELL_SUGGESTIONS.filter(s => s.value.toLowerCase().includes(lastWord.toLowerCase()));
      setSuggestions(filtered.slice(0, 8));
      setSelectedSugg(0);
    } else { setSuggestions([]); }
  };

  const applySuggestion = (sugg) => {
    const textarea = textareaRef.current?.resizableTextArea?.textArea;
    if (!textarea) return;
    // 替换最后输入的词
    const words = command.split(/[\s\n]+/);
    const lastWord = words[words.length - 1] || '';
    let val = sugg.value;
    if (selectedCollection) {
      val = val.replace(/\{collection\}/g, selectedCollection);
    }
    const prefix = command.substring(0, command.length - lastWord.length);
    const newCmd = prefix + val;
    setCommand(newCmd);
    setSuggestions([]);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCmd.length, newCmd.length);
    }, 0);
  };

  const execute = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    if (!selectedDb) { message.warning('请先选择数据库'); return; }
    setLoading(true);
    setHistory([...history, cmd]);
    setHistoryIdx(-1);
    setSuggestions([]);
    try {
      const res = await window.__mongo.executeShell(activeConnectionId, selectedDb, cmd);
      setResult(res);
      if (res.success && (cmd.includes('insert') || cmd.includes('update') || cmd.includes('delete') || cmd.includes('drop'))) {
        const colMatch = cmd.match(/db\.(\w+)\./);
        if (colMatch) { setSelectedCollection(colMatch[1]); setPage(1); }
      }
    } catch (err) { setResult({ success: false, error: err.message }); }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[selectedSugg]); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSugg(Math.min(selectedSugg + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp' && selectedSugg > 0) { e.preventDefault(); setSelectedSugg(selectedSugg - 1); return; }
      if (e.key === 'Escape') { setSuggestions([]); return; }
      if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); applySuggestion(suggestions[selectedSugg]); return; }
    }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); execute(); return; }
    const textarea = e.target;
    const isAtStart = textarea.selectionStart === 0;
    const isAtEnd = textarea.selectionEnd === textarea.value.length;
    if (e.key === 'ArrowUp' && isAtStart && history.length > 0 && suggestions.length === 0) {
      e.preventDefault();
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx); setCommand(history[idx]); return;
    }
    if (e.key === 'ArrowDown' && isAtEnd && history.length > 0 && suggestions.length === 0) {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible' }}>
      <div style={{ padding: '0 8px 8px', flexShrink: 0, overflow: 'visible' }}>
        <div style={{ marginBottom: 4, fontSize: 12 }}>
          <Text type="secondary">当前库：</Text>
          <Text code style={{ color: selectedDb ? '#00b96b' : '#ff4d4f' }}>
            {selectedDb || '未选择'}
          </Text>
          {selectedCollection && (
            <span>
              <Text type="secondary"> / </Text>
              <Text code style={{ color: '#4fc3f7' }}>{selectedCollection}</Text>
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
        <TextArea ref={textareaRef} value={command} onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder="db.t_player.find()"
          rows={4}
          style={{ background: '#0d0d0d', color: '#00b96b', border: '1px solid #333', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, borderRadius: 6, resize: 'vertical' }}
          spellCheck={false} />
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, marginTop: 2, background: '#141414', border: '1px solid #00b96b', borderRadius: 6, maxHeight: 180, overflow: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => applySuggestion(s)}
                style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: i === selectedSugg ? '#1a3a2a' : 'transparent', fontSize: 13, fontFamily: 'Consolas, Monaco, monospace' }}
                onMouseEnter={() => setSelectedSugg(i)}>
                <Text style={{ color: '#00b96b' }}>{s.value}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{s.desc}</Text>
              </div>
            ))}
          </div>
        )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Ctrl+Enter 执行 | Tab 补全 | ↑↓ 历史</Text>
          <Space>
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => { setCommand(''); setResult(null); }}>清空</Button>
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={loading} onClick={execute}>执行</Button>
          </Space>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 8px 8px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : renderResult(result)}
      </div>
    </div>
  );
}

export default function ShellPanel() {
  const [activeTab, setActiveTab] = useState('shell');
  const tabItems = [
    { key: 'shell', label: <Space size={4}><CodeOutlined />Shell</Space>, children: <ShellTab /> },
    { key: 'ai', label: <Space size={4}><RobotOutlined />AI 助手</Space>, children: <ChatPanel /> },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid #333', overflow: 'hidden' }}>
      <Tabs className="shell-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small"
        tabBarStyle={{ marginBottom: 0, padding: '0 12px', background: '#1a1a1a', flexShrink: 0 }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} />
    </div>
  );
}