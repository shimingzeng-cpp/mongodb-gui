import React, { useState, useEffect } from 'react';
import { Button, message, Spin, Typography, Modal, Input } from 'antd';
import { DatabaseOutlined, TableOutlined, PlusOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text } = Typography;

export default function DbTree() {
  const { databases, selectedDb, selectedCollection, setSelectedDb, setSelectedCollection, connected, setPage, setDocuments, refreshKey } = useStore();
  const [expandedDbs, setExpandedDbs] = useState({});
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState({});
  const [createModal, setCreateModal] = useState({ open: false, dbName: null });
  const [newName, setNewName] = useState('');

  // 刷新时清除缓存的集合列表
  useEffect(() => {
    setCollections({});
  }, [refreshKey]);

  const toggleDb = async (dbName) => {
    if (expandedDbs[dbName]) {
      setExpandedDbs({ ...expandedDbs, [dbName]: false });
      return;
    }
    setExpandedDbs({ ...expandedDbs, [dbName]: true });
    setSelectedDb(dbName);
    setSelectedCollection(null);
    if (!collections[dbName]) {
      setLoading({ ...loading, [dbName]: true });
      try {
        const cols = await window.__mongo.listCollections(dbName);
        setCollections({ ...collections, [dbName]: cols });
      } catch (err) { message.error('加载集合失败: ' + err.message); }
      setLoading({ ...loading, [dbName]: false });
    }
  };

  const selectCollection = (dbName, colName) => {
    setSelectedDb(dbName);
    setSelectedCollection(colName);
    setPage(1);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await window.__mongo.createCollection(createModal.dbName, newName.trim());
      message.success('集合创建成功');
      const cols = await window.__mongo.listCollections(createModal.dbName);
      setCollections({ ...collections, [createModal.dbName]: cols });
      setSelectedCollection(newName.trim());
      setDocuments([], 0);
      setCreateModal({ open: false, dbName: null });
      setNewName('');
    } catch (err) { message.error('创建失败: ' + err.message); }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ color: '#aaa', fontSize: 12 }}>数据库</Text>
        {selectedDb && (
          <Button type="text" size="small" icon={<PlusOutlined />}
            onClick={() => setCreateModal({ open: true, dbName: selectedDb })} />
        )}
      </div>

      {databases.map(db => (
        <div key={db.name}>
          <div
            onClick={() => toggleDb(db.name)}
            style={{
              cursor: 'pointer', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
              background: selectedDb === db.name && !selectedCollection ? '#1a3a2a' : 'transparent',
              borderLeft: selectedDb === db.name && !selectedCollection ? '3px solid #00b96b' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (selectedDb !== db.name || selectedCollection) e.currentTarget.style.background = '#2a2a2a'; }}
            onMouseLeave={e => { if (selectedDb !== db.name || selectedCollection) e.currentTarget.style.background = 'transparent'; }}
          >
            {expandedDbs[db.name] ? <DownOutlined style={{ fontSize: 10, color: '#888' }} /> : <RightOutlined style={{ fontSize: 10, color: '#888' }} />}
            <DatabaseOutlined style={{ color: '#00b96b' }} />
            <Text style={{ color: '#ddd', fontSize: 13 }}>{db.name}</Text>
          </div>

          {expandedDbs[db.name] && (
            <div style={{ paddingLeft: 28 }}>
              {loading[db.name] ? (
                <div style={{ padding: '8px 16px' }}><Spin size="small" /></div>
              ) : (
                (collections[db.name] || []).map(col => (
                  <div
                    key={col.name}
                    onClick={(e) => { e.stopPropagation(); selectCollection(db.name, col.name); }}
                    style={{
                      cursor: 'pointer', padding: '5px 16px', display: 'flex', alignItems: 'center', gap: 8,
                      background: selectedCollection === col.name && selectedDb === db.name ? '#1a3a2a' : 'transparent',
                      borderLeft: selectedCollection === col.name && selectedDb === db.name ? '3px solid #4fc3f7' : '3px solid transparent',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (selectedCollection !== col.name) e.currentTarget.style.background = '#2a2a2a'; }}
                    onMouseLeave={e => { if (selectedCollection !== col.name) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <TableOutlined style={{ color: '#4fc3f7' }} />
                    <Text style={{ color: '#ccc', fontSize: 13 }}>{col.name}</Text>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      <Modal title="新建集合（表）" open={createModal.open} onOk={handleCreate}
        onCancel={() => { setCreateModal({ open: false, dbName: null }); setNewName(''); }}
        okText="创建" cancelText="取消">
        {createModal.dbName && <p style={{ color: '#aaa', marginBottom: 8 }}>在数据库 <Text code>{createModal.dbName}</Text> 中创建</p>}
        <Input placeholder="集合名称（表名）" value={newName}
          onChange={e => setNewName(e.target.value)} onPressEnter={handleCreate} />
      </Modal>
    </div>
  );
}