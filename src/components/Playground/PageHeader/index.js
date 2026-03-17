import React from 'react';

import styles from './styles.module.css';

/**
 * 通用页面头部组件，用于 MLOps / OpsPilot 等 Tab 页顶部
 * @param {string} title - 主标题
 * @param {string} subtitle - 副标题
 */
export default function PageHeader({ title, subtitle }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderInner}>
        <div className={styles.pageHeaderContent}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
