import React, { useState, useRef } from 'react';
import { Input, Button, Space, Typography, message, Spin, Table, Tag, Modal } from 'antd';
import { PlayCircleOutlined, ClearOutlined, CodeOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { TextArea } = Input;
const { Text } = Typography;

const SHELL_SUGGESTIONS = [
  { label: 'use <db>', value: 'use ', desc: '切换数据库' },
  { label: 'show dbs', value: 'show dbs', desc: '查看所有数据库' },
  { label: 'show collections', value: 'show collections', desc: '查看当前库集合' },
  { label: 'show tables', value: 'show tables', desc: '查看当前库集合' },
  { label: 'show users', value: 'show users', desc: '查看当前库用户' },
  { label: 'show roles', value: 'show roles', desc: '查看当前库角色' },
  { label: 'show profile', value: 'show profile', desc: '查看性能分析' },
  { label: 'show indexes', value: 'show indexes', desc: '查看所有索引' },
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
  const { selectedDb, selectedCollection, setSelectedDb, setSelectedCollection, setPage, setDatabases, activeConnectionId } = useStore();
  const t = useTheme();
  const [command, setCommand] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugg, setSelectedSugg] = useState(0);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [fullResult, setFullResult] = useState(null);
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
    if (!selectedDb && !cmd.match(/^use\s+/) && !cmd.match(/^show\s+(dbs|databases|help)/) && cmd !== 'help' && cmd !== '?') { message.warning('请先选择数据库'); return; }

    // 处理 use xxx 命令（mongosh 语法，不是合法 JS）
    const useMatch = cmd.match(/^use\s+(\S+)/);
    if (useMatch) {
      const dbName = useMatch[1].replace(/[";]/g, '');
      setSelectedDb(dbName);
      const dbs = await window.__mongo.listDatabases(activeConnectionId).catch(() => []);
      if (dbs.length) setDatabases(dbs);
      const resultMsg = `已切换到数据库: ${dbName}`;
      setResult({ success: true, data: resultMsg });
      setFullResult({ success: true, data: resultMsg });
      message.success(resultMsg);
      return;
    }

    // 处理 show 命令
    const showMatch = cmd.match(/^show\s+(\S+)/);
    if (showMatch) {
      const what = showMatch[1].toLowerCase();
      setLoading(true);
      try {
        let result;
        if (what === 'dbs' || what === 'databases') {
          const dbs = await window.__mongo.listDatabases(activeConnectionId);
          result = dbs.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk }));
        } else if (what === 'collections' || what === 'tables') {
          if (!selectedDb) { message.warning('请先选择数据库'); setLoading(false); return; }
          const cols = await window.__mongo.listCollections(activeConnectionId, selectedDb);
          result = cols.map(c => c.name);
        } else if (what === 'users') {
          if (!selectedDb) { message.warning('请先选择数据库'); setLoading(false); return; }
          const res = await window.__mongo.executeShell(activeConnectionId, selectedDb, 'db.getUsers()');
          result = res.success ? res.data : [];
        } else if (what === 'roles') {
          if (!selectedDb) { message.warning('请先选择数据库'); setLoading(false); return; }
          const res = await window.__mongo.executeShell(activeConnectionId, selectedDb, 'db.getRoles()');
          result = res.success ? res.data : [];
        } else if (what === 'profile') {
          if (!selectedDb) { message.warning('请先选择数据库'); setLoading(false); return; }
          const res = await window.__mongo.executeShell(activeConnectionId, selectedDb, 'db.getProfilingStatus()');
          result = res.success ? res.data : [];
        } else if (what === 'indexes') {
          if (!selectedDb) { message.warning('请先选择数据库'); setLoading(false); return; }
          const cols = await window.__mongo.listCollections(activeConnectionId, selectedDb);
          const allIndexes = [];
          for (const col of cols) {
            const idxs = await window.__mongo.listIndexes(activeConnectionId, selectedDb, col.name);
            allIndexes.push({ collection: col.name, indexes: idxs });
          }
          result = allIndexes;
        }
        if (result) {
          setResult({ success: true, data: result });
          setFullResult({ success: true, data: result });
        } else {
          message.warning(`未知命令: show ${what}`);
        }
      } catch (err) {
        setResult({ success: false, error: err.message });
        setFullResult(null);
      }
      setLoading(false);
      setHistory([...history, cmd]);
      setHistoryIdx(-1);
      return;
    }

    // 处理 help 命令
    if (cmd === 'help' || cmd === '?') {
      const helpText = [
        'MongoDB Shell 命令支持：',
        '  db.collection.find()    查询文档',
        '  db.collection.insert()  插入文档',
        '  db.collection.update()  更新文档',
        '  db.collection.delete()  删除文档',
        '  use <db>                切换数据库',
        '  show dbs                查看所有数据库',
        '  show collections        查看当前库集合',
        '  show tables             查看当前库集合',
        '  show users              查看当前库用户',
        '  show roles              查看当前库角色',
        '  show profile            查看性能分析',
        '  show indexes            查看所有索引',
        '  help                    显示此帮助',
        '  Ctrl+Enter              执行命令',
        '  Tab                     补全命令',
      ].join('\n');
      setResult({ success: true, data: helpText });
      setFullResult({ success: true, data: helpText });
      return;
    }

    setLoading(true);
    setHistory([...history, cmd]);
    setHistoryIdx(-1);
    setSuggestions([]);
    try {
      const res = await window.__mongo.executeShell(activeConnectionId, selectedDb, cmd);
      setResult(res);
      setFullResult(res);
      if (res.success) {
        // 处理 use xxx 切换数据库
        if (res.data?.switched) {
          setSelectedDb(res.data.db);
          // 刷新数据库列表
          const dbs = await window.__mongo.listDatabases(activeConnectionId).catch(() => []);
          if (dbs.length) setDatabases(dbs);
          message.success(`已切换到数据库: ${res.data.db}`);
        }
        if (cmd.includes('insert') || cmd.includes('update') || cmd.includes('delete') || cmd.includes('drop')) {
          const colMatch = cmd.match(/db\.(\w+)\./);
          if (colMatch) { setSelectedCollection(colMatch[1]); setPage(1); }
        }
      }
    } catch (err) { setResult({ success: false, error: err.message }); setFullResult(null); }
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
    // 数组且包含对象 → 表格展示
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const keys = new Set();
      data.forEach(doc => Object.keys(doc).forEach(k => {  keys.add(k); }));
      const cols = Array.from(keys).map(key => ({
        title: key, dataIndex: key, key,
        width: 160, ellipsis: true,
        render: (val) => {
          if (val === null) return <Text type="secondary" italic>null</Text>;
          if (typeof val === 'object') {
            const str = JSON.stringify(val);
            return <Text style={{ color: t.info }} ellipsis>{str.length > 40 ? str.slice(0, 40) + '...' : str}</Text>;
          }
          if (typeof val === 'boolean') return <Tag color={val ? 'green' : 'red'}>{String(val)}</Tag>;
          return <Text>{String(val)}</Text>;
        },
      }));
      return (
        <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
            <Button type="link" size="small" icon={<CodeOutlined />}
              onClick={() => setResultModalOpen(true)} style={{ fontSize: 12 }}>
              展开全部
            </Button>
          </div>
          <Table
            columns={cols}
            dataSource={data}
            rowKey={(r) => r._id ? String(r._id) : JSON.stringify(r)}
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['50', '100', '500'], showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 'max-content', y: 150 }}
            virtual
          />
        </div>
      );
    }
    if (typeof data === 'object') {
      return (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
            <Button type="link" size="small" icon={<CodeOutlined />}
              onClick={() => setResultModalOpen(true)} style={{ fontSize: 12 }}>
              展开全部
            </Button>
          </div>
          <pre style={{ background: t.bg.panel, color: t.accent, padding: 12, borderRadius: 6, maxHeight: 150, overflow: 'auto', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
    }
    return <Text style={{ color: t.accent }}>{String(data)}</Text>;
  };

  const renderFullResult = (res) => {
    if (!res || !res.success) return null;
    const data = res.data;
    if (data === undefined || data === null) return <Text type="success">✅ 执行成功</Text>;
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const keys = new Set();
      data.forEach(doc => Object.keys(doc).forEach(k => {  keys.add(k); }));
      const cols = Array.from(keys).map(key => ({
        title: key, dataIndex: key, key,
        width: 160, ellipsis: true,
        render: (val) => {
          if (val === null) return <Text type="secondary" italic>null</Text>;
          if (typeof val === 'object') {
            const str = JSON.stringify(val);
            return <Text style={{ color: t.info }} ellipsis>{str.length > 60 ? str.slice(0, 60) + '...' : str}</Text>;
          }
          if (typeof val === 'boolean') return <Tag color={val ? 'green' : 'red'}>{String(val)}</Tag>;
          return <Text>{String(val)}</Text>;
        },
      }));
      return (
        <Table
          columns={cols}
          dataSource={data}
          rowKey={(r) => r._id ? String(r._id) : JSON.stringify(r)}
          size="small"
          pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '500', '5000'], showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 'max-content', y: '60vh' }}
          virtual
        />
      );
    }
    if (typeof data === 'object') {
      return <pre style={{ background: t.bg.panel, color: t.accent, padding: 12, borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(data, null, 2)}</pre>;
    }
    return <Text style={{ color: t.accent }}>{String(data)}</Text>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible' }}>
      <div style={{ padding: '0 8px 8px', flexShrink: 0, overflow: 'visible' }}>
        <div style={{ marginBottom: 4, fontSize: 12 }}>
          <Text type="secondary">当前库：</Text>
          <Text code style={{ color: selectedDb ? t.accent : t.error }}>
            {selectedDb || '未选择'}
          </Text>
          {selectedCollection && (
            <span>
              <Text type="secondary"> / </Text>
              <Text code style={{ color: t.info }}>{selectedCollection}</Text>
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
        <TextArea ref={textareaRef} value={command} onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder="db.t_player.find()"
          rows={4}
          style={{ background: t.bg.code, color: t.accent, border: `1px solid ${t.border}`, fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, borderRadius: 6, resize: 'vertical' }}
          spellCheck={false} />
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, marginTop: 2, background: t.bg.primary, border: `1px solid ${t.accent}`, borderRadius: 6, maxHeight: 180, overflow: 'auto', boxShadow: t.shadow }}>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => applySuggestion(s)}
                style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: i === selectedSugg ? t.bg.highlight : 'transparent', fontSize: 13, fontFamily: 'Consolas, Monaco, monospace' }}
                onMouseEnter={() => setSelectedSugg(i)}>
                <Text style={{ color: t.accent }}>{s.value}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{s.desc}</Text>
              </div>
            ))}
          </div>
        )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Ctrl+Enter 执行 | Tab 补全 | ↑↓ 历史 | help 查看帮助</Text>
          <Space>
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => { setCommand(''); setResult(null); }}>清空</Button>
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={loading} onClick={execute}>执行</Button>
          </Space>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 8px 8px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : renderResult(result)}
      </div>

      {/* 全屏结果弹窗 */}
      <Modal
        title="Shell 执行结果"
        open={resultModalOpen}
        onCancel={() => setResultModalOpen(false)}
        footer={null}
        width="80%"
        style={{ top: 20 }}
      >
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {fullResult && renderFullResult(fullResult)}
        </div>
      </Modal>
    </div>
  );
}

export default function ShellPanel() {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: `1px solid ${t.border}`, overflow: 'hidden' }}>
      <ShellTab />
    </div>
  );
}