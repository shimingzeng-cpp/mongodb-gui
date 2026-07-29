import React, { useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import useStore from '../store';

export default function SettingsModal() {
  const { aiConfig, setAiConfig, settingsOpen, setSettingsOpen } = useStore();
  const [form] = Form.useForm();

  // 每次打开弹窗时从 localStorage 加载最新值
  useEffect(() => {
    if (settingsOpen) {
      const saved = JSON.parse(localStorage.getItem('aiConfig') || '{}');
      form.setFieldsValue({
        url: saved.url || '',
        key: saved.key || '',
        model: saved.model || 'gpt-4o-mini',
      });
    }
  }, [settingsOpen, form]);

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
      title="设置"
      open={settingsOpen}
      onOk={handleSave}
      onCancel={() => setSettingsOpen(false)}
      okText="保存"
      cancelText="取消"
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item label="API 地址" name="url" extra="OpenAI 兼容接口地址">
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>

        <Form.Item label="API Key" name="key">
          <Input.Password placeholder="sk-..." />
        </Form.Item>

        <Form.Item label="模型" name="model">
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>
      </Form>

      <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
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