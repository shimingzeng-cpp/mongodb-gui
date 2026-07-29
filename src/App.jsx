import React, { useState, useCallback, useRef } from 'react';
import { Layout, ConfigProvider, theme, App as AntApp, Button, Typography, Card, Space } from 'antd';
import { PlusOutlined, LinkOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import ConnectionBar from './components/ConnectionBar';
import ConnectionList from './components/ConnectionList';
import DbTree from './components/DbTree';
import DocTable from './components/DocTable';
import DocEditor from './components/DocEditor';
import ShellPanel from './components/ShellPanel';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import SchemaModal from './components/SchemaModal';
import IndexModal from './components/IndexModal';
import ExportImportModal from './components/ExportImportModal';
import SyncModal from './components/SyncModal';
import useStore from './store';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

function WelcomeScreen() {
  const { connections, setConnectionLoading, setConnected, setUri, setActiveConnectionId, setDatabases, setSelectedDb, setSelectedCollection, setDocuments, setPage } = useStore();
  const [connecting, setConnecting] = useState(null);

  const handleQuickConnect = async (conn) => {
    setConnecting(conn.id);
    setConnectionLoading(true);
    try {
      await window.__mongo.connect(conn.id, conn.uri);
      setConnected(true);
      setUri(conn.uri);
      setActiveConnectionId(conn.id);
      const dbs = await window.__mongo.listDatabases(conn.id);
      setDatabases(dbs);
      setSelectedDb(null);
      setSelectedCollection(null);
      setDocuments([], 0);
      setPage(1);
    } catch (err) {
      // 连接失败，静默处理
    }
    setConnectionLoading(false);
    setConnecting(null);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, padding: 40,
    }}>
      <Title level={3} style={{ color: '#aaa', marginBottom: 8 }}>欢迎使用 MongoDB 可视化工具</Title>
      <Text type="secondary" style={{ marginBottom: 32 }}>
        请选择左侧的连接或添加新连接开始使用
      </Text>
      {connections.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600 }}>
          {connections.map(conn => (
            <Card
              key={conn.id}
              hoverable
              size="small"
              style={{ width: 200, background: '#1f1f1f', border: '1px solid #333' }}
              onClick={() => handleQuickConnect(conn)}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', background: '#555',
                  margin: '0 auto 8px',
                }} />
                <Text style={{ color: '#ddd', display: 'block' }}>{conn.name}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{conn.host}:{conn.port}</Text>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const connected = useStore((s) => s.connected);
  const [collapsed, setCollapsed] = useState(false);
  const [shellHeight, setShellHeight] = useState(250);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const shellHeightRef = useRef(250);

  const handleMouseDown = useCallback(() => {
    draggingRef.current = true;
    setDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    setDragging(false);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const container = document.getElementById('right-panel');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newHeight = Math.max(100, Math.min(rect.height - 200, rect.bottom - e.clientY));
    shellHeightRef.current = newHeight;
    setShellHeight(newHeight);
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#00b96b',
          borderRadius: 6,
        },
      }}
    >
      <AntApp>
        <Layout style={{ height: '100vh', overflow: 'hidden' }}>
          {/* 顶部连接栏 */}
          <ConnectionBar />

          <Layout style={{ flex: 1 }}>
            {/* 左侧边栏 - 始终显示 */}
            <Sider
              width={260}
              collapsedWidth={0}
              collapsible
              collapsed={collapsed}
              onCollapse={setCollapsed}
              style={{
                background: '#1f1f1f',
                borderRight: '1px solid #333',
                overflow: 'auto',
                overflowX: 'hidden',
              }}
            >
              <ConnectionList />
              {connected && <DbTree />}
            </Sider>

            {/* 右侧内容区 */}
            <Content
              id="right-panel"
              style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {connected ? (
                <>
                  <div style={{ flex: 1, overflow: 'auto', padding: 16, minHeight: 0, overflowX: 'hidden' }}>
                    <DocTable />
                  </div>
                  {/* 拖动分隔条 */}
                  <div
                    onMouseDown={handleMouseDown}
                    style={{
                      height: 4, cursor: 'row-resize', background: dragging ? '#00b96b' : '#333',
                      flexShrink: 0, transition: dragging ? 'none' : 'background 0.2s',
                    }}
                    onMouseEnter={e => { if (!dragging) e.target.style.background = '#00b96b'; }}
                    onMouseLeave={e => { if (!dragging) e.target.style.background = '#333'; }}
                  />
                  <div style={{ height: shellHeight, flexShrink: 0, overflow: 'hidden', overflowX: 'hidden' }}>
                    <ShellPanel />
                  </div>
                </>
              ) : (
                <WelcomeScreen />
              )}
            </Content>
          </Layout>
        </Layout>
        <DocEditor />
        <SettingsModal />
        <HelpModal />
        <SchemaModal />
        <IndexModal />
        <ExportImportModal />
        <SyncModal />
      </AntApp>
    </ConfigProvider>
  );
}