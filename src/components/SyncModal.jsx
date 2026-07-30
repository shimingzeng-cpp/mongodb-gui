import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Select, AutoComplete, Space, Typography, message, Tag, Progress, Divider, Radio, Spin } from 'antd';
import { SwapOutlined, DatabaseOutlined, TableOutlined, LinkOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text, Title } = Typography;

export default function SyncModal() {
  const {
    syncOpen, setSyncOpen,
    syncSource, setSyncSource,
    syncTarget, setSyncTarget,
    syncOptions, setSyncOptions,
    syncProgress, setSyncProgress,
    syncResult, setSyncResult,
    connections, activeConnectionId,
  } = useStore();
  const t = useTheme();

  const [syncScope, setSyncScope] = useState('collection'); // 'collection' | 'database'

  // 源/目标 的数据库和集合列表
  const [sourceDbs, setSourceDbs] = useState([]);
  const [sourceCols, setSourceCols] = useState([]);
  const [targetDbs, setTargetDbs] = useState([]);
  const [targetCols, setTargetCols] = useState([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [step, setStep] = useState(1); // 1: source, 2: target, 3: options, 4: confirm
  const [clearTarget, setClearTarget] = useState(false);

  // 连接选项
  const connOptions = connections.map(c => ({
    label: `${c.name} (${c.host}:${c.port})`,
    value: c.id,
  }));

  // 加载源数据库列表
  const loadSourceDbs = async (connId) => {
    if (!connId) return;
    setLoadingSource(true);
    try {
      const conn = connections.find(c => c.id === connId);
      if (!conn) { setSourceDbs([]); setLoadingSource(false); return; }
      try { window.__mongo.getClient(connId); } catch {
        await window.__mongo.connect(connId, conn.uri);
      }
      const dbs = await window.__mongo.listDatabases(connId);
      setSourceDbs(dbs.map(d => ({ label: d.name, value: d.name })));
    } catch {
      setSourceDbs([]);
    }
    setLoadingSource(false);
  };

  const loadSourceCols = async (connId, db) => {
    if (!connId || !db) return;
    setLoadingSource(true);
    try {
      const cols = await window.__mongo.listCollections(connId, db);
      setSourceCols(cols.map(c => ({ label: c.name, value: c.name })));
    } catch {
      setSourceCols([]);
    }
    setLoadingSource(false);
  };

  const loadTargetDbs = async (connId) => {
    if (!connId) return;
    setLoadingTarget(true);
    try {
      const conn = connections.find(c => c.id === connId);
      if (!conn) { setTargetDbs([]); setLoadingTarget(false); return; }
      try { window.__mongo.getClient(connId); } catch {
        await window.__mongo.connect(connId, conn.uri);
      }
      const dbs = await window.__mongo.listDatabases(connId);
      setTargetDbs(dbs.map(d => ({ label: d.name, value: d.name })));
    } catch {
      setTargetDbs([]);
    }
    setLoadingTarget(false);
  };

  const loadTargetCols = async (connId, db) => {
    if (!connId || !db) return;
    setLoadingTarget(true);
    try {
      const cols = await window.__mongo.listCollections(connId, db);
      setTargetCols(cols.map(c => ({ label: c.name, value: c.name })));
    } catch {
      setTargetCols([]);
    }
    setLoadingTarget(false);
  };

  useEffect(() => {
    if (syncOpen) {
      setStep(1);
      setSyncProgress(null);
      setSyncResult(null);
      setSyncSource(null);
      setSyncTarget(null);
      setSourceDbs([]);
      setSourceCols([]);
      setTargetDbs([]);
      setTargetCols([]);
      setSyncScope('collection');
      setClearTarget(false);
    }
  }, [syncOpen]);

  const handleSync = async () => {
    if (!syncSource || !syncTarget) return;
    setSyncing(true);
    setSyncProgress({ total: 0, current: 0, status: '准备中...' });
    setSyncResult(null);

    const sourceConn = connections.find(c => c.id === syncSource.connId);
    const targetConn = connections.find(c => c.id === syncTarget.connId);
    if (!sourceConn || !targetConn) {
      setSyncResult({ success: false, error: '连接配置不存在' });
      setSyncing(false);
      return;
    }

    try {
      // 确保源和目标连接都已建立
      setSyncProgress({ total: 0, current: 0, status: '检查连接...' });
      try { window.__mongo.getClient(syncSource.connId); } catch {
        await window.__mongo.connect(syncSource.connId, sourceConn.uri);
      }
      try { window.__mongo.getClient(syncTarget.connId); } catch {
        await window.__mongo.connect(syncTarget.connId, targetConn.uri);
      }

      const summary = {};

      if (syncScope === 'database') {
        // ====== 同步整个库 ======
        const cols = await window.__mongo.listCollections(syncSource.connId, syncSource.db);
        const allCols = cols.map(c => c.name);

        // 清空目标库
        if (clearTarget) {
          setSyncProgress({ total: 0, current: 0, status: '清空目标库...' });
          const targetColsList = await window.__mongo.listCollections(syncTarget.connId, syncTarget.db);
          for (const tc of targetColsList) {
            try {
              await window.__mongo.dropCollection(syncTarget.connId, syncTarget.db, tc.name);
            } catch (e) {
              // 忽略删除失败
            }
          }
        }

        let totalCols = allCols.length;
        let syncedCols = 0;

        for (const colName of allCols) {
          syncedCols++;
          setSyncProgress({ total: totalCols, current: syncedCols, status: `同步集合 ${colName} (${syncedCols}/${totalCols})` });

          // 确保目标集合存在
          try {
            const targetColsList = await window.__mongo.listCollections(syncTarget.connId, syncTarget.db);
            if (!targetColsList.find(c => c.name === colName)) {
              await window.__mongo.createCollection(syncTarget.connId, syncTarget.db, colName);
            }
          } catch {
            await window.__mongo.createCollection(syncTarget.connId, syncTarget.db, colName);
          }

          // 同步结构
          if (syncOptions.type === 'structure' || syncOptions.type === 'both') {
            try {
              const structResult = await window.__mongo.syncCollectionStructure(
                syncSource.connId, syncSource.db, colName,
                syncTarget.connId, syncTarget.db, colName,
              );
              if (!summary.structure) summary.structure = { indexesCreated: 0, indexesDropped: 0, schemaApplied: false, collections: [] };
              summary.structure.indexesCreated += structResult.indexesCreated;
              summary.structure.indexesDropped += structResult.indexesDropped;
              if (structResult.schemaApplied) summary.structure.schemaApplied = true;
              summary.structure.collections.push(colName);
            } catch (e) {
              // 单个集合结构同步失败不影响其他
            }
          }

          // 同步数据
          if (syncOptions.type === 'data' || syncOptions.type === 'both') {
            try {
              const dataResult = await window.__mongo.syncCollectionData(
                syncSource.connId, syncSource.db, colName,
                syncTarget.connId, syncTarget.db, colName,
                { dataMode: syncOptions.dataMode },
              );
              if (!summary.data) summary.data = { total: 0, inserted: 0, replaced: 0, skipped: 0, collections: 0 };
              summary.data.total += dataResult.total;
              summary.data.inserted += dataResult.inserted;
              summary.data.replaced += dataResult.replaced;
              summary.data.skipped += dataResult.skipped;
              summary.data.collections++;
            } catch (e) {
              // 单个集合数据同步失败不影响其他
            }
          }
        }
      } else {
        // ====== 同步单个集合 ======
        // 确保目标集合存在
        setSyncProgress({ total: 0, current: 0, status: '检查目标集合...' });
        const targetColExists = targetCols.find(c => c.value === syncTarget.collection);
        if (!targetColExists) {
          await window.__mongo.createCollection(syncTarget.connId, syncTarget.db, syncTarget.collection);
        }

        // 同步结构
        if (syncOptions.type === 'structure' || syncOptions.type === 'both') {
          setSyncProgress({ total: 0, current: 0, status: '同步结构...' });
          const structResult = await window.__mongo.syncCollectionStructure(
            syncSource.connId, syncSource.db, syncSource.collection,
            syncTarget.connId, syncTarget.db, syncTarget.collection,
          );
          summary.structure = structResult;
        }

        // 同步数据
        if (syncOptions.type === 'data' || syncOptions.type === 'both') {
          const dataResult = await window.__mongo.syncCollectionData(
            syncSource.connId, syncSource.db, syncSource.collection,
            syncTarget.connId, syncTarget.db, syncTarget.collection,
            {
              dataMode: syncOptions.dataMode,
              onProgress: (p) => {
                setSyncProgress({ ...p, status: `同步数据 ${p.current}/${p.total}` });
              },
            },
          );
          summary.data = dataResult;
        }
      }

      setSyncResult({ success: true, summary });
      setSyncProgress({ total: 0, current: 0, status: '完成' });
      message.success('同步完成');
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
      message.error('同步失败: ' + err.message);
    }
    setSyncing(false);
  };

  const canProceed = () => {
    if (step === 1) {
      if (syncScope === 'database') return syncSource?.connId && syncSource?.db;
      return syncSource?.connId && syncSource?.db && syncSource?.collection;
    }
    if (step === 2) {
      if (syncScope === 'database') return syncTarget?.connId && syncTarget?.db;
      return syncTarget?.connId && syncTarget?.db && syncTarget?.collection;
    }
    return true;
  };

  const isSameTarget = () => {
    if (!syncSource || !syncTarget) return false;
    if (syncScope === 'database') {
      return syncSource.connId === syncTarget.connId && syncSource.db === syncTarget.db;
    }
    return syncSource.connId === syncTarget.connId &&
      syncSource.db === syncTarget.db &&
      syncSource.collection === syncTarget.collection;
  };

  const formatSummary = (summary) => {
    if (!summary) return null;
    const parts = [];
    if (summary.structure) {
      if (summary.structure.collections) {
        parts.push(`覆盖 ${summary.structure.collections} 个集合的结构`);
      } else {
        parts.push(`结构同步完成`);
      }
    }
    if (summary.data) {
      if (summary.data.collections) {
        parts.push(`数据同步 ${summary.data.collections} 个集合，共 ${summary.data.total} 条文档`);
      } else {
        parts.push(`数据同步完成，共 ${summary.data.total} 条文档`);
      }
    }
    return parts.join(' | ');
  };

  return (
    <Modal
      title={<span><SwapOutlined style={{ color: t.accent, marginRight: 8 }} />同步数据</span>}
      open={syncOpen}
      onCancel={() => { if (!syncing) { setSyncOpen(false); setSyncResult(null); } }}
      width={600}
      footer={null}
      destroyOnClose
    >
      {/* 步骤指示器 */}
      {!syncResult && !syncing && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, justifyContent: 'center' }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step >= s ? t.accent : t.border, color: '#fff', fontSize: 12, fontWeight: 'bold',
            }}>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* 同步范围选择器 */}
      {!syncResult && !syncing && step === 1 && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <Radio.Group
            value={syncScope}
            onChange={(e) => {
              setSyncScope(e.target.value);
              setSyncSource(null);
              setSyncTarget(null);
            }}
            buttonStyle="solid"
          >
            <Radio.Button value="collection" icon={<TableOutlined />}>同步表</Radio.Button>
            <Radio.Button value="database" icon={<DatabaseOutlined />}>同步库</Radio.Button>
          </Radio.Group>
        </div>
      )}

      {syncResult ? (
        // 结果展示
        <div>
          {syncResult.success ? (
            <div>
              <Text style={{ color: t.accent, fontSize: 16, display: 'block', textAlign: 'center', marginBottom: 16 }}>
                ✅ 同步完成
              </Text>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <Text type="secondary">{formatSummary(syncResult.summary)}</Text>
              </div>
              {syncResult.summary.structure && (
                <div style={{ background: t.bg.panel, padding: 12, borderRadius: 6, marginBottom: 8 }}>
                  <Text strong style={{ color: t.text.secondary }}>结构同步</Text>
                  <div style={{ marginTop: 4 }}>
                    {syncResult.summary.structure.collections && (
                      <Tag color="cyan">同步 {syncResult.summary.structure.collections} 个集合</Tag>
                    )}
                    <Tag color="blue">删除 {syncResult.summary.structure.indexesDropped} 个索引</Tag>
                    <Tag color="green">创建 {syncResult.summary.structure.indexesCreated} 个索引</Tag>
                    {syncResult.summary.structure.schemaApplied && <Tag color="orange">已应用 Schema 验证</Tag>}
                  </div>
                </div>
              )}
              {syncResult.summary.data && (
                <div style={{ background: t.bg.panel, padding: 12, borderRadius: 6 }}>
                  <Text strong style={{ color: t.text.secondary }}>数据同步</Text>
                  <div style={{ marginTop: 4 }}>
                    {syncResult.summary.data.collections && (
                      <Tag color="cyan">同步 {syncResult.summary.data.collections} 个集合</Tag>
                    )}
                    <Tag color="green">新增 {syncResult.summary.data.inserted} 条</Tag>
                    <Tag color="blue">更新 {syncResult.summary.data.replaced} 条</Tag>
                    {syncResult.summary.data.skipped > 0 && <Tag color="orange">跳过 {syncResult.summary.data.skipped} 条</Tag>}
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">共处理 {syncResult.summary.data.total} 条文档</Text>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Text style={{ color: t.error, fontSize: 16, display: 'block', textAlign: 'center', marginBottom: 16 }}>
                ❌ 同步失败
              </Text>
              <div style={{ background: t.bg.errorBg, padding: 12, borderRadius: 6 }}>
                <Text type="danger">{syncResult.error}</Text>
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button onClick={() => { setSyncOpen(false); setSyncResult(null); }}>关闭</Button>
          </div>
        </div>
      ) : syncing ? (
        // 同步进度
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text style={{ color: t.accent }}>{syncProgress?.status || '同步中...'}</Text>
          </div>
          {syncProgress?.total > 0 && (
            <Progress
              percent={Math.round((syncProgress.current / syncProgress.total) * 100)}
              strokeColor={t.accent}
              style={{ marginTop: 12 }}
            />
          )}
        </div>
      ) : (
        // 配置步骤
        <div>
          {/* Step 1: 选择源 */}
          {step === 1 && (
            <div>
              <Text strong style={{ color: t.accent, display: 'block', marginBottom: 12 }}>
                步骤 1：选择源{syncScope === 'database' ? '数据库' : '数据'}
              </Text>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>连接</Text>
                  <Select
                    value={syncSource?.connId || undefined}
                    onChange={(v) => {
                      setSyncSource({ connId: v, db: null, collection: null });
                      loadSourceDbs(v);
                    }}
                    placeholder="选择源连接"
                    style={{ width: '100%' }}
                    options={connOptions}
                  />
                </div>
                {syncSource?.connId && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>数据库</Text>
                    <Select
                      value={syncSource?.db || undefined}
                      onChange={(v) => {
                        setSyncSource(s => ({ ...s, db: v, collection: null }));
                        if (syncScope === 'collection') loadSourceCols(syncSource.connId, v);
                      }}
                      placeholder="选择源数据库"
                      style={{ width: '100%' }}
                      options={sourceDbs}
                      loading={loadingSource}
                      showSearch
                    />
                  </div>
                )}
                {/* 同步表模式下才显示集合选择器 */}
                {syncScope === 'collection' && syncSource?.db && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>集合</Text>
                    <Select
                      value={syncSource?.collection || undefined}
                      onChange={(v) => setSyncSource(s => ({ ...s, collection: v }))}
                      placeholder="选择源集合"
                      style={{ width: '100%' }}
                      options={sourceCols}
                      loading={loadingSource}
                      showSearch
                    />
                  </div>
                )}
              </Space>
            </div>
          )}

          {/* Step 2: 选择目标 */}
          {step === 2 && (
            <div>
              <Text strong style={{ color: t.accent, display: 'block', marginBottom: 12 }}>
                步骤 2：选择目标位置
              </Text>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>连接</Text>
                  <Select
                    value={syncTarget?.connId || undefined}
                    onChange={(v) => {
                      setSyncTarget({ connId: v, db: null, collection: null });
                      loadTargetDbs(v);
                    }}
                    placeholder="选择目标连接"
                    style={{ width: '100%' }}
                    options={connOptions}
                  />
                </div>
                {syncTarget?.connId && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>数据库</Text>
                    <AutoComplete
                      value={syncTarget?.db || undefined}
                      onChange={(v) => {
                        setSyncTarget(s => ({ ...s, db: v, collection: null }));
                        if (syncScope === 'collection') loadTargetCols(syncTarget.connId, v);
                      }}
                      placeholder="输入目标数据库名称（可新建）"
                      style={{ width: '100%' }}
                      options={targetDbs}
                      allowClear
                      filterOption={(inputValue, option) =>
                        option.value.toLowerCase().includes(inputValue.toLowerCase())
                      }
                    />
                  </div>
                )}
                {/* 同步表模式下才显示集合选择器 */}
                {syncScope === 'collection' && syncTarget?.db && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>集合</Text>
                    <AutoComplete
                      value={syncTarget?.collection || undefined}
                      onChange={(v) => setSyncTarget(s => ({ ...s, collection: v }))}
                      placeholder="输入目标集合名称（可新建）"
                      style={{ width: '100%' }}
                      options={targetCols}
                      allowClear
                      filterOption={(inputValue, option) =>
                        option.value.toLowerCase().includes(inputValue.toLowerCase())
                      }
                    />
                  </div>
                )}
              </Space>

              {isSameTarget() && (
                <div style={{
                  background: t.bg.warning, border: '1px solid #ffcc80', borderRadius: 4,
                  padding: '8px 12px', marginTop: 12, fontSize: 12,
                }}>
                  ⚠️ 源和目标相同，建议创建新的目标数据库或选择不同的集合
                </div>
              )}
            </div>
          )}

          {/* Step 3: 同步选项 */}
          {step === 3 && (
            <div>
              <Text strong style={{ color: t.accent, display: 'block', marginBottom: 12 }}>
                步骤 3：同步选项
              </Text>
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>同步类型</Text>
                <Radio.Group
                  value={syncOptions.type}
                  onChange={(e) => setSyncOptions({ type: e.target.value })}
                >
                  <Space direction="vertical">
                    <Radio value="both">结构 + 数据（索引、验证规则、文档）</Radio>
                    <Radio value="structure">仅结构（索引、验证规则）</Radio>
                    <Radio value="data">仅数据（文档）</Radio>
                  </Space>
                </Radio.Group>
              </div>

              {(syncOptions.type === 'data' || syncOptions.type === 'both') && (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>数据同步模式</Text>
                  <Radio.Group
                    value={syncOptions.dataMode}
                    onChange={(e) => setSyncOptions({ dataMode: e.target.value })}
                  >
                    <Space direction="vertical">
                      <Radio value="upsert">覆盖（按 _id 匹配并替换，不匹配则新增）</Radio>
                      <Radio value="append">追加（跳过已存在的文档，仅新增）</Radio>
                      <Radio value="replace">替换（删除已存在的文档，重新插入）</Radio>
                    </Space>
                  </Radio.Group>
                </div>
              )}

              {/* 同步库模式下显示清空选项 */}
              {syncScope === 'database' && (
                <div style={{ marginTop: 16, padding: '12px', background: t.bg.panel, borderRadius: 6 }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={clearTarget}
                      onChange={(e) => setClearTarget(e.target.checked)}
                      style={{ accentColor: t.accent }}
                    />
                    <Text style={{ color: t.warningAlt }}>同步前清空目标库（删除所有已有集合）</Text>
                  </label>
                  {clearTarget && (
                    <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4, marginLeft: 24 }}>
                      ⚠️ 将删除目标数据库中所有集合和数据，不可撤销！
                    </Text>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: 确认 */}
          {step === 4 && (
            <div>
              <Text strong style={{ color: t.accent, display: 'block', marginBottom: 12 }}>
                步骤 4：确认同步
              </Text>
              <div style={{ background: t.bg.panel, padding: 16, borderRadius: 6 }}>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">同步范围：</Text>
                  <Text style={{ color: t.text.primary }}>
                    {syncScope === 'database' ? '同步整个数据库' : '同步单个集合'}
                  </Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">源：</Text>
                  <Text style={{ color: t.text.primary }}>
                    {syncSource?.connId && connections.find(c => c.id === syncSource.connId)?.name} / {syncSource?.db}
                    {syncSource?.collection && ` / ${syncSource.collection}`}
                  </Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">目标：</Text>
                  <Text style={{ color: t.text.primary }}>
                    {syncTarget?.connId && connections.find(c => c.id === syncTarget.connId)?.name} / {syncTarget?.db}
                    {syncTarget?.collection && ` / ${syncTarget.collection}`}
                  </Text>
                </div>
                <Divider style={{ borderColor: t.border, margin: '8px 0' }} />
                {syncScope === 'database' && clearTarget && (
                  <div style={{ marginBottom: 8 }}>
                    <Text type="danger">⚠️ 将清空目标库中所有已有集合和数据</Text>
                  </div>
                )}
                <div>
                  <Text type="secondary">同步类型：</Text>
                  <Text style={{ color: t.text.primary }}>
                    {syncOptions.type === 'both' ? '结构 + 数据' : syncOptions.type === 'structure' ? '仅结构' : '仅数据'}
                  </Text>
                </div>
                {(syncOptions.type === 'data' || syncOptions.type === 'both') && (
                  <div>
                    <Text type="secondary">数据模式：</Text>
                    <Text style={{ color: t.text.primary }}>
                      {syncOptions.dataMode === 'upsert' ? '覆盖（upsert）' : syncOptions.dataMode === 'append' ? '追加' : '替换'}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 导航按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              disabled={step === 1}
              onClick={() => setStep(s => s - 1)}
            >
              上一步
            </Button>
            {step < 4 ? (
              <Button
                type="primary"
                disabled={!canProceed()}
                onClick={() => setStep(s => s + 1)}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SwapOutlined />}
                onClick={handleSync}
                disabled={isSameTarget()}
              >
                开始同步
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}