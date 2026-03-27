import React, { useState, useEffect } from 'react';

import clsx from 'clsx';

import Layout from '@theme/Layout';

import MLOpsTab from '@site/src/components/Playground/MLOpsTab';
import OpsPilotTab from '@site/src/components/Playground/OpsPilotTab';

import { verifyLoginCallback, hasToken } from '@site/src/lib/playgroundAuth';

import styles from './index.module.css';

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState('mlops');

  // 处理登录回调：验证 third_login_code 并自动切换到 MLOps tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('third_login_code')) {
      const isValid = verifyLoginCallback();
      if (isValid && hasToken()) {
        setActiveTab('mlops');
      }
    }
  }, []);

  return (
    <Layout title="AI体验">
      <div className={styles.demoPage}>
        {/* Tab Bar */}
        <div className={styles.tabBar}>
          <div className={styles.tabBarInner}>
            <button
              type="button"
              className={clsx(styles.tabItem, activeTab === 'mlops' && styles.tabItemActive)}
              onClick={() => setActiveTab('mlops')}
            >
              MLOps
            </button>
            <button
              type="button"
              className={clsx(styles.tabItem, activeTab === 'opspilot' && styles.tabItemActive)}
              onClick={() => setActiveTab('opspilot')}
            >
              OpsPilot
            </button>
          </div>
        </div>
        {/* Tab Content */}
        {activeTab === 'mlops' && <MLOpsTab />}
        {activeTab === 'opspilot' && <OpsPilotTab />}
      </div>
    </Layout>
  );
}
