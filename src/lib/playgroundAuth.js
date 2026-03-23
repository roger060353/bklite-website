/**
 * 认证工具模块
 * 处理 bklite_token 检查、第三方登录跳转、回调验证
 */

const TOKEN_COOKIE_NAME = 'bklite_token';
const LOGIN_CODE_KEY = 'bklite_third_login_code';
export const AUTH_STATE_CHANGE_EVENT = 'bklite-auth-state-change';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * 从 cookie 中获取指定名称的值
 */
export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 设置 cookie
 */
function setCookie(name, value) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function notifyAuthStateChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_STATE_CHANGE_EVENT));
}

/**
 * 检查是否已登录（cookie 中存在 bklite_token）
 */
export function hasToken() {
  return !!getCookie(TOKEN_COOKIE_NAME);
}

/**
 * 获取当前 token
 */
export function getToken() {
  return getCookie(TOKEN_COOKIE_NAME);
}

/**
 * 生成随机 third_login_code
 */
function generateLoginCode() {
  if (typeof crypto === 'undefined') return '';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 跳转到登录页面
 * 1. 生成 third_login_code 存入 sessionStorage
 * 2. 构建登录 URL（含 callbackUrl）
 * 3. 跳转
 * @param {string} loginBaseUrl - 登录页地址，由调用方传入
 */
export function redirectToLogin(loginBaseUrl) {
  if (!isBrowser()) return;

  const code = generateLoginCode();
  sessionStorage.setItem(LOGIN_CODE_KEY, code);

  // 回调地址：当前站点的 /playground 页面，附带 third_login_code 参数
  const callbackUrl = window.location.origin + '/playground?third_login_code=' + code;
  const loginUrl = new URL(loginBaseUrl, window.location.origin);
  loginUrl.searchParams.set('callbackUrl', callbackUrl);
  loginUrl.searchParams.set('thirdLogin', 'true');

  window.location.href = loginUrl.toString();
}

/**
 * 验证回调中的 third_login_code
 * 检查 URL 参数中的 code 是否与 sessionStorage 中存储的一致
 * @returns {boolean} 验证是否通过
 */
export function verifyLoginCallback() {
  if (!isBrowser()) return false;

  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('third_login_code');
  const token = params.get('token');

  if (!urlCode) return false;

  const storedCode = sessionStorage.getItem(LOGIN_CODE_KEY);
  const isValid = urlCode === storedCode;

  if (isValid && token) {
    setCookie(TOKEN_COOKIE_NAME, token);
    notifyAuthStateChange();
  }

  // 验证完毕，清理 sessionStorage 和 URL 参数
  sessionStorage.removeItem(LOGIN_CODE_KEY);
  cleanUrlParams();

  return isValid;
}

/**
 * 清理 URL 中的认证参数，保持地址栏干净
 */
function cleanUrlParams() {
  if (!isBrowser()) return;

  const url = new URL(window.location.href);
  url.searchParams.delete('third_login_code');
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.pathname + url.search);
}

/**
 * 认证拦截：检查 token，未登录则跳转
 * @param {string} loginBaseUrl - 登录页地址，由调用方传入
 * @returns {boolean} true=已登录可继续，false=未登录已跳转
 */
export function requireAuth(loginBaseUrl) {
  if (hasToken()) return true;
  redirectToLogin(loginBaseUrl);
  return false;
}
