import React, { useState, useMemo } from 'react';
import { Select, Space, Button, Empty } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { useTheme } from '../theme';

const COLORS = ['#00b96b', '#4fc3f7', '#faad14', '#7262fd', '#ff4d4f', '#13c2c2', '#eb2f96', '#52c41a', '#f5222d', '#fa8c16'];

const CHART_TYPES = [
  { label: '柱状图', value: 'bar' },
  { label: '饼图', value: 'pie' },
  { label: '折线图', value: 'line' },
];

export default function ChartView({ data, onClose }) {
  const t = useTheme();
  const [chartType, setChartType] = useState('bar');
  const [xField, setXField] = useState('');
  const [yField, setYField] = useState('');

  const fields = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const first = data[0];
    return Object.keys(first || {}).filter(k => k !== '_id');
  }, [data]);

  const autoSelect = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return { x: '', y: '' };
    let x = '', y = '';
    for (const key of fields) {
      const val = data[0][key];
      if (typeof val === 'string' && !x) x = key;
      if (typeof val === 'number' && !y) y = key;
    }
    return { x: x || fields[0] || '', y: y || fields[0] || '' };
  }, [data, fields]);

  const resolvedX = xField || autoSelect.x;
  const resolvedY = yField || autoSelect.y;

  const chartData = useMemo(() => {
    if (!Array.isArray(data) || !resolvedX) return [];
    return data.map((item, i) => ({
      name: String(item[resolvedX] ?? `项${i + 1}`),
      [resolvedY]: item[resolvedY],
    }));
  }, [data, resolvedX, resolvedY]);

  if (!Array.isArray(data) || data.length === 0) {
    return <Empty description="无数据可展示" style={{ padding: 20 }} />;
  }

  const tooltipStyle = {
    background: t.bg.panel,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    fontSize: 12,
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select size="small" value={chartType} onChange={setChartType} style={{ width: 90 }}
          options={CHART_TYPES} />
        <Select size="small" value={resolvedX} onChange={setXField} style={{ width: 120 }}
          placeholder="X 轴字段" options={fields.map(f => ({ label: f, value: f }))} showSearch />
        <Select size="small" value={resolvedY} onChange={setYField} style={{ width: 120 }}
          placeholder="Y 轴字段" options={fields.map(f => ({ label: f, value: f }))} showSearch />
        {onClose && (
          <Button size="small" type="text" onClick={onClose} style={{ color: t.text.subtle }}>收起</Button>
        )}
      </div>

      {chartData.length === 0 ? (
        <Empty description="请选择 X 轴字段" style={{ padding: 20 }} />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' && (
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: t.text.secondary }} />
                <YAxis tick={{ fontSize: 10, fill: t.text.secondary }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={resolvedY} fill="#00b96b" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
            {chartType === 'pie' && (
              <PieChart>
                <Pie data={chartData} dataKey={resolvedY} nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            )}
            {chartType === 'line' && (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: t.text.secondary }} />
                <YAxis tick={{ fontSize: 10, fill: t.text.secondary }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={resolvedY} stroke="#00b96b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: 4, fontSize: 11, color: t.text.subtle }}>
        共 {data.length} 条数据
      </div>
    </div>
  );
}