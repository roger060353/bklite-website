import React, { useState, useEffect, useRef, useCallback } from 'react';

import clsx from 'clsx';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  FiActivity,
  FiTrendingUp,
  FiFileText,
  FiType,
  FiImage,
  FiTarget,
  FiCheck,
  FiAlertTriangle,
  FiCpu,
  FiChevronDown,
  FiLock
} from 'react-icons/fi';

import { getToken, hasToken, redirectToLogin } from '@site/src/lib/playgroundAuth';
import PageHeader from '@site/src/components/Playground/PageHeader';
import AnomalyDetection from '@site/src/components/Playground/scenarios/AnomalyDetection';
import TimeSeriesPredict from '@site/src/components/Playground/scenarios/TimeSeriesPredict';
import ComingSoon from '@site/src/components/Playground/scenarios/ComingSoon';

import styles from './styles.module.css';

// 场景配置：映射后端 serving 名称
const scenarioConfig = {
  'anomaly-detection': {
    name: '异常检测',
    icon: FiActivity,
    type: 'timeseries-anomaly',
    servingName: 'anomaly_detection_servings'
  },
  'time-series': {
    name: '时序预测',
    icon: FiTrendingUp,
    type: 'timeseries-predict',
    servingName: 'timeseries_predict_servings'
  },
  'log-analysis': {
    name: '日志分析',
    icon: FiFileText,
    type: 'log-clustering',
    servingName: 'log_clustering_servings',
    comingSoon: true
  },
  'text-classification': {
    name: '文本分类',
    icon: FiType,
    type: 'text-classification',
    servingName: 'classification_servings',
    comingSoon: true
  },
  'image-classification': {
    name: '图片分类',
    icon: FiImage,
    type: 'image-classification',
    servingName: 'image_classification_servings',
    comingSoon: true
  },
  'object-detection': {
    name: '目标检测',
    icon: FiTarget,
    type: 'object-detection',
    servingName: 'object_detection_servings',
    comingSoon: true
  }
};

// 场景 key → 组件映射
const scenarioComponents = {
  'anomaly-detection': AnomalyDetection,
  'time-series': TimeSeriesPredict,
  'log-analysis': ComingSoon,
  'text-classification': ComingSoon,
  'image-classification': ComingSoon,
  'object-detection': ComingSoon,
};

