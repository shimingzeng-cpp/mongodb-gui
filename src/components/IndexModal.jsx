import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Input, Select, Space, Typography, message, Tag, Popconfirm, Checkbox, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text } = Typography;

export default function IndexModal() {
  const { selectedDb, selectedCollection, indexOpen, setIndexOpen, documents, activeConnectionId } = useStore();
  const t = useTheme();
  const [indexes, setIndexes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newField, setNewField] = useState('');
  const [newOrder, setNewOrder] = useState(1);
  const [newUnique, setNewUnique] = useState(false);

  // 从文档中提取字段名
  const fieldNames = React.useMemo(() => {
    const names = new Set();
    documents.forEach(doc => Object.keys(doc).forEach(k => { if (k !== '_id') names.add(k); }));
    return Array.from(names).map(n => ({ label: n, value: n }));
  }, [documents]);

  useEffect(() => {
    if (indexOpen && selectedDb && selectedCollection) loadIndexes();
  }, [indexOpen, selectedDb, selectedCollection]);

  const loadIndexes = async () => {
    setLoading(true);
    try {
      const result = await window.__mongo.listIndexes(activeConnectionId, selectedDb, selectedCollection);
      setIndexes(result);
    } catch (err) { message.error('加载索引失败: ' + err.message); }
    setLoading(false);
  };

  const handleDelete = async (indexName) => {
    try {
      await window.__mongo.dropIndex(activeConnectionId, selectedDb, selectedCollection, indexName);
      message.success('索引已删除');
      loadIndexes();
    } catch (err) { message.error('删除失败: ' + err.message); }
  };

  const handleCreate = async () => {
    if (!newField) { message.warning('请选择字段'); return; }
    try {
      const keys = {};
      keys[newField] = newOrder;
      await window.__mongo.createIndex(activeConnectionId, selectedDb, selectedCollection, keys, { unique: newUnique });
      message.success('索引创建成功');
      setShowCreate(false);
      setNewField('');
      setNewOrder(1);
      setNewUnique(false);
      loadIndexes();
    } catch (err) { message.error('创建失败: ' + err.message); }
  };

  const columns = [
    { title: '索引名', dataIndex: 'name', key: 'name', width: 200 },
    {
      title: '字段', dataIndex: 'key', key: 'key', width: 200,
      render: (key) => (
        <Space>
          {Object.entries(key).map(([field, order]) => (
            <Tag key={field} color="blue">{field} ({order === 1 ? '↑' : '↓'})</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '属性', dataIndex: 'unique', key: 'attr', width: 120,
      render: (unique, record) => (
        <Space>
          {unique && <Tag color="green">唯一</Tag>}
          {record.sparse && <Tag color="orange">稀疏</Tag>}
        </Space>
      ),
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_, record) => (
        record.name !== '_id_' ? (
          <Popconfirm title="确认删除此索引?" onConfirm={() => handleDelete(record.name)} okText="删除" okType="danger" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>默认索引</Text>
      ),
    },
  ];

  return (
    <Modal
      title={<span><ThunderboltOutlined style={{ color: t.accent, marginRight: 8 }} />索引管理 - {selectedCollection}</span>}
      open={indexOpen}
      onCancel={() => { setIndexOpen(false); setShowCreate(false); }}
      width={800}
      footer={null}
    >
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '新建索引'}
        </Button>
        <Button size="small" onClick={loadIndexes}>刷新</Button>
      </Space>

      {showCreate && (
        <div style={{ padding: 12, background: t.bg.panel, borderRadius: 6, marginBottom: 12 }}>
          <Text strong style={{ color: t.text.secondary }}>新建索引</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <Select
              value={newField || undefined}
              onChange={setNewField}
              placeholder="选择字段"
              size="small"
              style={{ width: 160 }}
              options={fieldNames}
              showSearch
            />
            <Select
              value={newOrder}
              onChange={setNewOrder}
              size="small"
              style={{ width: 70 }}
              options={[
                { label: '升序', value: 1 },
                { label: '降序', value: -1 },
              ]}
            />
            <Checkbox checked={newUnique} onChange={e => setNewUnique(e.target.checked)}>唯一</Checkbox>
            <Button type="primary" size="small" onClick={handleCreate}>创建</Button>
          </div>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={indexes}
        rowKey="name"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
      />
    </Modal>
  );
}