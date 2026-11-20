import { DownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ImageAspectRatio } from '../../features/chat/imageAspectRatio';

export interface ImageAspectRatioOption {
  ratio: ImageAspectRatio;
  labelKey: string;
}

export interface ImageAspectRatioPickerProps {
  value: ImageAspectRatio;
  options: ImageAspectRatioOption[];
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (ratio: ImageAspectRatio) => void;
}

/** 图像对话：工具栏「画面」药丸 + 点击弹出比例面板（与 VideoGen 画面组件一致） */
export function ImageAspectRatioPicker({
  value,
  options,
  open,
  disabled = false,
  onOpenChange,
  onChange,
}: ImageAspectRatioPickerProps) {
  const { t } = useTranslation();

  if (options.length === 0) return null;

  const gridClass =
    options.length <= 4
      ? 'video-gen-visual-grid video-gen-visual-grid--4'
      : 'video-gen-visual-grid video-gen-visual-grid--3';

  return (
    <div className="video-gen-dropdown-wrap">
      <button
        type="button"
        className="video-gen-toolbar-pill"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        {t('chat.videoGenVisualMenu')}
        <span className="video-gen-toolbar-pill-sub">{value}</span>
        <DownOutlined style={{ fontSize: 14 }} />
      </button>
      {open ? (
        <>
          <div
            className="video-gen-dropdown-overlay"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <div
            className="video-gen-dropdown-panel video-gen-dropdown-panel--visual"
            role="dialog"
            aria-label={t('chat.imageAspectRatioTitle')}
          >
            <div className="video-gen-visual-section-title">{t('chat.videoGenAspectRatioLabel')}</div>
            <div className={gridClass} role="radiogroup">
              {options.map((opt) => (
                <button
                  key={opt.ratio}
                  type="button"
                  role="radio"
                  aria-checked={value === opt.ratio}
                  className={`video-gen-visual-chip${value === opt.ratio ? ' is-active' : ''}`}
                  onClick={() => onChange(opt.ratio)}
                >
                  {opt.ratio}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
