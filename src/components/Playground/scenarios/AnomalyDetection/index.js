import React, { useState, useEffect, useRef } from 'react';

import * as echarts from 'echarts';
import clsx from 'clsx';
import {
  FiActivity,
  FiUploadCloud,
  FiDownload,
  FiPlay,
  FiCheck,
  FiTrendingUp,
  FiAlertTriangle,
} from 'react-icons/fi';

import { requireAuth, getToken } from '@site/src/lib/playgroundAuth';

import styles from './index.module.css';

// ==================== 工具函数 ====================

function formatTimestamp(ts, spanSeconds, frequencySeconds, mode = 'axis') {
  const d = new Date(ts * 1000);
  if (spanSeconds == null) spanSeconds = 0;
  if (frequencySeconds == null) frequencySeconds = 0;
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  if (mode === 'tooltip') {
    if (frequencySeconds >= 365 * 86400) return `${yyyy}-${MM}`;
    if (frequencySeconds >= 86400) return `${yyyy}-${MM}-${dd}`;
    if (frequencySeconds >= 3600) return `${yyyy}-${MM}-${dd} ${hh}:00`;
    if (frequencySeconds >= 60) return `${yyyy}-${MM}-${dd} ${hh}:${mm}`;
    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
  }

  if (frequencySeconds >= 365 * 86400) return `${yyyy}-${MM}`;
  if (frequencySeconds >= 86400) return `${MM}-${dd}`;
  if (frequencySeconds >= 3600) {
    return spanSeconds > 2 * 86400 ? `${MM}-${dd} ${hh}:00` : `${hh}:00`;
  }
  if (frequencySeconds >= 60) {
    return spanSeconds > 86400 ? `${MM}-${dd} ${hh}:${mm}` : `${hh}:${mm}`;
  }
  if (frequencySeconds > 0) {
    return spanSeconds > 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  if (spanSeconds > 365 * 86400) return `${yyyy}-${MM}`;
  if (spanSeconds > 7 * 86400) return `${MM}-${dd}`;
  if (spanSeconds > 86400) return `${MM}-${dd} ${hh}:${mm}`;
  return `${hh}:${mm}`;
}

function detectSeriesFrequencySeconds(series) {
  if (!Array.isArray(series) || series.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < series.length; i++) {
    const gap = series[i].time - series[i - 1].time;
    if (Number.isFinite(gap) && gap > 0) {
      gaps.push(gap);
    }
  }

  if (!gaps.length) return null;

  const counts = new Map();
  gaps.forEach((gap) => {
    counts.set(gap, (counts.get(gap) || 0) + 1);
  });

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

function generateSampleData() {
  const data = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 287; i >= 0; i--) {
    const ts = now - i * 5 * 60;
    const hour = new Date(ts * 1000).getHours();
    const base = hour >= 9 && hour <= 18 ? 55 : 30;
    const noise = (Math.random() - 0.5) * 20;
    let value = base + noise + Math.sin(i / 10) * 10;
    data.push({
      time: ts,
      value: Math.max(5, Math.min(95, value))
    });
  }
  return data;
}

function parseTimestamp(raw) {
  if (raw == null || raw === '') return NaN;
  const str = String(raw).trim();
  const num = Number(str);
  if (!isNaN(num) && str !== '') {
    if (num > 1e12) return Math.floor(num / 1000);
    if (num > 1e8) return Math.floor(num);
    return NaN;
  }
  const ms = Date.parse(str);
  if (!isNaN(ms)) return Math.floor(ms / 1000);
  return NaN;
}

const chartColors = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  danger: '#EF4444',
  border: '#E2E8F0',
  text: '#64748B',
  surface: '#F8FAFC'
};

// ==================== 组件 ====================

