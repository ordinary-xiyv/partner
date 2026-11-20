/**
 * 首页合作伙伴 / 模型 Logo 跑马灯数据。
 * 仅使用真实 logo 资源；每行可见数量 = items.length；后续增删改此配置或接入 API 即可。
 */
export type HomePartnerMarqueeDirection = 'rtl' | 'ltr';

export interface HomePartnerLogoItem {
  id: string;
  /** 展示名称；接入 API 后可直接使用接口字段 */
  name: string;
  /** i18n key，可选；有则优先 t(nameKey) */
  nameKey?: string;
  logoFile: string;
}

export interface HomePartnerMarqueeRow {
  id: string;
  direction: HomePartnerMarqueeDirection;
  items: HomePartnerLogoItem[];
}

const partnerLogoModules = import.meta.glob<string>(
  '../../../assets/home-partner-logos/*.png',
  { eager: true, import: 'default' },
);

function partnerLogoSrc(fileName: string): string {
  const entry = Object.entries(partnerLogoModules).find(([path]) =>
    path.replace(/\\/g, '/').endsWith(`/${fileName}`),
  );
  if (!entry) {
    console.warn(`[home-partner-logos] missing asset: ${fileName}`);
    return '';
  }
  return entry[1];
}

/** 第 1、3 行 rtl（右→左），第 2 行 ltr（左→右） */
export const HOME_PARTNER_MARQUEE_ROWS: HomePartnerMarqueeRow[] = [
  {
    id: 'row-1',
    direction: 'rtl',
    items: [
      { id: 'mistral-ai', name: 'Mistral AI', logoFile: 'mistral-ai.png' },
      { id: 'kimi', name: 'Kimi', logoFile: 'kimi.png' },
      { id: 'deepseek', name: 'DeepSeek', logoFile: 'deepseek.png' },
      { id: 'minimax', name: 'MiniMax', logoFile: 'minimax.png' },
    ],
  },
  {
    id: 'row-2',
    direction: 'ltr',
    items: [
      { id: 'qwen', name: '通义千问 Qwen', nameKey: 'home.partner.qwen', logoFile: 'qwen.png' },
      { id: 'seedance', name: 'Seedance', logoFile: 'seedance.png' },
      { id: 'llama', name: 'Llama', logoFile: 'llama.png' },
      { id: 'huanlema', name: '欢乐马', nameKey: 'home.partner.huanlema', logoFile: 'huanlema.png' },
      { id: 'zhipu', name: '质朴', nameKey: 'home.partner.zhipuBrand', logoFile: 'zhipu.png' },
    ],
  },
  {
    id: 'row-3',
    direction: 'rtl',
    items: [
      { id: 'claude', name: 'Claude', logoFile: 'claude.png' },
      { id: 'doubao', name: '豆包', nameKey: 'home.partner.doubao', logoFile: 'doubao.png' },
      { id: 'openai', name: 'OpenAI', logoFile: 'openai.png' },
      { id: 'gemini', name: 'Gemini', logoFile: 'gemini.png' },
    ],
  },
];

export function resolveHomePartnerLogoSrc(logoFile: string): string {
  return partnerLogoSrc(logoFile);
}

/** 预留：API 接入时将响应映射为行配置 */
export function mapApiPartnerRows(
  rows: Array<{ id: string; direction: HomePartnerMarqueeDirection; items: HomePartnerLogoItem[] }>,
): HomePartnerMarqueeRow[] {
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    items: row.items.map((item) => ({
      ...item,
      logoFile: item.logoFile,
    })),
  }));
}
