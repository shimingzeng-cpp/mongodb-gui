import React, { useState, useEffect } from 'react';
import { Button, message, Spin, Typography, Modal, Input, Dropdown, Space } from 'antd';
import { DatabaseOutlined, TableOutlined, PlusOutlined, RightOutlined, DownOutlined, DeleteOutlined, ReloadOutlined, CloseOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text } = Typography;

export default function DbTree() {
  const { databases, selectedDb, selectedCollection, setSelectedDb, setSelectedCollection, connected, setPage, setDocuments, refreshKey, setDatabases, activeConnectionId, closeDb, closeCollection } = useStore();
  const t = useTheme();
  const [expandedDbs, setExpandedDbs] = useState({});
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState({});
  const [hoveredDb, setHoveredDb] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [createModal, setCreateModal] = useState({ open: false, dbName: null, isNewDb: false });
  const [newName, setNewName] = useState('');
  const [newDbName, setNewDbName] = useState('');

  const handleRefresh = async () => {
    try {
      const dbs = await window.__mongo.listDatabases(activeConnectionId);
      setDatabases(dbs);
      setCollections({});
      message.success('已刷新');
    } catch (err) { message.error('刷新失败: ' + err.message); }
  };

  // 刷新时清除缓存的集合列表
  useEffect(() => {
    setCollections({});
  }, [refreshKey]);

  const toggleDb = async (dbName) => {
    if (expandedDbs[dbName]) {
      setExpandedDbs(prev => ({ ...prev, [dbName]: false }));
      return;
    }
    setExpandedDbs(prev => ({ ...prev, [dbName]: true }));
    if (!collections[dbName]) {
      setLoading(prev => ({ ...prev, [dbName]: true }));
      try {
        const cols = await window.__mongo.listCollections(activeConnectionId, dbName);
        setCollections(prev => ({ ...prev, [dbName]: cols }));
      } catch (err) { message.error('加载集合失败: ' + err.message); }
      setLoading(prev => ({ ...prev, [dbName]: false }));
    }
  };

  // 双击打开数据库（选中并更新 Shell 上下文）
  const openDb = (dbName) => {
    setSelectedDb(dbName);
    setSelectedCollection(null);
  };

  // 单击：即时展开/折叠
  // 双击：选中数据库，同时确保展开
  const handleDbClick = (dbName) => {
    toggleDb(dbName);
  };

  const handleDbDoubleClick = (dbName) => {
    // 双击时先确保展开（单击可能已经折叠了）
    if (!expandedDbs[dbName]) {
      setExpandedDbs(prev => ({ ...prev, [dbName]: true }));
      if (!collections[dbName]) {
        window.__mongo.listCollections(activeConnectionId, dbName)
          .then(cols => setCollections(prev => ({ ...prev, [dbName]: cols })))
          .catch(() => {});
      }
    }
    openDb(dbName);
  };

  // 单击集合：展开父级数据库
  // 双击集合：选中
  const handleColClick = (dbName, colName) => {
    if (!expandedDbs[dbName]) {
      toggleDb(dbName);
    }
  };

  const handleColDoubleClick = (dbName, colName) => {
    selectCollection(dbName, colName);
  };

  const selectCollection = (dbName, colName) => {
    setSelectedDb(dbName);
    setSelectedCollection(colName);
    setPage(1);
  };

  const handleCreate = async () => {
    if (!newName.trim() && !createModal.isNewDb) return;
    if (createModal.isNewDb && !newDbName.trim()) return;
    try {
      const dbName = createModal.isNewDb ? newDbName.trim() : createModal.dbName;
      const colName = newName.trim() || '_default';
      await window.__mongo.createCollection(activeConnectionId, dbName, colName);
      message.success(createModal.isNewDb ? '数据库和集合创建成功' : '集合创建成功');
      // 如果创建了新数据库，刷新数据库列表
      if (createModal.isNewDb) {
        const dbs = await window.__mongo.listDatabases(activeConnectionId);
        setDatabases(dbs);
      }
      const cols = await window.__mongo.listCollections(activeConnectionId, dbName);
      setCollections(prev => ({ ...prev, [dbName]: cols }));
      setExpandedDbs(prev => ({ ...prev, [dbName]: true }));
      setSelectedDb(dbName);
      setSelectedCollection(colName);
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
        <Text strong style={{ color: t.text.secondary, fontSize: 12 }}>数据库</Text>
        <Space size={2}>
          <Button type="text" size="small" icon={<ReloadOutlined style={{ fontSize: 12 }} />}
            onClick={handleRefresh} title="刷新数据库列表" style={{ color: t.accent }} />
          <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 12 }} />}
            onClick={() => setCreateModal({ open: true, dbName: null, isNewDb: true })}
            style={{ color: t.accent }} title="新建数据库（可选同时创建集合）" />
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
              onClick={() => handleDbClick(db.name)}
              onDoubleClick={() => handleDbDoubleClick(db.name)}
              onMouseEnter={() => setHoveredDb(db.name)}
              onMouseLeave={() => setHoveredDb(null)}
              style={{
                cursor: 'pointer', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
                background: selectedDb === db.name && !selectedCollection ? t.bg.highlight : (hoveredDb === db.name ? t.bg.hover : 'transparent'),
                borderLeft: selectedDb === db.name && !selectedCollection ? `3px solid ${t.accent}` : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {expandedDbs[db.name] ? <DownOutlined style={{ fontSize: 10, color: t.text.subtle }} /> : <RightOutlined style={{ fontSize: 10, color: t.text.subtle }} />}
              <DatabaseOutlined style={{ color: t.accent }} />
              {selectedDb === db.name && !selectedCollection && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />
              )}
              <Text style={{ color: t.text.primary, fontSize: 13, flex: 1 }}>{db.name}</Text>
              {hoveredDb === db.name && (
                <Space size={2}>
                  <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 11 }} />}
                    onClick={(e) => { e.stopPropagation(); setCreateModal({ open: true, dbName: db.name, isNewDb: false }); }}
                    style={{ color: t.text.subtle, height: 20, width: 20 }} title="新建集合" />
                  {selectedDb === db.name && (
                    <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 11 }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeDb();
                        setExpandedDbs(prev => ({ ...prev, [db.name]: false }));
                      }}
                      style={{ color: t.text.subtle, height: 20, width: 20 }} title="关闭数据库" />
                  )}
                </Space>
              )}
            </div>
          </Dropdown>

          {expandedDbs[db.name] && (
            <div style={{ paddingLeft: 28 }}>
              {loading[db.name] ? (
                <div style={{ padding: '8px 16px' }}><Spin size="small" /></div>
              ) : (
                (collections[db.name] || []).map(col => (
                  <Dropdown
                    key={col.name}
                    menu={{
                      items: [
                        {
                          key: 'delete', icon: <DeleteOutlined />, label: '删除集合', danger: true,
                          onClick: () => {
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
                                  setCollections(prev => ({ ...prev, [db.name]: cols }));
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
                      onClick={(e) => { e.stopPropagation(); handleColClick(db.name, col.name); }}
                      onDoubleClick={(e) => { e.stopPropagation(); handleColDoubleClick(db.name, col.name); }}
                      onMouseEnter={() => setHoveredCol(col.name + db.name)}
                      onMouseLeave={() => setHoveredCol(null)}
                      style={{
                        cursor: 'pointer', padding: '5px 16px', display: 'flex', alignItems: 'center', gap: 8,
                        background: selectedCollection === col.name && selectedDb === db.name ? t.bg.highlight : (hoveredCol === col.name + db.name ? t.bg.hover : 'transparent'),
                        borderLeft: selectedCollection === col.name && selectedDb === db.name ? `3px solid ${t.info}` : '3px solid transparent',
                        transition: 'all 0.2s',
                      }}
                    >
                      <TableOutlined style={{ color: t.info }} />
                      <Text style={{ color: t.text.listItem, fontSize: 13, flex: 1 }}>{col.name}</Text>
                      {selectedCollection === col.name && selectedDb === db.name && (
                        <Button type="text" size="small" icon={<CloseOutlined style={{ fontSize: 11 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            closeCollection();
                          }}
                          style={{ color: t.text.subtle, height: 20, width: 20 }} title="关闭集合" />
                      )}
                    </div>
                  </Dropdown>
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
            <Input placeholder="数据库名称" value={newDbName} onChange={e => setNewDbName(e.target.value)}
              style={{ marginBottom: 8 }} />
            <Input placeholder="初始集合名称（可选，留空则创建 _default 集合）" value={newName}
              onChange={e => setNewName(e.target.value)} onPressEnter={handleCreate} />
          </div>
        ) : (
          <div>
            <p style={{ color: t.text.secondary, marginBottom: 8 }}>在数据库 <Text code>{createModal.dbName}</Text> 中创建</p>
            <Input placeholder="集合名称（表名）" value={newName}
              onChange={e => setNewName(e.target.value)} onPressEnter={handleCreate} />
          </div>
        )}
      </Modal>
    </div>
  );
}