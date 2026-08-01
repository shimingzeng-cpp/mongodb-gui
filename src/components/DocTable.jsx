import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, Input, Select, Tag, Popconfirm, message, Tooltip, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, CopyOutlined, CloseOutlined, CodeOutlined, SafetyCertificateOutlined, ThunderboltOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text } = Typography;

const OPERATORS = [
  { label: '=', value: 'eq' },
  { label: '!=', value: 'ne' },
  { label: '>', value: 'gt' },
  { label: '>=', value: 'gte' },
  { label: '<', value: 'lt' },
  { label: '<=', value: 'lte' },
  { label: '包含', value: 'regex' },
  { label: '存在', value: 'exists' },
  { label: '不存在', value: 'notExists' },
];

function buildFilter(conditions) {
  const filter = {};
  conditions.forEach(c => {
    if (!c.field) return;
    let val = c.value;
    // 尝试转换数字
    if (val && !isNaN(val) && val.trim()) val = Number(val);
    // 尝试转换布尔
    if (val === 'true') val = true;
    if (val === 'false') val = false;
    // 尝试转换 null
    if (val === 'null') val = null;

    switch (c.operator) {
      case 'eq': filter[c.field] = val; break;
      case 'ne': filter[c.field] = { $ne: val }; break;
      case 'gt': filter[c.field] = { $gt: val }; break;
      case 'gte': filter[c.field] = { $gte: val }; break;
      case 'lt': filter[c.field] = { $lt: val }; break;
      case 'lte': filter[c.field] = { $lte: val }; break;
      case 'regex': filter[c.field] = { $regex: val, $options: 'i' }; break;
      case 'exists': filter[c.field] = { $exists: true }; break;
      case 'notExists': filter[c.field] = { $exists: false }; break;
    }
  });
  return filter;
}

// 推断字段类型（MongoDB BSON 类型）
function inferFieldType(docs, field) {
  const types = new Set();
  for (const doc of docs) {
    const val = doc[field];
    if (val === null || val === undefined) continue;
    if (typeof val === 'number') {
      types.add(Number.isInteger(val) ? 'int32' : 'double');
      break;
    }
    if (typeof val === 'boolean') { types.add('bool'); break; }
    if (typeof val === 'string') {
      if (/^[a-f\d]{24}$/i.test(val)) { types.add('objectId'); break; }
      if (!isNaN(Date.parse(val))) { types.add('date'); break; }
      types.add('string'); break;
    }
    if (Array.isArray(val)) { types.add('array'); break; }
    if (typeof val === 'object') { types.add('object'); break; }
  }
  if (types.size === 0) return 'string';
  return Array.from(types)[0];
}

