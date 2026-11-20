import dayjs from 'dayjs';
import type { PlatformPermission, User } from '../types';
import { hasPermissionForUser, isPlatformAdmin as checkIsPlatformAdmin } from './permission';

// ── 全局货币配置（由 StatusContext 初始化） ──
let _currencySymbol = '¥';
let _currencyRate = 1;

/** StatusContext 加载后调用此函数设置全局货币 */
export function setCurrencyGlobal(symbol: string, rate: number) {
  _currencySymbol = symbol;
  _currencyRate = rate;
}

/** 获取货币符号（全局） */
export function getCurrencySymbol(): string {
  return _currencySymbol;
}

/** 获取汇率（全局） */
export function getCurrencyRate(): number {
  return _currencyRate;
}

/** 每百万 Token 的展示货币金额：固定 4 位小数（与定价表展示一致） */
export function formatPer1mDisplayAmount(displayAmount: number): string {
  const n = Number(displayAmount);
  if (!Number.isFinite(n)) return (0).toFixed(4);
  return n.toFixed(4);
}

/** 已是展示货币的「元」级数值（如到账金额）：固定 4 位小数 */
export function formatMoneyMajorUnits(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return (0).toFixed(4);
  return n.toFixed(4);
}

/**
 * 后端常以整数「分」存储的金额：÷100 × 汇率 → 展示货币，含符号，固定 4 位小数。
 */
export function formatMinorMoney(amountMinor: number | null | undefined, rate: number, symbol: string): string {
  const n = (Number(amountMinor ?? 0) / 100) * Number(rate);
  if (!Number.isFinite(n)) return symbol + (0).toFixed(4);
  return symbol + n.toFixed(4);
}

/** 将 quota 转为 USD 数值字符串（不带符号，向后兼容） */
export function renderQuota(quota: number, digits = 2, quotaPerUnit = 500000): string {
  if (!quota || isNaN(quota)) return '0.00';
  const q = quota / quotaPerUnit;
  if (q < 0.01) return q.toFixed(4);
  return q.toFixed(digits);
}

/** 将 quota 转为带货币符号的本地化金额字符串；`digits` 对含 0 在内的小数位数一致生效 */
export function renderAmount(quota: number, digits = 4, quotaPerUnit = 500000): string {
  if (quota === null || quota === undefined || Number.isNaN(quota)) {
    return _currencySymbol + (0).toFixed(digits);
  }
  if (quota === 0) {
    return _currencySymbol + (0).toFixed(digits);
  }
  const usd = quota / quotaPerUnit;
  const amount = usd * _currencyRate;
  if (amount > 0 && amount < 0.01 && digits < 4) {
    return _currencySymbol + amount.toFixed(4);
  }
  return _currencySymbol + amount.toFixed(digits);
}

// ── Time formatting ──
export function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  return dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
}

// ── Clipboard ──
/** Works on http:// non-localhost via execCommand fallback (Clipboard API needs secure context). */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to fallback
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// ── Role / permission（见 permission.ts，与后端 common/permission.go 对齐）──
export {
  hasPermissionForUser,
  hasPermissionByRole,
  hasPlatformAdmin,
  hasAnyStaffPermission,
  isPlatformAdmin,
  isPlatformWorker,
  isPlatformStaff,
  isRoot,
  canManageRole,
  canAssignRole,
  assignableRoles,
  getRoleTagColor,
  getRoleName,
  getFirstAdminLandingPath,
  getFirstSystemSettingsPath,
  canAccessLogSummaries,
  normalizeUserFromApi,
  buildPermissionsFromRole,
  RoleCommonUser,
  RoleFinance,
  RoleSales,
  RoleOperations,
  RoleAdminUser,
  RoleRootUser,
} from './permission';
export type { PlatformPermission } from '../types';

/** 优先 user.permissions，否则按 role 矩阵兜底 */
export function hasPermission(
  user: User | null | undefined,
  perm: PlatformPermission,
): boolean {
  return hasPermissionForUser(user, perm);
}

/** 仅 Admin/Root（平台管理员），语义同 isPlatformAdmin(role) */
export function isAdmin(role?: number): boolean {
  return checkIsPlatformAdmin(role);
}


// ── Quota conversion ──
export function toQuota(amount: number, quotaPerUnit = 500000): number {
  return Math.round(amount * quotaPerUnit);
}

export function fromQuota(quota: number, quotaPerUnit = 500000): number {
  return quota / quotaPerUnit;
}

// ── Number formatting ──
export function renderNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

export function getTokenStatusColor(status: number): string {
  switch (status) {
    case 1: return 'green';
    case 2: return 'red';
    case 3: return 'orange';
    case 4: return 'grey';
    default: return 'grey';
  }
}

export function getChannelStatusColor(status: number): string {
  switch (status) {
    case 1: return 'green';
    case 2: return 'red';
    case 3: return 'blue';
    default: return 'grey';
  }
}
