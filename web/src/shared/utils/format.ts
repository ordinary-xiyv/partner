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
 *
 * ★ 只用于「概览/卡片」这类单独展示的场合。
 *   **表格列里不要用它** —— 同一列里每行位数不同，右对齐也对不齐，
 *   扫视比较时看不出量级差别。表格用 formatMoneyFixed。
 */
export function formatMoneyAuto(amount: number): string {
  const abs = Math.abs(amount);
  if (abs === 0) return '¥0';
  if (abs >= 1) return `¥${amount.toFixed(2)}`;
  if (abs >= 0.01) return `¥${amount.toFixed(3)}`;
  if (abs >= 0.001) return `¥${amount.toFixed(4)}`;
  return `¥${amount.toFixed(5)}`;
}

/**
 * 固定位数的金额 —— 表格专用，保证同一列每行长度一致、能对齐。
 *
 * 位数取 4 位，理由是实测出来的：
 *   · 库里最小的一笔是 ¥0.000002（quota=1），2 位会显示成 ¥0.00，
 *     看明细的人会以为免费，4 位才露出 ¥0.0000… 的有效量级
 *   · 消耗金额的分布：< 1 分钱的 26979 条、1 分~1 元 9458 条、> 1 元 1850 条
 *     —— 绝大多数落在小数点后 3~4 位，4 位能覆盖主体，又不至于把
 *     30.15 元写成 30.15000000 这种噪声
 *
 * 「不够补 0」是关键：不用 toPrecision / 不 trim 尾零。
 * 尾零是这一列的对齐依据，去掉之后 ¥0.5 和 ¥0.5001 又混在一起了。
 */
export function formatMoneyFixed(amount: number, digits = 4): string {
  if (!Number.isFinite(amount)) return `¥${(0).toFixed(digits)}`;
  return `¥${amount.toFixed(digits)}`;
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

/**
 * 耗时格式化。★ 入参单位是**秒**，不是毫秒。
 *
 * 这个函数原来是按毫秒写的（`ms < 1000 ? 'ms' : 's'`），但上游
 * logs.use_time 存的是秒（lynxtonapi 的日志表就是这个口径）。
 * 结果每条记录都被标成了 ms —— 一次 14 秒的调用显示成「14 ms」，
 * 差了 1000 倍，看明细的人会以为接口快得离谱。
 *
 * 判据（实测 37092 条 use_time > 0 的记录）：
 *   · 1–60 秒 占 35343 条，60 秒以上仅 1729 条
 *   · 均值 13.99，最大值 7063
 * 如果是毫秒，均值 14ms 对 LLM 调用不可能；平均 14 秒才是合理量级。
 *
 * 展示规则：
 *   · 不足 1 秒   → 保留小数，如「0.85 s」（不写 ms，避免又引入单位歧义）
 *   · 1–60 秒     → 一位小数，如「14.0 s」
 *   · 60 秒以上   → 分秒，如「2 分 5 秒」
 * 非法值（<=0 / NaN）统一显示「-」，不显示「0 s」——0 秒不是真实耗时，
 * 那种记录通常是预扣/退款这类没有实际调用的行，显示 0 会让人误读成「极快」。
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  if (seconds < 1) return `${seconds.toFixed(2)} s`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    // 59.7 秒四舍五入成 60 秒时要进位，否则会输出「1 分 60 秒」
    if (s === 60) return `${m + 1} 分 0 秒`;
    return `${m} 分 ${s} 秒`;
  }
  /*
   * 超过 1 小时走「时:分:秒」。
   *
   * 实测最大的一条是 7063 秒 —— 按「分 秒」写出来是「117 分 43 秒」，
   * 读的人得在脑子里除一次 60 才知道是快两小时。这种长尾记录通常是
   * 视频生成这类慢任务，正是最需要一眼看清量级的场景。
   */
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s === 60 ? 0 : s).padStart(2, '0');
  return `${h}:${mm}:${ss}`;
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
