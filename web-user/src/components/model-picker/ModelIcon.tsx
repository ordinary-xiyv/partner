import React, { useEffect, useState } from 'react';
import {
  PROVIDER_ICON_PREFIX,
  ensureProviderIconsLoaded,
  getProviderIconMap,
  subscribeProviderIcons,
} from './providerIconCache';

const MODEL_ICON_MODULES = {
  ...import.meta.glob('../../assets/home-partner-logos/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../../assets/model-icons/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../../assets/model_icons/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
} as Record<string, string>;

const MODEL_ICON_SRC_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_ICON_MODULES).map(([path, src]) => {
    const file = path.split('/').pop() || '';
    const key = file.replace(/\.[^.]+$/, '').toLowerCase();
    return [key, src];
  }),
);

const ICON_NAME_ALIASES: Record<string, string> = {
  anthropic: 'claude',
  baidu: '文心一言',
  chatgpt: 'chatgpt',
  claude: 'claude',
  deepseek: 'deepseek',
  doubao: 'doubao',
  ernie: '文心一言',
  gemini: 'gemini',
  glm: 'zhipu',
  gpt: 'chatgpt',
  grok: 'grok',
  happyhorse: 'huanlema',
  huanlema: 'huanlema',
  kimi: 'kimi',
  minimax: 'minimax',
  moonshot: 'kimi',
  openai: 'chatgpt',
  qwen: 'qwen',
  seedance: 'seedance',
  tongyi: 'qwen',
  wenxin: '文心一言',
  zhipu: 'zhipu',
  豆包: 'doubao',
  通义千问: 'qwen',
  文心一言: '文心一言',
};

const MODEL_ICON_PATTERNS: Array<[RegExp, string]> = [
  [/^(gpt|o1|o3|o4|o5|chatgpt)\b|(^|[/_-])gpt|openai/i, 'chatgpt'],
  [/claude|anthropic/i, 'claude'],
  [/gemini|google/i, 'gemini'],
  [/deepseek/i, 'deepseek'],
  [/qwen|qwq|tongyi|通义/i, 'qwen'],
  [/kimi|moonshot/i, 'kimi'],
  [/doubao|豆包|seedance|火山|volc/i, 'doubao'],
  [/happyhorse|huanlema|欢乐马/i, 'huanlema'],
  [/minimax/i, 'minimax'],
  [/grok|xai/i, 'grok'],
  [/zhipu|chatglm|glm-|^glm|zai/i, 'zhipu'],
  [/ernie|wenxin|文心|baidu/i, '文心一言'],
];

function availableIconName(iconName: string | undefined): string | undefined {
  const key = (iconName || '').trim().toLowerCase();
  if (!key) return undefined;
  return MODEL_ICON_SRC_MAP[key] ? key : undefined;
}

function resolveIconAlias(raw: string): string | undefined {
  const alias = ICON_NAME_ALIASES[raw];
  return availableIconName(alias);
}

/** 是否为供应商图标引用（`provider:<provider_key>`）。 */
export function isProviderIconRef(iconName: string | undefined): boolean {
  return (iconName || '').trim().toLowerCase().startsWith(PROVIDER_ICON_PREFIX);
}

/** 从供应商图标引用里取出 provider_key；非供应商引用返回空串。 */
export function providerKeyFromIconRef(iconName: string | undefined): string {
  const raw = (iconName || '').trim();
  if (!raw.toLowerCase().startsWith(PROVIDER_ICON_PREFIX)) return '';
  return raw.slice(PROVIDER_ICON_PREFIX.length).trim();
}

/**
 * 归一化图标名。
 * - `provider:<key>` → 原样返回（交给 ModelIcon 解析成供应商实际图标）
 * - 内置图标文件名 / 别名 → 内置 key
 * - 其余 → 'other'
 */
export function normalizeIconName(iconName: string | undefined): string {
  const raw = (iconName || '').trim();
  if (!raw) return 'other';
  const lower = raw.toLowerCase();
  if (lower.startsWith(PROVIDER_ICON_PREFIX)) {
    const key = raw.slice(PROVIDER_ICON_PREFIX.length).trim();
    return key ? PROVIDER_ICON_PREFIX + key : 'other';
  }
  if (lower === 'other') return 'other';
  return availableIconName(lower) || resolveIconAlias(lower) || 'other';
}

export function resolveModelIconName(iconName: string | undefined, modelName: string | undefined): string {
  const normalizedIcon = normalizeIconName(iconName);
  if (normalizedIcon !== 'other') return normalizedIcon;

  const normalizedModelName = (modelName || '').trim().toLowerCase();
  for (const [pattern, icon] of MODEL_ICON_PATTERNS) {
    if (pattern.test(normalizedModelName)) {
      return availableIconName(icon) || normalizedIcon;
    }
  }

  return normalizedIcon;
}

/**
 * 订阅供应商图标表。
 * 仅在确实渲染供应商图标引用（enabled=true）时才发起请求，
 * 避免纯内置图标的页面产生无谓的接口调用。
 */
function useProviderIconMap(enabled: boolean): Record<string, string> | null {
  const [map, setMap] = useState<Record<string, string> | null>(() => getProviderIconMap());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const unsubscribe = subscribeProviderIcons((next) => {
      if (alive) setMap(next);
    });
    // 已有缓存时 subscribe 不会回放，这里同步一次当前值
    const current = getProviderIconMap();
    if (current) setMap(current);
    else void ensureProviderIconsLoaded();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled]);

  return map;
}

export function ModelIcon({
  label,
  iconName,
  className,
}: {
  label: string;
  iconName?: string;
  className?: string;
}) {
  const normalizedIcon = normalizeIconName(iconName);
  const providerKey = providerKeyFromIconRef(normalizedIcon);
  const providerIconMap = useProviderIconMap(!!providerKey);
  const glyph = (label || 'A').trim()[0]?.toUpperCase() || 'A';

  // 供应商图标引用：命中则用真实图标；未命中（供应商被删 / 未配图标）回退首字母
  if (providerKey) {
    const providerSrc = providerIconMap?.[providerKey];
    if (providerSrc) {
      return (
        <span className={`model-icon${className ? ` ${className}` : ''}`} aria-hidden>
          <img src={providerSrc} alt="" className="model-icon-img" />
        </span>
      );
    }
    return (
      <span className={`model-icon${className ? ` ${className}` : ''}`} aria-hidden>
        {glyph}
      </span>
    );
  }

  const iconSrc = MODEL_ICON_SRC_MAP[normalizedIcon];
  if (iconSrc) {
    return (
      <span className={`model-icon${className ? ` ${className}` : ''}`} aria-hidden>
        <img src={iconSrc} alt="" className="model-icon-img" />
      </span>
    );
  }
  return (
    <span className={`model-icon${className ? ` ${className}` : ''}`} aria-hidden>
      {glyph}
    </span>
  );
}
