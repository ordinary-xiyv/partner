import { useEffect, useState } from 'react';
import { Image as AntdImage, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ChatUserContentPart } from '../../features/videoGen/videoTaskModel';
import { resolveFreshImageSrc } from '../../features/chat/imageOutputUrl';
import { resolveFreshChatVideoSrc } from '../../features/chat/chatVideoOss';

export const MAX_USER_MESSAGE_ATTACHMENTS = 9;

export type UserMessageMediaItem = {
  id: string;
  kind: 'image' | 'video';
  src: string;
  fileId?: string;
  alt?: string;
};

function UserMessageAttachmentVideoCard({ src, fileId, alt }: { src: string; fileId?: string; alt?: string }) {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    setDisplaySrc(src);
    void resolveFreshChatVideoSrc(src, fileId).then((next) => {
      if (!cancelled) setDisplaySrc(next);
    });
    return () => { cancelled = true; };
  }, [src, fileId]);

  return (
    <>
      <button
        type="button"
        className="msg-user-attachment-card msg-user-attachment-card--video"
        onClick={() => setPreviewOpen(true)}
        aria-label={alt || t('chat.previewImage')}
      >
        <video src={displaySrc} className="msg-user-attachment-card__media" muted playsInline preload="metadata" />
      </button>
      <Modal
        open={previewOpen}
        footer={null}
        centered
        destroyOnClose
        onCancel={() => setPreviewOpen(false)}
        width="min(92vw, 720px)"
        styles={{ body: { padding: 0, lineHeight: 0 } }}
      >
        <video
          src={displaySrc}
          className="msg-user-attachment-video-modal__player"
          controls
          autoPlay
          playsInline
        />
      </Modal>
    </>
  );
}

function UserMessageAttachmentImage({
  src,
  fileId,
  alt,
}: {
  src: string;
  fileId?: string;
  alt?: string;
}) {
  const { t } = useTranslation();
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    setDisplaySrc(src);
    void resolveFreshImageSrc(src, fileId).then((next) => {
      if (!cancelled && next) setDisplaySrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [src, fileId]);

  if (!displaySrc.trim()) return null;

  return (
    <AntdImage
      src={displaySrc}
      alt={alt || t('chat.previewImage')}
      rootClassName="msg-user-attachment-ant-image"
      preview={{ mask: false }}
    />
  );
}

/** 用户气泡下方：一排最多 9 张，尺寸与参考上传卡牌一致，图片 antd 预览、视频弹层播放 */
export function UserMessageAttachmentsStrip({ items }: { items: UserMessageMediaItem[] }) {
  const displayItems = items
    .filter((item) => item.src.trim().length > 0 || Boolean(item.fileId?.trim()))
    .slice(0, MAX_USER_MESSAGE_ATTACHMENTS);
  if (displayItems.length === 0) return null;

  return (
    <div className="msg-user-attachments-strip">
      <AntdImage.PreviewGroup>
        <div className="msg-user-attachments-strip__row" role="list">
          {displayItems.map((item) =>
            item.kind === 'video' ? (
              <UserMessageAttachmentVideoCard key={item.id} src={item.src} fileId={item.fileId} alt={item.alt} />
            ) : (
              <div key={item.id} className="msg-user-attachment-card msg-user-attachment-card--image" role="listitem">
                <UserMessageAttachmentImage src={item.src} fileId={item.fileId} alt={item.alt} />
              </div>
            ),
          )}
        </div>
      </AntdImage.PreviewGroup>
    </div>
  );
}

export function extractUserMediaItems(content: string | ChatUserContentPart[]): UserMessageMediaItem[] {
  if (typeof content === 'string') return [];
  const items: UserMessageMediaItem[] = [];
  let idx = 0;
  for (const part of content) {
    if (part.type === 'image_url' && (part.image_url?.url || part.file_id)) {
      items.push({
        id: `u-media-${idx}`,
        kind: 'image',
        src: part.image_url?.url || '',
        fileId: part.file_id,
      });
      idx += 1;
    } else if (part.type === 'video_url' && part.video_url?.url) {
      items.push({ id: `u-media-${idx}`, kind: 'video', src: part.video_url.url, fileId: part.file_id });
      idx += 1;
    }
    if (items.length >= MAX_USER_MESSAGE_ATTACHMENTS) break;
  }
  return items;
}
