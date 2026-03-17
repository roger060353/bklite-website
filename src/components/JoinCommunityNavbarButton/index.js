import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import IconExternalLink from '@theme/Icon/ExternalLink';

import styles from './styles.module.css';

function QRCodeModal({ onClose }) {
  return createPortal(
    <div className={styles.qrModal} onClick={onClose}>
      <div className={styles.qrModalContent} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          ×
        </button>
        <h3 className={styles.qrTitle}>扫码加入社区</h3>
        <div className={styles.qrImageContainer}>
          <img
            src="/img/community-qrcode.png"
            alt="社区二维码"
            className={styles.qrImage}
          />
        </div>
        <p className={styles.qrDescription}>
          扫描二维码加入 BlueKing Lite 开源社区，与开发者们一起交流讨论
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default function JoinCommunityNavbarButton({ label = '🌍 加入社区' }) {
  const [showQRCode, setShowQRCode] = useState(false);
  const buttonLabel = useMemo(() => label.replace(/^🌍\s*/, ''), [label]);

  const handleOpen = (e) => {
    e.preventDefault();
    setShowQRCode(true);
  };

  const handleClose = () => {
    setShowQRCode(false);
  };

  return (
    <>
      <a
        href="/community"
        className={styles.navbarCommunityButton}
        onClick={handleOpen}
      >
        <span>{buttonLabel}</span>
        <IconExternalLink width={13.5} height={13.5} />
      </a>
      {showQRCode && <QRCodeModal onClose={handleClose} />}
    </>
  );
}
