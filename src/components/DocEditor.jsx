import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Modal, Button, Input, Select, message, Typography, DatePicker, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined, DatabaseOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text } = Typography;

const TYPE_OPTIONS = [
  { label: 'Array', value: 'array' },
  { label: 'Binary', value: 'binary' },
  { label: 'Boolean', value: 'bool' },
  { label: 'Code', value: 'code' },
  { label: 'Date', value: 'date' },
  { label: 'Decimal128', value: 'decimal' },
  { label: 'Double', value: 'double' },
  { label: 'Int32', value: 'int32' },
  { label: 'Int64', value: 'int64' },
  { label: 'MaxKey', value: 'maxKey' },
  { label: 'MinKey', value: 'minKey' },
  { label: 'Null', value: 'null' },
  { label: 'Object', value: 'object' },
  { label: 'ObjectId', value: 'objectId' },
  { label: 'BSONRegExp', value: 'regex' },
  { label: 'String', value: 'string' },
  { label: 'BSONSymbol', value: 'symbol' },
  { label: 'Timestamp', value: 'timestamp' },
  { label: 'Undefined', value: 'undefined' },
  { label: 'UUID', value: 'uuid' },
  { label: 'LegacyJavaUUID', value: 'uuidLegacyJava' },
  { label: 'LegacyCSharpUUID', value: 'uuidLegacyCSharp' },
  { label: 'LegacyPythonUUID', value: 'uuidLegacyPython' },
];

function inferType(val) {
  if (val === null || val === undefined) return 'null';
  if (val._bsontype === 'ObjectId' || (typeof val === 'string' && /^[a-f\d]{24}$/i.test(val))) return 'objectId';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'object') return 'object';
  if (typeof val === 'boolean') return 'bool';
  if (typeof val === 'number') return Number.isInteger(val) ? 'int32' : 'double';
  if (typeof val === 'string' && !isNaN(Date.parse(val))) return 'date';
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
    case 'int32': return parseInt(val, 10);
    case 'int64': return Number(val);
    case 'double': return Number(val);
    case 'decimal': return Number(val);
    case 'bool': return val === 'true';
    case 'date': return new Date(val).toISOString();
    case 'object':
    case 'array': return JSON.parse(val);
    case 'null': return null;
    case 'objectId': return val;
    default: return val;
  }
}

export default function DocEditor() {
  const { editingDoc, editingMode, setEditingDoc, selectedDb, selectedCollection, page, pageSize, setDocuments, documents, activeConnectionId } = useStore();
  const t = useTheme();
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaFieldTypes, setSchemaFieldTypes] = useState({});
  const [requiredFields, setRequiredFields] = useState([]);

  // Schema 类型映射
  const SCHEMA_TO_DISPLAY = {
    int: 'int32', long: 'int64', binData: 'binary', javascript: 'code',
  };

  // 从已有文档和 Schema 定义中提取字段名
  const fieldNames = React.useMemo(() => {
    const names = new Set();
    documents.forEach(doc => Object.keys(doc).forEach(k => names.add(k)));
    schemaFields.forEach(f => { if (f) names.add(f); });
    return Array.from(names).map(n => ({ label: n, value: n }));
  }, [documents, schemaFields]);

  useEffect(() => {
    if (editingDoc && editingMode) {
      const buildFields = async () => {
        let schemaTypes = {};
        if (selectedDb && selectedCollection) {
          try {
            const schema = await window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection);
            if (schema.validator && schema.validator.$jsonSchema) {
              const props = schema.validator.$jsonSchema.properties || {};
              const req = schema.validator.$jsonSchema.required || [];
              setSchemaFields(Object.keys(props));
              setRequiredFields(req);
              Object.entries(props).forEach(([name, def]) => {
                schemaTypes[name] = SCHEMA_TO_DISPLAY[def.bsonType] || def.bsonType || 'string';
              });
              setSchemaFieldTypes(schemaTypes);
            }
          } catch {}
        }

        const list = Object.entries(editingDoc)
          .map(([key, value]) => ({
          key,
          type: schemaTypes[key] || inferType(value),
          value: formatValue(value),
          originalKey: key,
        }));

        // 补充 Schema 有定义但文档中不存在的字段（显示为空）
        Object.keys(schemaTypes).forEach(name => {
          if (!list.find(f => f.key === name)) {
            list.push({ key: name, type: schemaTypes[name], value: '', originalKey: name });
          }
        });

        setFields(list.length > 0 ? list : [{ key: '', type: 'string', value: '' }]);
      };
      buildFields();
    } else {
      setFields([]);
      setSchemaFields([]);
      setSchemaFieldTypes({});
    }
  }, [editingDoc, editingMode, selectedDb, selectedCollection]);

  const handleClose = () => setEditingDoc(null, null);

  const handleSave = async () => {
    if (!selectedDb || !selectedCollection) return;

    const doc = {};
    fields.forEach(f => {
      if (!f.key.trim() || f.key === '_id') return;
      // 空值不保存
      if (f.value === '' || f.value === null || f.value === undefined) return;
      const parsed = parseValue(f.value, f.type);
      // NaN 不保存
      if (typeof parsed === 'number' && isNaN(parsed)) return;
      doc[f.key] = parsed;
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
        // 编辑模式：只更新非空字段，使用 $set 保留原文档结构
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
    <Modal title={<span>{editingMode === 'edit' ? <EditOutlined style={{ color: t.accent, marginRight: 8 }} /> : <PlusOutlined style={{ color: t.accent, marginRight: 8 }} />}{editingMode === 'edit' ? '编辑文档' : '新建文档'}</span>} open={!!editingMode} onCancel={handleClose} width={800}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>{editingMode === 'edit' ? '保存' : '创建'}</Button>,
      ]}>
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {fields.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: t.text.subtle }}>
            <DatabaseOutlined style={{ fontSize: 32, color: t.text.muted, marginBottom: 8 }} />
            <div>暂无字段，点击下方"添加字段"</div>
          </div>
        )}
        {fields.map((field, index) => (
          <div key={index} style={{
            display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
            padding: '8px 12px', background: t.bg.panel, borderRadius: 8,
            border: requiredFields.includes(field.key) ? `1px solid ${t.accent}44` : 'none',
          }}>
            <div style={{ width: 160, position: 'relative' }}>
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
              {requiredFields.includes(field.key) && (
                <Tag color="red" style={{ position: 'absolute', right: -18, top: -8, fontSize: 9, lineHeight: '14px', padding: '0 4px', border: 'none' }}>必填</Tag>
              )}
            </div>
            <Select value={field.type} onChange={v => updateField(index, 'type', v)}
              style={{ width: 170 }} size="middle" options={TYPE_OPTIONS} />
            {field.type === 'date' ? (
              <DatePicker
                value={field.value ? (typeof field.value === 'string' && field.value.includes('T') ? dayjs(field.value) : field.value ? dayjs(field.value) : null) : null}
                onChange={(date, dateStr) => updateField(index, 'value', dateStr || '')}
                style={{ flex: 1 }}
                size="middle"
                format="YYYY-MM-DD HH:mm:ss"
                showTime
                placeholder="选择日期"
                disabled={editingMode === 'edit' && field.originalKey === '_id'}
              />
            ) : (
              <Input placeholder={field.type === 'object' ? '{"key": "value"}' : field.type === 'array' ? '[1, 2, 3]' : field.type === 'boolean' ? 'true / false' : '值'} value={field.value} onChange={e => updateField(index, 'value', e.target.value)}
                style={{ flex: 1 }}
                disabled={field.type === 'null' || (editingMode === 'edit' && field.originalKey === '_id')} />
            )}
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