export default function AnomalyDetection({ apiBase, loginBaseUrl, isLoggedIn, selectedModel, scenarioConfig }) {
  const [dataSource, setDataSource] = useState('sample');
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [inferenceTime, setInferenceTime] = useState(null);
  const [sampleData, setSampleData] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadData, setUploadData] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');

  const sampleChartRef = useRef(null);
  const resultChartRef = useRef(null);
  const sampleChartInstance = useRef(null);
  const resultChartInstance = useRef(null);
  const fileInputRef = useRef(null);
  const uploadChartRef = useRef(null);
  const uploadChartInstance = useRef(null);

  const activeSeries = dataSource === 'upload' && uploadData?.length ? uploadData : sampleData;
  const detectedFrequencySeconds = detectSeriesFrequencySeconds(activeSeries);
  const resultFrequencySeconds = detectSeriesFrequencySeconds(resultData?.data);

  // ==================== 图表 ====================

  // 示例数据图表
  useEffect(() => {
    if (dataSource === 'sample' && sampleChartRef.current) {
      if (sampleChartInstance.current) {
        sampleChartInstance.current.dispose();
      }

      const chart = echarts.init(sampleChartRef.current);
      sampleChartInstance.current = chart;

      const data = generateSampleData();
      setSampleData(data);
      const sampleSpanSeconds = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
      const sampleFrequencySeconds = 5 * 60;

      const option = {
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', minSpan: 10 },
        ],
        grid: { top: 24, right: 24, bottom: 32, left: 56 },
        xAxis: {
          type: 'category',
          data: data.map(d => d.time),
          axisLabel: {
            fontSize: 11,
            color: chartColors.text,
            interval: 47,
            formatter: value => formatTimestamp(Number(value), sampleSpanSeconds, sampleFrequencySeconds)
          },
          axisLine: { lineStyle: { color: chartColors.border } },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { fontSize: 11, color: chartColors.text, formatter: '{value}%' },
          splitLine: { lineStyle: { color: chartColors.border, type: 'dashed' } }
        },
        series: [{
          data: data.map(d => d.value),
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: chartColors.primaryLight, width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
            ])
          }
        }],
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: chartColors.border,
          borderWidth: 1,
          textStyle: { color: chartColors.primary, fontSize: 13 },
          formatter: params => `<strong>${formatTimestamp(Number(params[0].axisValue), sampleSpanSeconds, sampleFrequencySeconds, 'tooltip')}</strong><br/>CPU: ${params[0].value.toFixed(1)}%`
        }
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.dispose();
      };
    }
  }, [dataSource]);

  // 上传数据图表
  useEffect(() => {
    if (uploadData && uploadChartRef.current) {
      if (uploadChartInstance.current) {
        uploadChartInstance.current.dispose();
      }

      const chart = echarts.init(uploadChartRef.current);
      uploadChartInstance.current = chart;

      const interval = Math.max(1, Math.floor(uploadData.length / 6));
      const uploadSpanSeconds = uploadData.length > 1 ? uploadData[uploadData.length - 1].time - uploadData[0].time : 0;
      const values = uploadData.map(d => d.value);
      const minVal = Math.floor(Math.min(...values));
      const maxVal = Math.ceil(Math.max(...values));
      const padding = Math.max(1, Math.round((maxVal - minVal) * 0.1));

      const option = {
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', minSpan: 10 },
        ],
        grid: { top: 24, right: 24, bottom: 32, left: 56 },
        xAxis: {
          type: 'category',
          data: uploadData.map(d => d.time),
          axisLabel: {
            fontSize: 11,
            color: chartColors.text,
            interval,
            formatter: value => formatTimestamp(Number(value), uploadSpanSeconds, detectedFrequencySeconds)
          },
          axisLine: { lineStyle: { color: chartColors.border } },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          min: minVal - padding,
          max: maxVal + padding,
          axisLabel: { fontSize: 11, color: chartColors.text },
          splitLine: { lineStyle: { color: chartColors.border, type: 'dashed' } }
        },
        series: [{
          data: values,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: chartColors.primaryLight, width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
            ])
          }
        }],
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: chartColors.border,
          borderWidth: 1,
          textStyle: { color: chartColors.primary, fontSize: 13 },
          formatter: params => `<strong>${formatTimestamp(Number(params[0].axisValue), uploadSpanSeconds, detectedFrequencySeconds, 'tooltip')}</strong><br/>数值: ${params[0].value}`
        }
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.dispose();
      };
    }
  }, [uploadData]);

  // 结果图表 — 异常检测
  useEffect(() => {
    if (resultData && resultChartRef.current) {
      if (resultChartInstance.current) {
        resultChartInstance.current.dispose();
      }

      const chart = echarts.init(resultChartRef.current);
      resultChartInstance.current = chart;

      const anomalyData = resultData.data || [];
      const anomalyPoints = anomalyData
        .map((d, i) => d.isAnomaly ? { xAxis: i, yAxis: d.value, value: d.value } : null)
        .filter(p => p !== null);

      const resultValues = anomalyData.map(d => d.value);
      const resultMin = Math.floor(Math.min(...resultValues));
      const resultMax = Math.ceil(Math.max(...resultValues));
      const resultPadding = Math.max(1, Math.round((resultMax - resultMin) * 0.1));
      const resultInterval = Math.max(1, Math.floor(anomalyData.length / 6));
      const resultSpanSeconds = anomalyData.length > 1 ? anomalyData[anomalyData.length - 1].time - anomalyData[0].time : 0;
      const effectiveResultFrequencySeconds = resultFrequencySeconds || detectedFrequencySeconds;

      const option = {
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', minSpan: 10 },
        ],
        grid: { top: 48, right: 24, bottom: 40, left: 56 },
        legend: {
          data: ['时序数据', '异常点'],
          top: 8,
          textStyle: { fontSize: 12, color: chartColors.text }
        },
        xAxis: {
          type: 'category',
          data: anomalyData.map(d => d.time),
          axisLabel: {
            fontSize: 11,
            color: chartColors.text,
            interval: resultInterval,
            formatter: value => formatTimestamp(Number(value), resultSpanSeconds, effectiveResultFrequencySeconds)
          },
          axisLine: { lineStyle: { color: chartColors.border } },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          min: resultMin - resultPadding,
          max: resultMax + resultPadding,
          axisLabel: { fontSize: 11, color: chartColors.text },
          splitLine: { lineStyle: { color: chartColors.border, type: 'dashed' } }
        },
        series: [
          {
            name: '时序数据',
            data: anomalyData.map(d => d.value),
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: { color: chartColors.primaryLight, width: 2.5 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
              ])
            },
            markPoint: {
              symbol: 'circle',
              symbolSize: 16,
              itemStyle: {
                color: chartColors.danger,
                borderColor: '#fff',
                borderWidth: 2,
                shadowColor: 'rgba(239, 68, 68, 0.5)',
                shadowBlur: 8
              },
              label: { show: false },
              data: anomalyPoints
            }
          },
          {
            name: '异常点',
            type: 'scatter',
            data: [],
            itemStyle: { color: chartColors.danger }
          }
        ],
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: chartColors.border,
          borderWidth: 1,
          textStyle: { fontSize: 13 },
          formatter: params => {
            const point = params[0];
            if (!point) return '';
            const idx = point.dataIndex;
            const d = anomalyData[idx];
            let html = `<strong>${formatTimestamp(Number(point.axisValue), resultSpanSeconds, effectiveResultFrequencySeconds, 'tooltip')}</strong><br/>数值: ${point.value.toFixed(1)}`;
            if (d?.anomalyProbability != null) html += `<br/>异常概率: ${(d.anomalyProbability * 100).toFixed(2)}%`;
            if (d?.isAnomaly) html += `<br/><span style="color:#EF4444;font-weight:600">⚠ 检测到异常</span>`;
            return html;
          }
        }
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.dispose();
      };
    }
  }, [resultData]);

  // ==================== 推理 ====================

  const handleRunInference = async () => {
    if (!requireAuth(loginBaseUrl)) return;

    if (!selectedModel) {
      setFormError('请选择一个模型');
      return;
    }
    if (dataSource === 'upload' && !uploadData) {
      setUploadError('请先上传数据文件');
      return;
    }

    setFormError('');
    setLoading(true);
    setResultData(null);
    setInferenceTime(null);

    try {
      const source = dataSource === 'upload' ? uploadData : sampleData;
      const payload = source.map(d => ({ timestamp: d.time, value: d.value }));
      const token = getToken();

      const response = await fetch(
        `${apiBase}/predict/${scenarioConfig.algorithmType}/${selectedModel}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: payload, config: {} }),
        }
      );

      if (!response.ok) {
        throw new Error(`推理请求失败: ${response.status}`);
      }

      const json = await response.json();
      // 异常检测响应格式：{ data: { results[], metadata } }
      const results = json.data?.results || [];
      const adapted = results.map(item => ({
        time: item.timestamp,
        value: item.value,
        isAnomaly: item.label === 1,
        anomalyScore: item.anomaly_score,
        anomalyProbability: item.anomaly_probability,
      }));
      setResultData({
        type: 'timeseries-anomaly',
        data: adapted,
        metadata: json.data?.metadata || {},
      });
      setInferenceTime(json.data?.metadata?.execution_time_ms ?? null);
    } catch (err) {
      console.error('推理请求失败:', err);
      setFormError(`推理失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== 文件上传 ====================

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    setUploadError('');
    setUploadData(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        let parsed = [];

        if (file.name.endsWith('.json')) {
          const json = JSON.parse(text);
          const arr = Array.isArray(json) ? json : json.data || [];
          parsed = arr.map(item => ({
            time: parseTimestamp(item.timestamp ?? item.time ?? item.ts),
            value: Number(item.value || item.val || 0)
          }));
        } else {
          const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
          const header = lines[0]?.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
          const tsIdx = header?.findIndex(h => ['timestamp', 'time', 'ts'].includes(h));
          const valIdx = header?.findIndex(h => ['value', 'val'].includes(h));
          if (tsIdx === -1 || valIdx === -1) {
            setUploadError('CSV 格式错误：需要包含 timestamp 和 value 列');
            return;
          }
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            if (cols.length > Math.max(tsIdx, valIdx)) {
              parsed.push({
                time: parseTimestamp(cols[tsIdx].trim()),
                value: Number(cols[valIdx].trim())
              });
            }
          }
        }

        parsed = parsed.filter(d => !isNaN(d.time) && !isNaN(d.value));
        parsed.sort((a, b) => a.time - b.time);

        if (parsed.length === 0) {
          setUploadError('未解析到有效数据，请检查文件格式');
          return;
        }
        setUploadData(parsed);
      } catch (err) {
        console.error('文件解析失败:', err);
        setUploadError('文件解析失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const csvContent = [
      'timestamp,value',
      '1704067200,45.2',
      '1704067500,47.8',
      '1704067800,42.1',
      '1704068100,50.5',
      '1704068400,48.3',
      '# 说明:',
      '# timestamp: Unix 秒级整数时间戳 (如 1704067200 表示 2024-01-01 08:00:00)',
      '# value: 数值型指标'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'data_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ==================== JSX ====================

  return (
    <div className={styles.scenarioContent}>
      {/* 数据源 */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>数据源</label>
        <div className={styles.dataSourceTabs}>
          <button
            className={clsx(styles.dataSourceTab, dataSource === 'sample' && styles.active)}
            onClick={() => {
              setDataSource('sample');
              setUploadFileName('');
              setUploadData(null);
              setUploadError('');
            }}
          >
            示例数据
          </button>
          <button
            className={clsx(styles.dataSourceTab, dataSource === 'upload' && styles.active)}
            onClick={() => setDataSource('upload')}
          >
            上传文件
          </button>
        </div>

        {dataSource === 'sample' && (
          <div className={styles.sampleDataSection}>
            <div className={styles.sampleDataCard}>
              <div className={styles.sampleDataHeader}>
                <span className={styles.sampleDataTitle}>
                  <FiActivity />
                  服务器 CPU 使用率监控数据
                </span>
                <span className={styles.sampleDataInfo}>24h · 288 points</span>
              </div>
              <div className={styles.sampleDataChart} ref={sampleChartRef}></div>
            </div>
          </div>
        )}

        {dataSource === 'upload' && !uploadData && (
          <div>
            <div
              className={clsx(styles.uploadArea, styles.active, uploadError && styles.uploadAreaError)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.uploadAreaIcon}>
                <FiUploadCloud />
              </div>
              <p className={styles.uploadAreaText}>
                {uploadFileName ? `已选择: ${uploadFileName}` : '点击或拖拽上传文件'}
              </p>
              <p className={styles.uploadAreaHint}>支持 CSV, JSON 格式，时间戳支持 Unix 整数或日期字符串</p>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".csv,.json"
                onChange={handleFileUpload}
              />
              <button className={styles.templateDownload} onClick={handleDownloadTemplate}>
                <FiDownload />
                下载数据模板
              </button>
            </div>
            {uploadError && (
              <p className={styles.uploadErrorText}>{uploadError}</p>
            )}
          </div>
        )}

        {dataSource === 'upload' && uploadData && (
          <div className={styles.sampleDataSection}>
            <div className={styles.sampleDataCard}>
              <div className={styles.sampleDataHeader}>
                <span className={styles.sampleDataTitle}>
                  <FiActivity />
                  {uploadFileName}
                </span>
                <span className={styles.sampleDataInfo}>{uploadData.length} points</span>
              </div>
              <div className={styles.sampleDataChart} ref={uploadChartRef}></div>
              <div className={styles.uploadChartActions}>
                <button
                  className={styles.uploadReplace}
                  onClick={() => {
                    setUploadData(null);
                    setUploadFileName('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <FiUploadCloud />
                  重新上传
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {formError && (
        <div className={styles.formErrorMsg}>
          <FiAlertTriangle />
          {formError}
        </div>
      )}

      {/* 执行按钮 */}
      <div className={styles.actionButtons}>
        <button
          className={clsx(styles.btn, styles.btnPrimary)}
          onClick={handleRunInference}
          disabled={loading || !selectedModel}
        >
          <FiPlay />
          开始异常检测
        </button>
      </div>

      {/* Loading */}
      <div className={clsx(styles.loading, loading && styles.active)}>
        <div className={styles.loadingSpinner}></div>
        <span>模型推理中...</span>
      </div>

      {/* 结果 */}
      <div className={clsx(styles.resultSection, resultData && !loading && styles.active)}>
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <span className={styles.resultTitle}>
              <FiTrendingUp />
              推理结果
            </span>
            <span className={styles.resultStatus}>
              <FiCheck />
              检测完成
            </span>
          </div>
          <div className={styles.resultChart} ref={resultChartRef}></div>
          <div className={styles.resultSummary}>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>数据点总数</span>
              <span className={styles.resultStatValue}>
                {resultData?.data?.length || 0}
              </span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>检测到异常</span>
              <span className={clsx(styles.resultStatValue, styles.resultStatValueAnomaly)}>
                {resultData?.data?.filter(d => d.isAnomaly).length || 0}
              </span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>异常占比</span>
              <span className={styles.resultStatValue}>
                {resultData?.data?.length ? (resultData.data.filter(d => d.isAnomaly).length / resultData.data.length * 100).toFixed(2) + '%' : '0%'}
              </span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>推理耗时</span>
              <span className={styles.resultStatValue}>{inferenceTime != null ? (inferenceTime / 1000).toFixed(2) + 's' : '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