export default function DocTable() {
  const {
    selectedDb, selectedCollection,
    documents, totalDocs, page, pageSize,
    setPage, setPageSize, setDocuments, filter, setFilter, setEditingDoc, setSchemaOpen, setIndexOpen, setExportOpen, reloadKey,
    activeConnectionId, triggerReload, doRefresh,
  } = useStore();
  const t = useTheme();

  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState([]);
  const [conditions, setConditions] = useState([{ field: '', operator: 'eq', value: '' }]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [shellCommand, setShellCommand] = useState('');
  const [editingCell, setEditingCell] = useState(null); // { rowId, field }
  const [editValue, setEditValue] = useState('');
  const editingCellRef = useRef(null);
  const editValueRef = useRef('');
  const [schemaTypes, setSchemaTypes] = useState({}); // 字段名 → 显示类型

  // Schema 类型映射（$jsonSchema → 显示类型）
  const SCHEMA_TO_DISPLAY = {
    int: 'int32',
    long: 'int64',
    binData: 'binary',
    javascript: 'code',
  };

  // 加载 Schema 字段类型
  useEffect(() => {
    if (selectedDb && selectedCollection) {
      window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection)
        .then(schema => {
          if (schema.validator && schema.validator.$jsonSchema && schema.validator.$jsonSchema.properties) {
            const types = {};
            Object.entries(schema.validator.$jsonSchema.properties).forEach(([name, def]) => {
              types[name] = SCHEMA_TO_DISPLAY[def.bsonType] || def.bsonType || 'string';
            });
            setSchemaTypes(types);
          } else {
            setSchemaTypes({});
          }
        })
        .catch(() => setSchemaTypes({}));
    } else {
      setSchemaTypes({});
    }
  }, [selectedDb, selectedCollection, reloadKey]);

  // 生成 MongoDB Shell 命令
  const buildShellCommand = (filterObj, isAdvanced) => {
    if (!selectedDb || !selectedCollection) return '';
    const filterStr = isAdvanced ? advancedJson.trim() : JSON.stringify(filterObj, null, 2);
    return `db.${selectedCollection}.find(${filterStr})`;
  };

  const loadData = async (p = page, filterObj = {}) => {
    if (!selectedDb || !selectedCollection) return;
    setLoading(true);
    try {
      const result = await window.__mongo.findDocuments(activeConnectionId, selectedDb, selectedCollection, filterObj, {
        skip: (p - 1) * pageSize, limit: pageSize,
      });
      setDocuments(result.docs, result.total);
    } catch (err) {
      message.error('加载失败: ' + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedDb && selectedCollection) loadData(1);
    setShellCommand('');
  }, [selectedDb, selectedCollection, reloadKey]);

  useEffect(() => {
    const keys = new Set();
    // 从文档中提取字段
    documents.forEach(doc => Object.keys(doc).forEach(k => keys.add(k)));
    // 从 Schema 中补充字段（即使文档中没有该字段，也能显示）
    Object.keys(schemaTypes).forEach(k => keys.add(k));
    if (keys.size === 0) { setColumns([]); return; }
    setColumns(Array.from(keys).map(key => ({
      title: <span>{key} <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{schemaTypes[key] || inferFieldType(documents, key)}</Tag></span>, dataIndex: key, key,
      ellipsis: true,
      sorter: (a, b) => {
        const va = a[key], vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return -1;
        if (vb == null) return 1;
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        return String(va).localeCompare(String(vb));
      },
      render: (val, record) => {
        const rowId = record._id ? String(record._id) : JSON.stringify(record);
        const isEditing = editingCellRef.current?.rowId === rowId && editingCellRef.current?.field === key;
        if (isEditing) {
          return (
            <Input
              size="small"
              value={editValueRef.current}
              onChange={e => { editValueRef.current = e.target.value; setEditValue(e.target.value); }}
              onPressEnter={() => saveEdit(record, key)}
              onBlur={() => cancelEdit()}
              autoFocus
              style={{ width: '100%' }}
            />
          );
        }
        return renderCellValue(val, record, key);
      },
    })));
  }, [documents, schemaTypes]);

  const renderCellValue = (val, record, field) => {
    const startEdit = () => {
      if (!record || !field) return;
      const rowId = record._id ? String(record._id) : JSON.stringify(record);
      const strVal = val === null || val === undefined ? '' : String(val);
      editingCellRef.current = { rowId, field };
      editValueRef.current = strVal;
      setEditingCell({ rowId, field });
      setEditValue(strVal);
    };

    if (val === null) return <Text type="secondary" italic onDoubleClick={startEdit} style={{ cursor: 'pointer' }}>null</Text>;
    if (val === undefined) return <Text type="secondary" italic onDoubleClick={startEdit} style={{ cursor: 'pointer' }}>undefined</Text>;
    if (typeof val === 'object') {
      const str = JSON.stringify(val);
      return (
        <Tooltip title={<pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(val, null, 2)}</pre>}>
          <Text style={{ color: t.info, cursor: 'pointer' }} ellipsis copyable onDoubleClick={startEdit}>
            {str.length > 40 ? str.slice(0, 40) + '...' : str}
          </Text>
        </Tooltip>
      );
    }
    if (typeof val === 'boolean') return <Tag color={val ? 'green' : 'red'}>{String(val)}</Tag>;
    return <Text style={{ cursor: 'pointer' }} onDoubleClick={startEdit}>{String(val)}</Text>;
  };

  const saveEdit = async (record, field) => {
    if (!editingCellRef.current) return;
    const val = editValueRef.current;
    try {
      const update = { ...record, [field]: val };
      // 尝试转换数字
      const num = Number(val);
      if (val !== '' && !isNaN(num)) update[field] = num;
      else if (val === 'true') update[field] = true;
      else if (val === 'false') update[field] = false;
      else if (val === 'null') update[field] = null;
      else update[field] = val;

      await window.__mongo.updateDocument(activeConnectionId, selectedDb, selectedCollection, { _id: record._id }, { [field]: update[field] });
      message.success('已更新');
      editingCellRef.current = null;
      setEditingCell(null);
      loadData(page, buildFilter(conditions));
    } catch (err) {
      message.error('更新失败: ' + err.message);
    }
  };

  const cancelEdit = () => {
    editingCellRef.current = null;
    editValueRef.current = '';
    setEditingCell(null);
    setEditValue('');
  };

  const handleSearch = () => {
    if (showAdvanced) {
      try {
        const parsed = JSON.parse(advancedJson.trim());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setFilter(advancedJson);
          setPage(1);
          loadData(1, parsed);
          setShellCommand(buildShellCommand(parsed, true));
        } else {
          message.warning('必须是 JSON 对象');
        }
      } catch { message.warning('JSON 格式错误'); }
      return;
    }
    const filterObj = buildFilter(conditions);
    setFilter(JSON.stringify(filterObj));
    setPage(1);
    loadData(1, filterObj);
    setShellCommand(buildShellCommand(filterObj, false));
  };

  const handleReset = () => {
    setConditions([{ field: '', operator: 'eq', value: '' }]);
    setAdvancedJson('');
    setFilter('');
    setPage(1);
    loadData(1, {});
    setShellCommand('');
  };

  const handleDelete = async (record) => {
    try {
      await window.__mongo.deleteDocument(activeConnectionId, selectedDb, selectedCollection, { _id: record._id });
      message.success('删除成功');
      loadData(page, buildFilter(conditions));
    } catch (err) { message.error('删除失败: ' + err.message); }
  };

  const updateCondition = (index, key, value) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [key]: value };
    setConditions(updated);
  };

  const addCondition = () => {
    setConditions([...conditions, { field: '', operator: 'eq', value: '' }]);
  };

  const removeCondition = (index) => {
    if (conditions.length === 1) {
      setConditions([{ field: '', operator: 'eq', value: '' }]);
    } else {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  // 提取字段名列表
  const fieldNames = columns.map(c => c.dataIndex);

  if (!selectedDb || !selectedCollection) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: t.text.muted }}>请选择左侧的数据库和集合</div>;
  }

  return (
    <div>
      {/* 筛选工具栏 */}
      {showFilter && (
        <div style={{ marginBottom: 12 }}>
          {!showAdvanced ? (
            <div>
              {conditions.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <Input
                    value={c.field}
                    onChange={e => updateCondition(i, 'field', e.target.value)}
                    placeholder={fieldNames.length > 0 ? `字段名，如 ${fieldNames[0]}` : '输入字段名'}
                    style={{ width: 140 }}
                    size="small"
                  />
                  <Select
                    value={c.operator}
                    onChange={v => updateCondition(i, 'operator', v)}
                    style={{ width: 90 }}
                    size="small"
                    options={OPERATORS}
                  />
                  {!['exists', 'notExists'].includes(c.operator) && (
                    <Input
                      value={c.value}
                      onChange={e => updateCondition(i, 'value', e.target.value)}
                      placeholder="值"
                      style={{ width: 160 }}
                      size="small"
                      onPressEnter={handleSearch}
                    />
                  )}
                  <Button type="text" size="small" danger icon={<CloseOutlined />} onClick={() => removeCondition(i)} />
                  {i === conditions.length - 1 && (
                    <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addCondition}>条件</Button>
                  )}
                </div>
              ))}
              <Space style={{ marginTop: 4 }}>
                <Button onClick={handleSearch} type="primary" size="small" icon={<SearchOutlined />}>查询</Button>
                <Button onClick={handleReset} size="small" icon={<ReloadOutlined />}>重置</Button>
                <Button onClick={() => setShowAdvanced(true)} size="small" icon={<CodeOutlined />}>高级</Button>
              </Space>
            </div>
          ) : (
            <Space>
              <Input
                placeholder='JSON 查询, 如 {"id": 1}'
                value={advancedJson}
                onChange={e => setAdvancedJson(e.target.value)}
                style={{ width: 300 }}
                size="small"
                onPressEnter={handleSearch}
              />
              <Button onClick={handleSearch} type="primary" size="small" icon={<SearchOutlined />}>查询</Button>
              <Button onClick={handleReset} size="small" icon={<ReloadOutlined />}>重置</Button>
              <Button onClick={() => setShowAdvanced(false)} size="small">简易</Button>
            </Space>
          )}
        </div>
      )}

      {/* Shell 命令展示 */}
      {shellCommand && showFilter && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CodeOutlined style={{ color: t.text.subtle, fontSize: 12 }} />
          <pre style={{
            margin: 0, padding: '4px 8px', background: t.bg.code, color: t.accent,
            borderRadius: 4, fontSize: 12, fontFamily: 'Consolas, Monaco, monospace',
            flex: 1, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{shellCommand}</pre>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => { navigator.clipboard.writeText(shellCommand); message.success('已复制'); }}
            style={{ color: t.text.subtle, flexShrink: 0 }}
          />
        </div>
      )}

      {/* 顶部信息栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <Text type="secondary">共 {totalDocs} 条，第 {page} 页</Text>
        <Space size="small">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => { triggerReload(); doRefresh(); }}
            title="刷新数据"
          />
          <Button
            type={showFilter ? 'primary' : 'default'}
            size="small"
            icon={<FilterOutlined />}
            onClick={() => setShowFilter(!showFilter)}
          >
            筛选
          </Button>
          <Button onClick={() => setEditingDoc({}, 'create')} type="primary" size="small" icon={<PlusOutlined />}>新建文档</Button>
          <Button onClick={() => setSchemaOpen(true)} size="small" icon={<SafetyCertificateOutlined />}>字段</Button>
          <Button onClick={() => setIndexOpen(true)} size="small" icon={<ThunderboltOutlined />}>索引</Button>
          <Button onClick={() => setExportOpen(true)} size="small" icon={<DownloadOutlined />}>导出</Button>
        </Space>
      </div>

      {/* 表格 */}
      <Table
        columns={[...columns, {
          title: '操作', key: 'actions', fixed: 'right', width: 150,
          render: (_, record) => (
            <Space size="small">
              <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditingDoc(record, 'edit')} /></Tooltip>
              <Tooltip title="复制新建"><Button type="link" size="small" icon={<CopyOutlined />} onClick={() => { const { _id, ...rest } = record; setEditingDoc(rest, 'create'); }} /></Tooltip>
              <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消">
                <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
              </Popconfirm>
            </Space>
          ),
        }]}
        dataSource={documents} rowKey="_id" loading={loading} size="small" virtual
        scroll={{ y: 500, x: 'max-content' }}
        pagination={{
          current: page, pageSize, total: totalDocs, showSizeChanger: true,
          pageSizeOptions: ['50', '100', '500', '5000', '10000', '20000'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            if (ps !== pageSize) {
              setPageSize(ps);
              loadData(1, buildFilter(conditions));
            } else {
              setPage(p);
              loadData(p, buildFilter(conditions));
            }
          },
        }}
      />
    </div>
  );
}