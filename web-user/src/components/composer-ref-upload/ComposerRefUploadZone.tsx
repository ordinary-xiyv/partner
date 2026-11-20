import { notify } from '../../ui/notify';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Image as AntdImage, Progress, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

export type ComposerRefAttachment = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  preview: string;
  /** 正在读取本地或上传 OSS */
  uploading?: boolean;
  /** 0–100；undefined 表示不确定进度 */
  uploadProgress?: number;
};

export interface ComposerRefUploadZoneProps {
  attachments: ComposerRefAttachment[];
  disabled: boolean;
  onTriggerPick: () => void;
  onRemove: (id: string) => void;
  variant: 'desktop' | 'mobile';
  /** 最多参考素材数量，默认 9（与视频全能参考一致） */
  maxCount?: number;
}

const DEFAULT_MAX_REF_ATTACHMENTS = 9;

function refSlotRotateExpandedDeg(slot1Based: number): number {
  const t = [-9, 8, -11, 10, -8, 9, -10, 11, -9];
  return t[slot1Based - 1] ?? 0;
}

/**
 * 全能参考 / 图像对话：扇形叠放参考图 + 添加槽（桌面 / 移动共用）。
 * 首尾帧见 `ComposerFrameUploadZone`；统一入口见 `ComposerUploadZone`。
 */
export function ComposerRefUploadZone({
  attachments,
  disabled,
  onTriggerPick,
  onRemove,
  variant,
  maxCount = DEFAULT_MAX_REF_ATTACHMENTS,
}: ComposerRefUploadZoneProps) {
  const { t } = useTranslation();
  const n = attachments.length;

  if (n === 0) {
    return (
      <button
        type="button"
        className={`video-gen-ref-empty${variant === 'mobile' ? ' video-gen-ref-empty--mobile' : ''}`}
        disabled={disabled}
        onClick={onTriggerPick}
      >
        <span className="video-gen-ref-empty-box" aria-hidden>
          <PlusOutlined className="video-gen-ref-empty-plus" />
        </span>
      </button>
    );
  }

  const stripMod = n >= 2 ? 'video-gen-ref-strip--multi' : 'video-gen-ref-strip--single';
  const addSlot = Math.min(n + 1, maxCount);

  const handleAddSlotClick = () => {
    if (n >= maxCount) {
      notify.warning(
        t('chat.videoGenOmniRefMaxReached', {
          max: maxCount,
          defaultValue: `最多使用 ${maxCount} 个参考内容`,
        }),
      );
      return;
    }
    onTriggerPick();
  };

  return (
    <div className={`video-gen-ref-zone${variant === 'mobile' ? ' video-gen-ref-zone--mobile' : ''}`}>
      <div className="video-gen-ref-stack">
        <div className={`video-gen-ref-strip ${stripMod}`}>
          <AntdImage.PreviewGroup>
            <div className="video-gen-ref-strip-cards">
              {attachments.map((a, i) => (
                <div
                  key={a.id}
                  className={`video-gen-ref-card video-gen-ref-card--media ${i % 2 === 0 ? 'is-tilt-a' : 'is-tilt-b'}`}
                >
                  <div className="video-gen-ref-card-body">
                    <Tooltip title={a.name} placement="top" mouseEnterDelay={0.35}>
                      <div className="video-gen-ref-tooltip-trigger">
                        {a.kind === 'video' ? (
                          <span className="video-gen-ref-card-tooltip-fill">
                            <video
                              src={a.preview}
                              className="video-gen-ref-card-video"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          </span>
                        ) : a.kind === 'audio' ? (
                          <span className="video-gen-ref-card-tooltip-fill video-gen-ref-card-audio">
                            <span className="video-gen-ref-card-audio-label">♪</span>
                          </span>
                        ) : (
                          <AntdImage
                            src={a.preview}
                            alt={a.name || t('chat.previewImage')}
                            rootClassName="video-gen-ref-thumb-ant-image"
                            preview={{ mask: false }}
                          />
                        )}
                        {a.uploading && (
                          <div className="video-gen-ref-upload-overlay" aria-live="polite">
                            <Progress
                              type="circle"
                              percent={a.uploadProgress ?? 0}
                              size={36}
                              strokeWidth={8}
                              showInfo={a.uploadProgress != null}
                              status={a.uploadProgress == null ? 'active' : 'normal'}
                            />
                          </div>
                        )}
                      </div>
                    </Tooltip>
                  </div>
                  <button
                    type="button"
                    className="video-gen-ref-remove"
                    aria-label={t('remove')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(a.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="default"
                variant="outlined"
                icon={<PlusOutlined />}
                disabled={disabled}
                onClick={handleAddSlotClick}
                aria-label={t('chat.uploadFile')}
                className={`video-gen-ref-add-slot ${addSlot % 2 === 1 ? 'is-tilt-a' : 'is-tilt-b'}${
                  n >= maxCount ? ' is-at-capacity' : ''
                }`}
                style={{
                  ['--ref-add-rotate' as string]: `${refSlotRotateExpandedDeg(addSlot)}deg`,
                }}
              />
            </div>
          </AntdImage.PreviewGroup>
        </div>
      </div>
    </div>
  );
}
