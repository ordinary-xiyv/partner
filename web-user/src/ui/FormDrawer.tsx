import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Space, theme } from 'antd';
import { CloseOutlined, SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { modalFooterBtnPrimary, modalFooterBtnSecondary } from './tableRowActionButtons';

export interface FormDrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** 点击保存时触发，通常内部调用 form.submit() */
  onSubmit: () => void;
  loading?: boolean;
  children: ReactNode;
  /** 未传时：桌面 560px，移动端全宽 */
  width?: number | string;
  submitText?: string;
  cancelText?: string;
  destroyOnClose?: boolean;
  /** 抽屉展开/收起动画结束后的回调 */
  afterOpenChange?: (open: boolean) => void;
  /** 是否展示底部操作栏，默认 true */
  showFooter?: boolean;
}

const MOBILE_MQ = '(max-width: 767.99px)';

/** 仅在需要自适应宽度时才订阅 matchMedia，避免 Drawer 布局 ↔ Grid.useBreakpoint 互相触发死循环 */
function useMobileWidth(enabled: boolean): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (!enabled || typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_MQ).matches;
  });

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [enabled]);

  return enabled ? isMobile : false;
}

/**
 * 通用表单抽屉：antd Drawer + 主题 Token + 响应式宽度 + i18n 底部按钮。
 * 业务表单作为 children 放入即可。
 */
export function FormDrawer({
  open,
  title,
  onClose,
  onSubmit,
  loading = false,
  children,
  width,
  submitText,
  cancelText,
  destroyOnClose = true,
  afterOpenChange,
  showFooter = true,
}: FormDrawerProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const needResponsiveWidth = width == null;
  const isMobile = useMobileWidth(needResponsiveWidth);
  const resolvedWidth = width ?? (isMobile ? '100%' : 560);

  const drawerStyles = useMemo(() => {
    const header: CSSProperties = {
      marginBottom: 0,
      padding: `${token.paddingMD}px ${token.paddingLG}px`,
      borderBottom: `1px solid ${token.colorSplit}`,
    };
    const body: CSSProperties = {
      padding: `${token.paddingMD}px ${token.paddingLG}px`,
      paddingBottom: showFooter ? token.paddingXL + token.paddingMD : token.paddingLG,
    };
    const footer: CSSProperties | undefined = showFooter
      ? {
          padding: `${token.paddingSM}px ${token.paddingLG}px`,
          borderTop: `1px solid ${token.colorSplit}`,
        }
      : undefined;
    return { header, body, footer };
  }, [
    showFooter,
    token.paddingMD,
    token.paddingLG,
    token.paddingXL,
    token.paddingSM,
    token.colorSplit,
  ]);

  return (
    <Drawer
      title={title}
      placement="right"
      open={open}
      onClose={onClose}
      afterOpenChange={afterOpenChange}
      destroyOnClose={destroyOnClose}
      width={resolvedWidth}
      styles={drawerStyles}
      footer={showFooter ? (
        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button
            {...modalFooterBtnSecondary}
            icon={<CloseOutlined />}
            onClick={onClose}
            disabled={loading}
          >
            {cancelText ?? t('cancel')}
          </Button>
          <Button
            {...modalFooterBtnPrimary}
            icon={<SaveOutlined />}
            loading={loading}
            onClick={onSubmit}
          >
            {submitText ?? t('save')}
          </Button>
        </Space>
      ) : undefined}
    >
      {children}
    </Drawer>
  );
}
