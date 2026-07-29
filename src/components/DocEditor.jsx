import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, message, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text } = Typography;

const TYPE_OPTIONS = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Object', value: 'object' },
  { label: 'Array', value: 'array' },
  { label: 'null', value: 'null' },
  { label: 'ObjectId', value: 'objectId' },
];

function inferType(val) {
  if (val === null || val === undefined) return 'null';
  if (val._bsontype === 'ObjectId' || (typeof val === 'string' && /^[a-f\d]{24}$/i.test(val))) return 'objectId';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'object') return 'object';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';
  return 'string';
}

function formatValue(val, type) {
  if (type === 'null') return 'null';
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function parseValue(val, type) {
  switch (type) {
    case 'number': return Number(val);
    case 'boolean': return val === 'true';
    case 'object':
    case 'array': return JSON.parse(val);
    case 'null': return null;
    case 'objectId': return val;
    default: return val;
  }
}

export default function DocEditor() {
  const { editingDoc, editingMode, setEditingDoc, selectedDb, selectedCollection, page, pageSize, setDocuments, documents, activeConnectionId } = useStore();
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);

  // 从已有文档中提取字段名
  const fieldNames = React.useMemo(() => {
    const names = new Set();
    documents.forEach(doc => Object.keys(doc).forEach(k => { if (k !== '_id') names.add(k); }));
    return Array.from(names).map(n => ({ label: n, value: n }));
  }, [documents]);

  useEffect(() => {
    if (editingDoc && editingMode) {
      const list = Object.entries(editingDoc).map(([key, value]) => ({
        key,
        type: inferType(value),
        value: formatValue(value),
        originalKey: key,
      }));
      setFields(list.length > 0 ? list : [{ key: '', type: 'string', value: '' }]);
    } else { setFields([]); }
  }, [editingDoc, editingMode]);

  const handleClose = () => setEditingDoc(null, null);

  const handleSave = async () => {
    if (!selectedDb || !selectedCollection) return;

    const doc = {};
    fields.forEach(f => {
      if (!f.key.trim() || f.key === '_id') return;
      doc[f.key] = parseValue(f.value, f.type);
    });

    // 新建时检查 Schema 必填字段
    if (editingMode === 'create') {
      try {
        const schema = await window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection);
        if (schema.validator && schema.validator.$jsonSchema) {
          const required = schema.validator.$jsonSchema.required || [];
          const missing = required.filter(f => !doc[f] && doc[f] !== 0 && doc[f] !== false);
          if (missing.length > 0) {
            message.warning(`缺少必填字段: ${missing.join(', ')}`);
            return;
          }
        }
      } catch (err) {
        // 获取 Schema 失败不阻止保存，让 MongoDB 自己验证
      }
    }

    setSaving(true);
    try {
      if (editingMode === 'edit' && editingDoc._id) {
        await window.__mongo.updateDocument(activeConnectionId, selectedDb, selectedCollection, { _id: editingDoc._id }, doc);
        message.success('更新成功');
      } else {
        await window.__mongo.insertDocument(activeConnectionId, selectedDb, selectedCollection, doc);
        message.success('创建成功');
      }
      const result = await window.__mongo.findDocuments(activeConnectionId, selectedDb, selectedCollection, {}, { skip: (page - 1) * pageSize, limit: pageSize });
      setDocuments(result.docs, result.total);
      setEditingDoc(null, null);
    } catch (err) { message.error('保存失败: ' + err.message); }
    setSaving(false);
  };

  return (
    <Modal title={editingMode === 'edit' ? '编辑文档' : '新建文档'} open={!!editingMode} onCancel={handleClose} width={800}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>{editingMode === 'edit' ? '保存' : '创建'}</Button>,
      ]}>
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {editingMode === 'edit' && editingDoc?._id && (
          <div style={{ marginBottom: 12, padding: '4px 8px', background: '#1f1f1f', borderRadius: 4 }}>
            <Text type="secondary">_id: </Text><Text code style={{ color: '#00b96b' }}>{editingDoc._id}</Text>
          </div>
        )}
        {fields.map((field, index) => (
          <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Select
              value={field.key || undefined}
              onChange={v => updateField(index, 'key', v)}
              placeholder="选择字段"
              style={{ width: 160 }}
              size="middle"
              options={fieldNames}
              showSearch
              allowClear
              disabled={editingMode === 'edit' && field.originalKey === '_id'}
            />
            <Select value={field.type} onChange={v => updateField(index, 'type', v)}
              style={{ width: 100 }} size="middle" options={TYPE_OPTIONS} />
            <Input placeholder="值" value={field.value} onChange={e => updateField(index, 'value', e.target.value)}
              style={{ flex: 1 }}
              disabled={field.type === 'null'}
              placeholder={field.type === 'object' ? '{"key": "value"}' : field.type === 'array' ? '[1, 2, 3]' : field.type === 'boolean' ? 'true / false' : '值'} />
            <Button icon={<DeleteOutlined />} danger type="text" onClick={() => removeField(index)}
              disabled={editingMode === 'edit' && field.originalKey === '_id'} />
          </div>
        ))}
        <Button type="dashed" onClick={addField} icon={<PlusOutlined />} style={{ width: '100%', marginTop: 8 }}>添加字段</Button>
      </div>
    </Modal>
  );

  function addField() { setFields([...fields, { key: '', type: 'string', value: '' }]); }
  function removeField(index) { setFields(fields.filter((_, i) => i !== index)); }
  function updateField(index, field, value) { const u = [...fields]; u[index] = { ...u[index], [field]: value }; setFields(u); }
}