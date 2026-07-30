import React from 'react';
import { Modal, Typography, Divider, Tag } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

const { Text, Title, Paragraph } = Typography;

const tips = [
  {
    title: '连接数据库',
    content: '在左侧连接管理中点击已保存的连接，或右键 → 编辑连接。支持多连接同时管理。',
  },
  {
    title: '浏览数据',
    content: '左侧点击数据库展开，再点击集合（表），右侧即可查看文档数据。',
  },
  {
    title: '分页与大数据量',
    content: '表格支持每页 50/100/500/5000/10000/20000 条，万级数据使用虚拟滚动，不会卡死。',
    tags: ['虚拟滚动', '50~20000条/页'],
  },
  {
    title: '查询筛选',
    content: '点击"筛选"按钮展开，选择字段、操作符（=、>、< 等），输入值，点击"查询"。支持多条件 AND 组合。',
    tags: ['高级模式', 'JSON 查询', '显示 Shell 命令'],
  },
  {
    title: '新建数据库',
    content: '在左侧数据库区域点击 + 按钮 → 新建数据库，输入库名和集合名即可。',
  },
  {
    title: '新建集合（表）',
    content: '选中数据库后点 + 按钮，或右键数据库名称 → 新建集合。',
  },
  {
    title: '新建/编辑文档',
    content: '点击"新建文档"按钮，填写字段名、选择类型、输入值，点"创建"。编辑时自动识别字段类型。',
    tags: ['支持 BSON 类型', 'String/Int32/Double/ObjectId/Date 等'],
  },
  {
    title: 'Shell 命令行',
    content: '底部 Shell 面板输入 MongoDB 命令，Ctrl+Enter 执行。按 ↑↓ 浏览历史，Tab 补全。查询结果以表格展示。',
    tags: ['db.col.find()', 'Ctrl+Enter 执行', 'Tab 补全'],
  },
  {
    title: 'AI 助手',
    content: '点击顶部 🤖 按钮打开右侧 AI 面板，点击 ⚙ 设置 API Key，用自然语言描述需求即可自动生成并执行 MongoDB 命令。',
    tags: ['OpenAI', 'DeepSeek', 'Ollama', '自动执行'],
  },
  {
    title: '暗色/亮色模式',
    content: '点击顶部 🌙/☀️ 按钮切换主题，支持暗色和亮色两种模式，选择后自动保存。',
  },
  {
    title: '导出/导入数据',
    content: '点击"导出"按钮，选择 JSON 或 CSV 格式导出。导入支持追加和覆盖模式。',
  },
  {
    title: '多库同步',
    content: '点击"同步"按钮，支持跨连接、跨数据库同步集合结构和数据。',
    tags: ['结构同步', '数据同步', '增量/全量'],
  },
  {
    title: '删除操作',
    content: '右键集合名称 → 删除集合。文档表格中每行有删除按钮。',
  },
  {
    title: '快捷键',
    content: 'Ctrl+Enter 执行 Shell 命令 | F12 开发者工具',
  },
];

export default function HelpModal() {
  const { helpOpen, setHelpOpen } = useStore();
  const t = useTheme();

  return (
    <Modal
      title={<span><QuestionCircleOutlined style={{ color: t.accent, marginRight: 8 }} />使用帮助</span>}
      open={helpOpen}
      onCancel={() => setHelpOpen(false)}
      footer={null}
      width={600}
    >
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {tips.map((tip, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14, color: t.accent }}>
              {i + 1}. {tip.title}
            </Text>
            <Paragraph style={{ margin: '4px 0 0', color: t.text.secondary, fontSize: 13 }}>
              {tip.content}
            </Paragraph>
            {tip.tags && (
              <div style={{ marginTop: 4 }}>
                {tip.tags.map(t => <Tag key={t} color="green" style={{ fontSize: 11 }}>{t}</Tag>)}
              </div>
            )}
          </div>
        ))}
        <Divider style={{ margin: '12px 0', borderColor: t.border }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          国产开源MongoDB可视化工具 v1.0 | 右键操作更便捷
        </Text>
      </div>
    </Modal>
  );
}