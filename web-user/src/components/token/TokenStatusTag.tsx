import { Tag, theme } from 'antd';
import type { TagProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { getTokenStatusColor } from '../../utils';
import { getTokenStatusMeta } from './tokenDisplay';

const TOKEN_STATUS_TAG_COLOR: Record<string, TagProps['color']> = {
  green: 'green',
  red: 'red',
  orange: 'orange',
  grey: 'default',
};

/** 令牌状态：描边 Tag（无填充底），与用户/渠道表 status 列一致 */
export function TokenStatusTag({ status }: { status: number }) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const meta = getTokenStatusMeta(status, t);

  const color = TOKEN_STATUS_TAG_COLOR[getTokenStatusColor(status)] ?? 'default';

  return (
    <Tag
      color={color}
      style={{
        margin: 0,
        fontSize: token.fontSizeSM,
        lineHeight: token.lineHeightSM,
        fontWeight: 500,
      }}
    >
      {meta.label}
    </Tag>
  );
}
