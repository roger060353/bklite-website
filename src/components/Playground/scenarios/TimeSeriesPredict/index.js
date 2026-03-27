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

const defaultSampleDataUrl = new URL('./sample-data/default.csv', import.meta.url).href;

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

function parseCsvSeries(text) {
  const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const header = lines[0]?.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const tsIdx = header?.findIndex(h => ['timestamp', 'time', 'ts'].includes(h));
  const valIdx = header?.findIndex(h => ['value', 'val'].includes(h));

  if (tsIdx === -1 || valIdx === -1) {
    throw new Error('CSV 格式错误：需要包含 timestamp 和 value 列');
  }

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length > Math.max(tsIdx, valIdx)) {
      parsed.push({
        time: parseTimestamp(cols[tsIdx].trim()),
        value: Number(cols[valIdx].trim())
      });
    }
  }

  return parsed
    .filter(d => !isNaN(d.time) && !isNaN(d.value))
    .sort((a, b) => a.time - b.time);
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

function formatDurationLabel(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '未知时长';

  if (totalSeconds % 86400 === 0) {
    const days = totalSeconds / 86400;
    return `${days}天`;
  }

  if (totalSeconds % 3600 === 0) {
    const hours = totalSeconds / 3600;
    return `${hours}小时`;
  }

  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return minutes ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }

  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${minutes}分钟`;
}

function getSampleMetaText(series) {
  if (!Array.isArray(series) || series.length === 0) return '加载中...';

  const frequencySeconds = detectSeriesFrequencySeconds(series) || 5 * 60;
  const spanSeconds = series.length > 1 ? series[series.length - 1].time - series[0].time : frequencySeconds;
  return `${formatDurationLabel(spanSeconds || frequencySeconds)} · ${series.length} points`;
}

const chartColors = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  danger: '#EF4444',
  border: '#E2E8F0',
  text: '#64748B',
  surface: '#F8FAFC'
};

const minPredictionSteps = 1;
const maxPredictionSteps = 12;

// ==================== 组件 ====================

export default function TimeSeriesPredict({ apiBase, loginBaseUrl, isLoggedIn, selectedModel, scenarioConfig }) {
  const [dataSource, setDataSource] = useState('sample');
  const [selectedSteps, setSelectedSteps] = useState(minPredictionSteps);
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
  const hasSampleData = Boolean(sampleData?.length);
  const detectedFrequencySeconds = detectSeriesFrequencySeconds(activeSeries);
  const frequencyLabel = detectedFrequencySeconds ? formatDurationLabel(detectedFrequencySeconds) : '5分钟';
  const resultSeries = resultData ? [...resultData.history, ...resultData.prediction] : null;
  const resultFrequencySeconds = detectSeriesFrequencySeconds(resultSeries) || detectedFrequencySeconds;

  const getPredictionTimeLabel = (steps) => {
    const baseFrequency = detectedFrequencySeconds || 5 * 60;
    return formatDurationLabel(baseFrequency * steps);
  };

  // ==================== 图表 ====================

  // 示例数据图表
  useEffect(() => {
    let cancelled = false;
    let chart = null;
    let handleResize = null;

    const loadSampleData = async () => {
      if (dataSource !== 'sample' || !sampleChartRef.current) {
        return;
      }

      if (sampleChartInstance.current) {
        sampleChartInstance.current.dispose();
      }

      try {
        const response = await fetch(defaultSampleDataUrl);
        if (!response.ok) {
          throw new Error(`示例数据加载失败: ${response.status}`);
        }

        const text = await response.text();
        const data = parseCsvSeries(text);
        if (!data.length) {
          throw new Error('示例数据文件为空或格式错误');
        }

        if (cancelled || !sampleChartRef.current) {
          return;
        }

        setFormError('');
        setSampleData(data);

        chart = echarts.init(sampleChartRef.current);
        sampleChartInstance.current = chart;

        const sampleSpanSeconds = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
        const sampleFrequencySeconds = detectSeriesFrequencySeconds(data) || 5 * 60;

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
              interval: Math.max(0, Math.floor(data.length / 6) - 1),
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

        handleResize = () => chart.resize();
        window.addEventListener('resize', handleResize);
      } catch (err) {
        console.error('示例数据加载失败:', err);
        if (!cancelled) {
          setSampleData(null);
          setFormError(`示例数据加载失败: ${err.message}`);
        }
      }
    };

    loadSampleData();

    return () => {
      cancelled = true;
      if (handleResize) {
        window.removeEventListener('resize', handleResize);
      }
      if (chart) {
        chart.dispose();
      }
    };
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
      const values = uploadData.map(d => d.value);
      const uploadSpanSeconds = uploadData.length > 1 ? uploadData[uploadData.length - 1].time - uploadData[0].time : 0;
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

  // 结果图表 — 时序预测：历史实线 + 预测虚线
  useEffect(() => {
    if (resultData && resultChartRef.current) {
      if (resultChartInstance.current) {
        resultChartInstance.current.dispose();
      }

      const chart = echarts.init(resultChartRef.current);
      resultChartInstance.current = chart;

      const allData = [...resultData.history, ...resultData.prediction];
      const allValues = allData.map(d => d.value);
      const allMin = Math.floor(Math.min(...allValues));
      const allMax = Math.ceil(Math.max(...allValues));
      const allPadding = Math.max(1, Math.round((allMax - allMin) * 0.1));
      const allInterval = Math.max(1, Math.floor(allData.length / 6));
      const allSpanSeconds = allData.length > 1 ? allData[allData.length - 1].time - allData[0].time : 0;
      const effectiveResultFrequencySeconds = resultFrequencySeconds || detectSeriesFrequencySeconds(allData);

      const historyValues = resultData.history.map(d => d.value);
      const overlapPadding = new Array(Math.max(0, resultData.history.length - 1)).fill(null);
      const overlapPrediction = [
        resultData.history[resultData.history.length - 1]?.value ?? null,
        ...resultData.prediction.map(d => d.value),
      ];

      const option = {
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', minSpan: 10 },
        ],
        grid: { top: 48, right: 24, bottom: 40, left: 56 },
        legend: {
          data: ['历史数据', '预测数据'],
          top: 8,
          textStyle: { fontSize: 12, color: chartColors.text }
        },
        xAxis: {
          type: 'category',
          data: allData.map(d => d.time),
          axisLabel: {
            fontSize: 11,
            color: chartColors.text,
            interval: allInterval,
            formatter: value => formatTimestamp(Number(value), allSpanSeconds, effectiveResultFrequencySeconds)
          },
          axisLine: { lineStyle: { color: chartColors.border } },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          min: allMin - allPadding,
          max: allMax + allPadding,
          axisLabel: { fontSize: 11, color: chartColors.text },
          splitLine: { lineStyle: { color: chartColors.border, type: 'dashed' } }
        },
        series: [
          {
            name: '历史数据',
            data: historyValues,
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
          },
          {
            name: '预测数据',
            data: [...overlapPadding, ...overlapPrediction],
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: { color: '#F59E0B', width: 2.5, type: 'dashed' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(245, 158, 11, 0.18)' },
                { offset: 1, color: 'rgba(245, 158, 11, 0.02)' }
              ])
            }
          }
        ],
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: chartColors.border,
          borderWidth: 1,
          textStyle: { fontSize: 13 },
          formatter: params => {
            const point = params[0] || params[1];
            if (!point) return '';
            let html = `<strong>${formatTimestamp(Number(point.axisValue), allSpanSeconds, effectiveResultFrequencySeconds, 'tooltip')}</strong>`;
            params.forEach(p => {
              if (p.value != null) {
                const color = p.seriesName === '预测数据' ? '#F59E0B' : chartColors.primaryLight;
                html += `<br/><span style="color:${color}">${p.seriesName}: ${p.value.toFixed(1)}</span>`;
              }
            });
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
    if (dataSource === 'sample' && !sampleData?.length) {
      setFormError('示例数据尚未加载完成');
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
          body: JSON.stringify({ data: payload, config: { steps: selectedSteps } }),
        }
      );

      if (!response.ok) {
        throw new Error(`推理请求失败: ${response.status}`);
      }

      const json = await response.json();
      // 时序预测响应格式：{ data: { success, history[], prediction[], metadata } }
      const inner = json.data || {};
      const history = (inner.history || []).map(item => ({
        time: item.timestamp,
        value: item.value,
      }));
      const prediction = (inner.prediction || []).map(item => ({
        time: item.timestamp,
        value: item.value,
      }));
      setResultData({
        type: 'timeseries-predict',
        history,
        prediction,
        metadata: inner.metadata || {},
      });
      setInferenceTime(inner.metadata?.execution_time_ms ?? null);
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
          parsed = parseCsvSeries(text);
        }

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
                <span className={styles.sampleDataInfo}>{getSampleMetaText(sampleData)}</span>
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

      {/* 预测时间 */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>预测时间</label>
        <div className={styles.stepsCard}>
          <div className={styles.stepsHeader}>
            <p className={styles.stepsHint}>拖动下方滑块可调整未来预测时长，当前每个数据点约为 {frequencyLabel}。</p>
            <div className={styles.stepsValue}>
              <div className={styles.stepsValueMain}>
                <span className={styles.stepsValueLabel}>当前预测范围</span>
                <span className={styles.stepsValueText}>{getPredictionTimeLabel(selectedSteps)}</span>
              </div>
            </div>
          </div>
          <div className={styles.stepsSliderGroup}>
            <input
              type="range"
              min={minPredictionSteps}
              max={maxPredictionSteps}
              step={1}
              value={selectedSteps}
              className={styles.stepsSlider}
              onChange={(e) => setSelectedSteps(Number(e.target.value))}
              disabled={loading}
            />
            <div className={styles.stepsScale}>
              <span className={styles.stepsScaleLabel}>{getPredictionTimeLabel(minPredictionSteps)}</span>
              <span className={styles.stepsScaleLabel}>{getPredictionTimeLabel(maxPredictionSteps)}</span>
            </div>
          </div>
        </div>
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
          disabled={loading || !selectedModel || (dataSource === 'sample' ? !hasSampleData : !uploadData?.length)}
        >
          <FiPlay />
          开始时序预测
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
              预测完成
            </span>
          </div>
          <div className={styles.resultChart} ref={resultChartRef}></div>
          <div className={styles.resultSummary}>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>输入数据点</span>
              <span className={styles.resultStatValue}>
                {resultData?.metadata?.input_data_points || resultData?.history?.length || 0}
              </span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>预测时间</span>
              <span className={styles.resultStatValue}>
                {getPredictionTimeLabel(resultData?.metadata?.prediction_steps || selectedSteps || resultData?.prediction?.length || 0)}
              </span>
            </div>
            <div className={styles.resultStat}>
              <span className={styles.resultStatLabel}>预测频率</span>
              <span className={styles.resultStatValue}>
                {resultData?.metadata?.input_frequency || '-'}
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
