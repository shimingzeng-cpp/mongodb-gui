import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Input, Select, Tag, Popconfirm, message, Tooltip, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, CopyOutlined, CloseOutlined, CodeOutlined } from '@ant-design/icons';
import useStore from '../store';

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

export default function DocTable() {
  const {
    selectedDb, selectedCollection,
    documents, totalDocs, page, pageSize,
    setPage, setDocuments, filter, setFilter, setEditingDoc,
  } = useStore();

  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState([]);
  const [conditions, setConditions] = useState([{ field: '', operator: 'eq', value: '' }]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState('');

  const loadData = async (p = page, filterObj = {}) => {
    if (!selectedDb || !selectedCollection) return;
    setLoading(true);
    try {
      const result = await window.__mongo.findDocuments(selectedDb, selectedCollection, filterObj, {
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
  }, [selectedDb, selectedCollection]);

  useEffect(() => {
    if (documents.length === 0) { setColumns([]); return; }
    const keys = new Set();
    documents.forEach(doc => Object.keys(doc).forEach(k => keys.add(k)));
    setColumns(Array.from(keys).map(key => ({
      title: key, dataIndex: key, key,
      width: key === '_id' ? 240 : 160, ellipsis: true,
      render: (val) => renderCellValue(val),
    })));
  }, [documents]);

  const renderCellValue = (val) => {
    if (val === null) return <Text type="secondary" italic>null</Text>;
    if (val === undefined) return <Text type="secondary" italic>undefined</Text>;
    if (typeof val === 'object') {
      const str = JSON.stringify(val);
      return (
        <Tooltip title={<pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(val, null, 2)}</pre>}>
          <Text style={{ color: '#4fc3f7', cursor: 'pointer' }} ellipsis copyable>
            {str.length > 40 ? str.slice(0, 40) + '...' : str}
          </Text>
        </Tooltip>
      );
    }
    if (typeof val === 'boolean') return <Tag color={val ? 'green' : 'red'}>{String(val)}</Tag>;
    return <Text>{String(val)}</Text>;
  };

  const handleSearch = () => {
    if (showAdvanced) {
      try {
        const parsed = JSON.parse(advancedJson.trim());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setFilter(advancedJson);
          setPage(1);
          loadData(1, parsed);
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
  };

  const handleReset = () => {
    setConditions([{ field: '', operator: 'eq', value: '' }]);
    setAdvancedJson('');
    setFilter('');
    setPage(1);
    loadData(1, {});
  };

  const handleDelete = async (record) => {
    try {
      await window.__mongo.deleteDocument(selectedDb, selectedCollection, { _id: record._id });
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
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>请选择左侧的数据库和集合</div>;
  }

  return (
    <div>
      {/* 筛选工具栏 */}
      <div style={{ marginBottom: 12 }}>
        {!showAdvanced ? (
          <div>
            {conditions.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <Select
                  value={c.field || undefined}
                  onChange={v => updateCondition(i, 'field', v)}
                  placeholder="选择字段"
                  style={{ width: 140 }}
                  size="small"
                  options={fieldNames.map(f => ({ label: f, value: f }))}
                  showSearch
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

      {/* 顶部信息栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text type="secondary">共 {totalDocs} 条，第 {page} 页</Text>
        <Button onClick={() => setEditingDoc({}, 'create')} type="primary" size="small" icon={<PlusOutlined />}>新建文档</Button>
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
        dataSource={documents} rowKey="_id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize, total: totalDocs, showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => { setPage(p); loadData(p, buildFilter(conditions)); },
        }}
      />
    </div>
  );
}