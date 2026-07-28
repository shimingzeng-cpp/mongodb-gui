import React, { useState, useCallback, useRef } from 'react';
import { Layout, ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ConnectionBar from './components/ConnectionBar';
import DbTree from './components/DbTree';
import DocTable from './components/DocTable';
import DocEditor from './components/DocEditor';
import ShellPanel from './components/ShellPanel';
import SettingsModal from './components/SettingsModal';
import useStore from './store';

const { Sider, Content } = Layout;

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
        <Layout style={{ height: '100vh' }}>
          {/* 顶部连接栏 */}
          <ConnectionBar />

          {connected ? (
            <Layout style={{ flex: 1 }}>
              {/* 左侧数据库树 */}
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
                }}
              >
                <DbTree />
              </Sider>

              {/* 右侧内容区 */}
              <Content
                id="right-panel"
                style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div style={{ flex: 1, overflow: 'auto', padding: 16, minHeight: 0 }}>
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
                <div style={{ height: shellHeight, flexShrink: 0, overflow: 'hidden' }}>
                  <ShellPanel />
                </div>
              </Content>
            </Layout>
          ) : (
            <Content
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                color: '#666',
                fontSize: 16,
              }}
            >
              请先连接 MongoDB 数据库
            </Content>
          )}
        </Layout>
        <DocEditor />
        <SettingsModal />
      </AntApp>
    </ConfigProvider>
  );
}