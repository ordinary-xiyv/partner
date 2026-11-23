import axios from 'axios';
import i18n from '../i18n';
import { formatApiMessage } from '../lib/formatApiMessage';
import { notify } from '../ui/notify';
import { encryptPassword, clearEncryptionKeyCache } from '../utils/transportCrypto';

function isTransportKeyExpiredMessage(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  return (
    message.includes('密钥已过期') ||
    message.includes('密鑰已過期') ||
    message.includes('Password transport key has expired')
  );
}
import type {
  LynxSiteFooterConfig,
  LynxSiteLogoPublic,
  LynxStorageUploadInitData,
  PublicObjectStorageConfig,
  SiteLogosThemed,
} from '../types';
import type { SiteAppearance, SiteAppearancePutBody } from '../types/siteAppearance';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Cache-Control': 'no-store',
  },
});

API.interceptors.request.use((config) => {
  const raw = localStorage.getItem('user');
  if (raw) {
    try {
      const { id } = JSON.parse(raw);
      if (id) config.headers['New-API-User'] = id;
    } catch { /* ignore */ }
  }

  const method = (config.method || 'get').toLowerCase();
  if (method === 'get') {
    // 降低浏览器/HTTP 磁盘缓存误用旧 404 的概率（POST 一般不缓存故少见）
    config.headers['Cache-Control'] = 'no-cache';
    config.headers.Pragma = 'no-cache';
    // 生产环境也需 cache-bust：iOS Safari（尤其 HTTP）易复用 GET 内存缓存
    if (typeof config.url === 'string' && (config.url.startsWith('/api/') || config.url.startsWith('/v1/'))) {
      config.params = { ...(config.params as object | undefined), _: Date.now() };
    }
  }
  return config;
});

