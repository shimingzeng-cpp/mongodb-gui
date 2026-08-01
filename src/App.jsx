import React, { useState } from 'react';
import { Layout, ConfigProvider, theme, App as AntApp, Button, Typography, Card, Space } from 'antd';
import { PlusOutlined, LinkOutlined, RobotOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import ConnectionBar from './components/ConnectionBar';
import ConnectionList from './components/ConnectionList';
import DbTree from './components/DbTree';
import DocTable from './components/DocTable';
import DocEditor from './components/DocEditor';
import ShellPanel from './components/ShellPanel';
import ChatPanel from './components/ChatPanel';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import SchemaModal from './components/SchemaModal';
import IndexModal from './components/IndexModal';
import ExportImportModal from './components/ExportImportModal';
import SyncModal from './components/SyncModal';
import BackupModal from './components/BackupModal';
import useStore from './store';
import { useTheme } from './theme';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

function WelcomeScreen() {
  const { connections, setConnectionLoading, setConnected, setUri, setActiveConnectionId, setDatabases, setSelectedDb, setSelectedCollection, setDocuments, setPage } = useStore();
  const [connecting, setConnecting] = useState(null);
  const t = useTheme();

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
      <Title level={3} style={{ color: t.text.secondary, marginBottom: 8 }}>欢迎使用 MongoBuddy</Title>
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
              style={{ width: 200, background: t.bg.card, border: `1px solid ${t.border}` }}
              onClick={() => handleQuickConnect(conn)}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', background: t.muted,
                  margin: '0 auto 8px',
                }} />
                <Text style={{ color: t.text.primary, display: 'block' }}>{conn.name}</Text>
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
  const appTheme = useStore((s) => s.theme);
  const aiOpen = useStore((s) => s.aiOpen);
  const t = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: appTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
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
                background: t.bg.sidebar,
                borderRight: `1px solid ${t.border}`,
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
            >
              {connected ? (
                <>
                  <div style={{ flex: 1, overflow: 'hidden', padding: 16, minHeight: 0 }}>
                    <DocTable />
                  </div>
                  <div style={{ height: 350, flexShrink: 0, overflow: 'hidden' }}>
                    <ShellPanel />
                  </div>
                </>
              ) : (
                <WelcomeScreen />
              )}
            </Content>

            {/* AI 助手侧边栏 */}
            {aiOpen && (
              <div style={{
                width: 320, borderLeft: `1px solid ${t.border}`,
                background: t.bg.sidebar, display: 'flex', flexDirection: 'column', flexShrink: 0,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderBottom: `1px solid ${t.border}`,
                }}>
                  <Space>
                    <RobotOutlined style={{ color: t.info }} />
                    <Text strong style={{ color: t.text.primary, fontSize: 13 }}>AI 助手</Text>
                  </Space>
                  <Button type="text" size="small" onClick={() => useStore.getState().setAiOpen(false)}
                    style={{ color: t.text.secondary, fontSize: 16, lineHeight: 1 }}>✕</Button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ChatPanel />
                </div>
              </div>
            )}
          </Layout>
        </Layout>
        <DocEditor />
        <SettingsModal />
        <HelpModal />
        <SchemaModal />
        <IndexModal />
        <ExportImportModal />
        <SyncModal />
        <BackupModal />
      </AntApp>
    </ConfigProvider>
  );
}