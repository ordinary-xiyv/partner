import type { TagProps } from 'antd';

type AppTagColor = NonNullable<TagProps['color']>;

const GROUP_TAG_COLORS: Record<string, AppTagColor> = {
  default: 'default',
  vip: 'gold',
  svip: 'purple',
  premium: 'blue',
};

/** 已知分组固定色；其余使用主题 geekblue，保证与 Ant Design Token 一致 */
export function getGroupTagColor(name: string): AppTagColor {
  const key = name.trim().toLowerCase();
  return GROUP_TAG_COLORS[key] ?? 'geekblue';
}
