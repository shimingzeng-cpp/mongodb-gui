import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Space, Typography, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text, Title } = Typography;

const BSON_TYPES = ['string', 'int', 'double', 'bool', 'object', 'array', 'date', 'objectId', 'null'];

export default function SchemaModal() {
  const { selectedDb, selectedCollection, schemaOpen, setSchemaOpen, activeConnectionId } = useStore();
  const t = useTheme();
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requiredFields, setRequiredFields] = useState([]);
  const [properties, setProperties] = useState([]);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    if (schemaOpen && selectedDb && selectedCollection) {
      loadSchema();
    }
  }, [schemaOpen, selectedDb, selectedCollection]);

  const loadSchema = async () => {
    setLoading(true);
    try {
      const result = await window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection);
      setSchema(result);
      if (result.validator && result.validator.$jsonSchema) {
        const s = result.validator.$jsonSchema;
        setRequiredFields(s.required || []);
        const props = s.properties ? Object.entries(s.properties).map(([name, def]) => ({
          name, type: def.bsonType || 'string', ...def,
        })) : [];
        setProperties(props);
        setJsonText(JSON.stringify(result.validator, null, 2));
      } else {
        setRequiredFields([]);
        setProperties([]);
        setJsonText('');
      }
    } catch (err) { message.error('加载 Schema 失败: ' + err.message); }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let validator;
      if (showJson) {
        validator = jsonText.trim() ? JSON.parse(jsonText) : {};
      } else {
        const props = {};
        properties.forEach(p => {
          if (!p.name) return;
          props[p.name] = { bsonType: p.type };
        });
        const required = requiredFields.filter(f => f.trim());
        validator = {
          $jsonSchema: {
            bsonType: 'object',
            ...(required.length > 0 ? { required } : {}),
            properties: props,
          },
        };
      }
      await window.__mongo.setCollectionSchema(activeConnectionId, selectedDb, selectedCollection, validator);
      message.success('Schema 保存成功');
      setSchemaOpen(false);
    } catch (err) { message.error('保存失败: ' + err.message); }
    setSaving(false);
  };

  const handleRemove = async () => {
    try {
      await window.__mongo.setCollectionSchema(activeConnectionId, selectedDb, selectedCollection, {});
      message.success('Schema 已移除');
      setSchemaOpen(false);
    } catch (err) { message.error('移除失败: ' + err.message); }
  };

  const addProperty = () => setProperties([...properties, { name: '', type: 'string' }]);
  const removeProperty = (i) => setProperties(properties.filter((_, idx) => idx !== i));
  const updateProperty = (i, field, val) => {
    const u = [...properties];
    u[i] = { ...u[i], [field]: val };
    setProperties(u);
  };
  const addRequired = () => setRequiredFields([...requiredFields, '']);
  const removeRequired = (i) => setRequiredFields(requiredFields.filter((_, idx) => idx !== i));
  const updateRequired = (i, val) => {
    const u = [...requiredFields];
    u[i] = val;
    setRequiredFields(u);
  };

  return (
    <Modal
      title={<span><SafetyCertificateOutlined style={{ color: t.accent, marginRight: 8 }} />字段验证 - {selectedCollection}</span>}
      open={schemaOpen}
      onCancel={() => setSchemaOpen(false)}
      width={700}
      footer={[
        <Popconfirm key="remove" title="确认移除所有 Schema 验证规则?" onConfirm={handleRemove} okText="移除" okType="danger" cancelText="取消">
          <Button danger>移除规则</Button>
        </Popconfirm>,
        <Button key="json" onClick={() => setShowJson(!showJson)}>{showJson ? '可视化' : 'JSON 编辑'}</Button>,
        <Button key="cancel" onClick={() => setSchemaOpen(false)}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>保存</Button>,
      ]}
    >
      {!showJson ? (
        <div>
          {/* Required 字段 */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ color: t.text.secondary, fontSize: 12 }}>必填字段 (required)</Text>
            {requiredFields.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Input
                  value={f}
                  onChange={e => updateRequired(i, e.target.value)}
                  placeholder="输入字段名"
                  size="small"
                  style={{ width: 200 }}
                />
                <Button icon={<DeleteOutlined />} size="small" danger type="text" onClick={() => removeRequired(i)} />
              </div>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addRequired} style={{ marginTop: 4 }}>添加必填字段</Button>
          </div>

          {/* 字段属性 */}
          <div>
            <Text strong style={{ color: t.text.secondary, fontSize: 12 }}>字段定义</Text>
            {properties.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <Input
                  value={p.name}
                  onChange={e => updateProperty(i, 'name', e.target.value)}
                  placeholder="输入字段名"
                  size="small"
                  style={{ width: 160 }}
                />
                <Select value={p.type} onChange={v => updateProperty(i, 'type', v)} size="small" style={{ width: 100 }} options={BSON_TYPES.map(t => ({ label: t, value: t }))} />
                <Button icon={<DeleteOutlined />} size="small" danger type="text" onClick={() => removeProperty(i)} />
              </div>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addProperty} style={{ marginTop: 4 }}>添加字段</Button>
          </div>
        </div>
      ) : (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>直接编辑 JSON Schema：</Text>
          <Input.TextArea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            rows={15}
            style={{ background: t.bg.code, color: t.accent, fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, marginTop: 8 }}
            placeholder='{"$jsonSchema": {"bsonType": "object", "required": ["id"], "properties": {"id": {"bsonType": "int"}}}}'
          />
        </div>
      )}
    </Modal>
  );
}