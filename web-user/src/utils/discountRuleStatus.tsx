import { Tag } from 'antd';
import type { TFunction } from 'i18next';

/** 0=未生效，1=生效中，2=已失效 */
export function renderRuleStatusTag(status: number | undefined, t: TFunction) {
  if (status === 0) return <Tag color="orange">{t('discountRules.statusPending')}</Tag>;
  if (status === 1) return <Tag color="green">{t('discountRules.statusActive')}</Tag>;
  if (status === 2) return <Tag color="default">{t('discountRules.statusExpired')}</Tag>;
  return <span>-</span>;
}
