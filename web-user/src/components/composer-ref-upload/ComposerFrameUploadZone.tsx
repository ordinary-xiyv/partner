import { PlusOutlined } from '@ant-design/icons';
import { Image as AntdImage } from 'antd';
import { useTranslation } from 'react-i18next';

/** 首尾帧 / 首帧槽位上的已选图片 */
export type ComposerFrameSlotValue = {
  id: string;
  preview: string;
  name?: string;
};

export type ComposerFrameUploadLayout = 'first-last' | 'first-only';

export interface ComposerFrameUploadZoneProps {
  /** `first-last`：首帧 + 尾帧；`first-only`：仅首帧 */
  layout: ComposerFrameUploadLayout;
  variant: 'desktop' | 'mobile';
  disabled: boolean;
  firstFrame: ComposerFrameSlotValue | null;
  /** 仅 `first-last` 使用 */
  lastFrame?: ComposerFrameSlotValue | null;
  firstLabel: string;
  lastLabel?: string;
  onTriggerPickFirst: () => void;
  onTriggerPickLast?: () => void;
  onRemoveFirst: () => void;
  onRemoveLast?: () => void;
}

interface FrameSlotMediaProps {
  disabled: boolean;
  label: string;
  frame: ComposerFrameSlotValue | null;
  onTriggerPick: () => void;
  onRemove: () => void;
}

/** 单槽卡牌区：空态点击上传；有图仅 antd 预览，不触发换图 */
function FrameSlotMedia({ disabled, label, frame, onTriggerPick, onRemove }: FrameSlotMediaProps) {
  const { t } = useTranslation();

  if (!frame) {
    return (
      <button
        type="button"
        className="video-gen-ref-empty video-gen-frame-slot-empty"
        disabled={disabled}
        onClick={onTriggerPick}
        aria-label={label}
      >
        <span className="video-gen-ref-empty-box" aria-hidden>
          <PlusOutlined className="video-gen-ref-empty-plus" />
        </span>
      </button>
    );
  }

  return (
    <div className="video-gen-ref-card video-gen-ref-card--media video-gen-frame-slot-filled">
      <div className="video-gen-ref-card-body">
        <AntdImage
          src={frame.preview}
          alt={frame.name || label}
          rootClassName="video-gen-ref-thumb-ant-image"
          preview={{ mask: true }}
        />
      </div>
      <button
        type="button"
        className="video-gen-ref-remove"
        aria-label={t('remove')}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    </div>
  );
}

function FrameSlotLabel({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={['video-gen-ref-empty-title', 'video-gen-frame-slot-label', className]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  );
}

/** 视频首尾帧 / 单首帧：卡牌 + 下方标签；⇄ 与卡牌行垂直居中。 */
export function ComposerFrameUploadZone({
  layout,
  variant,
  disabled,
  firstFrame,
  lastFrame = null,
  firstLabel,
  lastLabel = '',
  onTriggerPickFirst,
  onTriggerPickLast,
  onRemoveFirst,
  onRemoveLast,
}: ComposerFrameUploadZoneProps) {
  const showLast = layout === 'first-last';

  const rootClass = [
    'video-gen-frame-upload',
    showLast ? 'video-gen-frame-upload--first-last' : 'video-gen-frame-upload--first-only',
    variant === 'mobile' ? 'video-gen-composer-slots video-gen-composer-slots--mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const firstMedia = (
    <FrameSlotMedia
      disabled={disabled}
      label={firstLabel}
      frame={firstFrame}
      onTriggerPick={onTriggerPickFirst}
      onRemove={onRemoveFirst}
    />
  );

  if (!showLast) {
    return (
      <div className={rootClass}>
        <div className="video-gen-frame-slot-col">
          {firstMedia}
          <FrameSlotLabel label={firstLabel} />
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="video-gen-frame-slot-col video-gen-frame-slot-col--first">
        {firstMedia}
      </div>
      <span className="video-gen-slot-arrow video-gen-frame-upload__arrow" aria-hidden>
        ⇄
      </span>
      <div className="video-gen-frame-slot-col video-gen-frame-slot-col--last">
        <FrameSlotMedia
          disabled={disabled}
          label={lastLabel}
          frame={lastFrame ?? null}
          onTriggerPick={onTriggerPickLast ?? (() => undefined)}
          onRemove={onRemoveLast ?? (() => undefined)}
        />
      </div>
      <FrameSlotLabel label={firstLabel} className="video-gen-frame-upload__label-first" />
      <span className="video-gen-frame-upload__arrow-spacer" aria-hidden />
      <FrameSlotLabel label={lastLabel} className="video-gen-frame-upload__label-last" />
    </div>
  );
}
