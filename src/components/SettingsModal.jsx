import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Space, Spin, message } from 'antd';
import { ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import useStore from '../store';
import { useTheme } from '../theme';

export default function SettingsModal() {
  const { aiConfig, setAiConfig, settingsOpen, setSettingsOpen } = useStore();
  const t = useTheme();
  const [form] = Form.useForm();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  // 每次打开弹窗时从 localStorage 加载最新值
  useEffect(() => {
    if (settingsOpen) {
      const saved = JSON.parse(localStorage.getItem('aiConfig') || '{}');
      form.setFieldsValue({
        url: saved.url || '',
        key: saved.key || '',
        model: saved.model || 'gpt-4o-mini',
      });
      // 如果已有 url 和 key，自动加载模型列表
      if (saved.url && saved.key) {
        loadModels(saved.url, saved.key);
      }
    }
  }, [settingsOpen]);

  const loadModels = async (url, key) => {
    if (!url || !key) return;
    setLoading(true);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.data?.length) {
        const list = data.data.map(m => ({ label: m.id, value: m.id }));
        setModels(list);
        // 如果当前模型不在列表中，更新为第一个可用模型
        const currentModel = form.getFieldValue('model');
        if (!list.find(m => m.value === currentModel)) {
          form.setFieldsValue({ model: list[0].value });
        }
      } else {
        setModels([]);
      }
    } catch {
      // 静默失败，用户可手动输入
      setModels([]);
    }
    setLoading(false);
  };

  const handleTest = async () => {
    const { url, key, model } = form.getFieldsValue();
    if (!url || !key) {
      message.warning('请先填写 API 地址和 Key');
      return;
    }
    if (!model) {
      message.warning('请选择或输入模型名称');
      return;
    }
    setTesting(true);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${errBody ? ': ' + errBody.slice(0, 100) : ''}`);
      }
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content;
      message.success(`连接成功！模型响应正常${reply ? '（' + reply.trim() + '）' : ''}`);
    } catch (err) {
      message.error('测试失败: ' + err.message);
    }
    setTesting(false);
  };

  const handleSave = () => {
    const values = form.getFieldsValue();
    const config = {
      url: values.url || '',
      key: values.key || '',
      model: values.model || 'gpt-4o-mini',
    };
    setAiConfig(config);
    message.success('设置已保存');
    setSettingsOpen(false);
  };

  return (
    <Modal
      title={<span><SettingOutlined style={{ color: t.accent, marginRight: 8 }} />设置</span>}
      open={settingsOpen}
      onCancel={() => setSettingsOpen(false)}
      width={500}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            icon={<LinkOutlined />}
            loading={testing}
            onClick={handleTest}
          >
            测试连接
          </Button>
          <Space>
            <Button onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item label="API 地址" name="url" extra={
          <span style={{ fontSize: 12, color: t.text.subtle }}>OpenAI 兼容接口地址</span>
        }>
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>

        <Form.Item label="API Key" name="key">
          <Input.Password placeholder="sk-..." />
        </Form.Item>

        <Form.Item label="模型" name="model" extra={
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                const { url, key } = form.getFieldsValue();
                loadModels(url, key);
              }}
              style={{ padding: 0, fontSize: 12 }}
            >
              从 API 加载模型列表
            </Button>
            {loading && <Spin size="small" />}
          </Space>
        }>
          <Select
            placeholder="选择或输入模型名称"
            options={models}
            showSearch
            allowClear
            dropdownRender={(menu) => (
              <>
                {models.length > 0 ? menu : <div style={{ padding: 8, textAlign: 'center', color: '#999', fontSize: 12 }}>暂无模型列表，点击上方链接加载</div>}
              </>
            )}
            filterOption={(input, option) =>
              option?.label?.toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent={null}
          />
        </Form.Item>
      </Form>

      <div style={{ color: t.text.subtle, fontSize: 12, marginTop: 8 }}>
        支持 OpenAI、DeepSeek、通义千问等兼容 OpenAI 接口的服务。
        <br />
        示例：
        <br />• OpenAI: https://api.openai.com/v1
        <br />• DeepSeek: https://api.deepseek.com/v1
        <br />• 本地 Ollama: http://localhost:11434/v1
      </div>
    </Modal>
  );
}