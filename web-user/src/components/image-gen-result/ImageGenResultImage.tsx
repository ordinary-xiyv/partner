import { useEffect, useState } from 'react';
import { notifyApiError } from '../../lib/notifyApi';
import { resolveFreshImageSrc } from '../../features/chat/imageOutputUrl';
import { DownloadOutlined } from '@ant-design/icons';
import { Image as AntdImage } from 'antd';
import { useTranslation } from 'react-i18next';

async function downloadImageFromUrl(src: string, fileBase: string): Promise<void> {
  const ext = (() => {
    try {
      const path = new URL(src, window.location.href).pathname;
      const m = path.match(/\.(png|jpe?g|webp|gif)$/i);
      return m ? m[1].toLowerCase() : 'png';
    } catch {
      return 'png';
    }
  })();

  try {
    const resp = await fetch(src);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    const a = document.createElement('a');
    a.href = src;
    a.download = `${fileBase}.${ext}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** 图像生成结果：固定尺寸展示 + 右上角 hover 下载 + antd 预览 */
export function ImageGenResultImage({ src, alt }: { src: string; alt?: string }) {
  const { t } = useTranslation();
  const downloadLabel = t('chat.imageGenDownload');
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    setDisplaySrc(src);
    void resolveFreshImageSrc(src).then((next) => {
      if (!cancelled && next) setDisplaySrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleDownload = async () => {
    try {
      const fresh = await resolveFreshImageSrc(src);
      await downloadImageFromUrl(fresh || displaySrc || src, `lynxton-image-${Date.now()}`);
    } catch {
      notifyApiError(t('chat.imageGenDownloadFailed'));
    }
  };

  return (
    <div className="image-gen-media-stage image-gen-media-stage--image">
      <button
        type="button"
        className="image-gen-media-download-btn"
        onClick={(e) => {
          e.stopPropagation();
          void handleDownload();
        }}
        aria-label={downloadLabel}
        title={downloadLabel}
      >
        <DownloadOutlined aria-hidden />
      </button>
      <AntdImage
        src={displaySrc}
        alt={alt || t('chat.previewImage')}
        rootClassName="image-gen-result-ant-image"
        preview={{ mask: false }}
      />
    </div>
  );
}
