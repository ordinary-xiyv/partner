import { notify } from '../../ui/notify';
import { notifyApiError } from '../../lib/notifyApi';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getTokenKey, getTokens } from '../../api';
import { fetchCatalogPickerModels } from '../../features/chat/catalogPickerModels';
import { pickPreferredToken } from '../../components/token/tokenDisplay';
import {
  SearchOutlined, CopyOutlined, CloseOutlined, ClearOutlined, PlusOutlined,
} from '@ant-design/icons';
import { Button, Popconfirm } from 'antd';
import type { InputRef } from 'antd';
import EditSvg from '../../assets/platform-icons/编辑.svg?react';
import DeleteSvg from '../../assets/platform-icons/删除.svg?react';
import { useUser } from '../../contexts/UserContext';

import '../../components/composer-toolbar/composer-tokens.css';
import { ComposerUploadZone } from '../../components/composer-ref-upload';
import { uploadLocalVideoFileToGenMediaOss } from '../../features/videoGen/attachmentOss';
import { resolveFreshImageSrc } from '../../features/chat/imageOutputUrl';
import { deleteStorageFiles, uploadChatImageToOss } from '../../features/chat/chatImageOss';
import { chatImageFileIdsToDelete } from '../../features/chat/chatImageFileIds';
import {
  fileToAttachmentKind,
  isAttachmentKindAllowed,
  resolveChatAllowedAttachmentKinds,
  resolveChatAttachmentAccept,
  unsupportedModelsForAttachmentKind,
} from '../../features/chat/chatMediaCapabilities';
import { buildImageGenerationsRequestBody } from '../../features/chat/chatImageGenPayload';
// TODO: 画面比例（Seedream 需 2K/3K 等，与 OpenAI WxH 不同）— 暂关闭
// import {
//   DEFAULT_IMAGE_ASPECT_RATIO,
//   normalizeImageAspectRatioDraft,
//   resolveImageAspectRatioOptions,
//   resolveImageSizeFromRatio,
//   type ImageAspectRatio,
// } from '../../features/chat/imageAspectRatio';
// import { ImageAspectRatioPicker } from '../../components/image-aspect-ratio-picker';
import { ImageGenResultImage, ImageGenResultImages } from '../../components/image-gen-result';
import {
  UserMessageAttachmentsStrip,
  extractUserMediaItems,
} from '../../components/user-message-attachments';
import { Image as AntdImage } from 'antd';
import '../chat-page.css';
import '../video-gen.css';
import { convSidebarClass } from '../../ui/selectableNav';
import { ConvSidebarMoreMenu } from '../../components/conv-sidebar-more-menu/ConvSidebarMoreMenu';
import { ConvSidebarRenameInput } from '../../components/conv-sidebar-more-menu/ConvSidebarRenameInput';
import { coercePlaybackVideoUrl } from '../../features/videoGen/videoOutputUrl';
import { cancelVideoTask as cancelVideoTaskRequest } from '../../features/videoGen/videoTaskCancel';
import {
  encodeVideoTaskPayload,
  parseVideoTaskPayload,
  parseVideoTaskApiPollResponse,
  isVideoTaskApiSucceeded,
  parseRelayApiErrorBody as parseChatApiErrorBody,
  type ChatUserContentPart,
  type VideoTaskApiResponse,
  type VideoTaskPayload,
  type VideoTaskStatus,
} from '../../features/videoGen/videoTaskModel';
import {
  type ChatShellScope,
  getStorageKey,
  readLastActiveConversationId,
  persistStreamingConversations,
  subscribeChatPersist,
  writeLastActiveConversationId,
  genConversationId,
  createBlankConversation,
  saveConversations,
} from './chatSession';
import { runComposerSubmitGate } from '../../features/chat/composerSubmitGate';
import {
  finalizeInterruptedAssistantMessage,
  replaceFailedFetchAssistantContent,
  replyContentFromGenerationError,
} from '../../features/chat/generationInterrupt';
import i18n from '../../i18n';
import { mergeConversationsForMutation } from './chatConversationMerge';
import { stripChatConversationsForPersist } from '../../features/session-persist';
import { clearMessagesScrollCache, useMessagesScroll } from '../../hooks/useMessagesScroll';
import { copyToClipboard } from '../../utils';
import { ChatWelcomePane, chatWelcomePaneAriaLabel } from '../../components/chat-welcome';
import type { WelcomeApplyPayload } from '../../components/chat-welcome';
import {
  buildImageWelcomePaneProps,
  buildTextWelcomePaneProps,
} from '../../features/chat-welcome';
import { ModelEmptyCubeIcon } from '@/assets/icons';
import {
  ModelIcon,
  resolveModelIconName as resolveModelIconNameFromMeta,
  ComposerModelPicker,
  ComposerModelPickerPanel,
  modalityCategory,
  type ModelPickerFilterMode,
} from '../../components/model-picker';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * 仅决定发送时走哪条 API；模型列表与 /api/pricing 返回的模型一致（不依赖 supported_endpoint_types）。
 * chat → /v1/chat/completions
 * image → /v1/images/generations
 * （视频生成见独立路由 /video）
 */
type RelayRequestKind = 'chat' | 'image';

interface Message {
  /** divider：界面分隔线，仅本地展示，不参与 API；其以下（含后续）为当前上下文 */
  role: 'user' | 'assistant' | 'divider';
  content: string | ChatUserContentPart[];
  /** which model produced this assistant message */
  model?: string;
  /** streaming in progress */
  streaming?: boolean;
  /** API / 网络失败时的助手回复，用于红色错误样式 */
  isError?: boolean;
}

interface MessageGroup {
  userContent: string | ChatUserContentPart[];
  responses: Message[];
  id: string;
}

/** 发往模型时仅保留「最后一次清除上下文」之后的 user/assistant 消息 */
function messagesIncludedInApiContext(messages: Message[]): Message[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'divider') {
      start = i + 1;
      break;
    }
  }
  return messages.slice(start).filter((m): m is Message & { role: 'user' | 'assistant' } =>
    m.role === 'user' || m.role === 'assistant',
  );
}

type MessageTimelineItem =
  | { kind: 'divider'; key: string }
  | { kind: 'group'; group: MessageGroup };

function buildMessageTimeline(msgs: Message[]): MessageTimelineItem[] {
  const items: MessageTimelineItem[] = [];
  let i = 0;
  while (i < msgs.length) {
    if (msgs[i].role === 'divider') {
      items.push({ kind: 'divider', key: `div-${i}` });
      i++;
      continue;
    }
    if (msgs[i].role === 'user') {
      const userContent = msgs[i].content;
      const groupId = genConversationId();
      const responses: Message[] = [];
      i++;
      while (i < msgs.length && msgs[i].role === 'assistant') {
        responses.push(msgs[i]);
        i++;
      }
      items.push({ kind: 'group', group: { userContent, responses, id: groupId } });
    } else if (msgs[i].role === 'assistant') {
      const responses: Message[] = [];
      while (i < msgs.length && msgs[i].role === 'assistant') {
        responses.push(msgs[i]);
        i++;
      }
      items.push({
        kind: 'group',
        group: { userContent: '', responses, id: genConversationId() },
      });
    } else {
      i++;
    }
  }
  return items;
}

/** 多参考上传与视频全能参考一致：最多 9 个附件（图+视频合计） */
const MAX_CHAT_ATTACHMENTS = 9;
// const MAX_CHAT_ATTACHMENTS = 3;
type PendingAttachment = {
  id: string;
  preview: string;
  name: string;
  kind: 'image' | 'video';
  uploading?: boolean;
  uploadProgress?: number;
  ossPublicUrl?: string;
  ossFileId?: string;
  ossUploading?: boolean;
};

function mapChatAttachmentsForComposer(attachments: PendingAttachment[]) {
  return attachments.map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    preview: a.preview,
    uploading: Boolean(a.uploading || a.ossUploading),
    uploadProgress: a.ossUploading ? a.uploadProgress : a.uploadProgress,
  }));
}

/** /api/pricing 单条模型（与后端 Pricing 一致） */
interface PricingModelRow {
  model_name: string;
  display_name?: string;
  modalities?: string;
  /** 管理员配置的输入类型，如 text / text,image — 控制附件等能力 */
  input_types?: string;
  model_img?: string;
  /** 供应商 key：未显式配 model_img 时，用该供应商的 logo 兜底显示 */
  provider_key?: string;
  usage_description?: string;
}

function modelSupportsChatVideoAttachment(row: PricingModelRow | undefined): boolean {
  const explicit = (row?.input_types || '').trim();
  if (explicit) {
    const parts = explicit.toLowerCase().split(/[,;\s]+/).filter(Boolean);
    return parts.some((p) => p === 'video');
  }
  const modalities = (row?.modalities || '').toLowerCase();
  return /video/.test(modalities);
}

function modelSupportsChatImageAttachment(row: PricingModelRow | undefined): boolean {
  const explicit = (row?.input_types || '').trim();
  if (explicit) {
    const parts = explicit.toLowerCase().split(/[,;\s]+/).filter(Boolean);
    return parts.some((p) => p === 'image' || p === 'vision');
  }
  const modalities = (row?.modalities || '').toLowerCase();
  return /image|vision/.test(modalities);
}

function modelAllowedForChatScope(row: PricingModelRow | undefined, scope: ChatShellScope): boolean {
  const cat = modalityCategory(row?.modalities);
  if (scope === 'text') return cat === 'text';
  return cat === 'image' || cat === 'video';
}

function userContentTitlePreview(content: string | ChatUserContentPart[], maxLen = 28): string {
  if (typeof content === 'string') return content.slice(0, maxLen);
  const textPart = content.find((p): p is { type: 'text'; text: string } => p.type === 'text');
  if (textPart?.text?.trim()) return textPart.text.trim().slice(0, maxLen);
  if (content.some(p => p.type === 'video_url')) return '🎬';
  return '🖼';
}

/** 发往标准 Chat Completions：视频无原生字段，用占位文案保留上下文；图片用未过期预签名，不带 file_id */
async function mapContentForChatApi(
  content: string | ChatUserContentPart[],
  videoPlaceholder: string,
): Promise<string | ChatUserContentPart[]> {
  if (typeof content === 'string') return content;
  const out: ChatUserContentPart[] = [];
  for (const part of content) {
    if (part.type === 'video_url') {
      out.push({ type: 'text', text: videoPlaceholder });
    } else if (part.type === 'image_url') {
      const url = await resolveFreshImageSrc(part.image_url.url, part.file_id);
      if (url.trim()) out.push({ type: 'image_url', image_url: { url } });
    } else {
      out.push(part);
    }
  }
  if (out.length === 1 && out[0].type === 'text') return out[0].text;
  return out;
}

function chatImagePartFromPending(a: PendingAttachment): ChatUserContentPart {
  const url = (a.ossPublicUrl || a.preview).trim();
  return a.ossFileId
    ? { type: 'image_url', image_url: { url }, file_id: a.ossFileId }
    : { type: 'image_url', image_url: { url } };
}

function pendingChatImageFileIds(attachments: PendingAttachment[]): string[] {
  return attachments
    .filter((a) => a.kind === 'image' && a.ossFileId)
    .map((a) => a.ossFileId!.trim())
    .filter(Boolean);
}

function splitUserDisplay(content: string | ChatUserContentPart[]): { text: string; imageUrls: string[]; videoUrls: string[] } {
  if (typeof content === 'string') return { text: content, imageUrls: [], videoUrls: [] };
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const textParts: string[] = [];
  for (const part of content) {
    if (part.type === 'image_url') imageUrls.push(part.image_url.url);
    else if (part.type === 'video_url') videoUrls.push(part.video_url.url);
    else if (part.type === 'text' && part.text) textParts.push(part.text);
  }
  return { text: textParts.join('\n\n'), imageUrls, videoUrls };
}

const ASSISTANT_IMAGE_MD_RE = /!\[[^\]]*\]\([^)]+\)/g;

/** 图像对话：助手回复仅为 markdown 图片（文生图结果） */
function isAssistantImageOnlyMarkdown(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const images = trimmed.match(ASSISTANT_IMAGE_MD_RE);
  if (!images?.length) return false;
  return trimmed.replace(ASSISTANT_IMAGE_MD_RE, '').trim() === '';
}

