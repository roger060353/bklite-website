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
  FiCpu,
  FiChevronDown,
  FiLock
} from 'react-icons/fi';

import { AUTH_STATE_CHANGE_EVENT, getToken, hasToken, redirectToLogin } from '@site/src/lib/playgroundAuth';
import AnomalyDetection from '@site/src/components/Playground/scenarios/AnomalyDetection';
import TimeSeriesPredict from '@site/src/components/Playground/scenarios/TimeSeriesPredict';
import ComingSoon from '@site/src/components/Playground/scenarios/ComingSoon';

import styles from './styles.module.css';

// 场景配置：映射后端 serving 名称
const scenarioConfig = {
  'anomaly-detection': {
    name: '异常检测',
    description: '识别时间序列中的异常波动，帮助快速发现异常峰值、突增或突降。',
    guide: '适合监控指标与资源使用率数据，可直接使用示例数据或上传自己的时间序列进行验证。',
    icon: FiActivity,
    algorithmType: 'anomaly_detection',
    servingName: 'anomaly_detection_servings'
  },
  'time-series': {
    name: '时序预测',
    description: '基于历史趋势预测未来一段时间的数据变化，适合容量与负载趋势预估。',
    guide: '选择模型后可先用示例数据体验，再通过上传自己的指标数据验证预测效果。',
    icon: FiTrendingUp,
    algorithmType: 'timeseries_predict',
    servingName: 'timeseries_predict_servings'
  },
  'log-analysis': {
    name: '日志分析',
    description: '对日志内容进行聚类与归类，帮助识别相似问题和异常日志模式。',
    guide: '适合批量日志理解与问题归类场景，后续将开放在线体验能力。',
    icon: FiFileText,
    algorithmType: 'log_clustering',
    servingName: 'log_clustering_servings',
    comingSoon: true
  },
  'text-classification': {
    name: '文本分类',
    description: '对文本内容进行自动分类，适合工单、告警说明和文本标签场景。',
    guide: '适合标准化文本归类场景，后续将开放模型体验与示例数据流程。',
    icon: FiType,
    algorithmType: 'classification',
    servingName: 'classification_servings',
    comingSoon: true
  },
  'image-classification': {
    name: '图片分类',
    description: '识别图片所属类别，适合标准化图像识别与自动归类任务。',
    guide: '适合单目标图像分类场景，后续将提供图片上传与推理体验。',
    icon: FiImage,
    algorithmType: 'image_classification',
    servingName: 'image_classification_servings',
    comingSoon: true
  },
  'object-detection': {
    name: '目标检测',
    description: '检测图像中的目标位置与类别，适合定位与识别并存的视觉任务。',
    guide: '适合图像中多目标定位场景，后续将开放示例图片与检测结果展示。',
    icon: FiTarget,
    algorithmType: 'object_detection',
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
        `${apiBase}/servings/${config.algorithmType}`,
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

  const syncLoginState = useCallback(() => {
    const loggedIn = hasToken();
    setIsLoggedIn(loggedIn);
    if (loggedIn && selectedScenario && !scenarioConfig[selectedScenario]?.comingSoon) {
      fetchServings(selectedScenario);
    }
  }, [fetchServings, selectedScenario]);

  // 检查登录状态变化，登录后自动加载当前场景的 serving 列表
  useEffect(() => {
    syncLoginState();
  }, [syncLoginState]);

  useEffect(() => {
    const handleAuthStateChange = () => {
      syncLoginState();
    };

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, handleAuthStateChange);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, handleAuthStateChange);
    };
  }, [syncLoginState]);

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
      <div className={styles.moduleOverviewWrap}>
        <div className={styles.moduleOverview}>
          <span className={styles.moduleOverviewTag}>MLOps</span>
          <p className={styles.moduleOverviewText}>
            聚焦监控分析与趋势预测等运维场景。
          </p>
        </div>
      </div>

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
                <h2>{currentConfig?.name || '请选择场景'}</h2>
                <p>{currentConfig?.description || '从左侧选择一个场景后开始体验。'}</p>
              </div>
            </div>

            <div className={styles.inferenceBody}>
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
                <div className={clsx(styles.lockedContent, isLoggedIn === false && styles.lockedContentActive)}>
                  <div className={styles.lockedContentInner}>
                    <ScenarioComponent
                      apiBase={apiBase}
                      loginBaseUrl={loginBaseUrl}
                      isLoggedIn={isLoggedIn}
                      selectedModel={selectedModel}
                      scenarioConfig={scenarioConfig[selectedScenario]}
                    />
                  </div>

                  {isLoggedIn === false && !isComingSoon && (
                    <div className={styles.lockedOverlay}>
                      <div className={styles.lockedOverlayCard}>
                        <div className={styles.lockedOverlayIcon}>
                          <FiLock />
                        </div>
                        <div className={styles.lockedOverlayText}>
                          <strong>登录后解锁模型体验</strong>
                          <span>选择模型后可使用示例数据、上传数据并开始在线推理。</span>
                        </div>
                        <button
                          type="button"
                          className={styles.lockedOverlayButton}
                          onClick={() => redirectToLogin(loginBaseUrl)}
                        >
                          立即登录
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
