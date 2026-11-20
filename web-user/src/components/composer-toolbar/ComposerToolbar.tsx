import type { ReactNode } from 'react';

export type ComposerToolbarVariant = 'video' | 'speech';

export interface ComposerToolbarProps {
  variant: ComposerToolbarVariant;
  /** 模型选择区（页面侧通常已包裹 `model-picker-wrap`） */
  modelPicker: ReactNode;
  /** 模型右侧：模式·画面·时长等 */
  afterModel?: ReactNode;
  /** 最右侧：发送、停止、轮询刷新等 */
  trailing?: ReactNode;
  className?: string;
}

/** 视频生成底部工具栏：左侧模型/参数，右侧操作钮 */
export function ComposerToolbar({
  variant,
  modelPicker,
  afterModel,
  trailing,
  className,
}: ComposerToolbarProps) {
  const rootClass = [
    'chat-input-toolbar',
    'chat-input-toolbar--with-composer-model',
    variant === 'speech' ? 'chat-input-toolbar--speech' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <div className="video-gen-toolbar-left">
        {modelPicker}
        {afterModel}
      </div>
      {trailing != null && trailing !== false ? (
        <div className="video-gen-toolbar-right">{trailing}</div>
      ) : null}
    </div>
  );
}
