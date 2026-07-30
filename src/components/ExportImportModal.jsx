import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Space, Typography, message, Tag } from 'antd';
import { ExportOutlined, ImportOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text, Title } = Typography;

export default function ExportImportModal() {
  const { selectedDb, selectedCollection, exportOpen, setExportOpen, triggerReload, activeConnectionId } = useStore();
  const t = useTheme();
  const [tab, setTab] = useState('export');
  const [format, setFormat] = useState('json');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [importMode, setImportMode] = useState('overwrite'); // 'append' | 'overwrite'

  const handleExport = async () => {
    if (!selectedDb || !selectedCollection) return;
    setLoading(true);
    try {
      const result = await window.__mongo.exportCollection(activeConnectionId, selectedDb, selectedCollection, format);
      const ext = format === 'csv' ? 'csv' : 'json';
      const defaultName = `${selectedCollection}.${ext}`;
      const saveResult = await window.__dialog.saveFile(defaultName, result.data);
      if (saveResult.success) {
        message.success(`导出成功: ${saveResult.filePath}`);
      }
    } catch (err) { message.error('导出失败: ' + err.message); }
    setLoading(false);
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const result = await window.__dialog.openFile([
        { name: 'JSON / CSV', extensions: ['json', 'csv'] },
      ]);
      if (!result.success) { setLoading(false); return; }

      const ext = result.filePath.split('.').pop().toLowerCase();
      let docs;

      if (ext === 'csv') {
        // 解析 CSV
        const lines = result.content.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV 文件格式错误：至少需要标题行和一行数据');
        const headers = parseCSVLine(lines[0]);
        docs = lines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const doc = {};
          headers.forEach((h, i) => {
            let val = values[i] || '';
            if (val === '') return;
            // 尝试转数字
            if (!isNaN(val) && val.trim()) val = Number(val);
            if (val === 'true') val = true;
            if (val === 'false') val = false;
            doc[h] = val;
          });
          return doc;
        });
      } else {
        docs = JSON.parse(result.content);
      }

      if (importMode === 'overwrite') {
        // 覆盖模式：先清空集合，再导入
        await window.__mongo.importCollection(activeConnectionId, selectedDb, selectedCollection, docs, true);
        message.success(`导入完成：已覆盖导入 ${docs.length} 条数据`);
      } else {
        const importResult = await window.__mongo.importCollection(activeConnectionId, selectedDb, selectedCollection, docs);
        let msg = `导入完成：新增 ${importResult.insertedCount} 条`;
        if (importResult.replacedCount) msg += `，覆盖 ${importResult.replacedCount} 条`;
        message.success(msg);
      }
      triggerReload();
      setExportOpen(false);
    } catch (err) { message.error('导入失败: ' + err.message); }
    setLoading(false);
  };

  // CSV 行解析器（支持引号内的逗号）
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const handlePreview = async () => {
    try {
      const result = await window.__mongo.exportCollection(activeConnectionId, selectedDb, selectedCollection, 'json');
      const data = JSON.parse(result.data);
      setPreview(data.slice(0, 5));
    } catch (err) { message.error('预览失败: ' + err.message); }
  };

  useEffect(() => {
    if (exportOpen && tab === 'export') {
      setPreview(null);
    }
  }, [exportOpen, tab]);

  return (
    <Modal
      title={<span><DownloadOutlined style={{ color: t.accent, marginRight: 8 }} />导出/导入数据</span>}
      open={exportOpen}
      onCancel={() => { setExportOpen(false); setPreview(null); }}
      width={600}
      footer={null}
    >
      <div style={{ marginBottom: 12 }}>
        <Space>
          <Button type={tab === 'export' ? 'primary' : 'default'} size="small" icon={<ExportOutlined />} onClick={() => setTab('export')}>导出</Button>
          <Button type={tab === 'import' ? 'primary' : 'default'} size="small" icon={<ImportOutlined />} onClick={() => setTab('import')}>导入</Button>
        </Space>
      </div>

      {tab === 'export' ? (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              集合：<Text code>{selectedDb}.{selectedCollection}</Text>
            </Text>
            <Space>
              <Select value={format} onChange={setFormat} size="small" style={{ width: 100 }}
                options={[
                  { label: 'JSON', value: 'json' },
                  { label: 'CSV', value: 'csv' },
                ]} />
              <Button type="primary" icon={<ExportOutlined />} loading={loading} onClick={handleExport}>导出</Button>
              <Button size="small" onClick={handlePreview}>预览前5条</Button>
            </Space>
          </div>
          {preview && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>预览：</Text>
              <pre style={{
                background: t.bg.code, color: t.accent, padding: 8, borderRadius: 4,
                maxHeight: 200, overflow: 'auto', fontSize: 12, marginTop: 4,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            导入到集合：<Text code>{selectedDb}.{selectedCollection}</Text>
          </Text>
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>导入模式：</Text>
              <Button
                size="small"
                type={importMode === 'append' ? 'primary' : 'default'}
                onClick={() => setImportMode('append')}
              >
                追加
              </Button>
              <Button
                size="small"
                type={importMode === 'overwrite' ? 'primary' : 'default'}
                onClick={() => setImportMode('overwrite')}
                danger={importMode === 'overwrite'}
              >
                覆盖
              </Button>
            </Space>
          </div>
          {importMode === 'overwrite' && (
            <div style={{
              padding: '6px 10px', marginBottom: 12, fontSize: 12,
              color: t.warning,
            }}>
              ⚠️ 覆盖模式会先<strong>清空集合中所有数据</strong>，再导入文件内容，该操作不可撤销！
            </div>
          )}
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            选择 JSON 或 CSV 文件导入数据。
          </Text>
          <Button icon={<ImportOutlined />} loading={loading} onClick={handleImport}>选择文件并导入</Button>
        </div>
      )}
    </Modal>
  );
}