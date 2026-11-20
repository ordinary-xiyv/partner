import { Tag, theme } from 'antd';
import { getGroupTagColor } from './groupTagColor';

export interface GroupNameCellProps {
  name: string;
}

/** 表格「分组名称」列：彩色 Tag */
export function GroupNameCell({ name }: GroupNameCellProps) {
  const { token } = theme.useToken();
  const displayName = String(name ?? '').trim();

  return (
    <Tag
      color={getGroupTagColor(displayName)}
      style={{
        margin: 0,
        maxWidth: '100%',
        fontFamily: token.fontFamilyCode,
        fontSize: token.fontSizeSM,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          verticalAlign: 'middle',
        }}
      >
        {displayName}
      </span>
    </Tag>
  );
}
