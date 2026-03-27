import React, { useEffect, useMemo, useRef, useState } from 'react';

import clsx from 'clsx';
import { FiLogOut, FiUser } from 'react-icons/fi';

import { AUTH_STATE_CHANGE_EVENT, hasToken, logout } from '@site/src/lib/playgroundAuth';

import styles from './styles.module.css';

export default function LogoutNavbarButton({ mobile = false, label = '账号' }) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => hasToken());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const normalizedLabel = useMemo(() => label.trim() || '账号', [label]);

  useEffect(() => {
    const syncAuthState = () => {
      const nextLoggedIn = hasToken();
      setIsLoggedIn(nextLoggedIn);
      if (!nextLoggedIn) {
        setMenuOpen(false);
      }
    };

    syncAuthState();
    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen || mobile) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, mobile]);

  if (!isLoggedIn) {
    return null;
  }

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
  };

  if (mobile) {
    return (
      <button
        type="button"
        className={clsx(styles.mobileLogoutButton, 'clean-btn')}
        onClick={handleLogout}
      >
        <FiLogOut />
        <span>退出登录</span>
      </button>
    );
  }

  return (
    <div className={styles.accountMenu} ref={menuRef}>
      <button
        type="button"
        className={clsx(styles.accountButton, menuOpen && styles.accountButtonOpen)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={normalizedLabel}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <FiUser />
      </button>

      {menuOpen && (
        <div className={styles.menuPanel} role="menu" aria-label={`${normalizedLabel}菜单`}>
          <div className={styles.menuHeader}>{normalizedLabel}</div>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={handleLogout}
          >
            <FiLogOut />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  );
}
