import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Checkbox, Button, Space, message, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function ConnectionEditModal({ open, connection, onSave, onCancel }) {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  const isEdit = !!connection;

  useEffect(() => {
    if (open) {
      if (connection) {
        form.setFieldsValue({
          name: connection.name,
          host: connection.host,
          port: connection.port,
          username: connection.username || '',
          password: connection.password || '',
          authSource: connection.authSource || 'admin',
          authMechanism: connection.authMechanism || 'DEFAULT',
          ssl: connection.ssl || false,
          sslAllowInvalid: connection.sslAllowInvalid || false,
          replicaSet: connection.replicaSet || '',
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, connection, form]);

  const buildUri = (values) => {
    let uri = 'mongodb://';
    if (values.username && values.password) {
      uri += `${encodeURIComponent(values.username)}:${encodeURIComponent(values.password)}@`;
    }
    uri += `${values.host}:${values.port}`;
    const params = [];
    if (values.authSource) params.push(`authSource=${values.authSource}`);
    if (values.replicaSet) params.push(`replicaSet=${values.replicaSet}`);
    if (values.ssl) params.push('ssl=true');
    if (values.sslAllowInvalid) params.push('sslAllowInvalidCertificates=true');
    if (params.length > 0) uri += '/?' + params.join('&');
    return uri;
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const uri = buildUri(values);
      await window.__mongo.testConnection(uri);
      message.success('连接成功！');
    } catch (err) {
      if (err.errorFields) {
        message.warning('请先完善表单');
      } else {
        message.error('连接失败: ' + err.message);
      }
    }
    setTesting(false);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const uri = buildUri(values);
      onSave({
        name: values.name,
        host: values.host,
        port: values.port,
        uri,
        username: values.username || '',
        password: values.password || '',
        authSource: values.authSource || 'admin',
        authMechanism: values.authMechanism || 'DEFAULT',
        ssl: values.ssl || false,
        sslAllowInvalid: values.sslAllowInvalid || false,
        replicaSet: values.replicaSet || '',
      });
    } catch (err) {
      if (err.errorFields) return;
    }
  };

  return (
    <Modal
      title={<span><LinkOutlined style={{ color: '#00b96b', marginRight: 8 }} />{isEdit ? '编辑连接' : '新建连接'}</span>}
      open={open}
      onCancel={onCancel}
      width={520}
      footer={[
        <Button key="test" onClick={handleTest} loading={testing} icon={<LinkOutlined />}>
          测试连接
        </Button>,
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="save" type="primary" onClick={handleSubmit}>
          {isEdit ? '保存' : '添加'}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        size="small"
        initialValues={{
          host: 'localhost',
          port: 27017,
          authSource: 'admin',
          authMechanism: 'DEFAULT',
          ssl: false,
          sslAllowInvalid: false,
        }}
      >
        <Form.Item name="name" label="连接名称" rules={[{ required: true, message: '请输入连接名称' }]}>
          <Input placeholder="例如：本地开发" maxLength={64} />
        </Form.Item>

        <Space style={{ width: '100%' }} align="start">
          <Form.Item name="host" label="主机" rules={[{ required: true, message: '请输入主机地址' }]} style={{ flex: 1 }}>
            <Input placeholder="localhost" />
          </Form.Item>
          <Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]} style={{ width: 100 }}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Text strong style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 8 }}>认证（可选）</Text>
        <Space style={{ width: '100%' }} align="start">
          <Form.Item name="username" label="用户名" style={{ flex: 1 }}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" style={{ flex: 1 }}>
            <Input.Password placeholder="密码" />
          </Form.Item>
        </Space>
        <Space style={{ width: '100%' }} align="start">
          <Form.Item name="authSource" label="认证库" style={{ flex: 1 }}>
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item name="authMechanism" label="认证机制" style={{ flex: 1 }}>
            <Select
              options={[
                { label: '默认 (SCRAM)', value: 'DEFAULT' },
                { label: 'SCRAM-SHA-1', value: 'SCRAM-SHA-1' },
                { label: 'SCRAM-SHA-256', value: 'SCRAM-SHA-256' },
                { label: 'MONGODB-X509', value: 'MONGODB-X509' },
                { label: 'MONGODB-AWS', value: 'MONGODB-AWS' },
                { label: 'GSSAPI (Kerberos)', value: 'GSSAPI' },
                { label: 'PLAIN (LDAP)', value: 'PLAIN' },
              ]}
            />
          </Form.Item>
        </Space>

        <Text strong style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>高级选项</Text>
        <Form.Item name="replicaSet" label="副本集名称">
          <Input placeholder="留空则不使用副本集" />
        </Form.Item>
        <Space style={{ width: '100%' }}>
          <Form.Item name="ssl" valuePropName="checked">
            <Checkbox>使用 SSL</Checkbox>
          </Form.Item>
          <Form.Item name="sslAllowInvalid" valuePropName="checked">
            <Checkbox>允许无效证书</Checkbox>
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}