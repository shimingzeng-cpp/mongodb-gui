import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, message, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text } = Typography;

export default function DocEditor() {
  const { editingDoc, editingMode, setEditingDoc, selectedDb, selectedCollection, page, pageSize, setDocuments } = useStore();
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingDoc && editingMode) {
      const list = Object.entries(editingDoc).map(([key, value]) => ({
        key, value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''), originalKey: key,
      }));
      setFields(list.length > 0 ? list : [{ key: '', value: '' }]);
    } else { setFields([]); }
  }, [editingDoc, editingMode]);

  const handleClose = () => setEditingDoc(null, null);

  const handleSave = async () => {
    if (!selectedDb || !selectedCollection) return;
    setSaving(true);
    try {
      const doc = {};
      fields.forEach(f => {
        if (!f.key.trim()) return;
        let val = f.value;
        try { val = JSON.parse(val); } catch {}
        doc[f.key] = val;
      });
      if (editingMode === 'edit' && editingDoc._id) {
        await window.__mongo.updateDocument(selectedDb, selectedCollection, { _id: editingDoc._id }, doc);
        message.success('更新成功');
      } else {
        await window.__mongo.insertDocument(selectedDb, selectedCollection, doc);
        message.success('创建成功');
      }
      const result = await window.__mongo.findDocuments(selectedDb, selectedCollection, {}, { skip: (page - 1) * pageSize, limit: pageSize });
      setDocuments(result.docs, result.total);
      setEditingDoc(null, null);
    } catch (err) { message.error('保存失败: ' + err.message); }
    setSaving(false);
  };

  return (
    <Modal title={editingMode === 'edit' ? '编辑文档' : '新建文档'} open={!!editingMode} onCancel={handleClose} width={700}
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
            <Input placeholder="字段名" value={field.key} onChange={e => updateField(index, 'key', e.target.value)}
              style={{ width: 180 }} disabled={editingMode === 'edit' && field.originalKey === '_id'} />
            <Input placeholder="值 (支持 JSON)" value={field.value} onChange={e => updateField(index, 'value', e.target.value)} style={{ flex: 1 }} />
            <Button icon={<DeleteOutlined />} danger type="text" onClick={() => removeField(index)}
              disabled={editingMode === 'edit' && field.originalKey === '_id'} />
          </div>
        ))}
        <Button type="dashed" onClick={addField} icon={<PlusOutlined />} style={{ width: '100%', marginTop: 8 }}>添加字段</Button>
      </div>
    </Modal>
  );

  function addField() { setFields([...fields, { key: '', value: '' }]); }
  function removeField(index) { setFields(fields.filter((_, i) => i !== index)); }
  function updateField(index, field, value) { const u = [...fields]; u[index] = { ...u[index], [field]: value }; setFields(u); }
}