import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Space, Typography, message, Tag, Popconfirm, Checkbox } from 'antd';
import { PlusOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text, Title } = Typography;

const BSON_TYPES = [
  { label: 'Array', value: 'array' },
  { label: 'Binary', value: 'binData' },
  { label: 'Boolean', value: 'bool' },
  { label: 'Code', value: 'javascript' },
  { label: 'Date', value: 'date' },
  { label: 'Decimal128', value: 'decimal' },
  { label: 'Double', value: 'double' },
  { label: 'Int32', value: 'int' },
  { label: 'Int64', value: 'long' },
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

// MongoDB $type → 显示类型
const BSON_TYPE_TO_DISPLAY = {
  double: 'double', string: 'string', object: 'object', array: 'array',
  binData: 'binData', undefined: 'undefined', objectId: 'objectId',
  bool: 'bool', date: 'date', null: 'null', regex: 'regex',
  javascript: 'javascript', symbol: 'symbol', int: 'int',
  timestamp: 'timestamp', long: 'long', decimal: 'decimal',
  minKey: 'minKey', maxKey: 'maxKey',
};

export default function SchemaModal() {
  const { selectedDb, selectedCollection, schemaOpen, setSchemaOpen, activeConnectionId, triggerReload, doRefresh } = useStore();
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
      // 并行获取 Schema 定义和 MongoDB 实际字段类型
      const [result, fieldTypes] = await Promise.all([
        window.__mongo.getCollectionSchema(activeConnectionId, selectedDb, selectedCollection),
        window.__mongo.getCollectionFieldTypes(activeConnectionId, selectedDb, selectedCollection).catch(() => ({})),
      ]);
      setSchema(result);

      // 1. 从 MongoDB 获取所有字段的实际类型
      const docFieldNames = new Set(Object.keys(fieldTypes));

      // 2. 从 Schema 中提取字段定义
      const schemaProps = {};
      let req = [];
      if (result.validator && result.validator.$jsonSchema) {
        const s = result.validator.$jsonSchema;
        req = s.required || [];
        if (s.properties) {
          Object.entries(s.properties).forEach(([name, def]) => {
            schemaProps[name] = def.bsonType || 'string';
          });
        }
      }

      // 3. 合并：Schema 字段优先，MongoDB 实际类型补充
      const mergedProps = [];
      const seen = new Set();

      // 先处理 Schema 中已定义的字段
      if (result.validator && result.validator.$jsonSchema && result.validator.$jsonSchema.properties) {
        Object.keys(result.validator.$jsonSchema.properties).forEach(name => {
          if (!seen.has(name)) {
            mergedProps.push({ name, type: schemaProps[name] || 'string' });
            seen.add(name);
          }
        });
      }

      // 再处理 MongoDB 实际存在但 Schema 未定义的字段
      docFieldNames.forEach(name => {
        if (!seen.has(name)) {
          mergedProps.push({ name, type: BSON_TYPE_TO_DISPLAY[fieldTypes[name]] || 'string' });
          seen.add(name);
        }
      });

      // 确保 _id 必填
      if (!req.includes('_id')) req.unshift('_id');
      setRequiredFields(req);

      // 确保 _id 在字段列表首位
      if (!seen.has('_id')) {
        mergedProps.unshift({ name: '_id', type: 'objectId' });
      }

      setProperties(mergedProps);
      setJsonText(result.validator ? JSON.stringify(result.validator, null, 2) : '');
    } catch (err) { message.error('加载 Schema 失败: ' + err.message); }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 系统数据库不允许设置文档验证器
      const systemDbs = ['admin', 'config', 'local'];
      if (systemDbs.includes(selectedDb)) {
        message.warning(`数据库 "${selectedDb}" 是系统数据库，不支持设置字段验证`);
        setSaving(false);
        return;
      }
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
      triggerReload();
      doRefresh();
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
  const removeProperty = (i) => {
    const p = properties[i];
    if (!p || p.name === '_id') return;
    if (p.name && requiredFields.includes(p.name)) {
      setRequiredFields(requiredFields.filter(f => f !== p.name));
    }
    setProperties(properties.filter((_, idx) => idx !== i));
  };
  const updateProperty = (i, field, val) => {
    const u = [...properties];
    const oldName = u[i].name;
    // _id 不允许改字段名
    if (oldName === '_id' && field === 'name') return;
    u[i] = { ...u[i], [field]: val };
    // 如果字段名变了，同步更新 required 列表
    if (field === 'name' && oldName && requiredFields.includes(oldName)) {
      setRequiredFields(requiredFields.map(f => f === oldName ? val : f));
    }
    setProperties(u);
  };
  const toggleRequired = (fieldName, checked) => {
    if (fieldName === '_id') return; // _id 始终必填
    if (checked) {
      if (!requiredFields.includes(fieldName)) {
        setRequiredFields([...requiredFields, fieldName]);
      }
    } else {
      setRequiredFields(requiredFields.filter(f => f !== fieldName));
    }
  };

  const isSystemDb = ['admin', 'config', 'local'].includes(selectedDb);

  return (
    <Modal
      title={<span><SafetyCertificateOutlined style={{ color: t.accent, marginRight: 8 }} />字段验证 - {selectedCollection}{isSystemDb ? <Tag color="warning" style={{ marginLeft: 8 }}>系统数据库只读</Tag> : ''}</span>}
      open={schemaOpen}
      onCancel={() => setSchemaOpen(false)}
      width={700}
      footer={[
        <Popconfirm key="remove" title="确认移除所有 Schema 验证规则?" onConfirm={handleRemove} okText="移除" okType="danger" cancelText="取消">
          <Button danger disabled={isSystemDb}>移除规则</Button>
        </Popconfirm>,
        <Button key="json" onClick={() => setShowJson(!showJson)}>{showJson ? '可视化' : 'JSON 编辑'}</Button>,
        <Button key="cancel" onClick={() => setSchemaOpen(false)}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave} disabled={isSystemDb}>保存</Button>,
      ]}
    >
      {!showJson ? (
        <div>
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
                  disabled={p.name === '_id'}
                />
                <Select value={p.type} onChange={v => updateProperty(i, 'type', v)} size="small" style={{ width: 100 }} options={BSON_TYPES} />
                <Checkbox
                  checked={p.name ? requiredFields.includes(p.name) : false}
                  onChange={e => { if (p.name) toggleRequired(p.name, e.target.checked); }}
                  disabled={!p.name || p.name === '_id'}
                  title="勾选表示必填（非空）"
                >必填</Checkbox>
                {p.name !== '_id' && (
                  <Button icon={<DeleteOutlined />} size="small" danger type="text" onClick={() => removeProperty(i)} />
                )}
              </div>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addProperty} disabled={isSystemDb} style={{ marginTop: 4 }}>添加字段</Button>
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