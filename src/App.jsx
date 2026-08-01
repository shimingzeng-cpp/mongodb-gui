import React, { useState } from 'react';
import { Layout, ConfigProvider, theme, App as AntApp, Button, Typography, Card, Space } from 'antd';
import { PlusOutlined, LinkOutlined, RobotOutlined, DatabaseOutlined } from '@ant-design/icons';
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
      background: `linear-gradient(180deg, ${t.bg.primary} 0%, ${t.bg.sidebar} 100%)`,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: `linear-gradient(135deg, ${t.accent}, ${t.info})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, boxShadow: `0 8px 24px ${t.accent}33`,
      }}>
        <DatabaseOutlined style={{ fontSize: 28, color: '#fff' }} />
      </div>
      <Title level={3} style={{ color: t.text.primary, margin: 0, fontWeight: 600 }}>MongoBuddy</Title>
      <Text style={{ color: t.text.secondary, marginBottom: 32, fontSize: 14 }}>
        选择连接开始使用
      </Text>
      {connections.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600 }}>
          {connections.map(conn => (
            <Card
              key={conn.id}
              hoverable
              size="small"
              style={{
                width: 200, background: t.bg.card, border: `1px solid ${t.border}`,
                borderRadius: 12, transition: 'all 0.2s',
              }}
              styles={{ body: { padding: 16 } }}
              onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
              onClick={() => handleQuickConnect(conn)}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px',
                }}>
                  <DatabaseOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <Text style={{ color: t.text.primary, display: 'block', fontWeight: 500, marginBottom: 2 }}>{conn.name}</Text>
                <Text style={{ color: t.text.subtle, fontSize: 11 }}>{conn.host}:{conn.port}</Text>
              </div>
            </Card>
          ))}
        </div>
      )}
      {connections.length === 0 && (
        <div style={{ textAlign: 'center', color: t.text.muted, padding: 20 }}>
          <Text style={{ color: t.text.subtle }}>还没有连接，请点击左侧 + 添加连接</Text>
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
          borderRadius: 8,
          colorBgContainer: t.bg.primary,
          colorBgElevated: t.bg.sidebar,
          colorBorder: t.border,
          colorText: t.text.primary,
          colorTextSecondary: t.text.secondary,
          colorBgTextHover: t.bg.hover,
          colorBgTextActive: t.bg.highlight,
          boxShadow: t.shadow,
          fontSize: 13,
          controlHeight: 32,
          paddingContentVertical: 8,
          paddingContentHorizontal: 16,
          marginXS: 4,
          marginSM: 8,
        },
        components: {
          Table: {
            headerBg: appTheme === 'dark' ? '#1a1a1a' : '#fafafa',
            headerColor: t.text.secondary,
            rowHoverBg: t.bg.hover,
            borderColor: t.border,
            padding: 8,
          },
          Modal: {
            headerBg: t.bg.primary,
            contentBg: t.bg.primary,
            footerBg: t.bg.primary,
          },
          Input: {
            colorBgContainer: t.bg.input,
            colorBorder: t.border,
          },
          Select: {
            colorBgContainer: t.bg.input,
            colorBorder: t.border,
          },
          Button: {
            borderRadius: 6,
            controlHeight: 30,
          },
          Tag: {
            borderRadius: 4,
          },
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