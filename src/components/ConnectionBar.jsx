import React, { useState } from 'react';
import { Input, Button, Space, Tag, message } from 'antd';
import { LinkOutlined, DisconnectOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import useStore from '../store';

export default function ConnectionBar() {
  const { connected, uri, setConnected, setUri, setDatabases, setSelectedDb, setSelectedCollection, setSettingsOpen, doRefresh } = useStore();
  const [loading, setLoading] = useState(false);
  const [inputUri, setInputUri] = useState(uri);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await window.__mongo.connect(inputUri);
      setUri(inputUri);
      setConnected(true);
      message.success('连接成功');
      const dbs = await window.__mongo.listDatabases();
      setDatabases(dbs);
    } catch (err) { message.error('连接失败: ' + err.message); }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    await window.__mongo.disconnect();
    setConnected(false);
    setDatabases([]);
    setSelectedDb(null);
    setSelectedCollection(null);
    message.info('已断开连接');
  };

  const handleRefresh = async () => {
    const dbs = await window.__mongo.listDatabases();
    setDatabases(dbs);
    doRefresh();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#141414', borderBottom: '1px solid #333' }}>
      <Space>
        <Input value={inputUri} onChange={e => setInputUri(e.target.value)}
          placeholder="mongodb://localhost:27017" style={{ width: 320 }}
          disabled={connected} onPressEnter={handleConnect} />
        {!connected ? (
          <Button type="primary" icon={<LinkOutlined />} loading={loading} onClick={handleConnect}>连接</Button>
        ) : (
          <Space>
            <Tag color="green">已连接</Tag>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} size="small">刷新</Button>
            <Button danger icon={<DisconnectOutlined />} onClick={handleDisconnect} size="small">断开</Button>
          </Space>
        )}
      </Space>
      <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} title="设置" />
    </div>
  );
}