API.interceptors.response.use(
  (response) => {
    if (isTransportKeyExpiredMessage(response?.data?.message)) {
      clearEncryptionKeyCache();
    }
    return response;
  },
  (error) => {
    if (isTransportKeyExpiredMessage(error?.response?.data?.message)) {
      clearEncryptionKeyCache();
    }
    if (error.response?.status === 429) {
      const rateMsg = i18n.t('notify.tooManyRequests');
      const resp = error.response;
      return Promise.reject({
        ...error,
        response: {
          ...resp,
          data: {
            ...(typeof resp?.data === 'object' && resp?.data ? resp.data : {}),
            success: false,
            message: rateMsg,
          },
        },
      });
    }
    if (error.response?.status === 401) {
      const msg = error?.response?.data?.message;
      if (typeof msg === 'string' && msg.includes('其他设备登录')) {
        notify.error(formatApiMessage(msg, { fallbackKey: 'notify.sessionKicked' }));
      }
      localStorage.removeItem('user');
      const raw = window.location.pathname;
      const p = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw;
      const isSetupPath = p === '/setup' || p.startsWith('/setup/');
      const isAuthPath = p === '/login' || p === '/register';
      // /setup 未登录调用安装接口，不应因 401 整页踢回登录页（否则看不到错误与进度）
      if (p !== '/' && p !== '/models' && !isSetupPath && !isAuthPath) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?redirect=${redirect}`;
      }
    }
    return Promise.reject(error);
  }
);

export default API;

// Auth
export const login = async (data: { username: string; password: string }) => {
  const password_encrypted = await encryptPassword(data.password);
  return API.post('/api/user/login', { username: data.username, password_encrypted });
};
export const register = async (data: { username: string; password: string; email?: string; verification_code?: string }) => {
  const password_encrypted = await encryptPassword(data.password);
  const payload = { ...data, password_encrypted };
  delete (payload as Record<string, unknown>).password;
  return API.post('/api/user/register', payload);
};
/** 注册/绑定等：发邮箱验证码；开启 Turnstile 时需传 token */
export const sendVerificationCode = (email: string, turnstile?: string) =>
  API.get('/api/lynx/auth/email/verification', {
    params: { email, ...(turnstile ? { turnstile } : {}) },
  }).catch((err) => {
    if (err?.response?.status === 404) {
      return API.get('/api/verification', {
        params: { email, ...(turnstile ? { turnstile } : {}) },
      });
    }
    throw err;
  });

/** 登录后绑定邮箱：验证码校验通过后写入用户邮箱 */
export const bindEmailWithCode = (email: string, code: string) =>
  API.get('/api/lynx/auth/email/bind', { params: { email, code } }).catch((err) => {
    if (err?.response?.status === 404) {
      return API.get('/api/oauth/email/bind', { params: { email, code } });
    }
    throw err;
  });
// export const getCaptcha = () => API.get('/api/lynx/auth/captcha';
export const getCaptcha = () =>
  API.get('/api/lynx/captcha', { params: { _: Date.now() } });
export const verifyCaptchaChallenge = (data: { captcha_id: string; captcha_val: string }) =>
  API.post<{ success: boolean; message: string }>('/api/lynx/auth/captcha-verify', data);
export const passwordLoginWithCaptcha = async (data: { account: string; password: string; captcha_id: string; captcha_val: string }) => {
  const password_encrypted = await encryptPassword(data.password);
  const payload = { ...data, password_encrypted };
  delete (payload as Record<string, unknown>).password;
  return API.post('/api/lynx/auth/password-login', payload);
};
/** 用户短信双因子：用户点击「获取验证码」后发短信（依赖 pending session，非公开 send-code） */
export const passwordLoginSmsSend = () =>
  API.post('/api/lynx/auth/password-login/sms-send');
/** 用户短信双因子：校验短信验证码并完成登录 */
export const passwordLoginSmsVerify = (data: { code: string }) =>
  API.post('/api/lynx/auth/password-login/sms-verify', data);
/** 发送手机号短信验证码；purpose: phone_login | phone_register | phone_reset_password */
export const sendPhoneVerificationCode = (phone: string, purpose: string, captcha?: { captcha_id: string; captcha_val: string }) =>
  API.post('/api/lynx/auth/phone/send-code', {
    phone,
    purpose,
    captcha_id: captcha?.captcha_id,
    captcha_val: captcha?.captcha_val,
  });
/** 手机号 + 短信验证码登录 */
export const phoneLogin = (data: { phone: string; code: string }) =>
  API.post('/api/lynx/auth/phone-login', data);
/** 手机号 + 短信验证码注册（password 留空表示无密码，仅支持验证码登录） */
export const phoneRegister = async (data: {
  phone: string;
  code: string;
  password: string;
  aff_code?: string;
  turnstile_token?: string;
}) => {
  const payload: Record<string, unknown> = { ...data };
  if (data.password) {
    payload.password_encrypted = await encryptPassword(data.password);
    delete payload.password;
  }
  return API.post('/api/lynx/auth/phone-register', payload);
};
/** 已登录用户向目标手机号发送绑定/换绑验证码 */
export const sendBindPhoneCode = (phone: string, captcha?: { captcha_id: string; captcha_val: string }) =>
  API.post('/api/lynx/auth/phone/send-bind-code', {
    phone,
    captcha_id: captcha?.captcha_id,
    captcha_val: captcha?.captcha_val,
  });
/** 已登录用户绑定/换绑手机号 */
export const bindPhone = (data: { phone: string; code: string }) =>
  API.post('/api/lynx/auth/phone/bind', data);
/** 手机号 + 验证码重置密码（公开接口，成功后需重新登录） */
export const phoneResetPassword = async (
  data: { phone: string; code: string; new_password: string },
  turnstile?: string,
) => {
  const new_password_encrypted = await encryptPassword(data.new_password);
  const payload = { ...data, new_password_encrypted };
  delete (payload as Record<string, unknown>).new_password;
  return API.post(
    `/api/lynx/auth/phone/reset-password${turnstile ? `?turnstile=${encodeURIComponent(turnstile)}` : ''}`,
    payload,
  );
};
/** 忘记密码：GET /api/lynx/auth/reset-password/email（图形验证码与发信逻辑在服务端 resetpassword.go 中一并处理） */
export const requestPasswordResetEmail = (
  email: string,
  captcha: { captcha_id: string; captcha_val: string },
) =>
  API.get('/api/lynx/auth/reset-password/email', {
    params: { email, captcha_id: captcha.captcha_id, captcha_val: captcha.captcha_val },
  });
/** 与 loginauth.ResetPassword 一致：POST JSON { email, token, new_password } */
export const resetPasswordWithToken = async (data: { email: string; token: string; password: string }) => {
  const new_password_encrypted = await encryptPassword(data.password);
  return API.post('/api/lynx/auth/reset-password', {
    email: data.email,
    token: data.token,
    new_password_encrypted,
  });
};
// 管理员：锁定账号管理
export const getLockedAccounts = () => API.get('/api/lynx/admin/security/locked-accounts');
export const unlockAccount = (username: string) => API.post('/api/lynx/admin/security/unlock', { username });
export const logout = () => API.get('/api/user/logout');
export const getSelf = () => API.get('/api/user/self');
export const generateUserAccessToken = () => API.get('/api/user/token');
export const updateSelf = async (data: Record<string, unknown>) => {
  const payload = { ...data };
  if (typeof payload.password === 'string' && payload.password) {
    payload.password_encrypted = await encryptPassword(payload.password);
    delete payload.password;
  }
  if (typeof payload.original_password === 'string' && payload.original_password) {
    payload.original_password_encrypted = await encryptPassword(payload.original_password);
    delete payload.original_password;
  }
  return API.put('/api/user/self', payload);
};

// Status
export const getStatus = () => API.get('/api/status');
export const getNotice = () => API.get('/api/notice');
/** 遗留首页 CMS 字段；现用于首页风格标记 default | alt */
export const getHomePageContent = () => API.get('/api/home_page_content');

// Channels
export const getChannels = (params?: Record<string, unknown>) =>
  API.get('/api/channel/', { params });
export const searchChannels = (params: Record<string, unknown>) =>
  API.get('/api/channel/search', { params });
export const getChannel = (id: number) => API.get(`/api/channel/${id}`);
export const addChannel = (data: Record<string, unknown>) => API.post('/api/channel/', data);
export const updateChannel = (data: Record<string, unknown>) => API.put('/api/channel/', data);
export const deleteChannel = (id: number) => API.delete(`/api/channel/${id}`);
export const testChannel = (id: number) => API.get(`/api/channel/test/${id}`);
export const getAdminChannelTypes = () =>
  API.get('/api/lynx/admin/channel/types');

// Tokens
export const getTokens = (params?: Record<string, unknown>) =>
  API.get('/api/token/', { params });
export const searchTokens = (params: Record<string, unknown>) =>
  API.get('/api/token/search', { params });
export const getToken = (id: number) => API.get(`/api/token/${id}`);
export const addToken = (data: Record<string, unknown>) => API.post('/api/token/', data);
export const updateToken = (
  data: Record<string, unknown>,
  options?: { statusOnly?: boolean },
) =>
  API.put('/api/token/', data, {
    params: options?.statusOnly ? { status_only: '1' } : undefined,
  });
export const deleteToken = (id: number) => API.delete(`/api/token/${id}`);
export const getTokenKey = (id: number) => API.post(`/api/token/${id}/key`);
export const getTokenAKSK = (id: number) => API.get(`/api/token/${id}/aksk`);
export const createTokenAKSK = (id: number) => API.post(`/api/token/${id}/aksk`);
export const resetTokenAKSK = (id: number) => API.post(`/api/token/${id}/aksk/reset`);
export const setTokenAKSKEnabled = (id: number, enabled: boolean) => API.put(`/api/token/${id}/aksk`, { enabled });

// Logs
export const getLogs = (params?: Record<string, unknown>) =>
  API.get('/api/log/', { params });
export const searchLogs = (params: Record<string, unknown>) =>
  API.get('/api/log/search', { params });
export const getUserLogs = (params?: Record<string, unknown>) =>
  API.get('/api/log/self', { params });
export const searchUserLogs = (params: Record<string, unknown>) =>
  API.get('/api/log/self/search', { params });
export const exportLogs = (params?: Record<string, unknown>) =>
  API.get('/api/log/export', { params, responseType: 'blob' });
export const exportUserLogs = (params?: Record<string, unknown>) =>
  API.get('/api/log/self/export', { params, responseType: 'blob' });
export const getLogsStat = () => API.get('/api/log/stat');
export const getLogsSelfStat = () => API.get('/api/log/self/stat');
/** 账单页净消费汇总：消耗/预扣/补扣计正，退款计负，由后端一次聚合返回。 */
export const getBillingSummary = (params?: Record<string, unknown>) =>
  API.get('/api/log/self/billing-summary', { params });
export const getLogSummaries = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/log-summaries/user', { params });
export const exportLogSummaries = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/log-summaries/user/export', { params, responseType: 'blob' });
export const rebuildLogSummaries = (params?: Record<string, unknown>) =>
  API.post('/api/lynx/admin/log-summaries/rebuild', null, { params });

export const getLynxDebugLogs = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/debug-logs', { params });
export const getLynxDebugStreamUrl = (params?: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return `/api/lynx/admin/debug-logs/stream${query ? `?${query}` : ''}`;
};

// Users
export const getUsers = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/user/', { params });
export const searchUsers = (params: Record<string, unknown>) =>
  API.get('/api/lynx/user/search', { params });
export const getUser = (id: number) => API.get(`/api/lynx/user/${id}`);
export const createUser = async (data: Record<string, unknown>) => {
  const payload = { ...data };
  if (typeof payload.password === 'string' && payload.password) {
    payload.password_encrypted = await encryptPassword(payload.password);
    delete payload.password;
  }
  return API.post('/api/lynx/user/', payload);
};
export const updateUser = async (data: Record<string, unknown>) => {
  const payload = { ...data };
  if (typeof payload.password === 'string' && payload.password) {
    payload.password_encrypted = await encryptPassword(payload.password);
    delete payload.password;
  }
  return API.put('/api/lynx/user/', payload);
};
export const deleteUser = (id: number) => API.delete(`/api/lynx/user/${id}`);
export const manageUser = (data: Record<string, unknown>) =>
  API.post('/api/lynx/user/manage', data);
export const exportUsers = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/user/export', { params, responseType: 'blob' });

// Redemptions
export const getRedemptions = (params?: Record<string, unknown>) =>
  API.get('/api/redemption/', { params });
export const searchRedemptions = (params: Record<string, unknown>) =>
  API.get('/api/redemption/search', { params });
export const addRedemption = (data: Record<string, unknown>) =>
  API.post('/api/redemption/', data);
export const deleteRedemption = (id: number) => API.delete(`/api/redemption/${id}`);

// TopUp
export const topUp = (data: { key: string }) => API.post('/api/user/topup', data);
export const getTopUpInfo = () => API.get('/api/user/topup/info');
export const getAffCode = () => API.get('/api/user/aff');

// Dashboard data
export const getQuotaDates = (params?: Record<string, unknown>) =>
  API.get('/api/data/', { params });
export const getUserQuotaDates = (params?: Record<string, unknown>) =>
  API.get('/api/data/self', { params });
/** 当前用户按天、按模型聚合的调用趋势（数据源：日志每日汇总表） */
export const getMyLogDailyTrend = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/log-summaries/my/daily-trend', { params });

// Settings (admin)
export const getOptions = () => API.get('/api/option/');
export const updateOption = (data: Record<string, unknown>) => API.put('/api/option/', data);

// Groups
export const getGroups = () => API.get('/api/group/');
export const getUserGroups = () => API.get('/api/user/groups');

// ──────────────────── LynxTokens 闭源接口 ────────────────────

// Organizations
export const getOrgs = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/orgs', { params });
export const createOrg = (data: { name: string; logo?: string }) =>
  API.post('/api/lynx/orgs', data);
export const getOrg = (id: number) => API.get(`/api/lynx/orgs/${id}`);
export const updateOrg = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/orgs/${id}`, data);
export const deleteOrg = (id: number) => API.delete(`/api/lynx/orgs/${id}`);

// 企业 Owner 自管接口
export const getMyOrg = () => API.get('/api/lynx/org/mine');
/** 企业主账号：组织成员范围内的日志列表（查询参数与 /api/log/ 一致，含 username） */
export const getMyOrgLogs = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/org/mine/logs', { params });
/** 企业主账号：组织成员范围内的日志导出（查询参数与 /api/lynx/org/mine/logs 一致） */
export const exportMyOrgLogs = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/org/mine/logs/export', { params, responseType: 'blob' });
/** 企业主账号：组织成员范围内的账单列表（查询参数与 /api/lynx/org/mine/logs 一致） */
export const getMyOrgBills = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/org/mine/bills', { params });
export const exportMyOrgBills = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/org/mine/bills/export', { params, responseType: 'blob' });
export const getMyOrgMembers = () => API.get('/api/lynx/org/mine/members');
export const createOrgSubAccount = async (data: { username: string; password: string; display_name?: string; email?: string; quota_limit?: number; role?: string }) => {
  const password_encrypted = await encryptPassword(data.password);
  const payload = { ...data, password_encrypted };
  delete (payload as Record<string, unknown>).password;
  return API.post('/api/lynx/org/mine/members', payload);
};
export const updateOrgMemberQuota = (uid: number, data: { quota_limit?: number; status?: number }) =>
  API.put(`/api/lynx/org/mine/members/${uid}/quota`, data);
export const removeOrgSubAccount = (uid: number) =>
  API.delete(`/api/lynx/org/mine/members/${uid}`);
export const resetMemberPassword = async (uid: number, password: string) => {
  const password_encrypted = await encryptPassword(password);
  return API.put(`/api/lynx/org/mine/members/${uid}/password`, { password_encrypted });
};
// 平台管理员：设置企业总池额度
export const setOrgQuota = (orgId: number, quota: number) =>
  API.put(`/api/lynx/orgs/${orgId}/quota`, { quota });

// Org Members
export const getOrgMembers = (orgId: number) =>
  API.get(`/api/lynx/orgs/${orgId}/members`);
export const addOrgMember = (orgId: number, data: { user_id: number; role?: string; quota_limit?: number }) =>
  API.post(`/api/lynx/orgs/${orgId}/members`, data);
export const updateOrgMember = (orgId: number, uid: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/orgs/${orgId}/members/${uid}`, data);
export const removeOrgMember = (orgId: number, uid: number) =>
  API.delete(`/api/lynx/orgs/${orgId}/members/${uid}`);

// Credit
export const getCreditAccounts = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/credit/accounts', { params });
export const createCreditAccount = (data: Record<string, unknown>) =>
  API.post('/api/lynx/credit/accounts', data);
export const updateCreditAccount = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/credit/accounts/${id}`, data);
export const freezeCreditAccount = (id: number) =>
  API.post(`/api/lynx/credit/accounts/${id}/freeze`);
export const unfreezeCreditAccount = (id: number) =>
  API.post(`/api/lynx/credit/accounts/${id}/unfreeze`);
export const getCreditBills = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/credit/bills', { params });
export const getCreditBill = (id: number) =>
  API.get(`/api/lynx/credit/bills/${id}`);
export const getCreditTransactions = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/credit/transactions', { params });

// Audit
export const getAuditLogs = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/audit/logs', { params });

// Model Pricing
export const resetModelRatio = () => API.post('/api/option/rest_model_ratio');
export const getPricing = () => API.get('/api/pricing');

// Plans (public)
export const getPlans = () => API.get('/api/lynx/plans');

// Admin Plans
export const getAdminPlans = () => API.get('/api/lynx/admin/plans');
export const createPlan = (data: Record<string, unknown>) => API.post('/api/lynx/admin/plans', data);
export const updatePlan = (id: number, data: Record<string, unknown>) => API.put(`/api/lynx/admin/plans/${id}`, data);
export const deletePlan = (id: number) => API.delete(`/api/lynx/admin/plans/${id}`);

// Admin Subscriptions
export const getAdminSubscriptions = (params?: Record<string, unknown>) => API.get('/api/lynx/admin/subscriptions', { params });
export const grantSubscription = (data: Record<string, unknown>) => API.post('/api/lynx/admin/subscriptions', data);

// 可选分组（当前登录用户，供令牌分配使用）
export const getSelectableGroups = () => API.get('/api/lynx/groups');

// 管理员分组（lc_groups）
export const getAdminGroups = (params?: { search?: string }) =>
  API.get('/api/lynx/admin/groups', { params });
export const createAdminGroup = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/groups', data);
export const updateAdminGroup = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/admin/groups/${id}`, data);
export const deleteAdminGroup = (id: number) =>
  API.delete(`/api/lynx/admin/groups/${id}`);
export const syncAdminGroups = () =>
  API.post('/api/lynx/admin/groups/sync');

// My Subscriptions
export const getMySubscriptions = (params?: Record<string, unknown>) => API.get('/api/lynx/subscriptions/my', { params });
export const createSubscriptionOrder = (data: { plan_id: number; payment_method: 'alipay_native' | 'wechat_native' }) =>
  API.post('/api/lynx/subscriptions/orders', data);

// Distribution (admin)
export const getAgents = (params?: Record<string, unknown>) => API.get('/api/lynx/distribution/agents', { params });
export const createAgent = (data: Record<string, unknown>) => API.post('/api/lynx/distribution/agents', data);
export const updateAgent = (id: number, data: Record<string, unknown>) => API.put(`/api/lynx/distribution/agents/${id}`, data);
export const getCommissionRecords = (agentId: number, params?: Record<string, unknown>) => API.get(`/api/lynx/distribution/agents/${agentId}/commissions`, { params });
export const settleAgent = (agentId: number, data: Record<string, unknown>) => API.post(`/api/lynx/distribution/agents/${agentId}/settle`, data);

// Payment channels
export const requestEpay = (data: { amount: number; payment_method: string }) =>
  API.post('/api/user/pay', data);
export const requestStripePay = (data: { amount: number; payment_method: string; success_url?: string; cancel_url?: string }) =>
  API.post('/api/user/stripe/pay', data);
export const requestCreemPay = (data: { product_id: string; payment_method: string }) =>
  API.post('/api/user/creem/pay', data);
export const getStripeAmount = (data: { amount: number }) =>
  API.post('/api/user/stripe/amount', data);
export const getUserTopUps = (params?: Record<string, unknown>) =>
  API.get('/api/user/topup/self', { params });
export const exportConsumeBill = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/billing/export/consume', { params, responseType: 'blob' });
export const exportTopupBill = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/billing/export/topups', { params, responseType: 'blob' });
export const exportSubscriptionBill = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/billing/export/subscriptions', { params, responseType: 'blob' });

// Native Payment (直连支付宝/微信)
export const getPaymentConfig = () => API.get('/api/lynx/payment/config');
export const updatePaymentConfig = (data: Record<string, string>) => API.put('/api/lynx/payment/config', data);
export const getPaymentInfo = () => API.get('/api/lynx/payment/info');
export const requestNativePay = (data: { amount: number; payment_method: string }) =>
  API.post('/api/lynx/payment/pay', data);
export const queryPaymentStatus = (tradeNo: string) =>
  API.get('/api/lynx/payment/status', { params: { trade_no: tradeNo } });

// 银行收款方信息（对公转账）
export interface OrgBankReceiver {
  accountName: string;
  taxNo: string;
  bankName: string;
  bankAccount: string;
  address: string;
  phone: string;
}
export const getOrgBankReceiver = () => API.get('/api/lynx/payment/receiver');
export const getOrgBankReceiverRaw = () => API.get('/api/lynx/admin/payment/receiver');
export const updateOrgBankReceiver = (data: OrgBankReceiver) =>
  API.put('/api/lynx/admin/payment/receiver', data);

// ──────────────────── Billing (对账结算) ────────────────────

// 上游价格规则
export const getPriceRules = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/billing/price-rules', { params });
export const createPriceRule = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/billing/price-rules', data);
export const deletePriceRule = (id: number) =>
  API.delete(`/api/lynx/admin/billing/price-rules/${id}`);

// 汇率
export const upsertFxRate = (data: { target: string; rate: number; source?: string }) =>
  API.post('/api/lynx/admin/billing/fx-rates', data);

// 上游账单
export const getBillingInvoices = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/billing/invoices', { params });
export const importBillingInvoice = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/billing/invoices', data);

// 对账
export const runReconciliation = (data: { provider_id: number; provider_name?: string; invoice_id: number }) =>
  API.post('/api/lynx/admin/billing/reconcile', data);
export const getReconciliations = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/billing/reconciliations', { params });
export const resolveReconciliation = (id: number, data: { status: string; note?: string }) =>
  API.put(`/api/lynx/admin/billing/reconciliations/${id}`, data);

// 下游结算账单
export const getSettlementBills = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/billing/settlement-bills', { params });
export const generateSettlementBill = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/billing/settlement-bills/generate', data);
export const updateSettlementBill = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/admin/billing/settlement-bills/${id}`, data);

// 网关单笔阶梯定价（平台管理员）
export const getGatewayTierRules = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/billing/gateway-tier-rules', { params });
export const createGatewayTierRule = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/billing/gateway-tier-rules', data);
export const updateGatewayTierRule = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/admin/billing/gateway-tier-rules/${id}`, data);
export const deleteGatewayTierRule = (id: number) =>
  API.delete(`/api/lynx/admin/billing/gateway-tier-rules/${id}`);
export const previewGatewayTierRule = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/billing/gateway-tier-rules/preview', data);
export const getGatewayTierLedger = (id: number, params?: Record<string, unknown>) =>
  API.get(`/api/lynx/admin/billing/gateway-tier-rules/${id}/ledger`, { params });

// 模型限流配置（平台管理员）
export const getRateLimits = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/rate-limits', { params });
export const getRateLimit = (id: number) =>
  API.get(`/api/lynx/admin/rate-limits/${id}`);
export const createRateLimit = (data: Record<string, unknown>) =>
  API.post('/api/lynx/admin/rate-limits', data);
export const updateRateLimit = (id: number, data: Record<string, unknown>) =>
  API.put(`/api/lynx/admin/rate-limits/${id}`, data);
export const deleteRateLimit = (id: number) =>
  API.delete(`/api/lynx/admin/rate-limits/${id}`);
export const enableRateLimit = (id: number) =>
  API.post(`/api/lynx/admin/rate-limits/${id}/enable`);
export const disableRateLimit = (id: number) =>
  API.post(`/api/lynx/admin/rate-limits/${id}/disable`);
export const getRateLimitStats = () =>
  API.get('/api/lynx/admin/rate-limit-stats');

/** 当前用户所属企业的折扣规则（企业成员） */
export const getMyOrgDiscountRules = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/org/mine/discount-rules', { params });

// Billing aliases (AdminBilling.tsx uses these names)
export const getUpstreamInvoices = getBillingInvoices;
export const importUpstreamInvoice = importBillingInvoice;

// Model Meta (Admin)
export const getModelsMeta = (params?: Record<string, unknown>) =>
  API.get('/api/models/search', { params });
export const getModelMeta = (id: number) => API.get(`/api/models/${id}`);
export const updateModelMeta = (data: Record<string, unknown>) => API.put('/api/models/', data);
export const getVendors = () => API.get('/api/vendors/');

// Enterprise Applications
export const getProfileExt = () => API.get('/api/lynx/profile/ext');
export const getEnterpriseApplications = (params?: Record<string, unknown>) =>
  API.get('/api/lynx/admin/enterprise/applications', { params });
export const getEnterpriseApplication = (id: number) =>
  API.get(`/api/lynx/admin/enterprise/applications/${id}`);
export const approveEnterpriseApplication = async (id: number, data: { password: string; note?: string }) => {
  const password_encrypted = await encryptPassword(data.password);
  const payload = { ...data, password_encrypted };
  delete (payload as Record<string, unknown>).password;
  return API.post(`/api/lynx/admin/enterprise/applications/${id}/approve`, payload);
};
export const rejectEnterpriseApplication = (id: number, data: { note?: string }) =>
  API.post(`/api/lynx/admin/enterprise/applications/${id}/reject`, data);

// ── System config (public, no auth) ──
export const getLynxConfig = () => API.get('/api/lynx/config');

/** 页脚配置（公开，无需登录） */
export const getPublicSiteFooter = () =>
  API.get<{ success: boolean; data?: LynxSiteFooterConfig; message?: string }>('/api/lynx/config/footer');

/** 对象存储公开摘要（无密钥；URL/路径模板与后端 object_storage_setting 一致） */
export const getPublicObjectStorageConfig = () =>
  API.get<{ success: boolean; data?: PublicObjectStorageConfig; message?: string }>(
    '/api/lynx/config/object-storage',
  );

/** 已登录用户：按 file_id 换取短时预签名下载 URL（图像历史裂图刷新用） */
export const getStorageFileDownloadUrl = (fileId: string) =>
  API.get<{ success: boolean; data?: { url?: string; expires_in?: number }; message?: string }>(
    `/api/lynx/storage/files/${encodeURIComponent(fileId)}/download-url`,
  );

/** 最近站点 Logo 列表（公开，legacy site_logo） */
export const getPublicSiteLogos = (params?: { limit?: number }) =>
  API.get<{ success: boolean; data?: unknown[]; message?: string }>('/api/lynx/branding/logos', {
    params,
  });

/** Light/Dark 主题 Logo（公开，各取最新一条） */
export const getPublicSiteLogosThemed = () =>
  API.get<{ success: boolean; data?: SiteLogosThemed; message?: string }>(
    '/api/lynx/branding/logos/themed',
  );

/** 最近站点 Favicon 列表（公开，无需登录） */
export const getPublicSiteFavicons = (params?: { limit?: number }) =>
  API.get<{ success: boolean; data?: unknown[]; message?: string }>('/api/lynx/branding/favicons', {
    params,
  });

/** 管理员：初始化 Logo 上传（需登录且管理员；variant 为 light | dark） */
export const initSiteLogoUpload = (data: {
  original_name: string;
  content_type: string;
  size_bytes: number;
  variant?: 'light' | 'dark';
}) =>
  API.post<{ success: boolean; data?: LynxStorageUploadInitData; message?: string }>(
    '/api/lynx/admin/site/logo/upload-init',
    data,
  );

/** 服务端代传 Logo（同源，无需浏览器直传 OSS） */
export const proxySiteLogoUpload = (fileId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<{ success: boolean; message?: string }>(
    `/api/lynx/admin/site/logo/${encodeURIComponent(fileId)}/upload`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

/** 管理员：初始化 Favicon 上传 */
export const initSiteFaviconUpload = (data: {
  original_name: string;
  content_type: string;
  size_bytes: number;
}) =>
  API.post<{ success: boolean; data?: LynxStorageUploadInitData; message?: string }>(
    '/api/lynx/admin/site/favicon/upload-init',
    data,
  );

/** 服务端代传 Favicon */
export const proxySiteFaviconUpload = (fileId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<{ success: boolean; message?: string }>(
    `/api/lynx/admin/site/favicon/${encodeURIComponent(fileId)}/upload`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

/** 管理员：初始化客服二维码上传 */
export const initSiteCustomerServiceQrUpload = (data: {
  original_name: string;
  content_type: string;
  size_bytes: number;
}) =>
  API.post<{ success: boolean; data?: LynxStorageUploadInitData; message?: string }>(
    '/api/lynx/admin/site/customer-service/upload-init',
    data,
  );

/** 服务端代传客服二维码 */
export const proxySiteCustomerServiceQrUpload = (fileId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return API.post<{ success: boolean; message?: string }>(
    `/api/lynx/admin/site/customer-service/${encodeURIComponent(fileId)}/upload`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

/** 最近客服二维码（公开） */
export const getPublicCustomerServiceQrImages = (params?: { limit?: number }) =>
  API.get<{ success: boolean; data?: LynxSiteLogoPublic[]; message?: string }>(
    '/api/lynx/branding/customer-service',
    { params },
  );

/** 管理员：完成 Logo 上传落库（直传 OSS 流程使用；代传接口内部会自动 complete） */
export const completeSiteLogoUpload = (id: string, data?: { etag?: string }) =>
  API.post<{ success: boolean; message?: string }>(
    `/api/lynx/admin/site/logo/${encodeURIComponent(id)}/complete`,
    data ?? {},
  );

/** 管理员：更新页脚文案（链接由前端固定） */
export const putAdminSiteFooter = (data: Record<string, string>) =>
  API.put<{ success: boolean; data?: LynxSiteFooterConfig; message?: string }>(
    '/api/lynx/admin/site/footer',
    data,
  );

/** 站点外观（公开，无需登录）；404 为后端未就绪，不抛错 */
export const getPublicSiteAppearance = () =>
  API.get<{ success: boolean; data?: SiteAppearance; message?: string }>(
    '/api/lynx/branding/site',
    { validateStatus: (status) => status === 200 || status === 404 },
  );

/** 管理员：一次保存站点外观（Logo 仍走独立上传接口） */
export const putAdminSiteAppearance = (data: SiteAppearancePutBody) =>
  API.put<{ success: boolean; data?: SiteAppearance; message?: string }>(
    '/api/lynx/admin/site/appearance',
    data,
  );

/** 预签名直传（避免 axios 改写 body） */
export async function putPresignedObjectUpload(
  uploadUrl: string,
  method: string | undefined,
  headers: Record<string, string> | undefined,
  blob: Blob,
): Promise<Response> {
  const h = new Headers();
  if (headers && typeof headers === 'object') {
    Object.entries(headers).forEach(([k, v]) => {
      if (v != null && v !== '') h.set(k, String(v));
    });
  }
  return fetch(uploadUrl, {
    method: (method || 'PUT').toUpperCase(),
    headers: h,
    body: blob,
    mode: 'cors',
    credentials: 'omit',
  });
}

/** Logo 第二跳上传：本站返回相对路径 `/api/lynx/admin/site/logo/raw/:id` 时需走 axios（携带 New-API-User）；对象存储仍用 fetch */
export async function siteLogoPutUpload(
  uploadUrl: string,
  method: string | undefined,
  headers: Record<string, string> | Record<string, unknown> | undefined,
  blob: Blob,
): Promise<{ ok: boolean; etag?: string }> {
  const normalized = uploadUrl.trim();
  const isInternal =
    normalized.startsWith('/api/lynx/admin/site/logo/raw/') ||
    /\/api\/lynx\/admin\/site\/logo\/raw\//.test(normalized);

  const serverHeaders: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    Object.entries(headers).forEach(([k, v]) => {
      if (v != null && v !== '') serverHeaders[k] = String(v);
    });
  }

  if (isInternal) {
    const merged = { ...serverHeaders };
    const ct =
      merged['Content-Type'] ||
      merged['content-type'] ||
      blob.type ||
      'application/octet-stream';
    merged['Content-Type'] = ct;

    let path = normalized;
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      try {
        path = new URL(normalized).pathname;
      } catch {
        return { ok: false };
      }
    }
    try {
      const res = await API.put(path, blob, {
        headers: merged,
        transformRequest: [(data) => data],
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      if (!res.data?.success) {
        return { ok: false };
      }
      const etagRaw = res.headers['etag'] ?? (res.headers as Record<string, string>)['ETag'];
      const etag = typeof etagRaw === 'string' ? etagRaw.replace(/^"|"$/g, '') : undefined;
      return { ok: true, etag };
    } catch {
      return { ok: false };
    }
  }

  // 阿里云 OSS / S3 预签名：客户端请求头须与生成签名时一致，禁止擅自追加 Content-Type（易触发 SignatureDoesNotMatch）
  const putResp = await putPresignedObjectUpload(uploadUrl, method, serverHeaders, blob);
  if (!putResp.ok) {
    return { ok: false };
  }
  const etagRaw = putResp.headers.get('etag') || putResp.headers.get('ETag');
  const etag = etagRaw?.replace(/^"|"$/g, '') ?? '';
  return { ok: true, etag };
}
