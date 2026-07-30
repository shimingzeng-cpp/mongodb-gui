import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Space, Typography, message, Progress, Spin, Tag, Alert, Divider } from 'antd';
import { DownloadOutlined, UploadOutlined, FolderOpenOutlined, DatabaseOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text } = Typography;

export default function BackupModal() {
  const {
    backupOpen, setBackupOpen,
    backupProgress, setBackupProgress,
    backupResult, setBackupResult,
    backupSelectedDb, setBackupSelectedDb,
    databases, activeConnectionId,
    setDatabases, doRefresh, triggerReload,
    setSelectedDb,
  } = useStore();
  const t = useTheme();

  const [tab, setTab] = useState('backup'); // 'backup' | 'restore'
  const [backupDir, setBackupDir] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [selectedCols, setSelectedCols] = useState([]);
  const [restoreMode, setRestoreMode] = useState('upsert');
  const [working, setWorking] = useState(false);
  const [step, setStep] = useState('select'); // 'select' | 'config' | 'progress' | 'result'
  const [restoreTargetDb, setRestoreTargetDb] = useState(null);

  const reset = () => {
    setTab('backup');
    setBackupDir(null);
    setManifest(null);
    setSelectedCols([]);
    setRestoreMode('upsert');
    setRestoreTargetDb(null);
    setWorking(false);
    setStep('select');
    setBackupProgress(null);
    setBackupResult(null);
  };

  useEffect(() => {
    if (backupOpen) reset();
  }, [backupOpen]);

  // 选择备份目录（恢复模式）
  const handleSelectBackupDir = async () => {
    const result = await window.__dialog.selectDirectory();
    if (result.success) {
      setBackupDir(result.directory);
      try {
        const fs = require('fs');
        const path = require('path');
        const manifestPath = path.join(result.directory, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          setManifest(data);
          setSelectedCols(data.collections.map(c => c.name));
          setRestoreTargetDb(data.databaseName);
          setStep('config');
        } else {
          message.error('所选目录不包含有效的备份（未找到 manifest.json）');
        }
      } catch (err) {
        message.error('读取备份目录失败: ' + err.message);
      }
    }
  };

  // 开始备份
  const handleBackup = async () => {
    if (!backupSelectedDb) {
      message.warning('请选择要备份的数据库');
      return;
    }
    setWorking(true);
    setStep('progress');
    setBackupProgress({ total: 0, current: 0, status: '选择目录...', collectionName: '' });

    // 选择备份目录
    const dirResult = await window.__dialog.selectDirectory();
    if (!dirResult.success) {
      setWorking(false);
      setStep('select');
      return;
    }

    const db = backupSelectedDb;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const backupPath = require('path').join(dirResult.directory, `${db}_${ts}`);

    try {
      setBackupProgress({ total: 0, current: 0, status: '备份中...', collectionName: '' });
      const result = await window.__mongo.backupDatabase(
        activeConnectionId, db, backupPath,
        (p) => setBackupProgress({ ...p })
      );
      setBackupProgress({ total: result.totalDocuments, current: result.totalDocuments, status: 'done', collectionName: '' });
      setBackupResult({ success: true, summary: result });
      setStep('result');
      message.success(`备份完成: ${result.totalDocuments} 条文档，${result.collectionCount} 个集合`);
    } catch (err) {
      setBackupResult({ success: false, error: err.message });
      setStep('result');
      message.error('备份失败: ' + err.message);
    }
    setWorking(false);
  };

  // 开始恢复
  const handleRestore = async () => {
    if (!manifest || !backupDir) return;
    setWorking(true);
    setStep('progress');
    setBackupProgress({ total: selectedCols.length, current: 0, status: '恢复中...', collectionName: '' });

    try {
      const result = await window.__mongo.restoreDatabase(
        activeConnectionId, restoreTargetDb, backupDir,
        { collections: selectedCols, dataMode: restoreMode },
        (p) => setBackupProgress({ ...p })
      );
      setBackupProgress({ total: result.totalDocuments, current: result.totalDocuments, status: 'done', collectionName: '' });
      setBackupResult({ success: true, summary: result });
      setStep('result');
      message.success(`恢复完成: ${result.totalDocuments} 条文档`);

      // 刷新数据库列表和 UI
      try {
        const dbs = await window.__mongo.listDatabases(activeConnectionId);
        setDatabases(dbs);
        doRefresh();
        triggerReload();
      } catch {}
    } catch (err) {
      setBackupResult({ success: false, error: err.message });
      setStep('result');
      message.error('恢复失败: ' + err.message);
    }
    setWorking(false);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  // 渲染进度
  const renderProgress = () => {
    if (!backupProgress) return null;
    const { total, current, status } = backupProgress;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <Spin size="large" style={{ marginBottom: 16 }} />
        <div style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text.primary }}>
            {status === 'backing up' && `正在备份: ${backupProgress.collectionName || ''}`}
            {status === 'restoring' && `正在恢复: ${backupProgress.collectionName || ''}`}
            {status === 'preparing' && '准备中...'}
            {status === '选择目录...' && '请选择备份保存目录...'}
            {status === '备份中...' && '备份中...'}
            {status === '恢复中...' && '恢复中...'}
            {status === 'done' && '完成'}
          </Text>
        </div>
        {total > 0 && (
          <Progress percent={percent} status={status === 'done' ? 'success' : 'active'} style={{ maxWidth: 400, margin: '0 auto' }} />
        )}
        {total > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>{current} / {total}</Text>
        )}
      </div>
    );
  };

  // 渲染结果
  const renderResult = () => {
    if (!backupResult) return null;
    if (backupResult.success) {
      const summary = backupResult.summary;
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ color: t.text.primary, fontSize: 16 }}>
              {tab === 'backup' ? '备份完成' : '恢复完成'}
            </Text>
          </div>
          <div style={{ background: t.bg.panel, borderRadius: 6, padding: 16, textAlign: 'left', marginBottom: 16 }}>
            <div style={{ marginBottom: 4 }}><Text type="secondary">总文档数：</Text><Text>{summary.totalDocuments}</Text></div>
            {tab === 'backup' && (
              <>
                <div style={{ marginBottom: 4 }}><Text type="secondary">集合数：</Text><Text>{summary.collectionCount}</Text></div>
                {summary.collections && summary.collections.map(c => (
                  <div key={c.name} style={{ marginLeft: 16, fontSize: 12 }}>
                    <Text type="secondary">{c.name}：</Text><Text>{c.documentCount} 条</Text>
                  </div>
                ))}
              </>
            )}
            {tab === 'restore' && (
              <>
                <div style={{ marginBottom: 4 }}><Text type="secondary">插入：</Text><Text>{summary.inserted}</Text></div>
                <div style={{ marginBottom: 4 }}><Text type="secondary">替换：</Text><Text>{summary.replaced}</Text></div>
                <div style={{ marginBottom: 4 }}><Text type="secondary">集合数：</Text><Text>{summary.collectionCount}</Text></div>
              </>
            )}
          </div>
          <Space>
            <Button type="primary" onClick={() => { setBackupOpen(false); reset(); }}>关闭</Button>
            {tab === 'restore' && (
              <Button onClick={() => {
                setBackupOpen(false);
                reset();
                setSelectedDb(restoreTargetDb);
              }}>查看数据</Button>
            )}
          </Space>
        </div>
      );
    }
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: t.text.primary, fontSize: 16 }}>操作失败</Text>
        </div>
        <Alert type="error" message={backupResult.error} style={{ marginBottom: 16, textAlign: 'left' }} />
        <Button onClick={() => setStep('select')}>返回</Button>
      </div>
    );
  };

  return (
    <Modal
      title={<span><DownloadOutlined style={{ color: t.accent, marginRight: 8 }} />备份 / 恢复</span>}
      open={backupOpen}
      onCancel={() => { if (!working) { setBackupOpen(false); reset(); } }}
      width={560}
      footer={null}
      destroyOnClose
    >
      {/* 模式选择 */}
      {step === 'select' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Button
              type={tab === 'backup' ? 'primary' : 'default'}
              icon={<DownloadOutlined />}
              onClick={() => setTab('backup')}
              size="large"
              style={{ flex: 1, height: 60 }}
            >
              <div>
                <div>备份</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>将数据库导出到文件</div>
              </div>
            </Button>
            <Button
              type={tab === 'restore' ? 'primary' : 'default'}
              icon={<UploadOutlined />}
              onClick={() => setTab('restore')}
              size="large"
              style={{ flex: 1, height: 60 }}
            >
              <div>
                <div>恢复</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>从备份文件恢复</div>
              </div>
            </Button>
          </div>

          {tab === 'backup' ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>选择要备份的数据库</Text>
                <Select
                  value={backupSelectedDb}
                  onChange={setBackupSelectedDb}
                  placeholder="选择数据库"
                  style={{ width: '100%' }}
                  options={(databases || []).map(d => ({ label: d.name, value: d.name }))}
                  showSearch
                />
              </div>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleBackup} disabled={!backupSelectedDb}>
                开始备份
              </Button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>选择备份目录</Text>
                <Button icon={<FolderOpenOutlined />} onClick={handleSelectBackupDir} size="large" style={{ width: '100%', height: 50 }}>
                  选择备份目录
                </Button>
              </div>
              {backupDir && (
                <div style={{ background: t.bg.panel, borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: t.text.secondary }}>{backupDir}</Text>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 恢复配置 */}
      {step === 'config' && manifest && (
        <div>
          <div style={{ background: t.bg.panel, borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 4 }}>
              <DatabaseOutlined style={{ color: t.accent, marginRight: 6 }} />
              <Text strong style={{ color: t.text.primary }}>{manifest.databaseName}</Text>
            </div>
            <div style={{ fontSize: 12, color: t.text.secondary, marginBottom: 4 }}>
              创建时间：{new Date(manifest.createdAt).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: t.text.secondary }}>
              集合：{manifest.totalCollections} | 文档：{manifest.totalDocuments}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>目标数据库</Text>
            <Select
              value={restoreTargetDb}
              onChange={setRestoreTargetDb}
              style={{ width: '100%' }}
              options={[
                ...(databases || []).map(d => ({ label: d.name, value: d.name })),
                { label: manifest.databaseName, value: manifest.databaseName },
              ]}
              showSearch
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>选择要恢复的集合</Text>
            <div style={{ maxHeight: 150, overflow: 'auto', background: t.bg.panel, borderRadius: 6, padding: 8 }}>
              {manifest.collections.map(c => (
                <div
                  key={c.name}
                  onClick={() => {
                    if (selectedCols.includes(c.name)) {
                      setSelectedCols(selectedCols.filter(n => n !== c.name));
                    } else {
                      setSelectedCols([...selectedCols, c.name]);
                    }
                  }}
                  style={{
                    cursor: 'pointer', padding: '4px 8px', borderRadius: 4, marginBottom: 2,
                    background: selectedCols.includes(c.name) ? t.bg.highlight : 'transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: t.text.primary, fontSize: 13 }}>
                    {selectedCols.includes(c.name) ? '☑' : '☐'} {c.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{c.documentCount} 条</Text>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>恢复模式</Text>
            <Select
              value={restoreMode}
              onChange={setRestoreMode}
              style={{ width: '100%' }}
              options={[
                { label: 'Upsert（按 _id 替换已有文档）', value: 'upsert' },
                { label: 'Insert（直接插入，跳过冲突）', value: 'insert' },
                { label: 'Drop & Insert（删除集合后重新插入）', value: 'drop' },
              ]}
            />
          </div>

          <Space>
            <Button type="primary" icon={<UploadOutlined />} onClick={handleRestore} disabled={selectedCols.length === 0}>
              开始恢复
            </Button>
            <Button onClick={() => setStep('select')}>返回</Button>
          </Space>
        </div>
      )}

      {/* 进度 */}
      {step === 'progress' && renderProgress()}

      {/* 结果 */}
      {step === 'result' && renderResult()}
    </Modal>
  );
}