function parseAssistantImageUrls(raw: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match = re.exec(raw);
  while (match) {
    urls.push(match[1]);
    match = re.exec(raw);
  }
  return urls;
}

function assistantMessageBodyClass(
  scope: ChatShellScope,
  raw: string,
  streaming: boolean,
  isError?: boolean,
): string {
  if (isError && !streaming) {
    return 'msg-bubble msg-bubble--ai msg-bubble--error';
  }
  if (scope === 'image' && !streaming && isAssistantImageOnlyMarkdown(raw)) {
    return 'msg-ai-media image-gen-result-images-wrap';
  }
  return 'msg-bubble msg-bubble--ai chat-markdown';
}

/** 写入助手占位消息的最终内容与错误标记 */
function applyAssistantReplyFinal(
  msg: Message,
  accumulated: string,
  isError: boolean,
): Message {
  const currentContent = typeof msg.content === 'string' ? msg.content : '';
  const currentVideo = parseVideoTaskPayload(currentContent);
  const nextVideo = accumulated ? parseVideoTaskPayload(accumulated) : null;
  const shouldKeepCurrentCompleted =
    currentVideo?.status === 'completed' &&
    (!nextVideo || nextVideo.status !== 'completed');
  if (shouldKeepCurrentCompleted) {
    return { ...msg, streaming: false };
  }
  return {
    ...msg,
    content: accumulated || msg.content,
    streaming: false,
    isError: isError && Boolean(accumulated),
  };
}

function messageGroupClassName(scope: ChatShellScope, extra?: string): string {
  const parts = ['message-group'];
  if (scope === 'image') parts.push('message-group--image-gen');
  if (extra) parts.push(extra);
  return parts.join(' ');
}

function ImageGenResultShell({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <div className="image-gen-result">{children}</div>;
}

function canShowTextBubbleCopy(
  scope: ChatShellScope,
  bodyClass: string,
  streaming: boolean,
  hasVideoTask = false,
): boolean {
  if (scope !== 'text' || streaming || hasVideoTask) return false;
  return bodyClass.includes('msg-bubble--ai');
}

/** 文本对话 AI 气泡：右下角 hover 显示复制全文 */
function AssistantTextBubbleShell({
  showCopy,
  copyText,
  className,
  children,
}: {
  showCopy: boolean;
  copyText: string;
  className: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const text = copyText.trim();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (!ok) {
      notify.error(t('chat.copyBubbleFailed'));
      return;
    }
    setCopied(true);
    notify.success(t('copied'));
    window.setTimeout(() => setCopied(false), 2000);
  };

  const shellClass = showCopy ? `${className} msg-bubble--ai-copyable` : className;

  return (
    <div className={shellClass}>
      {children}
      {showCopy && copyText.trim() && (
        <button
          type="button"
          className="msg-bubble-copy-btn"
          onClick={(e) => { void handleCopy(e); }}
          aria-label={copied ? t('copied') : t('copy')}
          title={copied ? t('copied') : t('copy')}
        >
          <CopyOutlined aria-hidden />
        </button>
      )}
    </div>
  );
}

function UserMessageInline({ content }: { content: string | ChatUserContentPart[] }) {
  const { text } = splitUserDisplay(content);
  const mediaItems = extractUserMediaItems(content);
  const hasText = text.trim().length > 0;
  const hasMedia = mediaItems.length > 0;
  return (
    <>
      {hasText && (
        <div className="msg-bubble msg-bubble--user">
          <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
        </div>
      )}
      {hasMedia && (
        <div className={`msg-user-attachments-below${hasText ? ' msg-user-attachments-below--after-bubble' : ''}`}>
          <UserMessageAttachmentsStrip items={mediaItems} />
        </div>
      )}
    </>
  );
}

function VideoTaskInline({
  payload,
  retrying,
  onRetry,
  cancelling,
  onCancel,
}: {
  payload: VideoTaskPayload;
  retrying?: boolean;
  onRetry?: () => void;
  cancelling?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const statusLabelMap: Record<VideoTaskStatus, string> = {
    queued: t('chat.videoStatusQueued'),
    in_progress: t('chat.videoStatusInProgress'),
    completed: t('chat.videoStatusCompleted'),
    failed: t('chat.videoStatusFailed'),
    unknown: t('chat.videoStatusUnknown'),
  };
  const progress = typeof payload.progress === 'number' ? Math.max(0, Math.min(100, payload.progress)) : null;
  const statusLabel = statusLabelMap[payload.status] || statusLabelMap.unknown;
  // 只有后端明确标记可取消时才显示按钮：判断口径在服务端（渠道开关 + 适配器能力 + 排队状态），
  // 前端不做任何推断，避免出现「点了必定失败」的按钮。
  const showCancel = payload.canCancel === true && onCancel !== undefined;
  return (
    <div className="video-task-card">
      <div className="video-task-card__meta">
        <span className={`video-task-card__status video-task-card__status--${payload.status}`}>{statusLabel}</span>
        {progress !== null && payload.status !== 'completed' && payload.status !== 'failed' && (
          <span className="video-task-card__progress">{progress}%</span>
        )}
      </div>
      <div className="video-task-card__task-id">task: {payload.taskId}</div>
      {payload.errorMessage && payload.status !== 'completed' && (
        <div className="video-task-card__error">{payload.errorMessage}</div>
      )}
      {payload.videoUrl && payload.status === 'completed' && (
        <video
          src={coercePlaybackVideoUrl(payload.taskId, payload.videoUrl)}
          controls
          playsInline
          preload="metadata"
          className="video-task-card__video"
        />
      )}
      {payload.status !== 'completed' && (
        <button
          type="button"
          className="video-task-card__retry-btn"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? t('chat.videoRetryPollingLoading') : t('chat.videoRetryPolling')}
        </button>
      )}
      {showCancel && (
        <button
          type="button"
          className="video-task-card__cancel-btn"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? t('chat.videoCancelLoading') : t('chat.videoCancel')}
        </button>
      )}
      <button
        type="button"
        className="video-task-card__retry-icon-btn"
        onClick={onRetry}
        disabled={retrying}
        title={retrying ? t('chat.videoRetryPollingLoading') : t('chat.videoRetryPolling')}
        aria-label={retrying ? t('chat.videoRetryPollingLoading') : t('chat.videoRetryPolling')}
      >
        ↻
      </button>
    </div>
  );
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  /** flat message list for compat with API */
  messages: Message[];
  /** selected model IDs */
  models: string[];
  pinned?: boolean;
}

type ContextMenu = {
  convId: string;
  x: number;
  y: number;
} | null;

// ─── localStorage 读取（含旧版 key 迁移，仅文本 scope）────────────────────────

const LEGACY_STORAGE_PREFIX = 'lynxton_chat_conversations_v2';

