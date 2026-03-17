import React from 'react';

import { FiClock } from 'react-icons/fi';

import styles from './index.module.css';

export default function ComingSoon({ scenarioConfig }) {
  const Icon = scenarioConfig?.icon || FiClock;

  return (
    <div className={styles.comingSoon}>
      <div className={styles.iconWrapper}>
        <Icon />
      </div>
      <h3 className={styles.title}>{scenarioConfig?.name || '新场景'}</h3>
      <p className={styles.description}>该场景正在开发中，敬请期待</p>
      <div className={styles.badge}>
        <FiClock />
        <span>Coming Soon</span>
      </div>
    </div>
  );
}