export default function MLOpsTab() {
  const { siteConfig } = useDocusaurusContext();
  const apiBase = siteConfig.customFields.apiBaseUrl;
  const loginBaseUrl = siteConfig.customFields.loginBaseUrl;

  const [selectedScenario, setSelectedScenario] = useState('anomaly-detection');
  const [selectedModel, setSelectedModel] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  // 动态 serving 列表：{ [scenarioKey]: [{ id, name }] }
  const [servings, setServings] = useState({});
  const [servingsLoading, setServingsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(null);

  const modelDropdownRef = useRef(null);
  const servingsCache = useRef({});

  // 同步 ref 缓存
  useEffect(() => {
    servingsCache.current = servings;
  }, [servings]);

  // 检查登录状态变化，登录后自动加载当前场景的 serving 列表
  useEffect(() => {
    const loggedIn = hasToken();
    setIsLoggedIn(loggedIn);
    if (loggedIn && selectedScenario && !scenarioConfig[selectedScenario]?.comingSoon) {
      fetchServings(selectedScenario);
    }
  }, [selectedScenario]);

  // 从后端获取指定场景的 serving 列表
  const fetchServings = useCallback(async (scenario) => {
    const config = scenarioConfig[scenario];
    if (!config) return;

    // 已缓存则不重复请求（通过 ref 读取，避免 useCallback 依赖 servings）
    const cached = servingsCache.current[scenario];
    if (cached) {
      setSelectedModel(cached[0]?.id || '');
      return;
    }

    setServingsLoading(true);
    setSelectedModel('');
    try {
      const token = getToken();
      const response = await fetch(
        `${apiBase}/${config.servingName}/`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          }
        }
      );

      if (!response.ok) throw new Error(`获取模型列表失败: ${response.status}`);

      const json = await response.json();
      const items = json.data?.items || json.data || json.results || [];
      const list = items
        .filter(item => item.container_info?.state === 'running')
        .map(item => ({
          id: item.id,
          name: item.name || `Serving #${item.id}`,
        }));

      setServings(prev => ({ ...prev, [scenario]: list }));
      if (list.length > 0) {
        setSelectedModel(list[0].id);
      }
    } catch (err) {
      console.error('获取 serving 列表失败:', err);
    } finally {
      setServingsLoading(false);
    }
  }, [apiBase]);

  // 当前场景的 serving 列表
  const currentServings = servings[selectedScenario] || [];

  // Close model dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 根据 selectedScenario 获取场景组件
  const ScenarioComponent = scenarioComponents[selectedScenario] || null;
  const currentConfig = scenarioConfig[selectedScenario];
  const isComingSoon = currentConfig?.comingSoon;

  return (
    <div className={styles.mlopsTab}>
      <PageHeader title="MLOps 模型能力展示" subtitle="选择应用场景，体验 AI 推理能力" />

      <div className={styles.contentWrapper}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>应用场景</h2>
          </div>
          <div className={styles.scenarioList}>
            {Object.entries(scenarioConfig).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div
                  key={key}
                  className={clsx(styles.scenarioItem, selectedScenario === key && styles.selected)}
                  onClick={() => {
                    setSelectedScenario(key);
                  }}
                >
                  <div className={styles.scenarioItemIcon}>
                    <Icon />
                  </div>
                  <div className={styles.scenarioItemInfo}>
                    <div className={styles.scenarioItemName}>{config.name}</div>
                    <div className={styles.scenarioItemCount}>{servings[key]?.length ? `${servings[key].length} 个模型` : '--'}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.sidebarFooter}>
            <div className={styles.modelBadge}>
              {isLoggedIn ? <FiCpu /> : <FiLock />}
              <span>{isLoggedIn ? `${Object.entries(servings).filter(([k]) => !scenarioConfig[k]?.comingSoon).reduce((sum, [, arr]) => sum + arr.length, 0)} 个模型可用` : '登录后查看模型'}</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={styles.mainContent}>
          <div className={styles.inferenceCard}>
            <div className={styles.inferenceHeader}>
              <div className={styles.inferenceHeaderLeft}>
                <h2>推理测试</h2>
                <p>选择模型和数据源执行推理</p>
              </div>
            </div>

            <div className={styles.inferenceBody}>
              {/* Scenario Hint */}
              <div className={clsx(styles.scenarioHint, selectedScenario && styles.hasScenario)}>
                {selectedScenario ? <FiCheck /> : <FiAlertTriangle />}
                <span>
                  当前场景：
                  <span className={styles.scenarioName}>
                    {selectedScenario ? scenarioConfig[selectedScenario].name : '请先从左侧选择应用场景'}
                  </span>
                </span>
              </div>

              {/* Model Selection — 仅非 comingSoon 场景显示 */}
              {!isComingSoon && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>选择模型</label>
                {isLoggedIn === null ? (
                  <div className={styles.selectTrigger} style={{ cursor: 'wait' }}>
                    <span className={styles.selectValue}>检查登录状态中...</span>
                  </div>
                ) : !isLoggedIn ? (
                  <div className={styles.loginHint} onClick={() => redirectToLogin(loginBaseUrl)}>
                    <FiLock />
                    <span>请先登录后选择模型</span>
                  </div>
                ) : servingsLoading ? (
                  <div className={styles.selectTrigger} style={{ cursor: 'wait' }}>
                    <span className={styles.selectValue}>加载模型列表中...</span>
                  </div>
                ) : (
                  <div className={styles.customSelect} ref={modelDropdownRef}>
                    <button
                      type="button"
                      className={clsx(styles.selectTrigger, modelDropdownOpen && styles.selectOpen, !currentServings.length && styles.selectDisabled)}
                      onClick={() => currentServings.length && setModelDropdownOpen(!modelDropdownOpen)}
                      disabled={!currentServings.length}
                    >
                      <span className={styles.selectValue}>
                        {selectedModel
                          ? currentServings.find(m => m.id === selectedModel)?.name || `Serving #${selectedModel}`
                          : currentServings.length ? '请选择模型' : '当前场景无可用模型'}
                      </span>
                      <FiChevronDown className={clsx(styles.selectArrow, modelDropdownOpen && styles.selectArrowUp)} />
                    </button>
                    {modelDropdownOpen && currentServings.length > 0 && (
                      <ul className={styles.selectDropdown}>
                        {currentServings.map((m) => (
                          <li
                            key={m.id}
                            className={clsx(styles.selectOption, selectedModel === m.id && styles.selectOptionActive)}
                            onClick={() => {
                              setSelectedModel(m.id);
                              setModelDropdownOpen(false);
                            }}
                          >
                            <span className={styles.selectOptionName}>{m.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* 场景组件 */}
              {ScenarioComponent && (
                <ScenarioComponent
                  apiBase={apiBase}
                  loginBaseUrl={loginBaseUrl}
                  isLoggedIn={isLoggedIn}
                  selectedModel={selectedModel}
                  scenarioConfig={scenarioConfig[selectedScenario]}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
