import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Space, Typography, message, Tag, Popconfirm, Checkbox, Divider, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
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
    documents.forEach(doc => Object.keys(doc).forEach(k => names.add(k)));
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
      width={700}
      footer={null}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '新建索引'}
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={loadIndexes}>刷新</Button>
      </div>

      {showCreate && (
        <div style={{ padding: 12, background: t.bg.panel, borderRadius: 8, marginBottom: 12, border: `1px solid ${t.accent}33` }}>
          <Text style={{ fontSize: 12, fontWeight: 500, color: t.accent, marginBottom: 8, display: 'block' }}>新建索引</Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="small" /></div>
      ) : indexes.length === 0 ? (
        <Empty description="暂无索引" style={{ padding: 40 }} />
      ) : (
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {indexes.map(idx => (
            <div key={idx.name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', marginBottom: 6, borderRadius: 8,
              background: t.bg.panel, border: `1px solid ${t.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ThunderboltOutlined style={{ color: t.accent, fontSize: 13 }} />
                  <Text style={{ color: t.text.primary, fontSize: 12, fontWeight: 500 }}>{idx.name}</Text>
                  {idx.name === '_id_' && <Tag color="blue" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>默认</Tag>}
                  {idx.unique && <Tag color="green" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>唯一</Tag>}
                  {idx.sparse && <Tag color="orange" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>稀疏</Tag>}
                </div>
                <div>
                  {Object.entries(idx.key).map(([field, order]) => (
                    <Tag key={field} color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: '0 2px 2px 0' }}>
                      {field} {order === 1 ? '↑' : '↓'}
                    </Tag>
                  ))}
                </div>
              </div>
              {idx.name !== '_id_' && (
                <Popconfirm title="确认删除此索引?" onConfirm={() => handleDelete(idx.name)} okText="删除" okType="danger" cancelText="取消">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ flexShrink: 0 }} />
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}