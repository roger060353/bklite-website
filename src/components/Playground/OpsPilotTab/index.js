import React from 'react';

import styles from './styles.module.css';

export default function OpsPilotTab() {
  return (
    <div className={styles.opsPilotTab}>
      <div className={styles.placeholderWrap}>
        <div className={styles.placeholderCard}>
          <div className={styles.placeholderBadge}>OpsPilot</div>
          <h2 className={styles.placeholderTitle}>敬请期待</h2>
          <p className={styles.placeholderDescription}>
            OpsPilot AI 场景体验正在完善中，后续将开放更完整的智能运维能力展示。
          </p>
        </div>
      </div>
    </div>
  );
}
