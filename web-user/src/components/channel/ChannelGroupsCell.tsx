import { Popover, Space, Tag } from 'antd';
import { getGroupTagColor } from '../group/groupTagColor';
import { parseChannelGroups } from './channelGroup';

export interface ChannelGroupsCellProps {
  group: string;
}

/** 渠道列表分组列：只显示第一个分组，多余用「...」点开查看，与用户管理一致 */
export function ChannelGroupsCell({ group }: ChannelGroupsCellProps) {
  const groups = parseChannelGroups(group);
  const first = groups[0];

  return (
    <Space size={4} wrap={false}>
      <Tag color={getGroupTagColor(first)} style={{ marginInlineEnd: 0 }}>
        {first}
      </Tag>
      {groups.length > 1 ? (
        <Popover
          trigger="click"
          content={(
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 240 }}>
              {groups.map((name) => (
                <Tag key={name} color={getGroupTagColor(name)} style={{ margin: 0 }}>
                  {name}
                </Tag>
              ))}
            </div>
          )}
        >
          <Tag
            color="default"
            onClick={(e) => e.stopPropagation()}
            style={{
              marginInlineEnd: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 28,
              height: 22,
              padding: 0,
              lineHeight: 1,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            ...
          </Tag>
        </Popover>
      ) : null}
    </Space>
  );
}
