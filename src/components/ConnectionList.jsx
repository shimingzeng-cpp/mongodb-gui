import React, { useState } from 'react';
import { Button, Typography, message, Dropdown, Space, Tag, Spin } from 'antd';
import {
  PlusOutlined, DatabaseOutlined, RightOutlined, DownOutlined,
  MoreOutlined, LinkOutlined, DisconnectOutlined,
  EditOutlined, CopyOutlined, DeleteOutlined, LoadingOutlined,
} from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';
import ConnectionEditModal from './ConnectionEditModal';

const { Text } = Typography;

export default function ConnectionList() {
  const {
    connections, activeConnectionId, connected, connectionLoading,
    setActiveConnectionId, setConnectionLoading,
    addConnection, updateConnection, deleteConnection, duplicateConnection,
    setConnected, setUri, setDatabases, setSelectedDb, setSelectedCollection,
    setDocuments, setPage, doRefresh, setExportOpen, setSyncOpen,
  } = useStore();
  const t = useTheme();
  const [hoveredId, setHoveredId] = useState(null);

  const [editModal, setEditModal] = useState({ open: false, connection: null });
  const [expanded, setExpanded] = useState(true);

  const handleConnect = async (conn) => {
    if (connectionLoading) return;
    setConnectionLoading(true);
    try {
      // 先断开当前连接
      if (connected) {
        await window.__mongo.disconnect(activeConnectionId);
      }
      // 连接到新连接
      await window.__mongo.connect(conn.id, conn.uri);
      setConnected(true);
      setUri(conn.uri);
      setActiveConnectionId(conn.id);
      message.success(`已连接到 ${conn.name}`);
      // 加载数据库列表
      const dbs = await window.__mongo.listDatabases(conn.id);
      setDatabases(dbs);
      setSelectedDb(null);
      setSelectedCollection(null);
      setDocuments([], 0);
      setPage(1);
      doRefresh();
    } catch (err) {
      message.error('连接失败: ' + err.message);
      setConnected(false);
      setActiveConnectionId(null);
    }
    setConnectionLoading(false);
  };

  const handleDisconnect = async () => {
    try {
      await window.__mongo.disconnect(activeConnectionId);
      setConnected(false);
      setActiveConnectionId(null);
      setDatabases([]);
      setSelectedDb(null);
      setSelectedCollection(null);
      setDocuments([], 0);
      message.success('已断开');
    } catch (err) {
      message.error('断开失败: ' + err.message);
    }
  };

  const getStatusColor = (conn) => {
    if (activeConnectionId === conn.id && connected) return t.accent;
    if (activeConnectionId === conn.id && !connected) return t.error;
    return t.muted;
  };

  const getStatusLabel = (conn) => {
    if (activeConnectionId === conn.id && connected) return '已连接';
    if (activeConnectionId === conn.id && !connected) return '连接失败';
    return '未连接';
  };

  const contextMenuItems = (conn) => {
    const items = [];
    if (activeConnectionId !== conn.id) {
      items.push({
        key: 'connect', icon: <LinkOutlined />, label: '连接',
        onClick: () => handleConnect(conn),
      });
    } else {
      items.push({
        key: 'disconnect', icon: <DisconnectOutlined />, label: '断开',
        onClick: handleDisconnect,
      });
    }
    items.push({ type: 'divider' });
    items.push({
      key: 'edit', icon: <EditOutlined />, label: '编辑',
      onClick: () => setEditModal({ open: true, connection: conn }),
    });
    items.push({
      key: 'duplicate', icon: <CopyOutlined />, label: '复制',
      onClick: () => { duplicateConnection(conn.id); message.success('已复制'); },
    });
    items.push({ type: 'divider' });
    items.push({
      key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true,
      onClick: () => { deleteConnection(conn.id); message.success('已删除'); },
    });
    return items;
  };

  return (
    <div style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: 4 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px 4px', cursor: 'pointer',
      }}
        onClick={() => setExpanded(!expanded)}
      >
        <Text strong style={{ color: t.text.secondary, fontSize: 12 }}>
          连接管理
        </Text>
        <Space size={4}>
          <Button
            type="text" size="small" icon={<PlusOutlined style={{ fontSize: 12 }} />}
            onClick={(e) => { e.stopPropagation(); setEditModal({ open: true, connection: null }); }}
            style={{ color: t.accent }}
          />
          {expanded ? <DownOutlined style={{ fontSize: 10, color: t.text.subtle }} /> : <RightOutlined style={{ fontSize: 10, color: t.text.subtle }} />}
        </Space>
      </div>

      {expanded && (
        <div>
          {connections.length === 0 ? (
            <div style={{ padding: '8px 12px', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>暂无保存的连接</Text>
              <br />
              <Button
                type="link" size="small" style={{ fontSize: 11, color: t.accent }}
                onClick={() => setEditModal({ open: true, connection: null })}
              >
                添加连接
              </Button>
            </div>
          ) : (
            connections.map(conn => (
              <Dropdown key={conn.id} menu={{ items: contextMenuItems(conn) }} trigger={['contextMenu']}>
                <div
                  onClick={() => {
                    if (activeConnectionId === conn.id && connected) {
                      // 已连接则不做操作
                    } else {
                      handleConnect(conn);
                    }
                  }}
                  onMouseEnter={() => setHoveredId(conn.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                    background: activeConnectionId === conn.id ? t.bg.highlight : (hoveredId === conn.id ? t.bg.hover : 'transparent'),
                    borderLeft: activeConnectionId === conn.id ? `3px solid ${t.accent}` : '3px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: getStatusColor(conn), flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.text.primary, fontSize: 12, display: 'block', lineHeight: 1.3 }} ellipsis>
                      {conn.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 10, display: 'block', lineHeight: 1.2 }}>
                      {conn.host}:{conn.port}
                    </Text>
                  </div>
                  {activeConnectionId === conn.id && connectionLoading ? (
                    <LoadingOutlined style={{ color: t.accent, fontSize: 12 }} />
                  ) : activeConnectionId === conn.id && connected ? (
                    <Tag color="green" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>已连</Tag>
                  ) : null}
                </div>
              </Dropdown>
            ))
          )}
        </div>
      )}

      <ConnectionEditModal
        open={editModal.open}
        connection={editModal.connection}
        onSave={(config) => {
          if (editModal.connection) {
            updateConnection(editModal.connection.id, config);
            message.success('连接已更新');
          } else {
            addConnection(config);
            message.success('连接已保存');
          }
          setEditModal({ open: false, connection: null });
        }}
        onCancel={() => setEditModal({ open: false, connection: null })}
      />
    </div>
  );
}