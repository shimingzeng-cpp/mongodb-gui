import React, { useState } from 'react';
import { Button, Space, Tag, message, Select, Typography, Input } from 'antd';
import { LinkOutlined, DisconnectOutlined, ReloadOutlined, SettingOutlined, QuestionCircleOutlined, SwapOutlined, PlusOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text } = Typography;

export default function ConnectionBar() {
  const {
    connected, connections, activeConnectionId, connectionLoading,
    setConnected, setUri, setActiveConnectionId, setConnectionLoading,
    setDatabases, setSelectedDb, setSelectedCollection,
    setDocuments, setPage, setSettingsOpen, doRefresh, setHelpOpen, setSyncOpen,
    addConnection,
  } = useStore();

  const [inputUri, setInputUri] = useState('mongodb://localhost:27017');
  const activeConn = connections.find(c => c.id === activeConnectionId);

  const handleConnect = async () => {
    if (!activeConnectionId) {
      // 没有选中的连接，尝试快速连接
      await handleQuickConnect();
      return;
    }
    const conn = connections.find(c => c.id === activeConnectionId);
    if (!conn) return;
    setConnectionLoading(true);
    try {
      await window.__mongo.connect(conn.id, conn.uri);
      setConnected(true);
      setUri(conn.uri);
      message.success(`连接成功: ${conn.name}`);
      const dbs = await window.__mongo.listDatabases(conn.id);
      setDatabases(dbs);
      setSelectedDb(null);
      setSelectedCollection(null);
      setDocuments([], 0);
      setPage(1);
      doRefresh();
    } catch (err) {
      message.error('连接失败: ' + err.message);
    }
    setConnectionLoading(false);
  };

  const handleQuickConnect = async () => {
    if (!inputUri.trim()) {
      message.warning('请输入连接地址');
      return;
    }
    setConnectionLoading(true);
    try {
      const uri = inputUri.trim();
      const match = uri.match(/mongodb:\/\/(?:[^@]+@)?([^:/]+)(?::(\d+))?/);
      const host = match ? match[1] : 'localhost';
      const port = match && match[2] ? parseInt(match[2]) : 27017;
      const name = `快速连接 - ${host}:${port}`;

      // 检查是否已有相同 URI 的连接
      let existingConn = connections.find(c => c.uri === uri);
      let connId;
      if (existingConn) {
        connId = existingConn.id;
      } else {
        // 自动保存连接，返回新 ID
        connId = addConnection({ name, host, port, uri, username: '', password: '', authSource: 'admin', authMechanism: 'DEFAULT', ssl: false, sslAllowInvalid: false, replicaSet: '' });
      }

      await window.__mongo.connect(connId, uri);
      setConnected(true);
      setUri(uri);
      setActiveConnectionId(connId);
      message.success('连接成功');
      const dbs = await window.__mongo.listDatabases(connId);
      setDatabases(dbs);
      setSelectedDb(null);
      setSelectedCollection(null);
      setDocuments([], 0);
      setPage(1);
      doRefresh();
    } catch (err) {
      message.error('连接失败: ' + err.message);
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
      message.info('已断开连接');
    } catch (err) {
      message.error('断开失败: ' + err.message);
    }
  };

  const handleRefresh = async () => {
    if (!activeConnectionId) return;
    try {
      const dbs = await window.__mongo.listDatabases(activeConnectionId);
      setDatabases(dbs);
      doRefresh();
      message.success('已刷新');
    } catch (err) {
      message.error('刷新失败: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#141414', borderBottom: '1px solid #333' }}>
      <Space>
        {!connected ? (
          <>
            <Input
              value={inputUri}
              onChange={e => setInputUri(e.target.value)}
              placeholder="mongodb://localhost:27017"
              style={{ width: 320 }}
              size="small"
              onPressEnter={handleQuickConnect}
            />
            <Button
              type="primary"
              icon={<LinkOutlined />}
              loading={connectionLoading}
              onClick={handleQuickConnect}
              size="small"
            >
              连接
            </Button>
            <Text type="secondary" style={{ fontSize: 11 }}>或</Text>
            <Select
              value={activeConnectionId || undefined}
              onChange={(id) => setActiveConnectionId(id)}
              placeholder="选择已保存的连接..."
              style={{ width: 180 }}
              size="small"
              options={connections.map(c => ({
                label: `${c.name} (${c.host}:${c.port})`,
                value: c.id,
              }))}
              allowClear
              onClear={() => setActiveConnectionId(null)}
            />
            <Button
              type="primary"
              icon={<LinkOutlined />}
              loading={connectionLoading}
              onClick={handleConnect}
              size="small"
              disabled={!activeConnectionId}
            >
              连接
            </Button>
          </>
        ) : (
          <Space>
            <Tag color="green" style={{ marginRight: 0 }}>已连接 {activeConn?.name}</Tag>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} size="small">刷新</Button>
            <Button icon={<SwapOutlined />} onClick={() => setSyncOpen(true)} size="small">同步</Button>
            <Button danger icon={<DisconnectOutlined />} onClick={handleDisconnect} size="small">断开</Button>
          </Space>
        )}
      </Space>
      <Space size="small">
        <Button type="text" icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)} title="帮助" />
        <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} title="设置" />
      </Space>
    </div>
  );
}