import { useState } from 'react';
import { Dropdown, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface ConvSidebarMoreMenuProps {
  onRename: () => void;
  onDelete: () => void;
  showRename?: boolean;
}

export function ConvSidebarMoreMenu({
  onRename,
  onDelete,
  showRename = true,
}: ConvSidebarMoreMenuProps) {
  const { t } = useTranslation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const items: MenuProps['items'] = [
    ...(showRename
      ? [{
          key: 'rename',
          label: t('chat.rename'),
          icon: <EditOutlined />,
          onClick: (info: { domEvent: Event }) => {
            info.domEvent.stopPropagation();
            onRename();
          },
        }]
      : []),
    {
      key: 'delete',
      label: t('chat.delete'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: (info: { domEvent: Event }) => {
        info.domEvent.stopPropagation();
        setDeleteConfirmOpen(true);
      },
    },
  ];

  return (
    <div className="sidebar-item-actions" onClick={(e) => e.stopPropagation()}>
      <Popconfirm
        title={t('deleteConfirm')}
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={onDelete}
      >
        <span className="conv-sidebar-popconfirm-trigger">
          <Dropdown
            menu={{ items }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="conv-sidebar-more-dropdown"
          >
            <button
              type="button"
              className="sidebar-item-more-btn"
              aria-label={t('chat.convMoreActions')}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        </span>
      </Popconfirm>
    </div>
  );
}
