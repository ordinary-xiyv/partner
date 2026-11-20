import dayjs from 'dayjs';

/** 额度显示用的换算基准：1 元 = 500000 额度（对齐 lynxtonapi 的 QuotaPerUnit） */
export const QUOTA_PER_UNIT = 500000;

/** 额度 → 元 */
export function quotaToCny(quota: number): number {
  return quota / QUOTA_PER_UNIT;
}

/** 额度 → 带符号金额字符串 */
export function formatQuotaAsMoney(quota: number, digits = 2): string {
  return `¥${quotaToCny(quota).toFixed(digits)}`;
}

/** 普通金额格式化 */
export function formatMoney(amount: number, digits = 2): string {
  return `¥${amount.toFixed(digits)}`;
}

/**
 * 小额自适应金额：单次调用常常不到一分钱（¥0.0004），
 * 固定 2 位小数会显示成 ¥0.00，看表格的人会以为「没花钱」。
 * 这里按量级自动加位数，保证第一位有效数字露出来。
 */
export function formatMoneyAuto(amount: number): string {
  const abs = Math.abs(amount);
  if (abs === 0) return '¥0';
  if (abs >= 1) return `¥${amount.toFixed(2)}`;
  if (abs >= 0.01) return `¥${amount.toFixed(3)}`;
  if (abs >= 0.001) return `¥${amount.toFixed(4)}`;
  return `¥${amount.toFixed(5)}`;
}

/** 千分位整数 */
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** 大数字压缩：12345 → 1.23万 */
export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(2)}亿`;
  if (Math.abs(n) >= 1_0000) return `${(n / 1_0000).toFixed(2)}万`;
  return formatNumber(n);
}

/** 秒级时间戳 → 日期时间 */
export function formatTime(ts?: number, template = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!ts || ts <= 0) return '-';
  return dayjs(ts * 1000).format(template);
}

/** 秒级时间戳 → 日期 */
export function formatDate(ts?: number): string {
  return formatTime(ts, 'YYYY-MM-DD');
}

/** 相对时间：3 分钟前 */
export function formatRelative(ts?: number): string {
  if (!ts || ts <= 0) return '从未';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(ts);
}

/** 毫秒耗时 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 折扣率 → 折扣文案：0.82 → 8.2 折 */
export function formatDiscount(rate: number): string {
  const d = rate * 10;
  return `${Number.isInteger(d) ? d : d.toFixed(1)} 折`;
}

/** 百分比：0.12 → 12% */
export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** 令牌脱敏：sk-lynx-abcd...wxyz */
export function maskKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 10)}${'*'.repeat(6)}${key.slice(-4)}`;
}

/** 复制到剪贴板（带降级） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
