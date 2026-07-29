import React from 'react';
import { Modal, Typography, Divider, Tag } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import useStore from '../store';

const { Text, Title, Paragraph } = Typography;

const tips = [
  {
    title: '连接数据库',
    content: '在顶部输入框填入 MongoDB 连接地址，默认 mongodb://localhost:27017，点击"连接"按钮。',
  },
  {
    title: '浏览数据',
    content: '左侧点击数据库展开，再点击集合（表），右侧即可查看文档数据。',
  },
  {
    title: '查询筛选',
    content: '选择字段、操作符（=、>、< 等），输入值，点击"查询"。支持多条件 AND 组合。',
    tags: ['高级模式', '支持 JSON 查询'],
  },
  {
    title: '新建数据库',
    content: '在左侧空白区域右键 → 新建数据库，输入库名和集合名即可。',
  },
  {
    title: '新建集合（表）',
    content: '选中数据库后点 + 按钮，或右键数据库名称 → 新建集合。',
  },
  {
    title: '新建/编辑文档',
    content: '点击"新建文档"按钮，填写字段名、选择类型、输入值，点"创建"。编辑时自动识别字段类型。',
    tags: ['String', 'Number', 'Boolean', 'Object', 'Array', 'null', 'ObjectId'],
  },
  {
    title: 'Shell 命令行',
    content: '底部切换到 Shell 标签，输入 MongoDB 命令，Ctrl+Enter 执行。按 ↑↓ 浏览历史。',
    tags: ['db.col.find()', 'db.col.insertOne()', 'db.col.updateOne()'],
  },
  {
    title: 'AI 助手',
    content: '点击 ⚙ 设置 API Key，切换到 AI 助手标签，用自然语言描述需求即可自动生成并执行命令。',
    tags: ['OpenAI', 'DeepSeek', 'Ollama'],
  },
  {
    title: '删除操作',
    content: '右键集合名称 → 删除集合。文档表格中每行有删除按钮。',
  },
  {
    title: '快捷键',
    content: 'Ctrl+Enter 执行 Shell 命令 | Ctrl+N 新建连接 | F12 开发者工具',
  },
];

export default function HelpModal() {
  const { helpOpen, setHelpOpen } = useStore();

  return (
    <Modal
      title={<span><QuestionCircleOutlined style={{ color: '#00b96b', marginRight: 8 }} />使用帮助</span>}
      open={helpOpen}
      onCancel={() => setHelpOpen(false)}
      footer={null}
      width={600}
    >
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {tips.map((tip, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14, color: '#00b96b' }}>
              {i + 1}. {tip.title}
            </Text>
            <Paragraph style={{ margin: '4px 0 0', color: '#aaa', fontSize: 13 }}>
              {tip.content}
            </Paragraph>
            {tip.tags && (
              <div style={{ marginTop: 4 }}>
                {tip.tags.map(t => <Tag key={t} color="green" style={{ fontSize: 11 }}>{t}</Tag>)}
              </div>
            )}
          </div>
        ))}
        <Divider style={{ margin: '12px 0', borderColor: '#333' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          国产开源MongoDB可视化工具 v1.0 | 右键操作更便捷
        </Text>
      </div>
    </Modal>
  );
}