function loadConversations(userId: number | undefined, scope: ChatShellScope): Conversation[] {
  try {
    const key = getStorageKey(userId, scope);
    let raw = localStorage.getItem(key);
    if (!raw && scope === 'text') {
      const legacy = userId != null ? `${LEGACY_STORAGE_PREFIX}_u${userId}` : LEGACY_STORAGE_PREFIX;
      raw = localStorage.getItem(legacy);
      if (raw) {
        try {
          localStorage.setItem(key, raw);
        } catch { /* ignore */ }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((c: Conversation & { model?: string }) => ({
      ...c,
      models: c.models?.length ? c.models : (c.model ? [c.model] : []),
      messages: (c.messages || []).map((m: Message) => {
        let content: Message['content'] =
          typeof m.content === 'string' || Array.isArray(m.content) ? m.content : String(m.content ?? '');
        if (m.role === 'assistant' && Array.isArray(content)) {
          content = JSON.stringify(content);
        }
        return replaceFailedFetchAssistantContent(
          { ...m, content },
          i18n.t('chat.taskInterrupted'),
        );
      }),
    }));
  } catch { return []; }
}

function bootstrapChatShellSessions(
  userId: number | undefined,
  scope: ChatShellScope,
  newChatTitle: string,
): { conversations: Conversation[]; activeId: string } {
  let list = loadConversations(userId, scope);
  if (list.length === 0) {
    list = [createBlankConversation(newChatTitle)];
  } else {
    const interruptedText = i18n.t('chat.taskInterrupted');
    list = list.map((c) => ({
      ...c,
      messages: c.messages.map((m) => finalizeInterruptedAssistantMessage(m, interruptedText)),
    }));
  }
  const stored = readLastActiveConversationId(userId, scope);
  const activeId = stored && list.some((c) => c.id === stored) ? stored : list[0]!.id;
  return { conversations: list, activeId };
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (!ok) {
      notify.error(t('chat.copyBubbleFailed'));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="codeblock">
      <div className="codeblock-header">
        <span className="codeblock-lang">{language || 'code'}</span>
        <button className="codeblock-copy" onClick={() => { void handleCopy(); }}>
          <CopyOutlined style={{ fontSize: 12 }} />
          {copied ? t('codeCopied') : t('copyCode')}
        </button>
      </div>
      <pre className="codeblock-pre"><code>{code}</code></pre>
    </div>
  );
}

function buildChatMarkdownComponents(options: {
  useImageGenResult: boolean;
  onImagePreview: (url: string) => void;
  t: (key: string) => string;
}): Components {
  const { useImageGenResult, onImagePreview, t } = options;
  return {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const code = String(children).replace(/\n$/, '');
      if (match || code.includes('\n')) {
        return <CodeBlock code={code} language={match?.[1] || ''} />;
      }
      return (
        <code className="inline-code" {...props}>{children}</code>
      );
    },
    p({ children }) { return <p>{children}</p>; },
    ul({ children }) { return <ul>{children}</ul>; },
    ol({ children }) { return <ol>{children}</ol>; },
    li({ children }) { return <li>{children}</li>; },
    h1({ children }) { return <h1 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0 6px' }}>{children}</h1>; },
    h2({ children }) { return <h2 style={{ fontSize: 17, fontWeight: 600, margin: '10px 0 6px' }}>{children}</h2>; },
    h3({ children }) { return <h3 style={{ fontSize: 15, fontWeight: 600, margin: '8px 0 4px' }}>{children}</h3>; },
    blockquote({ children }) {
      return (
        <blockquote className="md-blockquote">{children}</blockquote>
      );
    },
    table({ children }) {
      return (
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table className="md-table">{children}</table>
        </div>
      );
    },
    th({ children }) { return <th className="md-th">{children}</th>; },
    td({ children }) { return <td className="md-td">{children}</td>; },
    a({ href, children }) {
      return <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>;
    },
    hr() { return <hr className="md-hr" />; },
    img({ src, alt, ...props }) {
      if (useImageGenResult && src) {
        return (
          <ImageGenResultImage
            src={String(src)}
            alt={typeof alt === 'string' ? alt : undefined}
          />
        );
      }
      return (
        <button
          type="button"
          className="chat-md-img-wrap"
          onClick={() => src && onImagePreview(String(src))}
          aria-label={t('chat.previewImage')}
        >
          <img
            {...props}
            src={src}
            alt={typeof alt === 'string' ? alt : ''}
            className="chat-md-img"
            loading="lazy"
          />
        </button>
      );
    },
  };
}

function renderAssistantReplyContent(options: {
  scope: ChatShellScope;
  raw: string;
  streaming: boolean;
  isError?: boolean;
  onImagePreview: (url: string) => void;
  t: (key: string) => string;
}): React.ReactNode {
  const { scope, raw, streaming, isError, onImagePreview, t } = options;
  if (isError && !streaming) {
    return <p className="msg-bubble-error-text">{raw}</p>;
  }
  return renderAssistantReplyMarkdown({ scope, raw, streaming, onImagePreview, t });
}

function renderAssistantReplyMarkdown(options: {
  scope: ChatShellScope;
  raw: string;
  streaming: boolean;
  onImagePreview: (url: string) => void;
  t: (key: string) => string;
}): React.ReactNode {
  const { scope, raw, streaming, onImagePreview, t } = options;
  const useImageGen = scope === 'image';

  if (useImageGen && !streaming && isAssistantImageOnlyMarkdown(raw)) {
    return <ImageGenResultImages urls={parseAssistantImageUrls(raw)} />;
  }

  const displayRaw = raw || (!streaming ? t('chat.multimodalMessage') : '');
  const components = buildChatMarkdownComponents({
    useImageGenResult: useImageGen,
    onImagePreview,
    t,
  });
  const markdown = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {displayRaw}
    </ReactMarkdown>
  );

  if (useImageGen) {
    return <AntdImage.PreviewGroup>{markdown}</AntdImage.PreviewGroup>;
  }
  return markdown;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatShell({
  modelPickerFilter,
}: {
  /** 文本对话 text；图像对话 img（仅展示图像类模型，不含纯视频） */
  modelPickerFilter: Extract<ModelPickerFilterMode, 'text' | 'img'>;
}) {
  const scope: ChatShellScope = modelPickerFilter === 'text' ? 'text' : 'image';
  /** 仅图像对话显示「上传文件」；文本对话不展示 */
  const showComposerFileUpload = modelPickerFilter === 'img';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh: refreshUser } = useUser();
  const userId = user?.id;

  const bootstrappedChatRef = useRef<ReturnType<typeof bootstrapChatShellSessions> | null>(null);
  if (bootstrappedChatRef.current === null) {
    bootstrappedChatRef.current = bootstrapChatShellSessions(userId, scope, t('chat.newChatTitle'));
  }

  // ── State ──────────────────────────────────────────────────────────────────

  const [conversations, setConversations] = useState<Conversation[]>(
    () => bootstrappedChatRef.current!.conversations,
  );
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const [activeId, setActiveId] = useState<string | null>(
    () => bootstrappedChatRef.current!.activeId,
  );
  /** 供滚底 rAF 等异步回调读取当前会话 id，避免闭包陈旧 */
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const [input, setInput] = useState('');
  /** 正在请求的会话 id；仅当与 activeId 一致时 composer 显示「停止」 */
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const isComposerSending = streamingConvId != null && streamingConvId === activeId;

  const beginConvStreaming = useCallback((convId: string) => {
    setStreamingConvId(convId);
  }, []);

  const endConvStreaming = useCallback((convId: string) => {
    setStreamingConvId((prev) => (prev === convId ? null : prev));
  }, []);

  const syncStreamingConvIdFromConversations = useCallback(
    (list: Conversation[], convId: string | null) => {
      if (!convId) return;
      const conv = list.find((c) => c.id === convId);
      const hasStreaming = Boolean(conv?.messages.some((m) => m.streaming));
      setStreamingConvId((prev) => {
        if (hasStreaming) return convId;
        return prev === convId ? null : prev;
      });
    },
    [],
  );
  const [tokenKey, setTokenKey] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [pricingModels, setPricingModels] = useState<PricingModelRow[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  /** models temporarily removed from this conversation */
  const [removedModels, setRemovedModels] = useState<string[]>([]);

  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  /** 本页 persist 触发的 sync 回调抑制计数，避免流式每次写入都 setConversations 自循环 */
  const suppressPersistSyncRef = useRef(0);
  /** 消息区滚动容器（桌面 / 移动互斥渲染，共用同一 ref） */
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<InputRef>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  /** 点击图片后的灯箱预览 URL */
  const [imageLightboxUrl, setImageLightboxUrl] = useState<string | null>(null);

  /** 待发送附件（图片先上 OSS，会话只落 file_id + 短时 URL） */
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  const discardedAttachmentIdsRef = useRef(new Set<string>());
  /** 拖拽文件悬停在输入框上时高亮 */
  const [composerDropActive, setComposerDropActive] = useState(false);
  const [retryingVideoTaskIds, setRetryingVideoTaskIds] = useState<Set<string>>(new Set());
  /** 正在发起取消请求的任务（用于按钮 loading 态，防止重复提交） */
  const [cancellingVideoTaskIds, setCancellingVideoTaskIds] = useState<Set<string>>(new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileModelsOpen, setMobileModelsOpen] = useState(false);
  // TODO: 画面比例选择 — 暂关闭
  // const [imageAspectRatioDraft, setImageAspectRatioDraft] = useState<ImageAspectRatio>(
  //   DEFAULT_IMAGE_ASPECT_RATIO,
  // );
  // const [imageVisualMenuOpen, setImageVisualMenuOpen] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeConv = useMemo(
    () => conversations.find(c => c.id === activeId),
    [conversations, activeId]
  );

  /** 「添加模型」药丸：有默认空白会话后始终可点 */
  const composerModelPillDisabled = false;

  const activeModels = useMemo(() => {
    const selected = activeConv?.models || [];
    return selected.filter(m => !removedModels.includes(m));
  }, [activeConv?.models, removedModels]);

  /** 有会话但尚未选模型：易与 :disabled 混淆，单独加高亮样式 */
  const composerModelPillPickModel = !composerModelPillDisabled && activeModels.length === 0;

  /** 由已选模型的 modalities 决定走对话还是文生图（与模型分组逻辑一致）；文本模块固定走 chat */
  const relayRequestKind = useMemo((): RelayRequestKind => {
    if (scope === 'text') return 'chat';
    if (activeModels.length === 0) return 'chat';
    const allImageGen = activeModels.every((m) => {
      const row = pricingModels.find((p) => p.model_name === m);
      return modalityCategory(row?.modalities) === 'image';
    });
    return allImageGen ? 'image' : 'chat';
  }, [scope, activeModels, pricingModels]);

  // const imageAspectRatioOptions = useMemo(
  //   () => resolveImageAspectRatioOptions(activeModels),
  //   [activeModels],
  // );
  // const imageAspectRatioPickerOptions = useMemo(
  //   () => imageAspectRatioOptions.map((o) => ({ ratio: o.ratio, labelKey: o.labelKey })),
  //   [imageAspectRatioOptions],
  // );
  // const imageGenSize = useMemo(
  //   () => resolveImageSizeFromRatio(imageAspectRatioDraft),
  //   [imageAspectRatioDraft],
  // );
  // const showImageAspectRatioPicker = scope === 'image' && relayRequestKind === 'image';

  const attachmentAccept = useMemo(
    () => resolveChatAttachmentAccept(activeModels, pricingModels),
    [activeModels, pricingModels],
  );

  const chatAllowedAttachmentKinds = useMemo(
    () => resolveChatAllowedAttachmentKinds(activeModels, pricingModels),
    [activeModels, pricingModels],
  );

  const composerZoneAttachments = useMemo(
    () => mapChatAttachmentsForComposer(pendingAttachments),
    [pendingAttachments],
  );

  // 时间轴：含「清除上下文」分隔线 + 多模型 (user + N assistant) 组
  const messageTimeline = useMemo((): MessageTimelineItem[] => {
    if (!activeConv) return [];
    return buildMessageTimeline(activeConv.messages);
  }, [activeConv?.messages]);

  /** 文本对话：新建/空会话展示居中预设卡片 */
  const showTextCenteredWelcome = scope === 'text' && (!activeConv || messageTimeline.length === 0);
  /** 图像对话：新建/空会话与文本相同的居中欢迎布局（仅标题，无卡片） */
  const showImageCenteredWelcome = scope === 'image' && (!activeConv || messageTimeline.length === 0);
  const showCenteredWelcome = showTextCenteredWelcome || showImageCenteredWelcome;

  const {
    onScroll: handleMessagesScroll,
    scrollToEnd: scrollMessagesToEnd,
    scrollIfStuckToBottom,
  } = useMessagesScroll({
    scrollRef: messagesScrollRef,
    sessionId: activeId,
    scopeKey: scope,
    userId,
    contentLength: messageTimeline.length,
    showEmpty: showCenteredWelcome,
    viewportKey: isMobileViewport,
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  // useEffect(() => {
  //   if (scope !== 'image') return;
  //   setImageAspectRatioDraft((prev) => normalizeImageAspectRatioDraft(prev, activeModels));
  // }, [scope, activeModels]);

  // Load token key
  useEffect(() => {
    (async () => {
      try {
        const res = await getTokens({ p: 0, page_size: 50 });
        if (res.data?.success) {
          const items: { id: number; status: number; key: string; default?: boolean }[] =
            res.data?.data?.items || res.data?.data || [];
          const active = pickPreferredToken(items);
          if (active) {
            try {
              const keyRes = await getTokenKey(active.id);
              if (keyRes.data?.success) {
                const fullKey: string = keyRes.data?.data?.key || '';
                setTokenKey(fullKey.startsWith('sk-') ? fullKey : `sk-${fullKey}`);
              }
            } catch {
              setTokenKey(active.key);
            }
          }
        }
      } catch { /* ignore */ }
      setTokenLoading(false);
    })();
  }, []);

  // Load 模型广场列表（name + category → modalities 过滤）
  useEffect(() => {
    let cancelled = false;
    void fetchCatalogPickerModels()
      .then((rows) => {
        if (!cancelled && rows.length > 0) setPricingModels(rows);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [scope]);

  /** 从磁盘恢复会话；无会话时自动插入一条空白对话。刷新后残留的 streaming 占位改为中断提示。 */
  useLayoutEffect(() => {
    let list = loadConversations(userId, scope);
    if (list.length === 0) {
      const blank = createBlankConversation(t('chat.newChatTitle'));
      list = [blank];
      saveConversations(list, userId, scope);
    } else {
      const interruptedText = t('chat.taskInterrupted');
      let changed = false;
      const next = list.map((c) => ({
        ...c,
        messages: c.messages.map((m) => {
          const nextMsg = finalizeInterruptedAssistantMessage(m, interruptedText);
          if (nextMsg !== m) changed = true;
          return nextMsg;
        }),
      }));
      if (changed) {
        saveConversations(next, userId, scope);
        list = next;
      }
    }
    const stored = readLastActiveConversationId(userId, scope);
    const chosen = stored && list.some((c) => c.id === stored) ? stored : list[0]!.id;
    setConversations(list);
    setActiveId(() => chosen);
    setRemovedModels([]);
    syncStreamingConvIdFromConversations(list, chosen);
  }, [userId, scope, syncStreamingConvIdFromConversations, t]);

  /**
   * 侧栏选中会话写入 localStorage。
   * 不在「列表空 + activeId null」时 remove：该组合会出现于 Strict Mode / 路由重挂载等瞬态，会误删已保存的选中项。
   */
  useEffect(() => {
    if (activeId != null && conversations.some((c) => c.id === activeId)) {
      writeLastActiveConversationId(userId, scope, activeId);
    }
  }, [activeId, conversations, userId, scope]);

  // 其它标签页 / 实例写入 localStorage 后同步；本页 persist 时通过 suppressPersistSyncRef 跳过
  useEffect(() => {
    const sync = () => {
      if (suppressPersistSyncRef.current > 0) return;
      const ls = loadConversations(userId, scope);
      let next = mergeConversationsForMutation(conversationsRef.current, ls);
      if (next.length === 0) {
        next = [createBlankConversation(t('chat.newChatTitle'))];
        saveConversations(next, userId, scope);
      }
      setConversations(next);
      setActiveId((prev) => {
        if (prev != null && next.some((c) => c.id === prev)) return prev;
        const stored = readLastActiveConversationId(userId, scope);
        if (stored && next.some((c) => c.id === stored)) return stored;
        return next[0]?.id ?? null;
      });
      const resolvedActive =
        (activeIdRef.current != null && next.some((c) => c.id === activeIdRef.current)
          ? activeIdRef.current
          : null)
        ?? (() => {
          const stored = readLastActiveConversationId(userId, scope);
          if (stored && next.some((c) => c.id === stored)) return stored;
          return next[0]?.id ?? null;
        })();
      syncStreamingConvIdFromConversations(next, resolvedActive);
    };
    return subscribeChatPersist(scope, sync);
  }, [userId, scope, syncStreamingConvIdFromConversations, t]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Focus rename input
  useEffect(() => {
    if (!renamingId) return;
    const el = renameInputRef.current?.input;
    el?.focus();
    el?.select();
  }, [renamingId]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Reset removed models when conversation changes
  useEffect(() => {
    setRemovedModels([]);
  }, [activeId]);

  const discardPendingChatImages = useCallback((attachments: PendingAttachment[]) => {
    for (const a of attachments) discardedAttachmentIdsRef.current.add(a.id);
    void deleteStorageFiles(pendingChatImageFileIds(attachments));
  }, []);

  const clearPendingAttachmentsDiscardingOss = useCallback(() => {
    discardPendingChatImages(pendingAttachmentsRef.current);
    setPendingAttachments([]);
  }, [discardPendingChatImages]);

  useEffect(() => {
    const leftover = pendingAttachmentsRef.current;
    if (leftover.length === 0) return;
    discardPendingChatImages(leftover);
    setPendingAttachments([]);
  }, [activeId, discardPendingChatImages]);

  useEffect(() => {
    if (!imageLightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImageLightboxUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageLightboxUrl]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= 900);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * 统一通过 localStorage 作为真源更新会话，避免路由切换卸载后 setState 被丢弃导致流式内容中断。
   */
  const applyConversationMutation = useCallback((mutator: (prev: Conversation[]) => Conversation[]) => {
    const lsPrev = loadConversations(userId, scope);
    const memPrev = conversationsRef.current;
    const mergedPrev = mergeConversationsForMutation(memPrev, lsPrev);
    const next = mutator(mergedPrev);
    const toPersist = stripChatConversationsForPersist(next);
    suppressPersistSyncRef.current += 1;
    let persistOk = true;
    try {
      persistOk = persistStreamingConversations(toPersist, userId, scope);
    } finally {
      suppressPersistSyncRef.current -= 1;
    }
    setConversations(next);
    if (!persistOk) {
      notify.warning(t('chat.localPersistFailed'));
    }
    return next;
  }, [userId, scope, t]);

  const updateConv = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    applyConversationMutation((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }, [applyConversationMutation]);

  /** 定价加载后：移除当前模块不允许的已选模型（统一走 LS 落盘，避免与 useEffect 双写） */
  useEffect(() => {
    if (!pricingModels.length) return;
    applyConversationMutation((prev) =>
      prev.map((c) => ({
        ...c,
        models: (c.models || []).filter((m) => {
          const row = pricingModels.find((p) => p.model_name === m);
          return modelAllowedForChatScope(row, scope);
        }),
      })),
    );
  }, [pricingModels, scope, applyConversationMutation]);

  const patchVideoTaskPayload = useCallback((convId: string, taskId: string, updater: (p: VideoTaskPayload) => VideoTaskPayload) => {
    applyConversationMutation((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const msgs = c.messages.map((m) => {
          if (m.role !== 'assistant' || typeof m.content !== 'string') return m;
          const payload = parseVideoTaskPayload(m.content);
          if (!payload || payload.taskId !== taskId) return m;
          return { ...m, content: encodeVideoTaskPayload(updater(payload)) };
        });
        return { ...c, messages: msgs };
      }),
    );
    scrollIfStuckToBottom();
  }, [applyConversationMutation, scrollIfStuckToBottom]);

  const retryVideoTaskPolling = useCallback(async (taskId: string) => {
    if (!activeId || !tokenKey) return;
    if (retryingVideoTaskIds.has(taskId)) return;
    setRetryingVideoTaskIds((prev) => new Set(prev).add(taskId));
    const pollTimes = 1;
    const intervalMs = 0;
    try {
      let finished = false;
      let shouldRefreshQuota = false;
      patchVideoTaskPayload(activeId, taskId, (p) => ({ ...p, errorMessage: undefined, status: p.status === 'failed' ? 'in_progress' : p.status }));
      for (let i = 0; i < pollTimes; i++) {
        const resp = await fetch(`/v1/videos/${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokenKey}` },
        });
        const raw = await resp.text();
        if (!resp.ok) {
          patchVideoTaskPayload(activeId, taskId, (p) => ({
            ...p,
            status: 'failed',
            errorMessage: parseChatApiErrorBody(resp.status, raw),
          }));
          break;
        }
        try {
          const parsed = JSON.parse(raw) as VideoTaskApiResponse;
          patchVideoTaskPayload(activeId, taskId, (p) => {
            const patch = parseVideoTaskApiPollResponse(taskId, parsed, p);
            if (patch.status === 'completed') {
              finished = true;
              shouldRefreshQuota = true;
            }
            return {
              ...p,
              ...patch,
              errorMessage: patch.status === 'completed'
                ? undefined
                : (parsed.error?.message ?? p.errorMessage),
            };
          });
          if (isVideoTaskApiSucceeded(parsed)) break;
        } catch {
          // keep retrying when payload is malformed
        }
        if (i < pollTimes - 1) await new Promise((r) => setTimeout(r, intervalMs));
      }
      if (!finished) {
        patchVideoTaskPayload(activeId, taskId, (p) => ({
          ...p,
          errorMessage: t('chat.videoStillGeneratingTip'),
        }));
      } else if (shouldRefreshQuota) {
        try { await refreshUser(); } catch { /* ignore quota refresh failure */ }
      }
    } finally {
      setRetryingVideoTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [activeId, tokenKey, retryingVideoTaskIds, patchVideoTaskPayload, refreshUser, t]);

  /**
   * 取消视频生成任务。前端只负责发 DELETE 与展示结果，计费全部由服务端裁决：
   * 服务端先 CAS 抢占状态再发上游，上游确认才置失败并退款，上游拒绝则回滚、不动钱。
   * 因此这里无论成功失败都不会在本地改动额度，只在成功后刷新一次用户信息。
   */
  const cancelVideoTask = useCallback(async (taskId: string) => {
    if (!activeId || !tokenKey) return;
    if (cancellingVideoTaskIds.has(taskId)) return;
    setCancellingVideoTaskIds((prev) => new Set(prev).add(taskId));
    try {
      const result = await cancelVideoTaskRequest(taskId, tokenKey, {
        failed: t('chat.videoCancelFailed'),
        networkFailed: t('chat.videoCancelNetworkFailed'),
        byCode: {
          task_delete_not_supported_by_channel: t('chat.videoCancelNotSupported'),
          task_delete_not_supported_by_upstream: t('chat.videoCancelNotSupported'),
          task_delete_invalid_status: t('chat.videoCancelInvalidStatus'),
          task_delete_conflict: t('chat.videoCancelBusy'),
          task_not_exist: t('chat.videoCancelTaskMissing'),
          // 上游原生错误码（服务端已改为透传我方上游的错误 code）
          ResourceNotFound: t('chat.videoCancelTaskMissing'),
          InvalidParameter: t('chat.videoCancelInvalidStatus'),
        },
      });

      if (!result.ok) {
        // 失败时先收起按钮（后端已判定该任务不能再取消），再把原因告诉用户。
        if (result.shouldHideButton) {
          patchVideoTaskPayload(activeId, taskId, (p) => ({ ...p, canCancel: false }));
        }
        // 用 notify.error 而非 notifyApiError：后者会对文案再做一次翻译查找，
        // 而我们这里已经是 t() 出来的本地化文案，二次翻译反而可能改写它。
        notify.error(result.message);
        return;
      }

      // 成功：无论是否退款，任务都已终态，按失败展示（用户主动取消）。
      patchVideoTaskPayload(activeId, taskId, (p) => ({
        ...p,
        status: 'failed',
        canCancel: false,
        errorMessage: t('chat.videoCancelledMessage'),
      }));
      notify.info(t('chat.videoCancelledNoRefund'));
      try { await refreshUser(); } catch { /* ignore quota refresh failure */ }
    } finally {
      setCancellingVideoTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [activeId, tokenKey, cancellingVideoTaskIds, patchVideoTaskPayload, refreshUser, t]);

  const newConversation = useCallback(() => {
    const existingEmpty = conversations.find((c) => {
      if (c.messages.length > 0) return false;
      if (c.id === activeId && (input.trim() || pendingAttachments.length > 0)) return false;
      return true;
    });
    if (existingEmpty) {
      setActiveId(existingEmpty.id);
      notify.info(t('chat.emptyDraftFinishFirst'));
      return;
    }
    const conv: Conversation = createBlankConversation(t('chat.newChatTitle'));
    applyConversationMutation((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput('');
    setRemovedModels([]);
    clearPendingAttachmentsDiscardingOss();
    setSidebarSearch('');
  }, [activeId, applyConversationMutation, conversations, input, pendingAttachments.length, scope, t, userId, clearPendingAttachmentsDiscardingOss]);

  // const onImageVisualMenuOpenChange = useCallback((nextOpen: boolean) => {
  //   setImageVisualMenuOpen(nextOpen);
  //   if (nextOpen) {
  //     setShowModelDropdown(false);
  //     setModelSearch('');
  //     setMobileModelsOpen(false);
  //   }
  // }, []);

  const openModelPicker = useCallback(() => {
    if (conversations.length === 0) return;
    const activeOk = Boolean(activeId && conversations.some((c) => c.id === activeId));
    if (!activeOk) {
      const first = conversations[0];
      if (first) setActiveId(first.id);
    }
    if (isMobileViewport) {
      setMobileModelsOpen(true);
    } else if (!activeOk) {
      setShowModelDropdown(true);
    } else {
      setShowModelDropdown((v) => {
        if (v) setModelSearch('');
        return !v;
      });
    }
  }, [activeId, conversations, isMobileViewport]);

  const onComposerModelPopoverOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (conversations.length === 0) {
        if (!nextOpen) {
          setShowModelDropdown(false);
          setModelSearch('');
        }
        return;
      }
      if (nextOpen) {
        const ok = Boolean(activeId && conversations.some((c) => c.id === activeId));
        if (!ok) {
          const first = conversations[0];
          if (first) setActiveId(first.id);
        }
        setShowModelDropdown(true);
      } else {
        setShowModelDropdown(false);
        setModelSearch('');
      }
    },
    [activeId, conversations],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        newConversation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openModelPicker();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [newConversation, openModelPicker]);

  const deleteConversation = useCallback((id: string) => {
    const isOnlyConversation = conversations.length === 1 && conversations[0]?.id === id;
    clearMessagesScrollCache(scope, userId, id);
    const target = conversations.find((c) => c.id === id);
    const extraFileIds = id === activeId ? pendingChatImageFileIds(pendingAttachmentsRef.current) : [];
    const toDelete = chatImageFileIdsToDelete(target, conversations, extraFileIds);
    if (id === activeId) {
      discardPendingChatImages(pendingAttachmentsRef.current);
    }
    void deleteStorageFiles(toDelete);

    if (isOnlyConversation) {
      const reset = createBlankConversation(t('chat.newChatTitle'));
      clearMessagesScrollCache(scope, userId, reset.id);
      applyConversationMutation(() => [reset]);
      setActiveId(reset.id);
      writeLastActiveConversationId(userId, scope, reset.id);
      setInput('');
      setRemovedModels([]);
      setPendingAttachments([]);
      notify.success(t('chat.lastConversationCleared'));
      return;
    }

    applyConversationMutation((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeId === id) {
        const newActive = next[0]?.id ?? null;
        setActiveId(newActive);
        writeLastActiveConversationId(userId, scope, newActive);
      }
      return next;
    });
    if (id === activeId) setPendingAttachments([]);
    notify.success(t('chat.conversationDeleted'));
  }, [activeId, applyConversationMutation, conversations, discardPendingChatImages, scope, t, userId]);

  const duplicateConversation = useCallback((id: string) => {
    applyConversationMutation((prev) => {
      const src = prev.find((c) => c.id === id);
      if (!src) return prev;
      const copy: Conversation = {
        ...src,
        id: genConversationId(),
        title: src.title + t('chat.copySuffix'),
        createdAt: Date.now(),
      };
      const idx = prev.findIndex((c) => c.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, [applyConversationMutation, t]);

  const togglePin = useCallback((id: string) => {
    applyConversationMutation((prev) => {
      const toggled = prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c));
      const pinned = toggled.filter((c) => c.pinned).sort((a, b) => b.createdAt - a.createdAt);
      const rest = toggled.filter((c) => !c.pinned).sort((a, b) => b.createdAt - a.createdAt);
      return [...pinned, ...rest];
    });
  }, [applyConversationMutation]);

  const toggleComposerModel = useCallback(
    (model: string) => {
      if (!activeId) return;
      if (modelPickerFilter === 'img') {
        updateConv(activeId, (c) => {
          if (c.models.includes(model) && c.models.length === 1) {
            return { ...c, models: [] };
          }
          return { ...c, models: [model] };
        });
        setRemovedModels((prev) => prev.filter((m) => m !== model));
        return;
      }
      updateConv(activeId, (c) => {
        const has = c.models.includes(model);
        return {
          ...c,
          models: has ? c.models.filter((m) => m !== model) : [...c.models, model],
        };
      });
      setRemovedModels((prev) => prev.filter((m) => m !== model));
    },
    [activeId, modelPickerFilter, updateConv],
  );

  // ── Send message ───────────────────────────────────────────────────────────

  /** 从本地文件列表追加附件（按已选模型 input_types 校验类型，最多 MAX_CHAT_ATTACHMENTS） */
  const addAttachmentFilesFromList = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      if (activeModels.length === 0) {
        notify.info(t('chat.selectModelFirst'));
        return;
      }
      const remain = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;
      if (remain <= 0) {
        notifyApiError(t('chat.maxAttachments', { max: MAX_CHAT_ATTACHMENTS }));
        return;
      }

      const toProcess = files.slice(0, remain);
      if (files.length > remain) {
        notify.warning(t('chat.maxAttachments', { max: MAX_CHAT_ATTACHMENTS }));
      }

      for (const file of toProcess) {
        const kind = fileToAttachmentKind(file);
        if (!kind) {
          notifyApiError(t('chat.attachmentsUnsupportedType'));
          continue;
        }
        if (!isAttachmentKindAllowed(kind, chatAllowedAttachmentKinds)) {
          const unsupported = unsupportedModelsForAttachmentKind(kind, activeModels, pricingModels);
          if (kind === 'image') {
            notifyApiError(
              t('chat.modelNotSupportImageInput', { models: unsupported.join(', ') }),
            );
          } else {
            notifyApiError(
              t('chat.modelNotSupportVideoInput', { models: unsupported.join(', ') }),
            );
          }
          continue;
        }

        if (kind === 'video') {
          const rowId = genConversationId();
          void (async () => {
            try {
              await uploadLocalVideoFileToGenMediaOss(
                file,
                rowId,
                (f) => new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onprogress = (event) => {
                    if (!event.lengthComputable) return;
                    const pct = Math.round((event.loaded / event.total) * 100);
                    setPendingAttachments((prev) => prev.map((a) => (
                      a.id === rowId ? { ...a, uploadProgress: pct } : a
                    )));
                  };
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(reader.error || new Error('read failed'));
                  reader.readAsDataURL(f);
                }),
                {
                  onStart: (id, preview) => {
                    setPendingAttachments((prev) => {
                      if (prev.length >= MAX_CHAT_ATTACHMENTS) return prev;
                      return [...prev, {
                        id,
                        preview,
                        name: file.name,
                        kind: 'video',
                        ossUploading: true,
                        uploadProgress: 0,
                      }];
                    });
                  },
                  onProgress: (id, percent) => {
                    setPendingAttachments((prev) => prev.map((a) => (
                      a.id === id ? { ...a, uploadProgress: percent } : a
                    )));
                  },
                  onSuccess: (id, publicUrl, fileId) => {
                    setPendingAttachments((prev) => prev.map((a) => (
                      a.id === id
                        ? {
                          ...a,
                          preview: publicUrl,
                          ossPublicUrl: publicUrl,
                          ossFileId: fileId,
                          ossUploading: false,
                          uploadProgress: 100,
                        }
                        : a
                    )));
                  },
                  onError: (id, msg) => {
                    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
                    notifyApiError(msg);
                  },
                },
                'seedance_ref',
              );
            } catch {
              /* onError 已处理 */
            }
          })();
          continue;
        }

        const rowId = genConversationId();
        const bizRef = activeId || 'pending';
        setPendingAttachments((prev) => {
          if (prev.length >= MAX_CHAT_ATTACHMENTS) return prev;
          return [...prev, {
            id: rowId,
            preview: '',
            name: file.name,
            kind: 'image',
            uploading: true,
            ossUploading: true,
            uploadProgress: 0,
          }];
        });
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.round((event.loaded / event.total) * 100);
          setPendingAttachments((prev) => prev.map((a) => (
            a.id === rowId ? { ...a, uploadProgress: pct } : a
          )));
        };
        reader.onload = () => {
          const localPreview = reader.result as string;
          setPendingAttachments((prev) => prev.map((a) => (
            a.id === rowId
              ? { ...a, preview: localPreview, uploading: false }
              : a
          )));
          void (async () => {
            try {
              const uploaded = await uploadChatImageToOss(file, bizRef, (percent) => {
                setPendingAttachments((prev) => prev.map((a) => (
                  a.id === rowId ? { ...a, uploadProgress: percent } : a
                )));
              });
              if (discardedAttachmentIdsRef.current.has(rowId)) {
                discardedAttachmentIdsRef.current.delete(rowId);
                void deleteStorageFiles([uploaded.file_id]);
                return;
              }
              setPendingAttachments((prev) => prev.map((a) => (
                a.id === rowId
                  ? {
                    ...a,
                    preview: uploaded.url,
                    ossPublicUrl: uploaded.url,
                    ossFileId: uploaded.file_id,
                    ossUploading: false,
                    uploadProgress: 100,
                  }
                  : a
              )));
            } catch (err) {
              setPendingAttachments((prev) => prev.filter((a) => a.id !== rowId));
              const msg = err instanceof Error && err.message.trim()
                ? err.message
                : t('chat.imageOssUploadFailed');
              notifyApiError(msg);
            }
          })();
        };
        reader.onerror = () => {
          setPendingAttachments((prev) => prev.filter((a) => a.id !== rowId));
          notifyApiError(t('chat.videoGenFileReadFailed'));
        };
        reader.readAsDataURL(file);
      }
    },
    [activeId, activeModels, chatAllowedAttachmentKinds, pendingAttachments.length, pricingModels, t],
  );

  const handleAttachmentPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) addAttachmentFilesFromList(Array.from(files));
      e.target.value = '';
    },
    [addAttachmentFilesFromList],
  );

  const handleComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!tokenKey || isComposerSending) return;
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      addAttachmentFilesFromList(imageFiles);
    },
    [tokenKey, isComposerSending, addAttachmentFilesFromList],
  );

  const handleComposerDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!tokenKey || isComposerSending) return;
      if (e.dataTransfer.types?.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setComposerDropActive(true);
      }
    },
    [tokenKey, isComposerSending],
  );

  const handleComposerDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setComposerDropActive(false);
  }, []);

  const handleComposerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setComposerDropActive(false);
      if (!tokenKey || isComposerSending) return;
      const fl = e.dataTransfer.files;
      if (!fl?.length) return;
      addAttachmentFilesFromList(Array.from(fl));
    },
    [tokenKey, isComposerSending, addAttachmentFilesFromList],
  );

  const composerSubmitGateMessages = useMemo(
    () => ({
      missingToken: t('chat.missingTokenDescShort'),
      selectModel: t('chat.selectModelFirst'),
      enterContent: t('chat.enterContentFirst'),
    }),
    [t],
  );

  const handleSend = useCallback(async () => {
    if (isComposerSending) return;

    const hasContent = Boolean(input.trim()) || pendingAttachments.length > 0;
    if (!runComposerSubmitGate(
      {
        hasToken: Boolean(tokenKey),
        hasModel: activeModels.length > 0,
        hasContent,
      },
      composerSubmitGateMessages,
    )) {
      if (tokenKey && activeModels.length > 0 && !hasContent) {
        textareaRef.current?.focus();
      }
      return;
    }

    const text = input.trim();
    if (!activeId) return;

    const convId = activeId;
    const modelsToUse = activeModels;
    if (pendingAttachments.some((a) => a.uploading || a.ossUploading)) {
      notifyApiError(t('chat.attachmentsStillUploading'));
      return;
    }
    const imageAttachments = pendingAttachments.filter((a) => a.kind === 'image');
    const videoAttachments = pendingAttachments.filter((a) => a.kind === 'video');
    if (imageAttachments.length > 0) {
      if (imageAttachments.some((a) => !a.ossFileId || !a.ossPublicUrl)) {
        notifyApiError(t('chat.imageOssUploadFailed'));
        return;
      }
      const unsupported = modelsToUse.filter((modelName) => {
        const row = pricingModels.find((p) => p.model_name === modelName);
        return !modelSupportsChatImageAttachment(row);
      });
      if (unsupported.length > 0) {
        notifyApiError(
          t('chat.modelNotSupportImageInput', { models: unsupported.join(', ') }),
        );
        return;
      }
    }
    if (videoAttachments.length > 0) {
      if (videoAttachments.some((a) => !a.ossPublicUrl)) {
        notifyApiError(t('chat.videoGenHappyHorseVideoOssUploadFailed'));
        return;
      }
      const unsupported = modelsToUse.filter((modelName) => {
        const row = pricingModels.find((p) => p.model_name === modelName);
        return !modelSupportsChatVideoAttachment(row);
      });
      if (unsupported.length > 0) {
        notifyApiError(
          t('chat.modelNotSupportVideoInput', { models: unsupported.join(', ') }),
        );
        return;
      }
    }

    /** true：该模型 modalities 为文生图，走 /v1/images/generations；否则走 chat completions */
    const relaySlots = modelsToUse.map((modelName) => {
      const row = pricingModels.find((p) => p.model_name === modelName);
      return modalityCategory(row?.modalities) === 'image';
    });
    const allImage = scope !== 'text' && relaySlots.every(Boolean);

    // ── 仅文生图模型：POST /v1/images/generations ──
    if (allImage) {
      if (!text && imageAttachments.length === 0) {
        notifyApiError(t('chat.promptRequiredForRelay'));
        return;
      }
      setInput('');
      setPendingAttachments([]);
      beginConvStreaming(convId);

      const partsForStore: ChatUserContentPart[] = imageAttachments.map((a) => chatImagePartFromPending(a));
      if (text) partsForStore.push({ type: 'text', text });
      else if (partsForStore.length > 0) partsForStore.push({ type: 'text', text: t('chat.imageOnlyPrompt') });
      const finalPrompt = text || t('chat.imageOnlyPrompt');
      const referenceImageUrls = await Promise.all(
        imageAttachments.map((a) => resolveFreshImageSrc(a.ossPublicUrl || a.preview, a.ossFileId)),
      );
      const userContentForStore: string | ChatUserContentPart[] =
        partsForStore.length === 1 && partsForStore[0].type === 'text' ? partsForStore[0].text : partsForStore;

      const placeholders: Message[] = modelsToUse.map((m) => ({
        role: 'assistant',
        content: '',
        model: m,
        streaming: true,
      }));
      updateConv(convId, (c) => ({
        ...c,
        messages: [
          ...c.messages,
          { role: 'user', content: userContentForStore },
          ...placeholders,
        ],
        title: c.messages.length === 0 ? userContentTitlePreview(userContentForStore) : c.title,
      }));
      scrollMessagesToEnd();

      const imagePromises = modelsToUse.map(async (model, modelIdx) => {
        const controller = new AbortController();
        abortRefs.current.set(model, controller);
        let accumulated = '';
        let replyIsError = false;
        try {
          const response = await fetch('/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenKey}`,
            },
            body: JSON.stringify(
              buildImageGenerationsRequestBody(model, finalPrompt, referenceImageUrls),
            ),
            signal: controller.signal,
          });
          const raw = await response.text();
          if (!response.ok) {
            replyIsError = true;
            accumulated = parseChatApiErrorBody(response.status, raw);
          } else {
            try {
              const j = JSON.parse(raw) as { data?: Array<{ url?: string }> };
              const url = j.data?.[0]?.url;
              accumulated = url ? `![image](${url})` : raw.slice(0, 800);
            } catch {
              accumulated = raw.slice(0, 800);
            }
          }
        } catch (err: unknown) {
          const next = replyContentFromGenerationError(err, accumulated, t('chat.taskInterrupted'));
          replyIsError = next.isError;
          accumulated = next.content;
        } finally {
          abortRefs.current.delete(model);
          applyConversationMutation((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const msgs = [...c.messages];
              const assistantStartIdx = msgs.length - modelsToUse.length;
              const targetIdx = assistantStartIdx + modelIdx;
              if (targetIdx >= 0 && targetIdx < msgs.length) {
                msgs[targetIdx] = applyAssistantReplyFinal(msgs[targetIdx], accumulated, replyIsError);
              }
              return { ...c, messages: msgs };
            }),
          );
          scrollIfStuckToBottom();
        }
      });

      await Promise.all(imagePromises);
      endConvStreaming(convId);
      try { await refreshUser(); } catch { /* ignore quota refresh failure */ }
      return;
    }

    // ── 对话：/v1/chat/completions 流式 ──
    const parts: ChatUserContentPart[] = [
      ...pendingAttachments
        .filter((p) => p.kind === 'image')
        .map((p) => chatImagePartFromPending(p)),
      ...pendingAttachments
        .filter((p) => p.kind === 'video' && p.ossPublicUrl)
        .map((p) => ({
          type: 'video_url' as const,
          video_url: { url: p.ossPublicUrl! },
          file_id: p.ossFileId,
        })),
    ];
    if (text) parts.push({ type: 'text', text });
    else if (pendingAttachments.length > 0) {
      parts.push({ type: 'text', text: t('chat.imageOnlyPrompt') });
    }

    const userContentForStore: string | ChatUserContentPart[] =
      parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;

    setInput('');
    setPendingAttachments([]);
    beginConvStreaming(convId);

    // 必须在 updateConv 写入 user + 空 assistant 占位之前取历史，否则会把本轮占位一并读入并重复追加 user
    const prevOnly =
      conversationsRef.current.find((c) => c.id === convId)?.messages
      ?? loadConversations(userId, scope).find((c) => c.id === convId)?.messages
      ?? [];
    const historyMessages: Message[] = [
      ...messagesIncludedInApiContext(prevOnly),
      { role: 'user', content: userContentForStore },
    ];

    const placeholders: Message[] = modelsToUse.map((m) => ({
      role: 'assistant',
      content: '',
      model: m,
      streaming: true,
    }));

    updateConv(convId, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        { role: 'user', content: userContentForStore },
        ...placeholders,
      ],
      title: c.messages.length === 0 ? userContentTitlePreview(userContentForStore) : c.title,
    }));

    scrollMessagesToEnd();

    const finalPromptForImage = text || t('chat.imageOnlyPrompt');
    const referenceImageUrlsForRelay = await Promise.all(
      imageAttachments.map((a) => resolveFreshImageSrc(a.ossPublicUrl || a.preview, a.ossFileId)),
    );
    const apiHistoryMessages = await Promise.all(
      historyMessages.map(async (m) => ({
        role: m.role,
        content: await mapContentForChatApi(m.content, t('chat.videoAttachmentApiPlaceholder')),
      })),
    );

    const relayPromises = modelsToUse.map(async (model, modelIdx) => {
      if (relaySlots[modelIdx]) {
        const controller = new AbortController();
        abortRefs.current.set(model, controller);
        let accumulated = '';
        let replyIsError = false;
        try {
          const response = await fetch('/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenKey}`,
            },
            body: JSON.stringify(
              buildImageGenerationsRequestBody(
                model,
                finalPromptForImage,
                referenceImageUrlsForRelay,
              ),
            ),
            signal: controller.signal,
          });
          const raw = await response.text();
          if (!response.ok) {
            replyIsError = true;
            accumulated = parseChatApiErrorBody(response.status, raw);
          } else {
            try {
              const j = JSON.parse(raw) as { data?: Array<{ url?: string }> };
              const url = j.data?.[0]?.url;
              accumulated = url ? `![image](${url})` : raw.slice(0, 800);
            } catch {
              accumulated = raw.slice(0, 800);
            }
          }
        } catch (err: unknown) {
          const next = replyContentFromGenerationError(err, accumulated, t('chat.taskInterrupted'));
          replyIsError = next.isError;
          accumulated = next.content;
        } finally {
          abortRefs.current.delete(model);
          applyConversationMutation((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const msgs = [...c.messages];
              const assistantStartIdx = msgs.length - modelsToUse.length;
              const targetIdx = assistantStartIdx + modelIdx;
              if (targetIdx >= 0 && targetIdx < msgs.length) {
                msgs[targetIdx] = applyAssistantReplyFinal(msgs[targetIdx], accumulated, replyIsError);
              }
              return { ...c, messages: msgs };
            }),
          );
          scrollIfStuckToBottom();
        }
        return;
      }

      const controller = new AbortController();
      abortRefs.current.set(model, controller);

      let accumulated = '';
      let replyIsError = false;

      try {
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenKey}`,
          },
          body: JSON.stringify({
            model,
            messages: apiHistoryMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          replyIsError = true;
          const errText = await response.text();
          accumulated = parseChatApiErrorBody(response.status, errText);
        } else {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  applyConversationMutation((prev) =>
                    prev.map((c) => {
                      if (c.id !== convId) return c;
                      const msgs = [...c.messages];
                      const assistantStartIdx = msgs.length - modelsToUse.length;
                      const targetIdx = assistantStartIdx + modelIdx;
                      if (targetIdx >= 0 && targetIdx < msgs.length) {
                        msgs[targetIdx] = { ...msgs[targetIdx], content: accumulated };
                      }
                      return { ...c, messages: msgs };
                    }),
                  );
                  scrollIfStuckToBottom();
                }
              } catch { /* skip invalid JSON */ }
            }
          }
        }
      } catch (err: unknown) {
        const next = replyContentFromGenerationError(err, accumulated, t('chat.taskInterrupted'));
        replyIsError = next.isError;
        accumulated = next.content;
      } finally {
        abortRefs.current.delete(model);
        applyConversationMutation((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            const assistantStartIdx = msgs.length - modelsToUse.length;
            const targetIdx = assistantStartIdx + modelIdx;
            if (targetIdx >= 0 && targetIdx < msgs.length) {
              msgs[targetIdx] = applyAssistantReplyFinal(msgs[targetIdx], accumulated, replyIsError);
            }
            return { ...c, messages: msgs };
          }),
        );
        scrollIfStuckToBottom();
      }
    });

    await Promise.all(relayPromises);
    endConvStreaming(convId);
    try { await refreshUser(); } catch { /* ignore quota refresh failure */ }
  }, [
    input,
    pendingAttachments,
    isComposerSending,
    tokenKey,
    activeId,
    activeModels,
    conversations,
    pricingModels,
    updateConv,
    applyConversationMutation,
    beginConvStreaming,
    endConvStreaming,
    refreshUser,
    t,
    scope,
    userId,
    composerSubmitGateMessages,
    scrollMessagesToEnd,
    scrollIfStuckToBottom,
  ]);

  const handleStop = useCallback(() => {
    abortRefs.current.forEach(ctrl => ctrl.abort());
    abortRefs.current.clear();
    if (activeId) {
      const interruptedText = t('chat.taskInterrupted');
      updateConv(activeId, c => ({
        ...c,
        messages: c.messages.map((m) => {
          if (!m.streaming) return { ...m, streaming: false };
          return finalizeInterruptedAssistantMessage(m, interruptedText);
        }),
      }));
      endConvStreaming(activeId);
    }
  }, [activeId, endConvStreaming, updateConv, t]);

  /** 在本会话插入「清除上下文」线：保留聊天记录展示，仅后续轮次不再带上文作为 API 上下文 */
  const handleClearContext = useCallback(() => {
    if (!activeId) return;
    const interruptedText = t('chat.taskInterrupted');
    if (streamingConvId === activeId) {
      abortRefs.current.forEach((ctrl) => ctrl.abort());
      abortRefs.current.clear();
      endConvStreaming(activeId);
    }
    updateConv(activeId, (c) => ({
      ...c,
      messages: [
        ...c.messages.map((m) => (
          m.streaming ? finalizeInterruptedAssistantMessage(m, interruptedText) : m
        )),
        { role: 'divider', content: '' },
      ],
    }));
    requestAnimationFrame(() => {
      scrollIfStuckToBottom();
    });
    setInput('');
    clearPendingAttachmentsDiscardingOss();
    setRemovedModels([]);
  }, [activeId, streamingConvId, endConvStreaming, updateConv, scrollIfStuckToBottom, clearPendingAttachmentsDiscardingOss, t]);

  /** 清空当前会话已选模型 */
  const handleClearModels = useCallback(() => {
    if (!activeId) return;
    updateConv(activeId, (c) => ({
      ...c,
      models: [],
    }));
    setRemovedModels([]);
  }, [activeId, updateConv]);

  const handleComposerClearModels = useCallback(() => {
    handleClearModels();
  }, [handleClearModels]);

  const handleComposerSelectAllInTab = useCallback(
    (modelNames: string[]) => {
      if (!activeId || modelPickerFilter !== 'text' || modelNames.length === 0) return;
      updateConv(activeId, (c) => ({
        ...c,
        models: [...new Set([...c.models, ...modelNames])],
      }));
      setRemovedModels((prev) => prev.filter((m) => !modelNames.includes(m)));
    },
    [activeId, modelPickerFilter, updateConv],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Sidebar groups ─────────────────────────────────────────────────────────

  const sidebarConvs = useMemo(() => {
    const q = sidebarSearch.toLowerCase();
    const filtered = conversations.filter(c =>
      !q || c.title.toLowerCase().includes(q)
    );
    const pinned = filtered.filter(c => c.pinned);
    const rest = filtered.filter(c => !c.pinned);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 86400000;

    const groups: { label: string; items: Conversation[] }[] = [];
    if (pinned.length) groups.push({ label: '📌 Pinned', items: pinned });

    const today = rest.filter(c => c.createdAt >= todayStart);
    const yesterday = rest.filter(c => c.createdAt >= yesterdayStart && c.createdAt < todayStart);
    const earlier = rest.filter(c => c.createdAt < yesterdayStart);

    if (today.length) groups.push({ label: t('chat.today'), items: today });
    if (yesterday.length) groups.push({ label: t('chat.yesterday'), items: yesterday });
    if (earlier.length) groups.push({ label: t('chat.earlier'), items: earlier });
    return groups;
  }, [conversations, sidebarSearch, t]);

  // ── 模型展示名 / 元数据（仍以 model_name 作为 API 与状态中的 id）──

  const modelMetaMap = useMemo(() => {
    const map = new Map<string, { displayName: string; modalities: string; img: string }>();
    for (const p of pricingModels) {
      const displayName = (p.display_name && p.display_name.trim()) ? p.display_name.trim() : p.model_name;
      // 图标优先级：定价里手动指定 / 模型名正则命中 → 用内置图标；
      // 都匹配不到（如自定义展示名 V4-1）时，回退到该模型所属供应商的 logo。
      const builtinImg = resolveModelIconNameFromMeta(p.model_img, p.model_name);
      const providerKey = (p.provider_key || '').trim();
      const img = builtinImg !== 'other'
        ? builtinImg
        : (providerKey ? `provider:${providerKey}` : 'other');
      map.set(p.model_name, {
        displayName,
        modalities: p.modalities || '',
        img,
      });
    }
    return map;
  }, [pricingModels]);

  const resolveModelDisplayName = useCallback(
    (modelName: string | undefined) => {
      if (!modelName) return 'AI';
      const meta = modelMetaMap.get(modelName);
      if (meta?.displayName) return meta.displayName;
      return modelName.split('/').pop() || modelName;
    },
    [modelMetaMap],
  );

  const resolveModelIconName = useCallback(
    (modelName: string | undefined) => {
      if (!modelName) return 'other';
      const meta = modelMetaMap.get(modelName);
      return resolveModelIconNameFromMeta(meta?.img, modelName);
    },
    [modelMetaMap],
  );

  const scopeEligiblePricing = useMemo(
    () => pricingModels.filter((p) => modelAllowedForChatScope(p, scope)),
    [pricingModels, scope],
  );

  const categoryScopedPricing = useMemo(() => {
    if (modelPickerFilter === 'text') {
      return scopeEligiblePricing.filter((p) => modalityCategory(p.modalities) === 'text');
    }
    return scopeEligiblePricing.filter((p) => modalityCategory(p.modalities) === 'image');
  }, [scopeEligiblePricing, modelPickerFilter]);

  const filteredModelsForPicker = useMemo(() => {
    const raw = modelSearch.trim();
    if (!raw) return categoryScopedPricing;
    const tokens = raw
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return categoryScopedPricing.filter((p) => {
      const mn = p.model_name.toLowerCase();
      const dn = (p.display_name || '').toLowerCase();
      const sub = (p.usage_description || '').toLowerCase();
      const hay = `${mn} ${dn} ${sub}`;
      return tokens.every((t) => hay.includes(t));
    });
  }, [categoryScopedPricing, modelSearch]);

  const { textModels, imageModels } = useMemo(() => {
    const text: PricingModelRow[] = [];
    const image: PricingModelRow[] = [];
    for (const p of filteredModelsForPicker) {
      const category = modalityCategory(p.modalities);
      if (category === 'image') image.push(p);
      else if (category === 'text') text.push(p);
    }
    return { textModels: text, imageModels: image };
  }, [filteredModelsForPicker]);

  const modelsInPickerTab = useMemo(
    () => (modelPickerFilter === 'text' ? textModels : imageModels),
    [modelPickerFilter, textModels, imageModels],
  );

  const composerModelPillLabel = useMemo(() => {
    if (activeModels.length === 0) return t('chat.addModelsPromptCenter');
    if (activeModels.length === 1) {
      const m = activeModels[0];
      const short = m.includes('/') ? (m.split('/').pop() || m) : m;
      return short.length > 40 ? `${short.slice(0, 38)}…` : short;
    }
    const m0 = activeModels[0];
    const short0 = (m0.includes('/') ? (m0.split('/').pop() || m0) : m0).slice(0, 16);
    return `${short0} +${activeModels.length - 1}`;
  }, [activeModels, t]);

  const selectableModelTotal = useMemo(() => categoryScopedPricing.length, [categoryScopedPricing]);

  const composerPickerPanelProps = useMemo(
    () => ({
      selectionMode: modelPickerFilter === 'img' ? ('single' as const) : ('multi' as const),
      showBulkActions: modelPickerFilter === 'text',
      selectedModelIds: activeModels,
      totalSelectableModels: selectableModelTotal,
      resolveModelLabel: resolveModelDisplayName,
      modelSearch,
      onModelSearchChange: setModelSearch,
      selectionLocked: isComposerSending,
      onClearModels: handleComposerClearModels,
      onSelectAllInTab: handleComposerSelectAllInTab,
      modelsInPickerTab,
      onToggleModel: toggleComposerModel,
      resolveModelIconName,
    }),
    [
      activeModels,
      handleComposerClearModels,
      handleComposerSelectAllInTab,
      modelPickerFilter,
      modelSearch,
      modelsInPickerTab,
      resolveModelDisplayName,
      resolveModelIconName,
      isComposerSending,
      selectableModelTotal,
      toggleComposerModel,
    ],
  );

  /** 与侧栏当前会话标题一致 */
  const mainChatTitle = activeConv?.title || t('chat.newChatTitle');

  const textWelcomePaneProps = useMemo(() => buildTextWelcomePaneProps(t), [t]);
  const imageWelcomePaneProps = useMemo(() => buildImageWelcomePaneProps(t), [t]);

  const handleWelcomeApply = useCallback(
    async (payload: WelcomeApplyPayload) => {
      if (!activeConv) newConversation();
      if (payload.kind === 'text') {
        setInput(payload.prompt);
        clearPendingAttachmentsDiscardingOss();
        textareaRef.current?.focus();
        return;
      }
      if (payload.kind !== 'image' || scope !== 'image') return;
      setInput(payload.prompt);
      clearPendingAttachmentsDiscardingOss();
      textareaRef.current?.focus();
    },
    [activeConv, newConversation, scope, t, clearPendingAttachmentsDiscardingOss],
  );

  const welcomeDisabled = !tokenKey || isComposerSending;

  const centeredWelcomeEl = showTextCenteredWelcome ? (
    <ChatWelcomePane
      {...textWelcomePaneProps}
      disabled={welcomeDisabled}
      onApply={handleWelcomeApply}
    />
  ) : showImageCenteredWelcome ? (
    <ChatWelcomePane
      {...imageWelcomePaneProps}
      disabled={welcomeDisabled}
      onApply={handleWelcomeApply}
    />
  ) : null;

  const centeredWelcomeAriaLabel = chatWelcomePaneAriaLabel(
    showTextCenteredWelcome
      ? textWelcomePaneProps.title
      : showImageCenteredWelcome
        ? imageWelcomePaneProps.title
        : undefined,
    showTextCenteredWelcome ? t('chat.textWelcomeHeading') : t('chat.imageWelcomeHeading'),
  );

  // ── Loading / no-token screens ─────────────────────────────────────────────

  if (tokenLoading) {
    return (
      <div className="chat-page">
        <div className="chat-center-screen">
          <div className="chat-spinner" />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  const hasToken = Boolean(tokenKey);

  const composerTextareaClassName = `chat-textarea${isMobileViewport ? ' chat-mobile-textarea' : ''}`;

  const composerTextareaEl = (
    <textarea
      ref={textareaRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handleComposerPaste}
      placeholder={
        hasToken
          ? (relayRequestKind === 'image'
            ? t('chat.placeholderImageGen')
            : t('chat.inputPlaceholder'))
          : t('chat.missingTokenInputPlaceholder')
      }
      rows={1}
      disabled={isComposerSending}
      className={composerTextareaClassName}
    />
  );

  /** 图像对话：左侧参考上传 + 右侧提示词（与 VideoGen omni 结构一致，否则上传槽会被拉成竖条） */
  const imageComposerOmniTopEl = showComposerFileUpload ? (
    <div className="video-gen-composer-top video-gen-composer-top--omni video-gen-composer-top--media-row">
      <div className="video-gen-composer-slots">
        <div className="video-gen-omni-ref-anchor">
          <ComposerUploadZone
            mode="multi-ref"
            variant={isMobileViewport ? 'mobile' : 'desktop'}
            attachments={composerZoneAttachments}
            maxCount={MAX_CHAT_ATTACHMENTS}
            disabled={isComposerSending || !hasToken}
            onTriggerPick={() => attachmentInputRef.current?.click()}
            onRemove={(id) => {
              setPendingAttachments((prev) => {
                const removed = prev.find((x) => x.id === id);
                if (removed) discardPendingChatImages([removed]);
                return prev.filter((x) => x.id !== id);
              });
            }}
          />
        </div>
      </div>
      {composerTextareaEl}
    </div>
  ) : null;

  /** 文本对话：与视频欢马文生视频 / 图像 omni 同行的提示词区结构（104px 字段高 + 外壳 padding） */
  const textComposerPromptTopEl = !showComposerFileUpload ? (
    <div className="video-gen-composer-top video-gen-composer-top--prompt-only">
      {composerTextareaEl}
    </div>
  ) : null;

  const composerInputBoxClassName = [
    'chat-input-box',
    'video-gen-input-box',
    composerDropActive ? 'chat-input-box--drag-active' : '',
    showComposerFileUpload
      ? 'video-gen-input-box--omni video-gen-input-box--media-row'
      : 'video-gen-input-box--prompt-only',
  ]
    .filter(Boolean)
    .join(' ');

  const composerTopEl = showComposerFileUpload ? imageComposerOmniTopEl : textComposerPromptTopEl;

  // const imageAspectRatioToolbarEl = showImageAspectRatioPicker ? (
  //   <ImageAspectRatioPicker
  //     value={imageAspectRatioDraft}
  //     options={imageAspectRatioPickerOptions}
  //     open={imageVisualMenuOpen}
  //     disabled={isComposerSending || !hasToken}
  //     onOpenChange={onImageVisualMenuOpenChange}
  //     onChange={setImageAspectRatioDraft}
  //   />
  // ) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isMobileViewport) {
    return (
      <div className="chat-mobile-page video-gen-main">
        <div className="chat-mobile-history-region">
          <button
            type="button"
            className="chat-mobile-history-toggle"
            onClick={() => setMobileHistoryOpen((v) => !v)}
          >
            <span className="chat-mobile-history-clock" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6l4 2" />
              </svg>
            </span>
            <span className="chat-mobile-history-title">{mainChatTitle}</span>
            <span className={`chat-mobile-history-arrow${mobileHistoryOpen ? ' is-open' : ''}`} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                {mobileHistoryOpen ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
              </svg>
            </span>
          </button>
          {mobileHistoryOpen && (
            <div className="chat-mobile-history-list">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                block
                className="chat-sidebar-new-btn"
                onClick={() => { newConversation(); setMobileHistoryOpen(false); }}
              >
                {t('newChat')}
              </Button>
              <div className="chat-mobile-conv-list sidebar-list">
                {sidebarConvs.map((group) => (
                  <div key={group.label} className="sidebar-group">
                    <div className="sidebar-group-label">{group.label}</div>
                    {group.items.map((conv) => (
                      <div
                        key={conv.id}
                        className={convSidebarClass(conv.id === activeId || renamingId === conv.id)}
                        onClick={() => { setActiveId(conv.id); setMobileHistoryOpen(false); }}
                      >
                        {renamingId === conv.id ? (
                          <ConvSidebarRenameInput
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={setRenameValue}
                            onCommit={() => {
                              updateConv(conv.id, (c) => ({ ...c, title: renameValue || c.title }));
                              setRenamingId(null);
                            }}
                            onCancel={() => setRenamingId(null)}
                          />
                        ) : (
                          <>
                            <span className="sidebar-item-title">{conv.title}</span>
                            <ConvSidebarMoreMenu
                              onRename={() => {
                                setRenamingId(conv.id);
                                setRenameValue(conv.title);
                              }}
                              onDelete={() => deleteConversation(conv.id)}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className="chat-mobile-messages chat-messages-area"
          style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto' }}
        >
          {!activeConv || messageTimeline.length === 0 ? (
            showCenteredWelcome ? (
              <section className="chat-welcome-pane" aria-label={centeredWelcomeAriaLabel}>
                {centeredWelcomeEl}
              </section>
            ) : (
              centeredWelcomeEl ?? <div className="chat-mobile-empty">{t('chat.newChatTitle')}</div>
            )
          ) : (
            <div className="chat-messages-inner chat-mobile-messages-inner">
              {messageTimeline.map((item) =>
                item.kind === 'divider' ? (
                  <div key={item.key} className="chat-context-divider" role="separator" aria-label={t('chat.contextDividerLabel')}>
                    <span className="chat-context-divider__text">{t('chat.contextDividerLabel')}</span>
                  </div>
                ) : (
                <div key={item.group.id} className={messageGroupClassName(scope, 'chat-mobile-group')}>
                  <div className="msg-row msg-row--user">
                    <div className="msg-avatar msg-avatar--user">
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="msg-user-content-col">
                      <UserMessageInline content={item.group.userContent} />
                    </div>
                  </div>
                  {item.group.responses.map((resp, idx) => {
                    const modelShown = resolveModelDisplayName(resp.model);
                    const raw = typeof resp.content === 'string' ? (resp.content || '') : '';
                    const bodyClass = assistantMessageBodyClass(
                      scope,
                      raw,
                      Boolean(resp.streaming),
                      resp.isError,
                    );
                    return (
                      <div key={idx} className="msg-row msg-row--assistant">
                        <ImageGenResultShell enabled={scope === 'image'}>
                          <div className="msg-block-head">
                            <div className="msg-avatar msg-avatar--ai">
                              <ModelIcon label={modelShown} iconName={resolveModelIconName(resp.model)} className="msg-model-icon" />
                            </div>
                            <div className="msg-ai-model-name">{modelShown}</div>
                          </div>
                          <AssistantTextBubbleShell
                            showCopy={canShowTextBubbleCopy(scope, bodyClass, Boolean(resp.streaming))}
                            copyText={raw}
                            className={bodyClass}
                          >
                            {renderAssistantReplyContent({
                              scope,
                              raw,
                              streaming: Boolean(resp.streaming),
                              isError: resp.isError,
                              onImagePreview: setImageLightboxUrl,
                              t,
                            })}
                            {resp.streaming && <span className="stream-cursor" />}
                          </AssistantTextBubbleShell>
                        </ImageGenResultShell>
                      </div>
                    );
                  })}
                </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="chat-composer-pane">
        <div className={`chat-mobile-composer chat-input-area${showCenteredWelcome ? ' chat-input-area--text-welcome' : ''}`}>
          <div className="chat-input-wrap">
          <div
            className={composerInputBoxClassName}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
          >
            {showComposerFileUpload && (
              <input
                ref={attachmentInputRef}
                type="file"
                accept={attachmentAccept}
                multiple
                style={{ display: 'none' }}
                onChange={handleAttachmentPick}
              />
            )}
            {isMobileViewport && !showComposerFileUpload ? composerTextareaEl : composerTopEl}
            <div className="chat-input-toolbar chat-input-toolbar--with-composer-model">
              <div className="model-picker-wrap model-picker-wrap--composer">
                <button
                  type="button"
                  className={`composer-model-pill${activeModels.length === 0 ? ' composer-model-pill--empty' : ' composer-model-pill--has-models'}${composerModelPillPickModel ? ' composer-model-pill--pick-model' : ''}`}
                  onClick={openModelPicker}
                  aria-expanded={mobileModelsOpen}
                  disabled={composerModelPillDisabled}
                >
                  {activeModels.length === 0 ? (
                    <span className="composer-model-pill-empty-row">
                      <ModelEmptyCubeIcon className="composer-model-pill-cube-icon" aria-hidden />
                      <span className="composer-model-pill-text">{composerModelPillLabel}</span>
                    </span>
                  ) : (
                    <span className="composer-model-pill-selected-row">
                      <ModelIcon
                        label={resolveModelDisplayName(activeModels[0])}
                        iconName={resolveModelIconName(activeModels[0])}
                        className="composer-model-pill-model-icon"
                      />
                      <span className="composer-model-pill-text">{composerModelPillLabel}</span>
                    </span>
                  )}
                </button>
              </div>
              {/* {imageAspectRatioToolbarEl} */}
              <Button
                type="default"
                className="chat-composer-toolbar-btn"
                icon={<ClearOutlined />}
                disabled={isComposerSending}
                onClick={handleClearContext}
                title={t('chat.clearContextTitle')}
              >
                {t('chat.clearContext')}
              </Button>
              <div className="input-tool-spacer" />
              {isComposerSending ? (
                <button className="chat-send-btn chat-send-btn--stop" onClick={handleStop}>
                  <span className="stop-icon" />
                </button>
              ) : (
                <button
                  type="button"
                  className="chat-send-btn"
                  onClick={() => void handleSend()}
                  disabled={isComposerSending}
                >
                  <svg
                    className="chat-send-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path d="M12 18V7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M7.5 11.5L12 7L16.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
        </div>

        {mobileModelsOpen && (
          <>
            <div
              className="chat-mobile-sheet-mask"
              onClick={() => {
                setMobileModelsOpen(false);
                setModelSearch('');
              }}
            />
            <div className="chat-mobile-sheet chat-mobile-sheet--right">
              <div className="chat-mobile-sheet-head">
                <span>{t('chat.selectModel')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMobileModelsOpen(false);
                    setModelSearch('');
                  }}
                >
                  ×
                </button>
              </div>
              <div className="chat-mobile-model-sheet-body">
                <ComposerModelPickerPanel sheetLayout {...composerPickerPanelProps} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-root">
      {/* ── Main split: sidebar + main ─────────────── */}
      <div className={`chat-body${sidebarCollapsed ? ' chat-body--sidebar-collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle-btn"
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={sidebarCollapsed ? t('chat.showSidebar') : t('chat.hideSidebar')}
        title={sidebarCollapsed ? t('chat.showSidebar') : t('chat.hideSidebar')}
      >
        {sidebarCollapsed ? '▶' : '◀'}
      </button>

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className={`chat-sidebar${sidebarCollapsed ? ' chat-sidebar--collapsed' : ''}`}>
        <div className="chat-sidebar-shell">
        {/* Search */}
        <div className="sidebar-header">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            block
            className="chat-sidebar-new-btn"
            onClick={newConversation}
          >
            {t('newChat')}
          </Button>
          <div className="sidebar-search">
            <SearchOutlined className="sidebar-search-icon" style={{ fontSize: 14 }} />
            <input
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder={t('chat.searchRooms')}
              className="sidebar-search-input"
            />
          </div>
        </div>

        {/* Conversation list */}
        
        <div className="sidebar-list">
          {sidebarConvs.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(conv => (
                <div
                  key={conv.id}
                  className={convSidebarClass(conv.id === activeId || renamingId === conv.id)}
                  onClick={() => { setActiveId(conv.id); setContextMenu(null); }}
                  onContextMenu={e => {
                    e.preventDefault();
                    setContextMenu({ convId: conv.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {renamingId === conv.id ? (
                    <ConvSidebarRenameInput
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={setRenameValue}
                      onCommit={() => {
                        updateConv(conv.id, (c) => ({ ...c, title: renameValue || c.title }));
                        setRenamingId(null);
                      }}
                      onCancel={() => setRenamingId(null)}
                    />
                  ) : (
                    <>
                      <span className="sidebar-item-title">{conv.title}</span>
                      <ConvSidebarMoreMenu
                        onRename={() => {
                          setRenamingId(conv.id);
                          setRenameValue(conv.title);
                        }}
                        onDelete={() => deleteConversation(conv.id)}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {sidebarConvs.length === 0 && (
            <div className="sidebar-empty">
              {t('chat.noConversations')}
            </div>
          )}
        </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      {isMobileViewport && !sidebarCollapsed && (
        <div
          className="chat-sidebar-backdrop"
          onClick={() => setSidebarCollapsed(true)}
          aria-hidden
        />
      )}

      <main className="chat-main video-gen-main">
        <div className="chat-main-shell">
        {!hasToken && (
          <div className="chat-token-notice">
            <div className="chat-token-notice__content">
              <div className="chat-token-notice__title">{t('chat.missingTokenTitle')}</div>
              <div className="chat-token-notice__desc">{t('chat.missingTokenDesc')}</div>
            </div>
            <div className="chat-token-notice__actions">
              <button className="chat-token-notice__btn chat-token-notice__btn--primary" onClick={() => navigate('/tokens')}>
                {t('chat.goConfigureToken')}
              </button>
            </div>
          </div>
        )}

        {!isMobileViewport && (
          <header className="chat-main-title-bar">
            <h1 className="chat-main-title">{mainChatTitle}</h1>
          </header>
        )}

        {showCenteredWelcome && !isMobileViewport ? (
          <section className="chat-welcome-pane" aria-label={centeredWelcomeAriaLabel}>
            {centeredWelcomeEl}
          </section>
        ) : (
        <div
          className="chat-messages-area"
          style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}
        >
          {(!activeConv || messageTimeline.length === 0) ? (
            centeredWelcomeEl ?? <div className="chat-welcome" />
          ) : (
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="chat-messages-inner"
            >
              {messageTimeline.map((item) =>
                item.kind === 'divider' ? (
                  <div key={item.key} className="chat-context-divider" role="separator" aria-label={t('chat.contextDividerLabel')}>
                    <span className="chat-context-divider__text">{t('chat.contextDividerLabel')}</span>
                  </div>
                ) : (
                <div key={item.group.id} className={messageGroupClassName(scope)}>
                  {/* User message */}
                  <div className="msg-row msg-row--user">
                    <div className="msg-avatar msg-avatar--user">
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="msg-user-content-col">
                      <UserMessageInline content={item.group.userContent} />
                    </div>
                  </div>

                  {/* AI responses */}
                  {item.group.responses.map((resp, ri) => {
                    const modelShown = resolveModelDisplayName(resp.model);
                    const raw = typeof resp.content === 'string' ? resp.content : '';
                    const videoPayload = parseVideoTaskPayload(raw);
                    const bodyClass = videoPayload
                      ? 'msg-bubble msg-bubble--ai chat-markdown'
                      : assistantMessageBodyClass(scope, raw, Boolean(resp.streaming), resp.isError);
                    return (
                    <div key={ri} className="msg-row msg-row--assistant">
                      <ImageGenResultShell enabled={scope === 'image'}>
                      <div className="msg-block-head">
                        <div className="msg-avatar msg-avatar--ai">
                          <ModelIcon label={modelShown} iconName={resolveModelIconName(resp.model)} className="msg-model-icon" />
                        </div>
                        <div className="msg-ai-model-name">{modelShown}</div>
                      </div>
                      <AssistantTextBubbleShell
                        showCopy={canShowTextBubbleCopy(scope, bodyClass, Boolean(resp.streaming), Boolean(videoPayload))}
                        copyText={raw}
                        className={bodyClass}
                      >
                          {(() => {
                            if (videoPayload) {
                              return (
                                <VideoTaskInline
                                  payload={videoPayload}
                                  retrying={retryingVideoTaskIds.has(videoPayload.taskId)}
                                  onRetry={() => retryVideoTaskPolling(videoPayload.taskId)}
                                  cancelling={cancellingVideoTaskIds.has(videoPayload.taskId)}
                                  onCancel={() => cancelVideoTask(videoPayload.taskId)}
                                />
                              );
                            }
                            return renderAssistantReplyContent({
                              scope,
                              raw,
                              streaming: Boolean(resp.streaming),
                              isError: resp.isError,
                              onImagePreview: setImageLightboxUrl,
                              t,
                            });
                          })()}
                          {resp.streaming && (
                            <span className="stream-cursor" />
                          )}
                      </AssistantTextBubbleShell>
                      </ImageGenResultShell>
                    </div>
                    );
                  })}
                </div>
                ),
              )}
            </div>
          )}
        </div>
        )}

        <div className="chat-composer-pane">
        {/* Input area */}
        <div className={`chat-input-area${showCenteredWelcome ? ' chat-input-area--text-welcome' : ''}`}>
          <div className="chat-input-wrap">
            <div
              className={composerInputBoxClassName}
              onDragOver={handleComposerDragOver}
              onDragLeave={handleComposerDragLeave}
              onDrop={handleComposerDrop}
            >
              {showComposerFileUpload && (
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={attachmentAccept}
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleAttachmentPick}
                />
              )}
              {composerTopEl}
              <div className="chat-input-toolbar chat-input-toolbar--with-composer-model">
                <div className="model-picker-wrap model-picker-wrap--composer">
                  <ComposerModelPicker
                    open={showModelDropdown}
                    onOpenChange={onComposerModelPopoverOpenChange}
                    disabled={composerModelPillDisabled}
                    pickModelHighlight={composerModelPillPickModel}
                    pillLabel={composerModelPillLabel}
                    pillEmpty={activeModels.length === 0}
                    selectModelAriaLabel={t('chat.selectModel')}
                    {...composerPickerPanelProps}
                  />
                </div>
                {/* {imageAspectRatioToolbarEl} */}
                <Button
                  type="default"
                  className="chat-composer-toolbar-btn"
                  icon={<ClearOutlined />}
                  disabled={isComposerSending}
                  onClick={handleClearContext}
                  title={t('chat.clearContextTitle')}
                >
                  {t('chat.clearContext')}
                </Button>
                <div className="input-tool-spacer" />
                {isComposerSending ? (
                  <button className="chat-send-btn chat-send-btn--stop" onClick={handleStop}>
                    <span className="stop-icon" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chat-send-btn"
                    onClick={() => void handleSend()}
                    disabled={isComposerSending}
                  >
                    <svg
                      className="chat-send-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden
                    >
                      <path d="M12 18V7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                      <path d="M7.5 11.5L12 7L16.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>

        </div>

        {imageLightboxUrl && (
          <div
            className="chat-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.previewImage')}
            onClick={() => setImageLightboxUrl(null)}
          >
            <button
              type="button"
              className="chat-image-lightbox__close"
              onClick={(e) => {
                e.stopPropagation();
                setImageLightboxUrl(null);
              }}
              aria-label={t('chat.closePreview')}
            >
              ×
            </button>
            <img
              src={imageLightboxUrl}
              alt=""
              className="chat-image-lightbox__img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </main>
      </div>{/* close chat-body */}

      {/* ── Context Menu ──────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => {
            togglePin(contextMenu.convId);
            setContextMenu(null);
          }}>
            📌 {t('chat.pin')}
          </button>
          <button className="context-menu-item" onClick={() => {
            const conv = conversations.find(c => c.id === contextMenu.convId);
            if (conv) { setRenamingId(conv.id); setRenameValue(conv.title); }
            setContextMenu(null);
          }}>
            <EditSvg className="action-icon-svg action-icon-svg--menu" aria-hidden /> {t('chat.rename')}
          </button>
          <button className="context-menu-item" onClick={() => {
            duplicateConversation(contextMenu.convId);
            setContextMenu(null);
          }}>
            <CopyOutlined style={{ fontSize: 12 }} /> {t('chat.duplicate')}
          </button>
          <div className="context-menu-divider" />
          <Popconfirm
            title={t('deleteConfirm')}
            onConfirm={() => {
              deleteConversation(contextMenu.convId);
              setContextMenu(null);
            }}
          >
            <button
              type="button"
              className="context-menu-item context-menu-item--danger"
              onClick={(e) => e.stopPropagation()}
            >
              <DeleteSvg className="action-icon-svg action-icon-svg--menu" aria-hidden /> {t('chat.delete')}
            </button>
          </Popconfirm>
        </div>
      )}

    </div>
    </div>
  );
}
