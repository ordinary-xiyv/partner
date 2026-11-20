/**
 * 登录页媒体面板「决策快照」缓存。
 *
 * 背景：左侧媒体面板要按媒体真实宽高比摆放，而媒体 URL 由服务端下发（浏览器本地只存
 * file_id），刷新首帧拿不到 URL → 探测不出比例。若此时退回品牌兜底区，等比例到达后
 * 再切成媒体，就会出现「每次刷新都先闪一下兜底内容」。
 *
 * 这里把上次解析到的结果（是否配置了媒体 / 媒体标识 / 宽高比）存进 localStorage，
 * 刷新首帧就能直接按正确形态和尺寸摆好面板，不再闪兜底区。
 *
 * 边界：只缓存展示参数（种类 + 宽高比），不缓存图片/视频内容；媒体标识用于校验缓存
 * 是否仍对应当前配置——管理员换/清空媒体后不会闪出旧内容。
 *
 * 三态区分（关键）：缓存缺失 ≠ 没有媒体。
 * - 缓存缺失：不知道该不该有媒体 → 调用方按「可能配了媒体」摆占位，等服务端确认
 * - kind='none'：服务端**明确**说没配媒体 → 直接渲染品牌区，不再占位
 * - kind='image'|'video'：服务端配了媒体 → 立刻按缓存比例摆面板
 */

const STORAGE_KEY = 'lynx_login_media_snapshot_v1';

export interface CachedLoginMedia {
  /** 上次解析到的媒体种类；none 表示服务端确实没有配置媒体 */
  kind: 'image' | 'video' | 'none';
  /** 媒体标识；kind !== 'none' 时用于判断缓存是否对应当前配置 */
  key: string;
  /** 上次加载到的宽高比（w/h）；未知为 0 */
  ratio: number;
}

const EMPTY_SNAPSHOT: CachedLoginMedia = { kind: 'none', key: '', ratio: 0 };

/** 是否读到过有效快照（用于区分「从没访问过」和「确认没媒体」） */
export interface CachedLoginMediaResult {
  /** 快照内容；未命中时为 { kind:'none', key:'', ratio:0 } */
  snapshot: CachedLoginMedia;
  /** 是否命中有效缓存。false = 从没访问过 / 缓存被清 */
  hit: boolean;
}

/**
 * 组装媒体标识。**必须 file_id 优先**：刷新首帧只有 file_id（来自本地缓存的外观），
 * URL 要等外观接口返回后才有；若以 URL 优先，同一媒体在「接口返回前/后」会算出两个
 * 不同的键，缓存永远命中不了。
 */
export function buildMediaCacheKey(
  kind: 'image' | 'video' | 'none',
  fileId?: string,
  url?: string,
): string {
  if (kind === 'none') return '';
  const id = ((fileId || url || '') as string).trim();
  return id ? `${kind}:${id}` : '';
}

/** 读取上次的决策快照；同时返回是否命中，用于区分「没访问过」与「确认无媒体」 */
export function readCachedLoginMedia(): CachedLoginMediaResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { snapshot: EMPTY_SNAPSHOT, hit: false };
    const parsed = JSON.parse(raw) as Partial<CachedLoginMedia> | null;
    if (!parsed || typeof parsed !== 'object') return { snapshot: EMPTY_SNAPSHOT, hit: false };
    const kind = parsed.kind;
    if (kind !== 'image' && kind !== 'video' && kind !== 'none') {
      return { snapshot: EMPTY_SNAPSHOT, hit: false };
    }
    const ratio = typeof parsed.ratio === 'number' && Number.isFinite(parsed.ratio) && parsed.ratio > 0
      ? parsed.ratio
      : 0;
    return {
      snapshot: { kind, key: typeof parsed.key === 'string' ? parsed.key : '', ratio },
      hit: true,
    };
  } catch {
    return { snapshot: EMPTY_SNAPSHOT, hit: false };
  }
}

/** 写入决策快照（仅在配置已知、或比例实测就绪后调用） */
export function writeCachedLoginMedia(snapshot: CachedLoginMedia): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage 不可用时静默降级：只是少了「刷新不闪」的优化 */
  }
}

/**
 * 写入「确认无媒体」快照。
 * 与 clearCachedLoginMedia 的区别：清空后下次访问无法区分「没访问过」与「确认无媒体」，
 * 会导致没配媒体的站点每次刷新都先摆一次占位；写入 kind='none' 则能直接渲染品牌区。
 */
export function writeNoMediaSnapshot(): void {
  writeCachedLoginMedia({ kind: 'none', key: '', ratio: 0 });
}

/** 清空缓存（缓存损坏等异常场景；正常"无媒体"应使用 writeNoMediaSnapshot） */
export function clearCachedLoginMedia(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
