/**
 * 首页风格：伙伴后台选择，客户站渲染。
 *
 * 这一份是**客户站（web-user）**的解析器。伙伴后台有一份等价实现
 * （web/src/shared/lib/homeStyle.ts），故意不共享代码：
 * 两个前端是两个独立的构建产物，没有任何共享包 —— 为两个字符串常量
 * 引入一个跨项目依赖，比重复 20 行代价更大。
 *
 * 重要的是两边对「未知值怎么办」的约定必须一致：一律落回 editorial。
 * 否则会出现「后台显示 A、客户站渲染 B」的错位，而这种错位在测试里
 * 极难发现 —— 两边都"能用"，只是不一样。
 */

export const HOME_STYLE_EDITORIAL = 'editorial';
export const HOME_STYLE_TERMINAL = 'terminal';

export type HomeStyle = typeof HOME_STYLE_EDITORIAL | typeof HOME_STYLE_TERMINAL;

export const DEFAULT_HOME_STYLE: HomeStyle = HOME_STYLE_EDITORIAL;

/**
 * 把任意输入归一到合法风格。
 *
 * 空值（没配过）→ editorial：这是平台历史默认，也是主色容错最高的那套，
 * 用在「什么都还不知道」的情况下最安全。
 *
 * 'brutal' → editorial：那是早期版本留在一个 jsonb 列里的旧取值，
 * 现在没有对应实现了。如果不做这个归一，历史商户的首页会渲染成空白。
 */
export function parseHomeStyle(raw: unknown): HomeStyle {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === HOME_STYLE_TERMINAL) return HOME_STYLE_TERMINAL;
  return DEFAULT_HOME_STYLE;
}

/** 给后台展示用的名字。两端共用同一套措辞，避免沟通时对不上号。 */
export const HOME_STYLE_LABELS: Record<HomeStyle, { name: string; en: string }> = {
  [HOME_STYLE_EDITORIAL]: { name: '纸感编辑', en: 'Editorial' },
  [HOME_STYLE_TERMINAL]: { name: '终端网格', en: 'Terminal' },
};
