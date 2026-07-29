import React, { useState, useEffect } from 'react';
import { Button, message, Spin, Typography, Modal, Input, Dropdown, Space } from 'antd';
import { DatabaseOutlined, TableOutlined, PlusOutlined, RightOutlined, DownOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text } = Typography;

export default function DbTree() {
  const { databases, selectedDb, selectedCollection, setSelectedDb, setSelectedCollection, connected, setPage, setDocuments, refreshKey, setDatabases, activeConnectionId } = useStore();
  const [expandedDbs, setExpandedDbs] = useState({});
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState({});
  const [createModal, setCreateModal] = useState({ open: false, dbName: null, isNewDb: false });
  const [newName, setNewName] = useState('');
  const [newDbName, setNewDbName] = useState('');

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
        const cols = await window.__mongo.listCollections(activeConnectionId, dbName);
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
    if (createModal.isNewDb && !newDbName.trim()) return;
    try {
      const dbName = createModal.isNewDb ? newDbName.trim() : createModal.dbName;
      await window.__mongo.createCollection(activeConnectionId, dbName, newName.trim());
      message.success(createModal.isNewDb ? '数据库和集合创建成功' : '集合创建成功');
      // 如果创建了新数据库，刷新数据库列表
      if (createModal.isNewDb) {
        const dbs = await window.__mongo.listDatabases(activeConnectionId);
        setDatabases(dbs);
      }
      const cols = await window.__mongo.listCollections(activeConnectionId, dbName);
      setCollections({ ...collections, [dbName]: cols });
      setExpandedDbs({ ...expandedDbs, [dbName]: true });
      setSelectedDb(dbName);
      setSelectedCollection(newName.trim());
      setDocuments([], 0);
      setCreateModal({ open: false, dbName: null, isNewDb: false });
      setNewName('');
      setNewDbName('');
    } catch (err) { message.error('创建失败: ' + err.message); }
  };

  return (
    <div style={{ padding: '8px 0', height: '100%' }}>
      <div
        style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Text strong style={{ color: '#aaa', fontSize: 12 }}>数据库</Text>
        <Space size={4}>
          <Button type="text" size="small" icon={<PlusOutlined />}
            onClick={() => setCreateModal({ open: true, dbName: null, isNewDb: true })}
            style={{ color: '#00b96b' }} title="新建数据库" />
          {selectedDb && (
            <Button type="text" size="small" icon={<PlusOutlined />}
              onClick={() => setCreateModal({ open: true, dbName: selectedDb, isNewDb: false })} />
          )}
        </Space>
      </div>

      {databases.map(db => (
        <div key={db.name}>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'create', icon: <PlusOutlined />, label: '新建集合',
                  onClick: () => setCreateModal({ open: true, dbName: db.name, isNewDb: false }),
                },
                { type: 'divider' },
                {
                  key: 'delete', icon: <DeleteOutlined />, label: '删除数据库', danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: `删除数据库 "${db.name}"?`,
                      content: '此操作将删除该数据库及其所有集合和数据，不可撤销！',
                      okText: '删除', okType: 'danger', cancelText: '取消',
                      onOk: async () => {
                        try {
                          await window.__mongo.dropDatabase(activeConnectionId, db.name);
                          message.success(`数据库 ${db.name} 已删除`);
                          setSelectedDb(null);
                          setSelectedCollection(null);
                          setDocuments([], 0);
                          const dbs = await window.__mongo.listDatabases(activeConnectionId);
                          setDatabases(dbs);
                        } catch (err) { message.error('删除失败: ' + err.message); }
                      },
                    });
                  },
                },
              ],
            }}
            trigger={['contextMenu']}
          >
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
          </Dropdown>

          {expandedDbs[db.name] && (
            <div style={{ paddingLeft: 28 }}>
              {loading[db.name] ? (
                <div style={{ padding: '8px 16px' }}><Spin size="small" /></div>
              ) : (
                (collections[db.name] || []).map(col => (
                  <div
                    key={col.name}
                    onClick={(e) => { e.stopPropagation(); selectCollection(db.name, col.name); }}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      Modal.confirm({
                        title: `删除集合 "${col.name}"?`,
                        content: '此操作不可撤销',
                        okText: '删除', okType: 'danger', cancelText: '取消',
                        onOk: async () => {
                          try {
                            await window.__mongo.dropCollection(activeConnectionId, db.name, col.name);
                            message.success('已删除');
                            setSelectedCollection(null);
                            setDocuments([], 0);
                            const cols = await window.__mongo.listCollections(activeConnectionId, db.name);
                            setCollections({ ...collections, [db.name]: cols });
                          } catch (err) { message.error('删除失败: ' + err.message); }
                        },
                      });
                    }}
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

      <Modal title={createModal.isNewDb ? '新建数据库' : '新建集合（表）'} open={createModal.open} onOk={handleCreate}
        onCancel={() => { setCreateModal({ open: false, dbName: null, isNewDb: false }); setNewName(''); setNewDbName(''); }}
        okText="创建" cancelText="取消">
        {createModal.isNewDb ? (
          <div>
            <p style={{ color: '#aaa', marginBottom: 8 }}>MongoDB 中创建数据库需要同时创建一个集合</p>
            <Input placeholder="数据库名称" value={newDbName} onChange={e => setNewDbName(e.target.value)}
              style={{ marginBottom: 8 }} />
            <Input placeholder="集合名称（表名）" value={newName} onChange={e => setNewName(e.target.value)}
              onPressEnter={handleCreate} />
          </div>
        ) : (
          <div>
            <p style={{ color: '#aaa', marginBottom: 8 }}>在数据库 <Text code>{createModal.dbName}</Text> 中创建</p>
            <Input placeholder="集合名称（表名）" value={newName}
              onChange={e => setNewName(e.target.value)} onPressEnter={handleCreate} />
          </div>
        )}
      </Modal>
    </div>
  );
}