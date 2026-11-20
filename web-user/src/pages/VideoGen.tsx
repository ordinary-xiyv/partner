import { notify } from '../ui/notify';
import { copyToClipboard } from '../utils';
import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  DownOutlined,
  DownloadOutlined,
  CopyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

import { getTokenKey, getTokens } from '../api';
import { fetchCatalogPickerModels } from '../features/chat/catalogPickerModels';
import { pickPreferredToken } from '../components/token/tokenDisplay';
import { useUser } from '../contexts/UserContext';
import { Button, Input } from 'antd';
import type { InputRef } from 'antd';
import {
  ComposerModelPicker,
  ModelIcon,
  modalityCategory,
  resolveModelIconName,
  type PricingModelRow,
} from '../components/model-picker';
import { ComposerToolbar } from '../components/composer-toolbar';
import {
  ComposerUploadZone,
  type ComposerFrameUploadLayout,
} from '../components/composer-ref-upload';
import {
  UserMessageAttachmentsStrip,
  MAX_USER_MESSAGE_ATTACHMENTS,
  type UserMessageMediaItem,
} from '../components/user-message-attachments';
import './chat-page.css';
import { convSidebarClass } from '../ui/selectableNav';
import { ConvSidebarMoreMenu } from '../components/conv-sidebar-more-menu/ConvSidebarMoreMenu';
import { ConvSidebarRenameInput } from '../components/conv-sidebar-more-menu/ConvSidebarRenameInput';
import './video-gen.css';
import { ChatWelcomePane, chatWelcomePaneAriaLabel } from '../components/chat-welcome';
import type { WelcomeApplyPayload } from '../components/chat-welcome';
import { buildVideoWelcomePaneProps } from '../features/chat-welcome';
import {
  loadVideoGenDurationSec,
  parseRelayApiErrorBody,
  parseVideoDurationDraft,
  parseVideoTaskApiPollResponse,
  isVideoTaskApiSucceeded,
  type VideoTaskApiResponse,
  VIDEO_DURATION_STORAGE_KEY,
} from '../features/videoGen/videoTaskModel';
import {
  buildHappyHorseVideoPayload,
  clampHappyHorseDuration,
  collectHappyHorseMediaUrls,
  getHappyHorseMode,
  getHappyHorseRatioOptions,
  getHappyHorseUiConfig,
  HAPPYHORSE_RESOLUTIONS,
  isPublicHttpUrl,
} from '../features/videoGen/happyHorse';
import {
  buildMiniMaxH3VideoPayload,
  clampMiniMaxH3Duration,
  getMiniMaxH3RatioOptions,
  getMiniMaxH3UiConfig,
  getMiniMaxH3Variant,
  isMiniMaxH3AllowedImageFile,
  isMiniMaxH3AudioFile,
  MINIMAX_H3_IMAGE_ACCEPT,
  MINIMAX_H3_MAX_IMAGE_BYTES,
  type MiniMaxH3GenMode,
} from '../features/videoGen/minimaxH3';
import { uploadLocalVideoFileToGenMediaOss, type VideoOssUploadCallbacks } from '../features/videoGen/attachmentOss';
import { buildDoubaoVideoPayload } from '../features/videoGen/doubaoVideoPayload';
import type { GenMediaBizRef } from '../features/videoGen/genMediaUpload';
import { fileToAttachmentKind } from '../features/modelInputTypes';
import { resolveVideoGenComposerMediaCapability } from '../features/videoGen/modelCapabilities';
import {
  HAPPYHORSE_VIDEO_EDIT_MIN_SOURCE_SEC,
  HAPPYHORSE_VIDEO_EDIT_MAX_SOURCE_SEC,
  isHappyHorseVideoEditSourceDurationValid,
  readLocalVideoDurationSec,
} from '../features/videoGen/happyHorseVideoDuration';
import { friendlyVideoProviderError } from '../features/videoGen/videoProviderError';
import { cancelVideoTask as cancelVideoTaskRequest } from '../features/videoGen/videoTaskCancel';
import { probeVideoOutput, PROBE_RETRY_DELAYS_MS } from '../features/videoGen/videoOutputProbe';
import { runComposerSubmitGate } from '../features/chat/composerSubmitGate';
import { isInterruptedFetchError } from '../features/chat/generationInterrupt';
import {
  createBlankVideoSession,
  finalizeInterruptedVideoSessions,
  loadVideoSessions,
  mergeVideoSessionsForMutation,
  rememberGenerationAttachmentPreviews,
  resolveAttachmentDisplayUrl,
  saveVideoSessions,
  warmAttachmentPreviewCacheFromSessions,
  runVideoSessionMutation,
  shouldSkipVideoPersistSync,
  subscribeVideoPersist,
  updateVideoGenerationInStorage,
  type PendingAttachment,
  type VideoGeneration,
  type VideoGenMode,
  type VideoSession,
  type VideoTaskStatus,
} from './video/videoGenSession';
import {
  runVideoGenPollCycle,
  setVideoGenPollContext,
  type VideoGenPollMessages,
} from './video/videoGenBackgroundPoll';
import { clearMessagesScrollCache, useMessagesScroll } from '../hooks/useMessagesScroll';

type AttachmentKind = 'image' | 'video';

const ACTIVE_SESSION_KEY_PREFIX = 'lynxton_video_active_session_v1';

function getActiveSessionStorageKey(userId?: number) {
  return userId ? `${ACTIVE_SESSION_KEY_PREFIX}_u${userId}` : ACTIVE_SESSION_KEY_PREFIX;
}

/**
 * 气泡底部的任务元信息：任务 ID 唯一展示处。
 *
 * 以前这行在气泡**外面**（气泡上方），和正文里的「（排队号：xxx）」重复了一遍。
 * 现在统一收进气泡底部，卡片自包含：完成 / 失败 / 进行中三种状态共用同一个位置。
 */
function VideoGenTaskMeta({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  return (
    <div className="video-gen-run__meta">
      <span className="video-gen-run__meta-label">{t('chat.videoGenDebug.taskId')}</span>
      <span className="video-gen-run__meta-value" title={taskId}>{taskId}</span>
    </div>
  );
}

/**
 * 用户气泡下方的操作条（复制自己发的提示词）。
 *
 * 单独一行而不是绝对定位盖在气泡里：用户气泡是 `width: fit-content` 且没有
 * `position: relative`，套 AI 气泡那套绝对定位会把按钮压到文字上。
 */
function VideoGenUserActions({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // 历史 localStorage 里可能没有 prompt（同 displayHistoryTitle 的 defensive 写法）
  const copyText = (text || '').trim();

  if (!copyText) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(copyText);
    if (!ok) {
      notify.error(t('chat.copyBubbleFailed'));
      return;
    }
    setCopied(true);
    notify.success(t('copied'));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="video-gen-user-actions">
      <button
        type="button"
        className="video-gen-user-action-btn"
        onClick={() => { void handleCopy(); }}
        aria-label={copied ? t('copied') : t('copy')}
        title={copied ? t('copied') : t('copy')}
      >
        <CopyOutlined aria-hidden />
        <span>{copied ? t('copied') : t('copy')}</span>
      </button>
    </div>
  );
}

function VideoGenResultVideo({
  src,
  videoClassName,
  showDownload,
  downloadDisabled,
  downloadLabel,
  downloading,
  onDownload,
  onVideoError,
}: {
  src: string;
  videoClassName: string;
  showDownload: boolean;
  downloadDisabled: boolean;
  downloadLabel: string;
  /** 下载中：按钮里换成全站统一的 loading 圈，与其它等待态一致 */
  downloading?: boolean;
  onDownload: () => void;
  onVideoError?: () => void;
}) {
  return (
    <div className="video-gen-media-stage">
      <video
        src={src}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        playsInline
        preload="metadata"
        className={videoClassName}
        onError={onVideoError}
      />
      {showDownload ? (
        <button
          type="button"
          className="video-gen-media-download-btn"
          disabled={downloadDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          aria-label={downloadLabel}
          title={downloadLabel}
          aria-busy={downloading === true}
        >
          {downloading ? (
            <span className="chat-spinner video-gen-media-download-spinner" />
          ) : (
            <DownloadOutlined aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 统一的等待态展示：复用项目现有的 .chat-spinner（24px 紫色旋转圈，见 chat-page.css），
 * 与全站其它 loading 保持同一视觉语言。用于排队中 / 生成中 / 视频转存中等一切“等一会儿”的场景。
 */
function VideoGenWaiting({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={compact ? 'video-gen-waiting video-gen-waiting--compact' : 'video-gen-waiting'}>
      <span className={compact ? 'chat-spinner video-gen-waiting__spinner' : 'chat-spinner'} />
      <span className="video-gen-waiting__text">{text}</span>
    </div>
  );
}

/**
 * 任务进行中时显示在视频卡片里的取消按钮。
 *
 * 为什么放在卡片上：视频任务现在允许同时跑多个，取消必须能精确指向**某一个**任务。
 * 如果继续挂在输入框的发送键上，一次只能取消「最后一个」，其余任务无从取消，
 * 而且用户会失去发送新任务的按钮。
 *
 * visible 为 false 时返回 null；被上游拒绝过取消（cancelRejectedAt）后就整体收起。
 */
function VideoGenCancelButton({
  gen,
  cancelling,
  onCancel,
}: {
  gen: Pick<VideoGeneration, 'taskId' | 'status' | 'cancelRejectedAt'>;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isPending = Boolean(gen.taskId) && gen.status !== 'completed' && gen.status !== 'failed';
  if (!isPending) return null;

  // 上游已明确拒绝过取消：按钮收起，只留一句说明，避免用户反复点。
  const rejected = gen.cancelRejectedAt != null;
  return (
    <button
      type="button"
      className="video-gen-cancel-btn"
      onClick={onCancel}
      disabled={cancelling || rejected}
      aria-busy={cancelling}
      title={
        cancelling
          ? t('chat.videoCancelLoading')
          : rejected
            ? t('chat.videoCancelInvalidStatus')
            : t('chat.videoCancel')
      }
    >
      {cancelling ? (
        <span className="chat-spinner video-gen-cancel-btn__spinner" />
      ) : (
        <span className="stop-icon video-gen-cancel-btn__icon" />
      )}
      <span>{cancelling ? t('chat.videoCancelLoading') : t('chat.videoCancel')}</span>
    </button>
  );
}

function loadPersistedActiveSessionId(userId?: number): string | null {
  try {
    const v = localStorage.getItem(getActiveSessionStorageKey(userId));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function persistActiveSessionId(id: string | null, userId?: number) {
  try {
    const k = getActiveSessionStorageKey(userId);
    if (!id) localStorage.removeItem(k);
    else localStorage.setItem(k, id);
  } catch {
    /* ignore */
  }
}

const MAX_OMNI_REF_ATTACHMENTS = 9;
const MAX_IMAGE_FILE_SIZE_MB = 5;
const MAX_VIDEO_FILE_SIZE_MB = 15;
const VIDEO_DURATION_MIN_SECONDS = 5;
const VIDEO_DURATION_MAX_SECONDS = 15;
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const;
const VIDEO_ASPECT_RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3'] as const;

/** 与 new-api `doubao-seedance-2-0-260128` 对齐（不含 fast 变体） */
const SEEDANCE_20_MODEL_ID = 'doubao-seedance-2-0-260128';

function isSeedance20Model(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m === SEEDANCE_20_MODEL_ID || m.endsWith(SEEDANCE_20_MODEL_ID);
}

/** 与网关 clienterror 对齐：seedance2.5 变体（含渠道自定义命名如 do-seedance-2-5-ff）支持 4–30s */
const SEEDANCE_25_DURATION_MIN_SECONDS = 4;
const SEEDANCE_25_DURATION_MAX_SECONDS = 30;

function isSeedance25Model(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.includes('seedance-2-5') || m.includes('seedance-2.5') || m.includes('seedance2.5');
}

/** 与网关 clienterror 对齐：seedance 2.0 系列（含 fast/mini）支持 4–15s */
const SEEDANCE_20_DURATION_MIN_SECONDS = 4;
const SEEDANCE_20_DURATION_MAX_SECONDS = 15;

function isSeedance20RangeModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.includes('seedance-2-0') || m.includes('seedance-2.0') || m.includes('seedance2.0');
}

function mapPendingAttachmentsForComposer(attachments: PendingAttachment[]) {
  return attachments.map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    preview: a.preview,
    uploading: Boolean(a.ossUploading),
    uploadProgress: a.ossUploading ? a.uploadProgress : undefined,
  }));
}

function buildVideoOssAttachmentCallbacks(
  setPendingAttachments: React.Dispatch<React.SetStateAction<PendingAttachment[]>>,
  buildRow: (id: string) => Omit<PendingAttachment, 'id' | 'preview' | 'sizeBytes' | 'ossUploading' | 'uploadProgress'>,
): VideoOssUploadCallbacks {
  return {
    onStart: (id, preview, sizeBytes) => {
      setPendingAttachments((prev) => [...prev, {
        id,
        preview,
        sizeBytes,
        ossUploading: true,
        uploadProgress: 0,
        ...buildRow(id),
      }]);
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
            ossFileId: fileId,
            ossPublicUrl: publicUrl,
            ossUploading: false,
            uploadProgress: 100,
            ossUploadError: undefined,
          }
          : a
      )));
    },
    onError: (id, msg) => {
      setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
      notifyApiError(msg);
    },
  };
}

function genMediaBizRefForModel(model: string): GenMediaBizRef {
  return isSeedance20Model(model) ? 'seedance_ref' : 'video_edit';
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function mapGenerationAttachmentsToMediaItems(
  generationId: string,
  attachments: PendingAttachment[],
): UserMessageMediaItem[] {
  return attachments
    .filter((a): a is PendingAttachment & { kind: 'image' | 'video' } => a.kind === 'image' || a.kind === 'video')
    .slice(0, MAX_USER_MESSAGE_ATTACHMENTS)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      src: resolveAttachmentDisplayUrl(generationId, a),
      alt: a.name,
    }))
    .filter((item) => item.src.length > 0);
}

function latestGeneration(session: VideoSession): VideoGeneration | null {
  const g = session.generations;
  return g.length ? g[g.length - 1]! : null;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read file failed'));
    reader.readAsDataURL(file);
  });
}

async function compressImageFileToDataUrl(
  file: File,
  maxSide = 1920,
  quality = 0.82,
  minShortSide = 400,
): Promise<string> {
  const source = await readFileAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode image failed'));
    image.src = source;
  });
  const shortSide = Math.min(img.width, img.height);
  const longSide = Math.max(img.width, img.height);
  let scale = Math.min(1, maxSide / longSide);
  if (shortSide > 0 && shortSide * scale < minShortSide) {
    scale = Math.max(scale, minShortSide / shortSide);
  }
  const width = Math.max(minShortSide, Math.round(img.width * scale));
  const height = Math.max(minShortSide, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function displayHistoryTitle(item: Pick<VideoGeneration, 'prompt'>, fallback: string): string {
  const text = item.prompt?.trim() || '';
  if (!text) return fallback;
  const lowered = text.toLowerCase();
  // 清洗旧版本里残留的“pending·taskid”类标题
  if (lowered.startsWith('pending') || lowered.startsWith('task_') || lowered.startsWith('task:')) {
    return fallback;
  }
  return text;
}

function clampDurationRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampVideoDurationForPage(value: number): number {
  return clampDurationRange(value, VIDEO_DURATION_MIN_SECONDS, VIDEO_DURATION_MAX_SECONDS);
}

function isFrameGenMode(mode: VideoGenMode): boolean {
  return mode === 'first_last' || mode === 'first_frame';
}

function videoGenModeI18nKey(mode: VideoGenMode): 'chat.videoGenModeT2v' | 'chat.videoGenModeFirstFrame' | 'chat.videoGenModeFirstLast' | 'chat.videoGenModeOmni' {
  if (mode === 't2v') return 'chat.videoGenModeT2v';
  if (mode === 'first_frame') return 'chat.videoGenModeFirstFrame';
  if (mode === 'first_last') return 'chat.videoGenModeFirstLast';
  return 'chat.videoGenModeOmni';
}

function formatVideoGenerationModeLabel(
  gen: Pick<VideoGeneration, 'model' | 'genMode'>,
  t: (key: string) => string,
): string {
  const hh = getHappyHorseMode(gen.model || '');
  if (hh) {
    return t(`chat.videoGenHappyHorseMode_${hh}`);
  }
  const mode = gen.genMode ?? 'omni_ref';
  return t(videoGenModeI18nKey(mode));
}

function friendlyRelayError(status: number, raw: string, payloadTooLargeMessage: string): string {
  if (status === 413 || /Request Entity Too Large/i.test(raw)) {
    return payloadTooLargeMessage;
  }
  return parseRelayApiErrorBody(status, raw);
}

function statusTone(status: VideoTaskStatus): { labelColor: string; bgColor: string; text: string } {
  if (status === 'completed') return { labelColor: '#0f766e', bgColor: '#ccfbf1', text: '已完成' };
  if (status === 'failed') return { labelColor: '#b91c1c', bgColor: '#fee2e2', text: '失败' };
  if (status === 'in_progress') return { labelColor: '#1d4ed8', bgColor: '#dbeafe', text: '生成中' };
  if (status === 'queued') return { labelColor: '#92400e', bgColor: '#fef3c7', text: '排队中' };
  return { labelColor: '#374151', bgColor: '#e5e7eb', text: '未知' };
}

function sidebarHistoryTag(item: Pick<VideoGeneration, 'status'>): { text: string; color: string; bg: string } | null {
  // 不再有「已过期」这一档：视频能不能播由运行时探测决定，是瞬时状态，
  // 不适合固化进侧栏的持久标签，否则刷新后仍会显示过期的假结论。
  if (item.status === 'failed') return { text: '生成失败', color: '#b91c1c', bg: '#fee2e2' };
  if (item.status === 'completed') return { text: '生成成功', color: '#0f766e', bg: '#ccfbf1' };
  return null;
}

function sessionSidebarTag(session: VideoSession): { text: string; color: string; bg: string } | null {
  const last = latestGeneration(session);
  if (!last) return null;
  return sidebarHistoryTag(last);
}

export default function VideoGen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh: refreshUser } = useUser();
  const userId = user?.id;

  const [sessions, setSessions] = useState<VideoSession[]>(() => loadVideoSessions(userId));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const initial = loadVideoSessions(userId);
    const saved = loadPersistedActiveSessionId(userId);
    if (saved && initial.some((s) => s.id === saved)) return saved;
    return initial[0]?.id ?? null;
  });
  const [tokenKey, setTokenKey] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [pricingModels, setPricingModels] = useState<PricingModelRow[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [videoModelSearch, setVideoModelSearch] = useState('');
  const [videoModelPickerOpen, setVideoModelPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [videoDurationDraft, setVideoDurationDraft] = useState(() => String(loadVideoGenDurationSec()));
  const [videoResolutionDraft, setVideoResolutionDraft] = useState('480p');
  const [videoAspectRatioDraft, setVideoAspectRatioDraft] = useState('16:9');
  const [videoGenMode, setVideoGenMode] = useState<VideoGenMode>('omni_ref');
  const [firstFrameAttachment, setFirstFrameAttachment] = useState<PendingAttachment | null>(null);
  const [lastFrameAttachment, setLastFrameAttachment] = useState<PendingAttachment | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [visualMenuOpen, setVisualMenuOpen] = useState(false);
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [submittingSessionId, setSubmittingSessionId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );
  const [imageLightboxUrl, setImageLightboxUrl] = useState<string | null>(null);
  /** IndexedDB 预热参考图缓存后递增，触发气泡附件重绘 */
  const [attachmentPreviewCacheEpoch, setAttachmentPreviewCacheEpoch] = useState(0);
  const [videoDownloading, setVideoDownloading] = useState(false);
  /**
   * 已完成视频的可播性探测状态（仅内存，**不落盘**）。
   * 这是「这一刻能不能播」的瞬时事实：一旦写进 localStorage，一次瞬时 502 就会在刷新后
   * 仍然显示成「资源已过期」，把用户逼去重新生成、白扣一次钱。刷新后重探即可自愈。
   */
  const [videoContentProbe, setVideoContentProbe] = useState<
    'idle' | 'checking' | 'ok' | 'pending' | 'unavailable' | 'not_found'
  >('idle');
  const [probeAttempt, setProbeAttempt] = useState(0);
  /**
   * 同一世代由「播放报错」触发过几次重探。
   * 用于打断死循环：HTTP 探测 200（说明文件在）但浏览器解码失败时，
   * 每次重探都会重新挂 <video> → 再报错 → 再重探，形成一个不停发请求的环。
   */
  const videoErrorReprobeRef = useRef<{ genId: string; count: number }>({ genId: '', count: 0 });

  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const frameFirstInputRef = useRef<HTMLInputElement>(null);
  const frameLastInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const renameSessionInputRef = useRef<InputRef>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const historyItemsRef = useRef<VideoSession[]>(sessions);
  const tokenKeyRef = useRef<string | null>(null);
  const videoDownloadInFlightRef = useRef(false);
  /** 正在发起取消请求的任务集合：ref 做并发去重，state 驱动按钮 loading 态 */
  const cancellingTaskIdsRef = useRef<Set<string>>(new Set());
  const [cancellingTaskIds, setCancellingTaskIds] = useState<Set<string>>(new Set());
  const isComposerSubmitting =
    submittingSessionId != null && submittingSessionId === activeSessionId;

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const showVideoCenteredWelcome =
    !activeSession || activeSession.generations.length === 0;

  const {
    onScroll: handleVideoGenMessagesScroll,
    scrollToEnd: scrollVideoMessagesToEnd,
    scrollIfStuckToBottom: scrollVideoIfStuckToBottom,
  } = useMessagesScroll({
    scrollRef: messagesScrollRef,
    sessionId: activeSessionId,
    scopeKey: 'video',
    userId,
    contentLength: activeSession?.generations.length ?? 0,
    showEmpty: showVideoCenteredWelcome,
    viewportKey: isMobileViewport,
  });

  const happyHorseMode = useMemo(
    () => getHappyHorseMode(selectedModel),
    [selectedModel],
  );
  const happyHorseUi = useMemo(
    () => (happyHorseMode ? getHappyHorseUiConfig(happyHorseMode) : null),
    [happyHorseMode],
  );
  const isHappyHorse = happyHorseMode != null;
  const miniMaxH3Variant = useMemo(
    () => getMiniMaxH3Variant(selectedModel),
    [selectedModel],
  );
  const miniMaxH3Ui = useMemo(
    () => (miniMaxH3Variant ? getMiniMaxH3UiConfig(miniMaxH3Variant) : null),
    [miniMaxH3Variant],
  );
  const isMiniMaxH3 = miniMaxH3Variant != null;
  const isSeedance25 = useMemo(() => isSeedance25Model(selectedModel), [selectedModel]);
  const isSeedance20Range = useMemo(
    () => !isSeedance25 && isSeedance20RangeModel(selectedModel),
    [isSeedance25, selectedModel],
  );
  const composerModeOptions = useMemo((): VideoGenMode[] => {
    if (miniMaxH3Ui) return [...miniMaxH3Ui.modes];
    if (isHappyHorse) return [];
    return ['omni_ref', 'first_last'];
  }, [isHappyHorse, miniMaxH3Ui]);

  const frameUploadLayout: ComposerFrameUploadLayout =
    (isHappyHorse && happyHorseMode === 'i2v') || videoGenMode === 'first_frame' ? 'first-only' : 'first-last';
  const frameFirstLabel = isHappyHorse
    ? t('chat.videoGenHappyHorseFirstFrame')
    : t('chat.videoGenFirstFrame');

  /** 首尾帧 / 单首帧 composer 行（非 t2v 纯文生视频） */
  const isFrameComposerLayout = isFrameGenMode(videoGenMode) && happyHorseMode !== 't2v' && videoGenMode !== 't2v';
  const isFrameComposerFirstOnly = isFrameComposerLayout && frameUploadLayout === 'first-only';
  const isHappyHorseT2v = happyHorseMode === 't2v';
  const isPromptOnlyComposer = isHappyHorseT2v || videoGenMode === 't2v';

  const durationMinSec = isSeedance25
    ? SEEDANCE_25_DURATION_MIN_SECONDS
    : isSeedance20Range
      ? SEEDANCE_20_DURATION_MIN_SECONDS
      : miniMaxH3Ui?.durationMin ?? VIDEO_DURATION_MIN_SECONDS;
  const durationMaxSec = isSeedance25
    ? SEEDANCE_25_DURATION_MAX_SECONDS
    : isSeedance20Range
      ? SEEDANCE_20_DURATION_MAX_SECONDS
      : miniMaxH3Ui?.durationMax ?? VIDEO_DURATION_MAX_SECONDS;

  /** 是否渲染左侧上传槽（欢马 / MiniMax t2v 仅提示词，不占位） */
  const showComposerMediaSlots = useMemo(() => {
    if (isPromptOnlyComposer) return false;
    if (happyHorseMode === 'video-edit' || happyHorseMode === 'r2v' || happyHorseMode === 'i2v') {
      return true;
    }
    return videoGenMode === 'omni_ref' || isFrameGenMode(videoGenMode);
  }, [happyHorseMode, isPromptOnlyComposer, videoGenMode]);

  const useOmniComposerChrome =
    showComposerMediaSlots
    && (videoGenMode === 'omni_ref' || happyHorseMode === 'video-edit' || happyHorseMode === 'r2v');

  const selectedModelInputTypes = useMemo(
    () => pricingModels.find((p) => p.model_name === selectedModel)?.input_types,
    [pricingModels, selectedModel],
  );

  const composerMediaCapability = useMemo(
    () => resolveVideoGenComposerMediaCapability(selectedModel, videoGenMode, selectedModelInputTypes),
    [selectedModel, selectedModelInputTypes, videoGenMode],
  );

  const composerAttachmentAccept = composerMediaCapability.acceptAttribute || 'image/*';

  const composerZoneAttachments = useMemo(
    () => mapPendingAttachmentsForComposer(pendingAttachments),
    [pendingAttachments],
  );

  /** 左侧有媒体槽时固定 composer 上行高 */
  const hasSyncedMediaComposerRow = showComposerMediaSlots;

  const happyHorseMediaInput = useMemo(
    () => ({
      firstFramePreview: firstFrameAttachment?.preview,
      imagePreviews:
        happyHorseUi?.uploadKind === 'first-frame'
          ? []
          : pendingAttachments.filter((a) => a.kind === 'image').map((a) => a.preview),
      videoSourceUrl: pendingAttachments.find((a) => a.kind === 'video')?.ossPublicUrl ?? '',
    }),
    [firstFrameAttachment?.preview, happyHorseUi?.uploadKind, pendingAttachments],
  );

  const happyHorseCollectedMedia = useMemo(() => {
    if (!happyHorseMode) return { imageUrls: [] as string[], videoUrls: [] as string[] };
    return collectHappyHorseMediaUrls(happyHorseMode, happyHorseMediaInput);
  }, [happyHorseMode, happyHorseMediaInput]);

  const videoResolutionOptions = useMemo(() => {
    if (miniMaxH3Ui) return [...miniMaxH3Ui.resolutions];
    if (isHappyHorse) return [...HAPPYHORSE_RESOLUTIONS];
    return [...VIDEO_RESOLUTION_OPTIONS];
  }, [isHappyHorse, miniMaxH3Ui]);

  const videoAspectRatioOptions = useMemo(() => {
    if (miniMaxH3Ui) return [...getMiniMaxH3RatioOptions(videoGenMode as MiniMaxH3GenMode)];
    if (happyHorseMode && happyHorseUi?.showRatio) {
      return [...getHappyHorseRatioOptions(happyHorseMode)];
    }
    if (isHappyHorse) return [] as readonly string[];
    return [...VIDEO_ASPECT_RATIO_OPTIONS];
  }, [happyHorseMode, happyHorseUi?.showRatio, isHappyHorse, miniMaxH3Ui, videoGenMode]);

  const omniRefMaxCount = miniMaxH3Ui?.omni?.maxTotal ?? MAX_OMNI_REF_ATTACHMENTS;

  const hasComposerInput = useMemo(() => {
    if (happyHorseMode && happyHorseUi) {
      const { imageUrls } = happyHorseCollectedMedia;
      if (happyHorseMode === 't2v') return Boolean(prompt.trim());
      if (happyHorseMode === 'i2v') return imageUrls.length > 0 || Boolean(prompt.trim());
      if (happyHorseMode === 'r2v') return Boolean(prompt.trim()) && imageUrls.length > 0;
      if (happyHorseMode === 'video-edit') {
        const video = pendingAttachments.find((a) => a.kind === 'video');
        return Boolean(prompt.trim()) && Boolean(video?.ossPublicUrl) && !video?.ossUploading;
      }
      return false;
    }
    if (videoGenMode === 't2v') return Boolean(prompt.trim());
    if (videoGenMode === 'first_frame') {
      return Boolean(prompt.trim()) && Boolean(firstFrameAttachment);
    }
    if (videoGenMode === 'omni_ref') {
      const video = pendingAttachments.find((a) => a.kind === 'video');
      const audio = pendingAttachments.find((a) => a.kind === 'audio');
      if (video) {
        if (video.ossUploading) return false;
        if (!video.ossPublicUrl || !isPublicHttpUrl(video.ossPublicUrl)) return false;
      }
      if (audio) {
        if (audio.ossUploading) return false;
        if (!audio.ossPublicUrl || !isPublicHttpUrl(audio.ossPublicUrl)) return false;
      }
      return Boolean(prompt.trim()) || pendingAttachments.length > 0;
    }
    return Boolean(prompt.trim()) || Boolean(firstFrameAttachment || lastFrameAttachment);
  }, [
    firstFrameAttachment,
    happyHorseCollectedMedia,
    happyHorseMode,
    happyHorseUi,
    lastFrameAttachment,
    pendingAttachments,
    prompt,
    videoGenMode,
  ]);

  useEffect(() => {
    if (!happyHorseMode) return;
    if (happyHorseMode === 'i2v') {
      setVideoGenMode('first_last');
    } else if (happyHorseMode === 'r2v' || happyHorseMode === 'video-edit') {
      setVideoGenMode('omni_ref');
    }
    const res = videoResolutionDraft.toLowerCase();
    if (!HAPPYHORSE_RESOLUTIONS.some((r) => r === res)) {
      setVideoResolutionDraft('720p');
    }
    if (happyHorseMode === 't2v') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments([]);
    }
    if (happyHorseMode === 'i2v') {
      setLastFrameAttachment(null);
      setPendingAttachments((prev) => prev.filter((a) => a.kind !== 'video' && a.kind !== 'audio'));
    }
    if (happyHorseMode === 'r2v') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments((prev) => prev.filter((a) => a.kind === 'image').slice(0, 9));
    }
    if (happyHorseMode === 'video-edit') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments((prev) => {
        const videos = prev.filter((a) => a.kind === 'video').slice(0, 1);
        const images = prev.filter((a) => a.kind === 'image').slice(0, MAX_OMNI_REF_ATTACHMENTS);
        return [...videos, ...images];
      });
    }
    if (happyHorseUi?.showRatio && videoAspectRatioOptions.length > 0) {
      const ratios = videoAspectRatioOptions as readonly string[];
      if (!ratios.includes(videoAspectRatioDraft)) {
        setVideoAspectRatioDraft(ratios[0] ?? '16:9');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在切换欢乐马模型时重置 UI
  }, [happyHorseMode]);

  useEffect(() => {
    if (!miniMaxH3Ui) return;
    if (!miniMaxH3Ui.modes.includes(videoGenMode as MiniMaxH3GenMode)) {
      setVideoGenMode(miniMaxH3Ui.modes[0] ?? 't2v');
    }
    if (!miniMaxH3Ui.resolutions.includes(videoResolutionDraft)) {
      setVideoResolutionDraft(miniMaxH3Ui.resolutions[0] ?? '768P');
    }
    const nextDuration = clampMiniMaxH3Duration(
      parseVideoDurationDraft(videoDurationDraft),
      miniMaxH3Ui.variant,
    );
    if (String(nextDuration) !== videoDurationDraft) {
      setVideoDurationDraft(String(nextDuration));
    }
    const ratios = getMiniMaxH3RatioOptions(
      (miniMaxH3Ui.modes.includes(videoGenMode as MiniMaxH3GenMode)
        ? videoGenMode
        : miniMaxH3Ui.modes[0] ?? 't2v') as MiniMaxH3GenMode,
    );
    if (!ratios.includes(videoAspectRatioDraft)) {
      setVideoAspectRatioDraft(ratios[0] ?? '16:9');
    }
    if (videoGenMode === 't2v') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments([]);
    } else if (videoGenMode === 'first_frame') {
      setLastFrameAttachment(null);
      setPendingAttachments([]);
    } else if (videoGenMode === 'first_last') {
      setPendingAttachments([]);
    } else if (videoGenMode === 'omni_ref') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在切换 MiniMax H3 模型/模式时对齐能力
  }, [miniMaxH3Variant, videoGenMode]);

  useEffect(() => {
    if (miniMaxH3Ui || isHappyHorse) return;
    if (videoGenMode === 't2v' || videoGenMode === 'first_frame') {
      setVideoGenMode('omni_ref');
    }
    if (!VIDEO_RESOLUTION_OPTIONS.includes(videoResolutionDraft as (typeof VIDEO_RESOLUTION_OPTIONS)[number])) {
      setVideoResolutionDraft('480p');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 离开 MiniMax/欢乐马时收回默认控件
  }, [isHappyHorse, miniMaxH3Variant]);

  useEffect(() => {
    // 切换模型后把越界的时长草稿拉回当前模型的可选范围（如 seedance2.5 的 4–30s）
    const next = clampDurationRange(parseVideoDurationDraft(videoDurationDraft), durationMinSec, durationMaxSec);
    if (String(next) !== videoDurationDraft) {
      setVideoDurationDraft(String(next));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在切换模型时对齐时长范围
  }, [selectedModel]);

  const pendingTaskIds = useMemo(
    () =>
      sessions.flatMap((s) =>
        s.generations
          .filter((x) => x.taskId && x.status !== 'completed' && x.status !== 'failed')
          .map((x) => x.taskId),
      ),
    [sessions],
  );
  /**
   * 未完成的视频任务 id（跨会话统计），只用于轮询调度。
   * 视频任务允许并发，后端也没有并发数限制，所以它不再参与任何发送拦截。
   */
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const filteredSessions = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((session) => {
      const blob = [
        session.title,
        ...session.generations.map((g) => `${g.prompt} ${g.taskId} ${g.model}`),
      ].join(' ');
      return blob.toLowerCase().includes(q);
    });
  }, [sessions, sidebarSearch]);

  const currentSessionHasPending = useMemo(
    () =>
      Boolean(
        activeSession?.generations.some(
          (g) => g.taskId && g.status !== 'completed' && g.status !== 'failed',
        ),
      ),
    [activeSession],
  );

  /**
   * 当前会话里正在进行、且允许取消的任务。
   * 仅用于「立即刷新」按钮的可用性与历史遗留样式判断；
   * 取消操作的入口已经下放到每张视频卡片上，不再占用输入框的发送键。
   */
  const cancellableGeneration = useMemo(() => {
    const pending = activeSession?.generations.filter(
      (g) => g.taskId && g.status !== 'completed' && g.status !== 'failed',
    );
    if (!pending || pending.length === 0) return null;
    return pending[pending.length - 1];
  }, [activeSession]);

  const videoPricingAll = useMemo(
    () =>
      pricingModels
        .filter((p) => modalityCategory(p.modalities) === 'video')
        .sort((a, b) => a.model_name.localeCompare(b.model_name)),
    [pricingModels],
  );

  const filteredVideoModelsForPicker = useMemo(() => {
    const raw = videoModelSearch.trim();
    if (!raw) return videoPricingAll;
    const tokens = raw
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return videoPricingAll.filter((p) => {
      const mn = p.model_name.toLowerCase();
      const dn = (p.display_name || '').toLowerCase();
      const sub = (p.usage_description || '').toLowerCase();
      const hay = `${mn} ${dn} ${sub}`;
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [videoPricingAll, videoModelSearch]);

  const videoModelMetaMap = useMemo(() => {
    const map = new Map<string, { displayName: string; modalities: string; img: string }>();
    for (const p of pricingModels) {
      const displayName = (p.display_name && p.display_name.trim()) ? p.display_name.trim() : p.model_name;
      // 图标优先级：内置图标（手动指定 / 名字正则）→ 供应商 logo → other
      const builtinImg = resolveModelIconName(p.model_img, p.model_name);
      const providerKey = (p.provider_key || '').trim();
      map.set(p.model_name, {
        displayName,
        modalities: p.modalities || '',
        img: builtinImg !== 'other'
          ? builtinImg
          : (providerKey ? `provider:${providerKey}` : 'other'),
      });
    }
    return map;
  }, [pricingModels]);

  const resolveVideoModelIconName = useCallback(
    (modelName: string | undefined) => {
      if (!modelName) return 'other';
      const meta = videoModelMetaMap.get(modelName);
      return resolveModelIconName(meta?.img, modelName);
    },
    [videoModelMetaMap],
  );

  const videoComposerPillLabel = useMemo(() => {
    if (!selectedModel) return t('chat.addModelsPromptCenter');
    const meta = videoModelMetaMap.get(selectedModel);
    const short = meta?.displayName || (selectedModel.includes('/') ? selectedModel.split('/').pop() || selectedModel : selectedModel);
    return short.length > 40 ? `${short.slice(0, 38)}…` : short;
  }, [selectedModel, t, videoModelMetaMap]);

  const toggleVideoComposerModel = useCallback((modelName: string) => {
    setSelectedModel((prev) => (prev === modelName ? '' : modelName));
  }, []);

  const handleVideoComposerClearModels = useCallback(() => setSelectedModel(''), []);

  const onVideoModelPopoverOpenChange = useCallback((open: boolean) => {
    setVideoModelPickerOpen(open);
    if (open) {
      setModeMenuOpen(false);
      setVisualMenuOpen(false);
      setDurationMenuOpen(false);
    }
  }, []);

  const resolveVideoModelLabel = useCallback(
    (modelName: string) => {
      const meta = videoModelMetaMap.get(modelName);
      if (meta?.displayName) return meta.displayName;
      return modelName.includes('/') ? modelName.split('/').pop() || modelName : modelName;
    },
    [videoModelMetaMap],
  );

  const videoComposerPickerPanelProps = useMemo(
    () => ({
      selectionMode: 'single' as const,
      showBulkActions: false,
      selectedModelIds: selectedModel ? [selectedModel] : [],
      totalSelectableModels: videoPricingAll.length,
      resolveModelLabel: resolveVideoModelLabel,
      modelSearch: videoModelSearch,
      onModelSearchChange: setVideoModelSearch,
      selectionLocked: isComposerSubmitting,
      onClearModels: handleVideoComposerClearModels,
      modelsInPickerTab: filteredVideoModelsForPicker,
      onToggleModel: toggleVideoComposerModel,
      resolveModelIconName: resolveVideoModelIconName,
    }),
    [
      filteredVideoModelsForPicker,
      handleVideoComposerClearModels,
      resolveVideoModelLabel,
      resolveVideoModelIconName,
      selectedModel,
      isComposerSubmitting,
      toggleVideoComposerModel,
      videoModelSearch,
      videoPricingAll.length,
    ],
  );

  /**
   * 进行中的提示文案：按任务状态区分。
   * 上游进入 running 后仍显示「排队中」会误导用户 —— 火山这个阶段已不允许取消，
   * 文案却说还在排队，用户会去找取消按钮却找不到。
   *
   * 注意：这里**不再拼接 taskId**。任务 ID 统一在气泡底部的元信息行展示，
   * 塞进正文会把整行撑得很长、且和上面那行重复。
   */
  const progressHint = useCallback(
    (status: VideoTaskStatus) => {
      if (status === 'in_progress') return t('chat.videoGenGeneratingLabel');
      return t('chat.videoGenQueueLabel');
    },
    [t],
  );

  const applySessionMutation = useCallback(
    (mutator: (prev: VideoSession[]) => VideoSession[]) => {
      const { next, persistOk } = runVideoSessionMutation(
        userId,
        mutator,
        historyItemsRef.current,
      );
      historyItemsRef.current = next;
      setSessions(next);
      if (!persistOk) {
        notify.warning(t('chat.localPersistFailed'));
      }
      return next;
    },
    [userId, t],
  );

  const updateGeneration = useCallback(
    (sessionId: string, generationId: string, updater: (g: VideoGeneration) => VideoGeneration) => {
      const { next, persistOk } = updateVideoGenerationInStorage(
        userId,
        sessionId,
        generationId,
        updater,
        historyItemsRef.current,
      );
      historyItemsRef.current = next;
      setSessions(next);
      if (!persistOk) {
        notify.warning(t('chat.localPersistFailed'));
      }
      return next;
    },
    [userId, t],
  );

  const pollAllPendingTasks = useCallback(async () => {
    if (!tokenKeyRef.current) return;
    await runVideoGenPollCycle();
    const ls = loadVideoSessions(userId);
    const merged = mergeVideoSessionsForMutation(historyItemsRef.current, ls);
    historyItemsRef.current = merged;
    setSessions(merged);
  }, [userId]);

  const pollCurrentTask = useCallback(async () => {
    await pollAllPendingTasks();
  }, [pollAllPendingTasks]);

  /**
   * 取消视频生成任务（DELETE /v1/videos/:task_id）。
   * 计费完全由服务端裁决，这里只负责发请求、刷新本地状态与提示；
   * 成功后按失败展示（用户主动取消），并刷新一次用户额度信息。
   */
  const cancelGeneration = useCallback(
    async (sessionId: string, generation: VideoGeneration) => {
      const taskId = generation.taskId;
      if (!taskId || !tokenKeyRef.current) return;
      if (cancellingTaskIdsRef.current.has(taskId)) return;
      cancellingTaskIdsRef.current.add(taskId);
      setCancellingTaskIds(new Set(cancellingTaskIdsRef.current));
      try {
        const result = await cancelVideoTaskRequest(taskId, tokenKeyRef.current, {
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
          // 后端已判定该任务不能再取消：记一个不会被轮询覆盖的「已拒绝」标记，
          // 让停止键收起，避免用户对同一个不可取消的任务反复点击。
          if (result.shouldHideButton) {
            updateGeneration(sessionId, generation.id, (old) => ({
              ...old,
              canCancel: false,
              cancelRejectedAt: Date.now(),
            }));
          }
          // 文案已是 t() 结果，用 notify.error 避免 notifyApiError 的二次翻译改写。
          notify.error(result.message);
          return;
        }

        updateGeneration(sessionId, generation.id, (old) => ({
          ...old,
          status: 'failed',
          canCancel: false,
          errorMessage: t('chat.videoCancelledMessage'),
        }));
        notify.info(t('chat.videoCancelledNoRefund'));
        try { await refreshUser(); } catch { /* ignore quota refresh failure */ }
      } finally {
        cancellingTaskIdsRef.current.delete(taskId);
        setCancellingTaskIds(new Set(cancellingTaskIdsRef.current));
      }
    },
    [updateGeneration, refreshUser, t],
  );

  useLayoutEffect(() => {
    let list = loadVideoSessions(userId);
    if (list.length === 0) {
      const blank = createBlankVideoSession(t('chat.newChatTitle'));
      list = [blank];
      saveVideoSessions(list, userId);
    } else {
      const next = finalizeInterruptedVideoSessions(list);
      if (list.some((s) => s.generations.some((g) => !g.taskId && g.status !== 'completed' && g.status !== 'failed'))) {
        saveVideoSessions(next, userId);
        list = next;
      }
    }
    historyItemsRef.current = list;
    setSessions(list);
    const saved = loadPersistedActiveSessionId(userId);
    const chosen = saved && list.some((s) => s.id === saved) ? saved : list[0]!.id;
    setActiveSessionId(chosen);
  }, [userId, t]);

  useEffect(() => {
    persistActiveSessionId(activeSessionId, userId);
  }, [activeSessionId, userId]);

  useEffect(() => {
    if (sessions.length === 0) return;
    setActiveSessionId((prev) => {
      if (prev && sessions.some((s) => s.id === prev)) return prev;
      const saved = loadPersistedActiveSessionId(userId);
      if (saved && sessions.some((s) => s.id === saved)) return saved;
      return sessions[0]!.id;
    });
  }, [sessions, userId]);

  useEffect(() => {
    historyItemsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    let cancelled = false;
    void warmAttachmentPreviewCacheFromSessions(sessions).then((hydrated) => {
      if (!cancelled && hydrated) {
        setAttachmentPreviewCacheEpoch((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessions]);

  useEffect(() => {
    tokenKeyRef.current = tokenKey;
  }, [tokenKey]);

  useEffect(() => {
    const sync = () => {
      if (shouldSkipVideoPersistSync()) return;
      const ls = loadVideoSessions(userId);
      const merged = mergeVideoSessionsForMutation(historyItemsRef.current, ls);
      historyItemsRef.current = merged;
      setSessions(merged);
    };
    return subscribeVideoPersist(sync);
  }, [userId]);

  const videoPollMessages = useMemo<VideoGenPollMessages>(
    () => ({
      payloadTooLarge: t('chat.videoGenPayloadTooLarge'),
      sensitiveContent: t('chat.videoGenSensitiveContent'),
      statusFailed: t('chat.videoStatusFailed'),
      emptyResponse: t('chat.videoGenEmptyResponse'),
      durationTooShort: (minSec, actualSec) =>
        t('chat.videoGenHappyHorseVideoEditDurationTooShort', {
          min: minSec,
          actual: actualSec.toFixed(2),
        }),
      taskMissing: t('chat.videoGenTaskMissing'),
      authFailed: t('chat.videoGenAuthFailed'),
      pollUnstable: t('chat.videoGenPollUnstable'),
    }),
    [t],
  );

  const videoProviderErrorMessages = useMemo(
    () => ({
      sensitive: t('chat.videoGenSensitiveContent'),
      fallback: t('chat.videoStatusFailed'),
      durationTooShort: videoPollMessages.durationTooShort,
    }),
    [t, videoPollMessages.durationTooShort],
  );

  const probeHappyHorseVideoEditDuration = useCallback(async (file: File): Promise<number | null> => {
    try {
      const sec = await readLocalVideoDurationSec(file);
      if (!isHappyHorseVideoEditSourceDurationValid(sec)) {
        notifyApiError(
          t('chat.videoGenHappyHorseVideoEditDurationRange', {
            min: HAPPYHORSE_VIDEO_EDIT_MIN_SOURCE_SEC,
            max: HAPPYHORSE_VIDEO_EDIT_MAX_SOURCE_SEC,
            actual: sec.toFixed(2),
          }),
        );
        return null;
      }
      return sec;
    } catch {
      notifyApiError(t('chat.videoGenHappyHorseVideoDurationUnreadable'));
      return null;
    }
  }, [t]);

  useEffect(() => {
    if (userId == null) {
      setVideoGenPollContext(null);
      return undefined;
    }
    setVideoGenPollContext({
      userId,
      getTokenKey: () => tokenKeyRef.current,
      getMemSnapshot: () => historyItemsRef.current,
      messages: videoPollMessages,
      queueHint: progressHint,
      onQuotaRefresh: refreshUser,
    });
    return undefined;
  }, [userId, videoPollMessages, progressHint, refreshUser]);

  /** 切换会话：清空输入区（与文本对话切会话一致，不从历史生成回填附件） */
  useEffect(() => {
    if (!activeSessionId) return;
    setPrompt('');
    setPendingAttachments([]);
    setFirstFrameAttachment(null);
    setLastFrameAttachment(null);
  }, [activeSessionId, userId]);

  const probeTargetGen = useMemo(() => {
    if (!activeSession) return null;
    const completed = activeSession.generations.filter((g) => g.status === 'completed' && g.taskId && g.videoUrl);
    return completed.length ? completed[completed.length - 1]! : null;
  }, [activeSession]);

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
              const key = keyRes.data?.data?.key || '';
              setTokenKey(key.startsWith('sk-') ? key : `sk-${key}`);
            } catch {
              setTokenKey(active.key);
            }
          }
        }
      } catch {
      } finally {
        setTokenLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogPickerModels()
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        setPricingModels(rows);
        const videoIds = rows
          .filter((p) => modalityCategory(p.modalities) === 'video')
          .map((p) => p.model_name)
          .sort((a, b) => a.localeCompare(b));
        setSelectedModel((prev) => {
          if (prev && videoIds.includes(prev)) return prev;
          return videoIds[0] || '';
        });
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!tokenKey || pendingTaskIds.length === 0) return;
    void pollAllPendingTasks();
  }, [pendingTaskIds.length, pollAllPendingTasks, tokenKey]);

  useEffect(() => {
    if (isMobileViewport) return;
    const ta = promptRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [prompt, videoGenMode, isMobileViewport]);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const probe = probeTargetGen;
    if (!activeSessionId || !probe || probe.status !== 'completed' || !probe.taskId || !tokenKey) {
      setVideoContentProbe('idle');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setVideoContentProbe('checking');

    const run = async (attempt: number): Promise<void> => {
      const outcome = await probeVideoOutput(probe.taskId, tokenKey);
      if (cancelled) return;

      switch (outcome.kind) {
        case 'ok':
          setVideoContentProbe('ok');
          return;
        case 'unavailable':
          setVideoContentProbe('unavailable');
          return;
        case 'not_found':
          setVideoContentProbe('not_found');
          return;
        case 'pending':
          // 输出还在转存 OSS：正常中间态，退避重试，绝不显示成“过期”
          setVideoContentProbe('pending');
          break;
        case 'retry':
          // 瞬时故障：保持上一次的可见态，退避重试；只有真的重试耗尽才降级
          break;
      }

      const delay = PROBE_RETRY_DELAYS_MS[attempt];
      if (delay == null) {
        // 重试耗尽仍未探到「确定能播」：归为可手动重试的失败态。
        // 注意这里不能停在 pending —— 那会让「视频正在转存」的等待态永久挂住、
        // 用户既看不到结果也没有重试入口；也给不出「过期」这种结论，因为真的没探到。
        setVideoContentProbe('unavailable');
        return;
      }
      timer = setTimeout(() => { void run(attempt + 1); }, delay);
    };

    void run(0);

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
    // updateGeneration 在 effect 内并未使用，放进依赖只会在语言切换时白跑一遍探测
  }, [activeSessionId, probeTargetGen?.id, probeTargetGen?.status, probeTargetGen?.taskId, tokenKey, probeAttempt]);

  const handleAttachmentPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const rejectUnsupported = (file: File): boolean => {
      const isAudio = isMiniMaxH3 && composerMediaCapability.supportsReferenceAudio && isMiniMaxH3AudioFile(file);
      const kind = isAudio ? 'audio' as const : fileToAttachmentKind(file);
      if (!kind) {
        notifyApiError(t('chat.attachmentsUnsupportedType'));
        return true;
      }
      if (!selectedModel) {
        notify.info(t('chat.selectModelFirst'));
        return true;
      }
      if (kind === 'image' && !composerMediaCapability.supportsReferenceImage) {
        notify.warning(t('chat.videoGenModelNoImageSupport', { model: selectedModel }));
        return true;
      }
      if (kind === 'video' && !composerMediaCapability.supportsReferenceVideo) {
        notify.warning(t('chat.videoGenModelNoVideoSupport', { model: selectedModel }));
        return true;
      }
      if (kind === 'audio' && !composerMediaCapability.supportsReferenceAudio) {
        notifyApiError(t('chat.attachmentsUnsupportedType'));
        return true;
      }
      if (kind === 'image' && isMiniMaxH3 && !isMiniMaxH3AllowedImageFile(file)) {
        notifyApiError(t('chat.videoGenMiniMaxImageType'));
        return true;
      }
      return false;
    };

    const addImageFromFile = async (file: File, extra?: Partial<PendingAttachment>) => {
      const rowId = genId();
      const blobPreview = URL.createObjectURL(file);
      setPendingAttachments((prev) => [...prev, {
        id: rowId,
        kind: 'image',
        name: file.name,
        preview: blobPreview,
        sizeBytes: file.size,
        ossUploading: true,
        ...extra,
      }]);
      try {
        const preview = await compressImageFileToDataUrl(file);
        setPendingAttachments((prev) => prev.map((a) => (
          a.id === rowId
            ? { ...a, preview, ossUploading: false, uploadProgress: 100 }
            : a
        )));
      } catch {
        setPendingAttachments((prev) => prev.filter((a) => a.id !== rowId));
        notifyApiError(t('chat.videoGenFileReadFailed'));
      } finally {
        URL.revokeObjectURL(blobPreview);
      }
    };

    if (happyHorseMode === 'video-edit') {
      const hasVideo = pendingAttachments.some((a) => a.kind === 'video');
      Array.from(files as FileList).forEach((file: File) => {
        void (async () => {
          if (rejectUnsupported(file)) return;
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          if (isVideo && hasVideo) {
            notify.warning(t('chat.videoGenHappyHorseVideoOneOnly'));
            return;
          }
          // if (isImage && imageCount >= 5) {
          //   notify.warning(t('chat.videoGenHappyHorseMaxFiveRefImages'));
          //   return;
          // }
          if (pendingAttachments.length >= MAX_OMNI_REF_ATTACHMENTS) {
            notify.warning(
              t('chat.videoGenOmniRefMaxReached', {
                max: MAX_OMNI_REF_ATTACHMENTS,
                defaultValue: `最多使用 ${MAX_OMNI_REF_ATTACHMENTS} 个参考内容`,
              }),
            );
            return;
          }
          const maxBytes = (isImage ? MAX_IMAGE_FILE_SIZE_MB : MAX_VIDEO_FILE_SIZE_MB) * 1024 * 1024;
          if (file.size > maxBytes) {
            notifyApiError(
              t(
                'chat.videoGenFileTooLarge',
                `${file.name} 过大，${isImage ? '图片' : '视频'}请小于 ${isImage ? MAX_IMAGE_FILE_SIZE_MB : MAX_VIDEO_FILE_SIZE_MB}MB`,
              ),
            );
            return;
          }
          try {
            if (isVideo) {
              const sourceDurationSec = await probeHappyHorseVideoEditDuration(file);
              if (sourceDurationSec == null) return;
              const rowId = genId();
              const callbacks = buildVideoOssAttachmentCallbacks(
                setPendingAttachments,
                () => ({
                  kind: 'video',
                  name: file.name,
                  sourceDurationSec,
                }),
              );
              try {
                await uploadLocalVideoFileToGenMediaOss(
                  file,
                  rowId,
                  readFileAsDataUrl,
                  callbacks,
                  'video_edit',
                );
              } catch {
                /* onError 已提示并移除 */
              }
              return;
            }
            await addImageFromFile(file);
          } catch {
            notifyApiError(t('chat.videoGenFileReadFailed'));
          }
        })();
      });
      e.target.value = '';
      return;
    }
    if (happyHorseMode === 'i2v') {
      e.target.value = '';
      return;
    }
    const maxRefs = miniMaxH3Ui?.omni?.maxTotal ?? (happyHorseMode === 'r2v' ? 9 : MAX_OMNI_REF_ATTACHMENTS);
    if (videoGenMode !== 'omni_ref' && !happyHorseMode) {
      e.target.value = '';
      return;
    }
    const remain = maxRefs - pendingAttachments.length;
    if (remain <= 0) {
      notify.warning(
        t('chat.videoGenOmniRefMaxReached', {
          max: maxRefs,
          defaultValue: `最多使用 ${maxRefs} 个参考内容`,
        }),
      );
      e.target.value = '';
      return;
    }
    Array.from(files as FileList).slice(0, remain).forEach((file: File) => {
      void (async () => {
        if (rejectUnsupported(file)) return;
        const isImage = file.type.startsWith('image/') || (isMiniMaxH3 && isMiniMaxH3AllowedImageFile(file));
        const isVideo = file.type.startsWith('video/');
        const isAudio = isMiniMaxH3 && isMiniMaxH3AudioFile(file);
        if (!isImage && !isVideo && !isAudio) return;
        if (isMiniMaxH3 && miniMaxH3Ui?.omni) {
          const images = pendingAttachments.filter((a) => a.kind === 'image').length + (isImage ? 1 : 0);
          const videos = pendingAttachments.filter((a) => a.kind === 'video').length + (isVideo ? 1 : 0);
          const audios = pendingAttachments.filter((a) => a.kind === 'audio').length + (isAudio ? 1 : 0);
          if (
            images > miniMaxH3Ui.omni.maxImages
            || videos > miniMaxH3Ui.omni.maxVideos
            || audios > miniMaxH3Ui.omni.maxAudios
          ) {
            notify.warning(t('chat.videoGenMiniMaxRefCap', {
              images: miniMaxH3Ui.omni.maxImages,
              videos: miniMaxH3Ui.omni.maxVideos,
              audios: miniMaxH3Ui.omni.maxAudios,
              total: miniMaxH3Ui.omni.maxTotal,
            }));
            return;
          }
        }
        const maxImageBytes = isMiniMaxH3 ? (miniMaxH3Ui?.maxImageBytes ?? MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024) : MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024;
        const maxBytes = isImage ? maxImageBytes : MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;
        if (file.size > maxBytes) {
          notifyApiError(
            t(
              'chat.videoGenFileTooLarge',
              `${file.name} 过大，${isImage ? '图片' : isAudio ? '音频' : '视频'}请小于 ${isImage && isMiniMaxH3 ? 30 : isImage ? MAX_IMAGE_FILE_SIZE_MB : MAX_VIDEO_FILE_SIZE_MB}MB`,
            ),
          );
          return;
        }
        try {
          if (isVideo || isAudio) {
            const rowId = genId();
            const bizRef = genMediaBizRefForModel(selectedModel);
            const callbacks = buildVideoOssAttachmentCallbacks(
              setPendingAttachments,
              () => ({
                kind: isAudio ? 'audio' : 'video',
                name: file.name,
              }),
            );
            try {
              await uploadLocalVideoFileToGenMediaOss(
                file,
                rowId,
                isAudio ? async (f) => URL.createObjectURL(f) : readFileAsDataUrl,
                callbacks,
                bizRef,
              );
            } catch {
              /* onError 已提示并移除 */
            }
            return;
          }
          await addImageFromFile(file);
        } catch {
          notifyApiError(t('chat.videoGenFileReadFailed'));
        }
      })();
    });
    e.target.value = '';
  }, [
    composerMediaCapability,
    happyHorseMode,
    isMiniMaxH3,
    miniMaxH3Ui,
    pendingAttachments,
    probeHappyHorseVideoEditDuration,
    selectedModel,
    t,
    videoGenMode,
  ]);

  const handleFrameSlotPick = useCallback((e: React.ChangeEvent<HTMLInputElement>, slot: 'first' | 'last') => {
    const files = e.target.files;
    const file = files?.[0];
    e.target.value = '';
    if (!file) return;
    const imageOk = isMiniMaxH3 ? isMiniMaxH3AllowedImageFile(file) : file.type.startsWith('image/');
    if (!imageOk) {
      notifyApiError(isMiniMaxH3 ? t('chat.videoGenMiniMaxImageType') : t('chat.videoGenFrameImageOnly'));
      return;
    }
    const maxBytes = isMiniMaxH3
      ? (miniMaxH3Ui?.maxImageBytes ?? MINIMAX_H3_MAX_IMAGE_BYTES)
      : MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      const limitMb = isMiniMaxH3 ? 30 : MAX_IMAGE_FILE_SIZE_MB;
      notifyApiError(t('chat.videoGenFileTooLarge', `${file.name} 过大，图片请小于 ${limitMb}MB`));
      return;
    }
    void (async () => {
      try {
        const minShortSide = happyHorseMode === 'i2v' ? 300 : 400;
        const preview = await compressImageFileToDataUrl(file, 1920, 0.82, minShortSide);
        const row: PendingAttachment = {
          id: genId(),
          kind: 'image',
          name: file.name,
          preview,
          sizeBytes: file.size,
        };
        if (slot === 'first') setFirstFrameAttachment(row);
        else setLastFrameAttachment(row);
      } catch {
        notifyApiError(t('chat.videoGenFileReadFailed'));
      }
    })();
  }, [happyHorseMode, isMiniMaxH3, miniMaxH3Ui, t]);

  const composerSubmitGateMessages = useMemo(
    () => ({
      missingToken: t('chat.missingTokenDescShort'),
      selectModel: t('chat.selectModelFirst'),
      enterContent: t('chat.enterContentFirst'),
    }),
    [t],
  );

  const handleSubmit = useCallback(async () => {
    if (isComposerSubmitting) return;
    // 这里刻意不检查「是否已有任务在跑」：视频任务支持同时跑多个，
    // 后端也没有并发数限制。拦截只会让用户以为按钮坏了。
    if (!runComposerSubmitGate(
      {
        hasToken: Boolean(tokenKey),
        hasModel: Boolean(selectedModel),
        hasContent: hasComposerInput,
      },
      composerSubmitGateMessages,
    )) {
      if (tokenKey && selectedModel && !hasComposerInput) {
        promptRef.current?.focus();
      }
      return;
    }

    const promptText = prompt.trim();

    const hhMode = getHappyHorseMode(selectedModel);
    const h3Variant = getMiniMaxH3Variant(selectedModel);
    if (hhMode) {
      const { imageUrls } = collectHappyHorseMediaUrls(hhMode, happyHorseMediaInput);
      if (hhMode === 'i2v' && imageUrls.length === 0) {
        notify.info(t('chat.enterContentFirst'));
        return;
      }
      if (hhMode === 'r2v') {
        if (imageUrls.length === 0) {
          notify.info(t('chat.enterContentFirst'));
          return;
        }
        if (imageUrls.length > 9) return notifyApiError(t('chat.videoGenHappyHorseMaxNineImages'));
      }
      if (hhMode === 'video-edit') {
        const videoAttachment = pendingAttachments.find((a) => a.kind === 'video');
        if (!videoAttachment) {
          notify.info(t('chat.enterContentFirst'));
          return;
        }
        if (videoAttachment.ossUploading) {
          return notifyApiError(t('chat.videoGenHappyHorseVideoOssUploading'));
        }
        if (!videoAttachment.ossPublicUrl || !isPublicHttpUrl(videoAttachment.ossPublicUrl)) {
          return notifyApiError(
            videoAttachment.ossUploadError || t('chat.videoGenHappyHorseVideoOssUploadFailed'),
          );
        }
        if (
          videoAttachment.sourceDurationSec != null
          && !isHappyHorseVideoEditSourceDurationValid(videoAttachment.sourceDurationSec)
        ) {
          return notifyApiError(
            t('chat.videoGenHappyHorseVideoEditDurationRange', {
              min: HAPPYHORSE_VIDEO_EDIT_MIN_SOURCE_SEC,
              max: HAPPYHORSE_VIDEO_EDIT_MAX_SOURCE_SEC,
              actual: videoAttachment.sourceDurationSec.toFixed(2),
            }),
          );
        }
      }
    }

    if (h3Variant) {
      if (!promptText) {
        notify.info(t('chat.enterContentFirst'));
        promptRef.current?.focus();
        return;
      }
      if (videoGenMode === 'first_frame' && !firstFrameAttachment) {
        return notifyApiError(t('chat.videoGenMiniMaxNeedFirstFrame'));
      }
      if (videoGenMode === 'first_last' && !firstFrameAttachment) {
        return notifyApiError(t('chat.videoGenMiniMaxNeedFirstFrame'));
      }
      if (videoGenMode === 'omni_ref') {
        const images = pendingAttachments.filter((a) => a.kind === 'image');
        const videos = pendingAttachments.filter((a) => a.kind === 'video');
        const audios = pendingAttachments.filter((a) => a.kind === 'audio');
        if (images.length === 0 && videos.length === 0) {
          return notifyApiError(t('chat.videoGenMiniMaxNeedVisualRef'));
        }
        if (audios.length > 0 && images.length + videos.length === 0) {
          return notifyApiError(t('chat.videoGenMiniMaxAudioNeedsVisual'));
        }
        for (const media of [...videos, ...audios]) {
          if (media.ossUploading) {
            return notifyApiError(t('chat.videoGenHappyHorseVideoOssUploading'));
          }
          if (!media.ossPublicUrl || !isPublicHttpUrl(media.ossPublicUrl)) {
            return notifyApiError(media.ossUploadError || t('chat.videoGenHappyHorseVideoOssUploadFailed'));
          }
        }
      }
    }

    const frameList = [firstFrameAttachment, lastFrameAttachment].filter((x): x is PendingAttachment => x != null);

    const durationSec = hhMode
      ? clampHappyHorseDuration(parseVideoDurationDraft(videoDurationDraft))
      : h3Variant
        ? clampMiniMaxH3Duration(parseVideoDurationDraft(videoDurationDraft), h3Variant)
        : isSeedance25
          ? clampDurationRange(parseVideoDurationDraft(videoDurationDraft), SEEDANCE_25_DURATION_MIN_SECONDS, SEEDANCE_25_DURATION_MAX_SECONDS)
          : isSeedance20Range
            ? clampDurationRange(parseVideoDurationDraft(videoDurationDraft), SEEDANCE_20_DURATION_MIN_SECONDS, SEEDANCE_20_DURATION_MAX_SECONDS)
            : clampVideoDurationForPage(parseVideoDurationDraft(videoDurationDraft));
    try { localStorage.setItem(VIDEO_DURATION_STORAGE_KEY, String(durationSec)); } catch {}
    setVideoDurationDraft(String(durationSec));
    let resolvedSessionId = '';

    const attachmentSnapshot = isFrameGenMode(videoGenMode) ? frameList : pendingAttachments;
    const imageRows =
      isFrameGenMode(videoGenMode)
        ? frameList
        : pendingAttachments.filter((a) => a.kind === 'image');
    const videoRows =
      isFrameGenMode(videoGenMode)
        ? []
        : pendingAttachments.filter((a) => a.kind === 'video');
    const apiGenMode = isFrameGenMode(videoGenMode) ? 'first_last' : 'omni_reference';

    const seedance20 = isSeedance20Model(selectedModel);
    // if (seedance20 && videoGenMode === 'omni_ref' && imageRows.length > 2) {
    //   notifyApiError(t('chat.videoGenSeedanceMaxTwoImages'));
    //   return;
    // }
    // if (seedance20 && videoGenMode === 'first_last' && frameList.length > 0 && frameList.length !== 2) {
    //   notifyApiError(t('chat.videoGenFirstLastRequiresTwoImages'));
    //   return;
    // }
    if (!hhMode && videoRows.length > 0) {
      for (const v of videoRows) {
        if (v.ossUploading) {
          return notifyApiError(t('chat.videoGenHappyHorseVideoOssUploading'));
        }
        if (!v.ossPublicUrl || !isPublicHttpUrl(v.ossPublicUrl)) {
          return notifyApiError(v.ossUploadError || t('chat.videoGenHappyHorseVideoOssUploadFailed'));
        }
      }
    }

    const totalAttachmentBytes = attachmentSnapshot.reduce((sum, x) => sum + (x.sizeBytes || 0), 0);
    const finalPrompt = promptText || t('chat.videoGenRefOnlyPrompt');
    const hhMediaForSubmit = hhMode ? collectHappyHorseMediaUrls(hhMode, happyHorseMediaInput) : null;
    const generationId = genId();
    rememberGenerationAttachmentPreviews(generationId, attachmentSnapshot);
    applySessionMutation((prev) => {
      let sid =
        activeSessionId && prev.some((s) => s.id === activeSessionId)
          ? activeSessionId
          : genId();
      let next = prev;
      if (!next.some((s) => s.id === sid)) {
        next = [{ id: sid, createdAt: Date.now(), title: t('chat.newChatTitle'), generations: [] }, ...next];
      }
      resolvedSessionId = sid;
      const newGen: VideoGeneration = {
        id: generationId,
        createdAt: Date.now(),
        model: selectedModel,
        prompt: finalPrompt,
        duration: durationSec,
        resolution: videoResolutionDraft,
        aspectRatio: videoAspectRatioDraft,
        taskId: '',
        status: 'queued',
        errorMessage: t('chat.videoQueuedWaitTip'),
        attachments: attachmentSnapshot,
        genMode: videoGenMode,
      };
      return next.map((s) => {
        if (s.id !== sid) return s;
        const title =
          s.generations.length === 0
            ? (finalPrompt.trim().slice(0, 28) || t('chat.newChatTitle'))
            : s.title;
        return { ...s, title, generations: [...s.generations, newGen] };
      });
    });
    setSubmittingSessionId(resolvedSessionId);
    if (!activeSessionId || activeSessionId !== resolvedSessionId) {
      setActiveSessionId(resolvedSessionId);
    }
    setPrompt('');
    setPendingAttachments([]);
    setFirstFrameAttachment(null);
    setLastFrameAttachment(null);
    scrollVideoMessagesToEnd();

    let requestBody: Record<string, unknown>;
    if (hhMode && hhMediaForSubmit) {
      requestBody = buildHappyHorseVideoPayload({
        model: selectedModel,
        prompt: finalPrompt,
        durationSec,
        resolution: videoResolutionDraft,
        aspectRatio: videoAspectRatioDraft,
        imageUrls: hhMediaForSubmit.imageUrls,
        videoUrls: hhMediaForSubmit.videoUrls,
      });
    } else if (h3Variant) {
      requestBody = buildMiniMaxH3VideoPayload({
        model: selectedModel,
        prompt: finalPrompt,
        durationSec,
        resolution: videoResolutionDraft,
        aspectRatio: videoAspectRatioDraft,
        mode: videoGenMode as MiniMaxH3GenMode,
        firstFrameUrl: firstFrameAttachment?.preview,
        lastFrameUrl: lastFrameAttachment?.preview,
        references: pendingAttachments.map((row) => ({
          kind: row.kind,
          url: row.kind === 'image' ? row.preview : (row.ossPublicUrl || row.preview),
        })),
      });
    } else {
      const toSubmitAtt = (row: PendingAttachment) => ({
        kind: row.kind === 'audio' ? 'video' as const : row.kind,
        preview: row.preview,
        ossPublicUrl: row.ossPublicUrl,
      });
      requestBody = buildDoubaoVideoPayload({
        model: selectedModel,
        prompt: finalPrompt,
        durationSec,
        resolution: videoResolutionDraft,
        ratio: videoAspectRatioDraft,
        genMode: apiGenMode,
        imageAttachments: (isFrameGenMode(videoGenMode) ? frameList : imageRows).map(toSubmitAtt),
        videoAttachments: videoRows.map(toSubmitAtt),
        seedance20,
      });
    }

    try {
      const resp = await fetch('/v1/videos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const raw = await resp.text();
      if (!resp.ok) {
        updateGeneration(resolvedSessionId, generationId, (old) => ({
          ...old,
          status: 'failed',
          errorMessage: resp.status === 413
            ? (
              totalAttachmentBytes <= 1024 * 1024
                ? `${t('chat.videoGenPayloadTooLargeGateway')} (${t('chat.videoGenAttachmentTotalSize')}: ${formatSize(totalAttachmentBytes)})`
                : `${t('chat.videoGenPayloadTooLarge')} (${t('chat.videoGenAttachmentTotalSize')}: ${formatSize(totalAttachmentBytes)})`
            )
            : friendlyRelayError(resp.status, raw, t('chat.videoGenPayloadTooLarge')),
          responseRaw: raw,
        }));
        return;
      }

      try {
        const parsed = JSON.parse(raw) as VideoTaskApiResponse & { id?: string; task_id?: string; error?: { message?: string; code?: string } };
        const taskId = parsed.task_id || parsed.id || '';
        if (!taskId) {
          updateGeneration(resolvedSessionId, generationId, (old) => ({ ...old, status: 'failed', errorMessage: t('chat.videoTaskMissingId') }));
          return;
        }
        updateGeneration(resolvedSessionId, generationId, (old) => {
          const patch = parseVideoTaskApiPollResponse(taskId, parsed, old);
          if (patch.status === 'completed') {
            return { ...old, taskId, ...patch, errorMessage: undefined, responseRaw: raw };
          }
          if (patch.status === 'failed') {
            return {
              ...old,
              taskId,
              ...patch,
              errorMessage: friendlyVideoProviderError(parsed.error, videoProviderErrorMessages),
              responseRaw: raw,
            };
          }
          const nextStatus = patch.status === 'queued' ? 'queued' : 'in_progress';
          return {
            ...old,
            taskId,
            status: nextStatus,
            progress: patch.progress,
            errorMessage: progressHint(nextStatus),
            responseRaw: raw,
          };
        });
        if (!isVideoTaskApiSucceeded(parsed)) {
          void pollAllPendingTasks();
        }
        try { await refreshUser(); } catch { /* ignore */ }
      } catch {
        updateGeneration(resolvedSessionId, generationId, (old) => ({
          ...old,
          status: 'failed',
          errorMessage: raw.trim()
            ? friendlyRelayError(resp.status, raw, t('chat.videoGenPayloadTooLarge'))
            : t('chat.videoGenEmptyResponse'),
          responseRaw: raw,
        }));
      }
    } catch (err: unknown) {
      updateGeneration(resolvedSessionId, generationId, (old) => ({
        ...old,
        status: 'failed',
        errorMessage: isInterruptedFetchError(err)
          ? t('chat.taskInterrupted')
          : (err instanceof Error && err.message.trim() ? err.message : t('chat.taskInterrupted')),
      }));
    } finally {
      setSubmittingSessionId(null);
    }
  }, [
    activeSessionId,
    applySessionMutation,
    composerSubmitGateMessages,
    firstFrameAttachment,
    hasComposerInput,
    isComposerSubmitting,
    lastFrameAttachment,
    pendingAttachments,
    prompt,
    progressHint,
    refreshUser,
    selectedModel,
    t,
    tokenKey,
    updateGeneration,
    pollAllPendingTasks,
    videoAspectRatioDraft,
    videoDurationDraft,
    happyHorseMediaInput,
    videoGenMode,
    videoResolutionDraft,
    scrollVideoMessagesToEnd,
    videoProviderErrorMessages,
    isSeedance25,
    isSeedance20Range,
  ]);

  const deleteSession = useCallback(
    (id: string) => {
      const isOnlySession = sessions.length === 1 && sessions[0]?.id === id;
      clearMessagesScrollCache('video', userId, id);

      if (isOnlySession) {
        const reset = createBlankVideoSession(t('chat.newChatTitle'));
        clearMessagesScrollCache('video', userId, reset.id);
        applySessionMutation(() => [reset]);
        setActiveSessionId(reset.id);
        setPrompt('');
        setPendingAttachments([]);
        setFirstFrameAttachment(null);
        setLastFrameAttachment(null);
        notify.success(t('chat.lastConversationCleared'));
        return;
      }

      let nextActiveId: string | null = null;
      applySessionMutation((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (activeSessionId === id || !next.some((s) => s.id === activeSessionId)) {
          nextActiveId = next[0]!.id;
        }
        return next;
      });
      if (nextActiveId) setActiveSessionId(nextActiveId);
      notify.success(t('chat.conversationDeleted'));
    },
    [activeSessionId, applySessionMutation, sessions, t, userId],
  );

  const commitSessionRename = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    applySessionMutation((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed || s.title } : s)),
    );
    setRenamingSessionId(null);
  }, [applySessionMutation]);

  useEffect(() => {
    if (!renamingSessionId) return;
    const el = renameSessionInputRef.current?.input;
    el?.focus();
    el?.select();
  }, [renamingSessionId]);

  const applyVideoGenMode = useCallback((next: VideoGenMode) => {
    if (next === videoGenMode) {
      setModeMenuOpen(false);
      return;
    }
    if (next === 't2v') {
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments([]);
    } else if (isFrameGenMode(next)) {
      const imgs = pendingAttachments.filter((a) => a.kind === 'image');
      const droppedMedia = pendingAttachments.filter((a) => a.kind === 'video' || a.kind === 'audio');
      if (droppedMedia.length > 0) {
        notify.info(t('chat.videoGenModeDropVideos'));
      }
      const first = firstFrameAttachment ?? imgs[0] ?? null;
      const leftover = firstFrameAttachment ? imgs : imgs.slice(1);
      setFirstFrameAttachment(first);
      setLastFrameAttachment(next === 'first_last' ? (lastFrameAttachment ?? leftover[0] ?? null) : null);
      setPendingAttachments([]);
    } else {
      const merged: PendingAttachment[] = [];
      if (firstFrameAttachment) merged.push(firstFrameAttachment);
      if (lastFrameAttachment) merged.push(lastFrameAttachment);
      merged.push(...pendingAttachments);
      const cap = omniRefMaxCount;
      setPendingAttachments(merged.slice(0, cap));
      if (merged.length > cap) {
        notify.info(t('chat.videoGenOmniRefCap', { max: cap, defaultValue: `全能参考最多保留 ${cap} 个附件` }));
      }
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
    }
    setVideoGenMode(next);
    setModeMenuOpen(false);
  }, [firstFrameAttachment, lastFrameAttachment, omniRefMaxCount, pendingAttachments, t, videoGenMode]);

  const handleCreateNewVideoHistory = useCallback(() => {
    const hasComposerDraft =
      prompt.trim().length > 0 ||
      pendingAttachments.length > 0 ||
      firstFrameAttachment != null ||
      lastFrameAttachment != null;
    const existingEmpty = sessions.find((s) => {
      if (s.generations.length > 0) return false;
      if (s.id === activeSessionId && hasComposerDraft) return false;
      return true;
    });
    if (existingEmpty) {
      setActiveSessionId(existingEmpty.id);
      notify.info(t('chat.emptyDraftFinishFirst'));
      return;
    }
    const id = genId();
    applySessionMutation((prev) => [{
      id,
      createdAt: Date.now(),
      title: t('chat.newChatTitle'),
      generations: [],
    }, ...prev]);
    setActiveSessionId(id);
    setPrompt('');
    setPendingAttachments([]);
    setFirstFrameAttachment(null);
    setLastFrameAttachment(null);
    setSidebarSearch('');
  }, [
    activeSessionId,
    applySessionMutation,
    firstFrameAttachment,
    lastFrameAttachment,
    pendingAttachments.length,
    prompt,
    sessions,
    t,
  ]);

  const handleDownloadVideo = useCallback(async (gen: VideoGeneration) => {
    if (!tokenKey || !activeSessionId || !gen.taskId || gen.status !== 'completed' || !gen.videoUrl) return;
    if (videoDownloadInFlightRef.current) return;
    videoDownloadInFlightRef.current = true;
    setVideoDownloading(true);
    try {
      const resp = await fetch(`/v1/videos/${encodeURIComponent(gen.taskId)}/content`, {
        headers: { Authorization: `Bearer ${tokenKey}` },
      });
      if (!resp.ok) {
        const raw = await resp.text();
        let msg = t('chat.videoGenDownloadFailed');
        if (resp.status === 404) {
          msg = t('chat.videoGenDownloadFailedExpired');
          setVideoContentProbe('not_found');
        } else if (resp.status === 403 || resp.status === 502 || resp.status === 503) {
          // 下载失败不代表视频没了：OSS 抖动 / 转存未完成都会走到这里。
          // 不本地定性为“过期”，只提示稍后重试，并让探测机制去核实真实情况。
          msg = t('chat.videoGenDownloadRetryLater');
        }
        try {
          const j = JSON.parse(raw) as { error?: { message?: string } };
          if (j?.error?.message) {
            msg = `${msg} (${j.error.message})`;
          }
        } catch {
          if (raw.trim()) {
            msg = `${msg} (${raw.slice(0, 120)}${raw.length > 120 ? '…' : ''})`;
          }
        }
        notifyApiError(msg);
        return;
      }
      const blob = await resp.blob();
      const ct = resp.headers.get('content-type') || '';
      if (blob.size < 4096 && (ct.includes('application/json') || ct.includes('text/plain'))) {
        try {
          const text = await blob.text();
          const j = JSON.parse(text) as { error?: { message?: string } };
          if (j?.error?.message) {
            notifyApiError(`${t('chat.videoGenDownloadFailed')}: ${j.error.message}`);
            return;
          }
        } catch {
          notifyApiError(t('chat.videoGenDownloadFailed'));
          return;
        }
      }
      const safe = gen.taskId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'video';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lynxton-video-${safe}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifyApiSuccess(t('chat.videoGenDownloadSuccess'));
    } catch {
      notifyApiError(t('chat.videoGenDownloadFailed'));
    } finally {
      videoDownloadInFlightRef.current = false;
      setVideoDownloading(false);
    }
  }, [activeSessionId, t, tokenKey, updateGeneration]);

  const videoWelcomePaneProps = useMemo(() => buildVideoWelcomePaneProps(t), [t]);

  const handleVideoWelcomeApply = useCallback(
    async (payload: WelcomeApplyPayload) => {
      if (payload.kind !== 'video') return;

      const activeHasMessages =
        activeSessionId != null
        && (sessions.find((s) => s.id === activeSessionId)?.generations.length ?? 0) > 0;
      if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId) || activeHasMessages) {
        handleCreateNewVideoHistory();
      }

      setPrompt(payload.prompt);
      setFirstFrameAttachment(null);
      setLastFrameAttachment(null);
      setPendingAttachments([]);

      // TODO(next): 欢迎卡片自动挂载示例视频/参考图（下版本恢复时取消注释）
      /*
      const capability = resolveVideoGenComposerMediaCapability(
        selectedModel,
        videoGenMode,
        pricingModels.find((p) => p.model_name === selectedModel)?.input_types,
      );
      const hhMode = getHappyHorseMode(selectedModel);
      const needsOssVideo = Boolean(
        capability.supportsReferenceVideo
        && (hhMode === 'video-edit' || videoGenMode === 'omni_ref'),
      );
      const maxVideoBytes = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;

      if (payload.videos.length > 0 && !capability.supportsReferenceVideo) {
        notify.info(t('chat.videoGenWelcomeVideoPromptOnly'));
        promptRef.current?.focus();
        return;
      }

      for (const v of payload.videos) {
        try {
          const file = await fetchWelcomeMediaAsFile(v, 'video/mp4');
          if (file.size > maxVideoBytes) {
            notifyApiError(
              t('chat.videoGenFileTooLarge', {
                defaultValue: `${file.name} 过大，视频请小于 ${MAX_VIDEO_FILE_SIZE_MB}MB`,
              }),
            );
            continue;
          }
          const rowId = genId();
          if (needsOssVideo) {
            const sourceDurationSec = hhMode === 'video-edit'
              ? await probeHappyHorseVideoEditDuration(file)
              : undefined;
            if (hhMode === 'video-edit' && sourceDurationSec == null) continue;
            const bizRef = genMediaBizRefForModel(selectedModel);
            const callbacks = buildVideoOssAttachmentCallbacks(
              setPendingAttachments,
              () => ({
                kind: 'video',
                name: file.name,
                ...(sourceDurationSec != null ? { sourceDurationSec } : {}),
              }),
            );
            try {
              await uploadLocalVideoFileToGenMediaOss(
                file,
                rowId,
                readFileAsDataUrl,
                callbacks,
                hhMode === 'video-edit' ? 'video_edit' : bizRef,
              );
            } catch {
              // onError 已提示并移除
            }
          } else {
            const preview = await readFileAsDataUrl(file);
            setPendingAttachments((prev) => [...prev, {
              id: rowId,
              kind: 'video',
              name: file.name,
              preview,
              sizeBytes: file.size,
            }].slice(0, MAX_OMNI_REF_ATTACHMENTS));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('chat.welcomePresetMediaLoadFailed');
          notifyApiError(msg);
        }
      }

      for (const img of payload.images ?? []) {
        if (!capability.supportsReferenceImage) {
          notify.warning(t('chat.videoGenModelNoImageSupport', { model: selectedModel }));
          break;
        }
        try {
          const file = await fetchWelcomeMediaAsFile(img, 'image/jpeg');
          const rowId = genId();
          const blobPreview = URL.createObjectURL(file);
          setPendingAttachments((prev) => [...prev, {
            id: rowId,
            kind: 'image',
            name: file.name,
            preview: blobPreview,
            sizeBytes: file.size,
            ossUploading: true,
          }].slice(0, MAX_OMNI_REF_ATTACHMENTS));
          try {
            const preview = await compressImageFileToDataUrl(file);
            setPendingAttachments((prev) => prev.map((a) => (
              a.id === rowId ? { ...a, preview, ossUploading: false, uploadProgress: 100 } : a
            )));
          } finally {
            URL.revokeObjectURL(blobPreview);
          }
        } catch {
          notifyApiError(t('chat.welcomePresetMediaLoadFailed'));
        }
      }
      */

      promptRef.current?.focus();
    },
    [activeSessionId, handleCreateNewVideoHistory, sessions],
  );

  const videoWelcomeAriaLabel = chatWelcomePaneAriaLabel(
    videoWelcomePaneProps.title,
    t('chat.videoWelcomeHeading'),
  );

  if (tokenLoading) {
    return <div className="chat-page"><div className="chat-center-screen"><div className="chat-spinner" /><span>{t('loading')}</span></div></div>;
  }

  const hasToken = Boolean(tokenKey);
  // 已有任务在跑**不再**禁用发送：视频任务支持同时跑多个，后端无并发限制。
  const canSubmit = !isComposerSubmitting;
  const videoWelcomeDisabled = !hasToken || isComposerSubmitting;

  const videoCenteredWelcomeEl = (
    <ChatWelcomePane
      {...videoWelcomePaneProps}
      disabled={videoWelcomeDisabled}
      onApply={handleVideoWelcomeApply}
    />
  );

  if (isMobileViewport) {
    return (
      <>
        <div className="video-gen-mobile-page chat-mobile-page">
          {!hasToken && (
            <div className="chat-token-notice" style={{ flexShrink: 0 }}>
              <div className="chat-token-notice__content">
                <div className="chat-token-notice__title">{t('chat.missingTokenTitle')}</div>
                <div className="chat-token-notice__desc">{t('chat.missingTokenDescShort')}</div>
              </div>
              <div className="chat-token-notice__actions">
                <button type="button" className="chat-token-notice__btn chat-token-notice__btn--primary" onClick={() => navigate('/tokens')}>
                  {t('chat.goConfigureToken')}
                </button>
              </div>
            </div>
          )}

          <div className="chat-mobile-history-region" style={{ padding: '0 10px' }}>
            <button type="button" className="chat-mobile-history-toggle" onClick={() => setMobileHistoryOpen((v) => !v)}>
              <span className="chat-mobile-history-clock" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6l4 2" />
                </svg>
              </span>
              <span className="chat-mobile-history-title">
                {activeSession?.title || t('chat.newChatTitle')}
              </span>
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
                  onClick={() => {
                    handleCreateNewVideoHistory();
                    setMobileHistoryOpen(false);
                  }}
                >
                  {t('newChat')}
                </Button>
                <div className="sidebar-search" style={{ maxWidth: 'none', margin: '0 12px 12px' }}>
                  <span className="sidebar-search-icon"><SearchOutlined style={{ fontSize: 14 }} /></span>
                  <input
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder={t('chat.searchRooms')}
                    className="sidebar-search-input"
                  />
                </div>
                <div className="chat-mobile-conv-list sidebar-list">
                  {filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className={convSidebarClass(session.id === activeSessionId || renamingSessionId === session.id)}
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setMobileHistoryOpen(false);
                      }}
                    >
                      {renamingSessionId === session.id ? (
                        <ConvSidebarRenameInput
                          ref={renameSessionInputRef}
                          value={renameSessionValue}
                          onChange={setRenameSessionValue}
                          onCommit={() => commitSessionRename(session.id, renameSessionValue)}
                          onCancel={() => setRenamingSessionId(null)}
                        />
                      ) : (
                        <>
                          <span className="sidebar-item-title">{session.title}</span>
                          <ConvSidebarMoreMenu
                            onRename={() => {
                              setRenamingSessionId(session.id);
                              setRenameSessionValue(session.title);
                            }}
                            onDelete={() => deleteSession(session.id)}
                          />
                        </>
                      )}
                    </div>
                  ))}
                  {filteredSessions.length === 0 && <div className="sidebar-empty">{t('chat.noConversations')}</div>}
                </div>
              </div>
            )}
          </div>

          <div
            ref={messagesScrollRef}
            className="video-gen-mobile-scroll"
            style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto' }}
            onScroll={handleVideoGenMessagesScroll}
          >
            {showVideoCenteredWelcome && (
              <section className="chat-welcome-pane" aria-label={videoWelcomeAriaLabel}>
                {videoCenteredWelcomeEl}
              </section>
            )}
            {activeSession?.generations.map((gen) => {
              const isProbeTarget = probeTargetGen?.id === gen.id;
              return (
                <div key={gen.id} className="video-gen-mobile-card">
                  <div className="video-gen-mobile-card-head">
                    <div>
                      <div className="video-gen-mobile-card-title">{displayHistoryTitle(gen, t('chat.videoGenNewTitle'))}</div>
                      <div className="video-gen-mobile-card-meta">{gen.model} · {gen.duration}s · {gen.resolution} · {gen.aspectRatio}</div>
                      <VideoGenUserActions text={gen.prompt} />
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 999,
                        color: statusTone(gen.status).labelColor,
                        background: statusTone(gen.status).bgColor,
                        flexShrink: 0,
                      }}
                    >
                      {statusTone(gen.status).text}
                    </span>
                  </div>
                  {gen.status === 'completed' && gen.videoUrl ? (
                    !hasToken ? (
                      <VideoGenResultVideo
                        src={gen.videoUrl}
                        videoClassName="video-gen-mobile-player"
                        showDownload={false}
                        downloadDisabled
                        downloadLabel={t('chat.videoGenDownload')}
                        onDownload={() => {}}
                      />
                    ) : isProbeTarget && (videoContentProbe === 'idle' || videoContentProbe === 'checking') ? (
                      <div className="video-gen-mobile-placeholder">
                        <VideoGenWaiting compact text={t('chat.videoGenVideoChecking')} />
                      </div>
                    ) : isProbeTarget && videoContentProbe === 'pending' ? (
                      <div className="video-gen-mobile-placeholder">
                        <VideoGenWaiting compact text={t('chat.videoGenVideoStoring')} />
                      </div>
                    ) : isProbeTarget && videoContentProbe === 'not_found' ? (
                      <div className="video-gen-mobile-placeholder">
                        {t('chat.videoGenVideoNotFound')}
                      </div>
                    ) : isProbeTarget && videoContentProbe === 'unavailable' ? (
                      <div className="video-gen-mobile-placeholder">
                        {t('chat.videoGenVideoUnavailable')}
                        <button
                          type="button"
                          className="video-gen-probe-retry"
                          onClick={() => {
                            // 手动重试是用户明确要求，重置自动重探计数
                            videoErrorReprobeRef.current = { genId: gen.id, count: 0 };
                            setVideoContentProbe('checking');
                            setProbeAttempt((n) => n + 1);
                          }}
                        >
                          {t('chat.videoGenRetryLoad')}
                        </button>
                      </div>
                    ) : (
                      <VideoGenResultVideo
                        src={gen.videoUrl}
                        videoClassName="video-gen-mobile-player"
                        showDownload={hasToken}
                        downloadDisabled={
                          !hasToken
                          || !gen.taskId
                          || gen.status !== 'completed'
                          || !gen.videoUrl
                          || videoDownloading
                        }
                        downloadLabel={videoDownloading ? t('chat.videoGenDownloading') : t('chat.videoGenDownload')}
                        downloading={videoDownloading}
                        onDownload={() => void handleDownloadVideo(gen)}
                        onVideoError={() => {
                          // 播放失败不直接定性：重新探一次，探通了就恢复播放。
                          // 浏览器的解码失败 / 网络抖动都会走这里，绝不能就此判成“资源过期”。
                          // 同一世代最多自动重探 2 次，避免与探测形成死循环。
                          if (!isProbeTarget) return;
                          const rec = videoErrorReprobeRef.current;
                          const count = rec.genId === gen.id ? rec.count : 0;
                          if (count >= 2) {
                            setVideoContentProbe('unavailable');
                            return;
                          }
                          videoErrorReprobeRef.current = { genId: gen.id, count: count + 1 };
                          setVideoContentProbe('checking');
                          setProbeAttempt((n) => n + 1);
                        }}
                      />
                    )
                  ) : gen.status === 'failed' ? (
                    <div className="video-gen-mobile-placeholder">
                      {gen.errorMessage || t('chat.videoStatusFailed')}
                    </div>
                  ) : gen.status === 'unknown' && !gen.taskId ? (
                    <div className="video-gen-mobile-placeholder">
                      {t('chat.videoGenDraftHint')}
                    </div>
                  ) : (
                    <div className="video-gen-mobile-placeholder">
                      <div className="video-gen-run video-gen-run--mobile">
                        <div className="video-gen-run__status">
                          <span className="chat-spinner video-gen-run__spinner" />
                          <span>{progressHint(gen.status === 'queued' ? 'queued' : 'in_progress')}</span>
                        </div>
                        {typeof gen.progress === 'number' && (
                          <div className="video-gen-run__progress">
                            <span className="video-gen-run__progress-label">{t('chat.videoGenProgressLabel')}</span>
                            <span className="video-gen-run__progress-track">
                              <span
                                className="video-gen-run__progress-fill"
                                style={{ width: `${Math.max(0, Math.min(100, Math.round(gen.progress)))}%` }}
                              />
                            </span>
                            <span className="video-gen-run__progress-value">
                              {Math.max(0, Math.min(100, Math.round(gen.progress)))}%
                            </span>
                          </div>
                        )}
                        {gen.pollWarning ? (
                          <p className="video-gen-poll-warning">{gen.pollWarning}</p>
                        ) : null}
                        {gen.taskId ? <VideoGenTaskMeta taskId={gen.taskId} /> : null}
                        <VideoGenCancelButton
                          gen={gen}
                          cancelling={Boolean(gen.taskId && cancellingTaskIds.has(gen.taskId))}
                          onCancel={() => {
                            if (!activeSessionId) return;
                            void cancelGeneration(activeSessionId, gen);
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {gen.status === 'completed' && gen.videoUrl && (
                    <p className="video-gen-result-footnote">{t('chat.videoGenVideoRetentionHint')}</p>
                  )}
                  {/* 进行中的任务 ID 已收进气泡底部（方案 B），这里只补终态，避免重复两遍 */}
                  {gen.taskId && (gen.status === 'completed' || gen.status === 'failed') ? (
                    <VideoGenTaskMeta taskId={gen.taskId} />
                  ) : null}
                </div>
              );
            })}

            <div className="video-gen-mobile-card">
              <div className="video-gen-mobile-field-row">
                <span>{t('chat.models')}</span>
                <div className="model-picker-wrap model-picker-wrap--composer">
                  <ComposerModelPicker
                    open={videoModelPickerOpen}
                    onOpenChange={onVideoModelPopoverOpenChange}
                    disabled={!hasToken || isComposerSubmitting || videoPricingAll.length === 0}
                    pickModelHighlight={hasToken && !selectedModel}
                    pillLabel={videoComposerPillLabel}
                    pillEmpty={!selectedModel}
                    selectModelAriaLabel={t('chat.selectModel')}
                    {...videoComposerPickerPanelProps}
                  />
                </div>
              </div>
              {composerModeOptions.length > 0 ? (
                <div className="video-gen-mobile-field-row">
                  <span>{t('chat.videoGenModeLabel')}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {composerModeOptions.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={videoGenMode === mode ? 'video-gen-mobile-mode-btn is-active' : 'video-gen-mobile-mode-btn'}
                        disabled={!hasToken || isComposerSubmitting}
                        onClick={() => applyVideoGenMode(mode)}
                      >
                        {t(videoGenModeI18nKey(mode))}
                      </button>
                    ))}
                  </div>
                </div>
              ) : happyHorseMode ? (
                <div className="video-gen-mobile-field-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <span>{t(`chat.videoGenHappyHorseMode_${happyHorseMode}` as 'chat.videoGenHappyHorseMode_t2v')}</span>
                  {happyHorseMode === 't2v' ? (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chat.videoGenHappyHorseT2vHint')}</span>
                  ) : null}
                  {happyHorseMode === 'i2v' ? (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chat.videoGenHappyHorseI2vHint')}</span>
                  ) : null}
                  {happyHorseMode === 'r2v' ? (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chat.videoGenHappyHorseR2vHint')}</span>
                  ) : null}
                  {happyHorseMode === 'video-edit' ? (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('chat.videoGenHappyHorseVideoEditHint')}</span>
                  ) : null}
                </div>
              ) : null}
              <details className="video-gen-mobile-details">
                <summary>
                  {t('chat.videoGenVisualMenu')}: {videoResolutionDraft}
                  {videoAspectRatioOptions.length > 0 ? ` · ${videoAspectRatioDraft}` : ''}
                </summary>
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>{t('chat.videoGenResolutionLabel')}</div>
                    <div className="video-gen-mobile-segment">
                      {videoResolutionOptions.map((x) => (
                        <button key={x} type="button" className={videoResolutionDraft === x ? 'is-active' : ''} onClick={() => setVideoResolutionDraft(x)} disabled={!hasToken || isComposerSubmitting}>{x}</button>
                      ))}
                    </div>
                  </div>
                  {videoAspectRatioOptions.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>{t('chat.videoGenAspectRatioLabel')}</div>
                      <div className="video-gen-mobile-segment">
                        {videoAspectRatioOptions.map((x) => (
                          <button key={x} type="button" className={videoAspectRatioDraft === x ? 'is-active' : ''} onClick={() => setVideoAspectRatioDraft(x)} disabled={!hasToken || isComposerSubmitting}>{x}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
              <div className="video-gen-mobile-field-row">
                <span>{t('chat.videoGenDurationLabel')}</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={videoDurationDraft}
                    disabled={!hasToken || isComposerSubmitting}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (/^\d{0,2}$/.test(raw)) setVideoDurationDraft(raw);
                    }}
                    onBlur={() => {
                      setVideoDurationDraft(String(clampDurationRange(parseVideoDurationDraft(videoDurationDraft), durationMinSec, durationMaxSec)));
                    }}
                    style={{
                      width: 56,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      padding: '0 8px',
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>s</span>
                </div>
              </div>
              {showComposerMediaSlots ? (
              <div className="video-gen-mobile-slots">
                {happyHorseMode === 'video-edit' ? (
                  <ComposerUploadZone
                    mode="multi-ref"
                    variant="mobile"
                    attachments={composerZoneAttachments}
                    maxCount={omniRefMaxCount}
                    disabled={!hasToken || isComposerSubmitting}
                    onTriggerPick={() => attachmentInputRef.current?.click()}
                    onRemove={(id) => setPendingAttachments((prev) => prev.filter((x) => x.id !== id))}
                  />
                ) : isPromptOnlyComposer ? null : isFrameGenMode(videoGenMode) ? (
                  <ComposerUploadZone
                    mode="frames"
                    layout={frameUploadLayout}
                    variant="mobile"
                    disabled={!hasToken || isComposerSubmitting}
                    firstFrame={firstFrameAttachment}
                    lastFrame={lastFrameAttachment}
                    firstLabel={frameFirstLabel}
                    lastLabel={t('chat.videoGenLastFrame')}
                    onTriggerPickFirst={() => frameFirstInputRef.current?.click()}
                    onTriggerPickLast={() => frameLastInputRef.current?.click()}
                    onRemoveFirst={() => setFirstFrameAttachment(null)}
                    onRemoveLast={() => setLastFrameAttachment(null)}
                  />
                ) : (
                  <ComposerUploadZone
                    mode="multi-ref"
                    variant="mobile"
                    attachments={composerZoneAttachments}
                    maxCount={omniRefMaxCount}
                    disabled={!hasToken || isComposerSubmitting}
                    onTriggerPick={() => attachmentInputRef.current?.click()}
                    onRemove={(id) => setPendingAttachments((prev) => prev.filter((x) => x.id !== id))}
                  />
                )}
              </div>
              ) : null}
            </div>
          </div>

          <div className="video-gen-mobile-bottom">
            <div className="chat-input-wrap" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="chat-input-box">
                <Input.TextArea
                  id="video-gen-prompt-mobile"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  aria-label={t('chat.placeholderVideoGen')}
                  placeholder={
                    isFrameGenMode(videoGenMode)
                      ? t('chat.placeholderVideoGenFirstLast')
                      : t('chat.placeholderVideoGen')
                  }
                  disabled={!hasToken || isComposerSubmitting}
                  autoSize={{ minRows: 1, maxRows: 8 }}
                  variant="borderless"
                  className="chat-mobile-composer-ant-input"
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                />
              </div>
            </div>
            <Button type="primary" block size="large" className="video-gen-mobile-submit-antd" onClick={() => void handleSubmit()} disabled={!canSubmit} loading={isComposerSubmitting}>
              {t('chat.videoGenSubmit')}
            </Button>
          </div>
        </div>
        <input ref={frameFirstInputRef} type="file" accept={isMiniMaxH3 ? MINIMAX_H3_IMAGE_ACCEPT : 'image/*'} style={{ display: 'none' }} onChange={(e) => handleFrameSlotPick(e, 'first')} />
        <input ref={frameLastInputRef} type="file" accept={isMiniMaxH3 ? MINIMAX_H3_IMAGE_ACCEPT : 'image/*'} style={{ display: 'none' }} onChange={(e) => handleFrameSlotPick(e, 'last')} />
        <input ref={attachmentInputRef} type="file" accept={composerAttachmentAccept} multiple style={{ display: 'none' }} onChange={handleAttachmentPick} />
        {imageLightboxUrl && (
          <div className="chat-image-lightbox" role="dialog" aria-modal="true" onClick={() => setImageLightboxUrl(null)}>
            <button type="button" className="chat-image-lightbox__close" onClick={(e) => { e.stopPropagation(); setImageLightboxUrl(null); }}>×</button>
            <img src={imageLightboxUrl} alt="" className="chat-image-lightbox__img" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-root">
        <div className={`chat-body video-gen-body${sidebarCollapsed ? ' chat-body--sidebar-collapsed' : ''}`}>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? t('chat.showSidebar') : t('chat.hideSidebar')}
            title={sidebarCollapsed ? t('chat.showSidebar') : t('chat.hideSidebar')}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
          <aside className={`chat-sidebar${sidebarCollapsed ? ' chat-sidebar--collapsed' : ''}`}>
            <div className="chat-sidebar-shell">
              <div className="sidebar-header">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  block
                  className="chat-sidebar-new-btn"
                  onClick={handleCreateNewVideoHistory}
                >
                  {t('newChat')}
                </Button>
                <div className="sidebar-search">
                  <span className="sidebar-search-icon"><SearchOutlined style={{ fontSize: 14 }} /></span>
                  <input value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder={t('chat.searchRooms')} className="sidebar-search-input" />
                </div>
              </div>
              <div className="sidebar-list">
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className={convSidebarClass(session.id === activeSessionId || renamingSessionId === session.id)}
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    {renamingSessionId === session.id ? (
                      <ConvSidebarRenameInput
                        ref={renameSessionInputRef}
                        value={renameSessionValue}
                        onChange={setRenameSessionValue}
                        onCommit={() => commitSessionRename(session.id, renameSessionValue)}
                        onCancel={() => setRenamingSessionId(null)}
                      />
                    ) : (
                      <>
                        <span className="sidebar-item-title">{session.title}</span>
                        <ConvSidebarMoreMenu
                          onRename={() => {
                            setRenamingSessionId(session.id);
                            setRenameSessionValue(session.title);
                          }}
                          onDelete={() => deleteSession(session.id)}
                        />
                      </>
                    )}
                  </div>
                ))}
                {filteredSessions.length === 0 && <div className="sidebar-empty">{t('chat.noConversations')}</div>}
              </div>
            </div>
          </aside>

          <main className="chat-main video-gen-main">
            <div className="chat-main-shell">
              {!hasToken && (
                <div className="chat-token-notice">
                  <div className="chat-token-notice__content"><div className="chat-token-notice__title">{t('chat.missingTokenTitle')}</div><div className="chat-token-notice__desc">{t('chat.missingTokenDescShort')}</div></div>
                  <div className="chat-token-notice__actions"><button className="chat-token-notice__btn chat-token-notice__btn--primary" onClick={() => navigate('/tokens')}>{t('chat.goConfigureToken')}</button></div>
                </div>
              )}
              <header className="chat-main-title-bar">
                <h1 className="chat-main-title">{activeSession?.title || t('chat.newChatTitle')}</h1>
              </header>
              {showVideoCenteredWelcome ? (
                <section className="chat-welcome-pane" aria-label={videoWelcomeAriaLabel}>
                  {videoCenteredWelcomeEl}
                </section>
              ) : (
                <div
                  className="chat-messages-area"
                  style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}
                >
                  <div
                    ref={messagesScrollRef}
                    className="chat-messages-inner"
                    onScroll={handleVideoGenMessagesScroll}
                  >
                    {activeSession!.generations.map((gen) => {
                      const isProbeTarget = probeTargetGen?.id === gen.id;
                      void attachmentPreviewCacheEpoch;
                      const userMediaItems = mapGenerationAttachmentsToMediaItems(gen.id, gen.attachments);
                      return (
                        <div key={gen.id} className="message-group message-group--video-gen">
                          <div className="msg-row msg-row--user">
                            <div className="msg-avatar msg-avatar--user" aria-hidden>
                              {user?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="msg-user-content-col">
                              {(gen.prompt.trim() || userMediaItems.length > 0) ? (
                                <>
                                  {gen.prompt.trim() ? (
                                    <div className="msg-bubble msg-bubble--user">{gen.prompt}</div>
                                  ) : (
                                    <div className="msg-bubble msg-bubble--user" style={{ opacity: 0.9 }}>
                                      {t('chat.videoGenRefOnlyPrompt')}
                                    </div>
                                  )}
                                  {userMediaItems.length > 0 && (
                                    <div className="msg-user-attachments-below msg-user-attachments-below--after-bubble">
                                      <UserMessageAttachmentsStrip
                                        key={`${gen.id}-previews-${attachmentPreviewCacheEpoch}`}
                                        items={userMediaItems}
                                      />
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="msg-bubble msg-bubble--user" style={{ opacity: 0.88 }}>
                                  {t('chat.videoGenNoPromptYet')}
                                </div>
                              )}
                              <VideoGenUserActions text={gen.prompt} />
                            </div>
                          </div>

                          <div className="msg-row msg-row--assistant">
                            <div className="video-gen-result">
                            <div className="msg-block-head">
                              <div className="msg-avatar msg-avatar--ai" aria-hidden>
                                <ModelIcon
                                  label={(gen.model || '').split('/').pop() || gen.model}
                                  iconName={resolveVideoModelIconName(gen.model)}
                                  className="msg-model-icon"
                                />
                              </div>
                              <div className="msg-ai-model-name">
                                {(gen.model || '').split('/').pop() || gen.model}
                                <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--text-tertiary)' }}>
                                  · {gen.duration}s · {gen.resolution} · {gen.aspectRatio}
                                  {' · '}
                                  {formatVideoGenerationModeLabel(gen, t)}
                                </span>
                                {/* JSX语法导致构建失败吗? */}
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    color: statusTone(gen.status).labelColor,
                                    background: statusTone(gen.status).bgColor,
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {statusTone(gen.status).text}
                                </span>
                              </div>
                            </div>
                              {gen.status === 'completed' && gen.videoUrl ? (
                                !hasToken ? (
                                  <div className="msg-ai-media">
                                    <VideoGenResultVideo
                                      src={gen.videoUrl}
                                      videoClassName="msg-ai-media-video"
                                      showDownload={false}
                                      downloadDisabled
                                      downloadLabel={t('chat.videoGenDownload')}
                                      onDownload={() => {}}
                                    />
                                  </div>
                                ) : isProbeTarget && (videoContentProbe === 'idle' || videoContentProbe === 'checking') ? (
                                  <div className="msg-bubble msg-bubble--ai" style={{ textAlign: 'center', padding: '28px 12px' }}>
                                    <VideoGenWaiting text={t('chat.videoGenVideoChecking')} />
                                  </div>
                                ) : isProbeTarget && videoContentProbe === 'pending' ? (
                                  <div className="msg-bubble msg-bubble--ai" style={{ textAlign: 'center', padding: '28px 12px' }}>
                                    <VideoGenWaiting text={t('chat.videoGenVideoStoring')} />
                                  </div>
                                ) : isProbeTarget && videoContentProbe === 'not_found' ? (
                                  <div className="msg-bubble msg-bubble--ai" style={{ color: 'var(--text-secondary)' }}>
                                    {t('chat.videoGenVideoNotFound')}
                                  </div>
                                ) : isProbeTarget && videoContentProbe === 'unavailable' ? (
                                  <div className="msg-bubble msg-bubble--ai" style={{ color: 'var(--text-secondary)' }}>
                                    {t('chat.videoGenVideoUnavailable')}
                                    <button
                                      type="button"
                                      className="video-gen-probe-retry"
                                      onClick={() => {
                                        // 手动重试是用户明确要求，重置自动重探计数
                                        videoErrorReprobeRef.current = { genId: gen.id, count: 0 };
                                        setVideoContentProbe('checking');
                                        setProbeAttempt((n) => n + 1);
                                      }}
                                    >
                                      {t('chat.videoGenRetryLoad')}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="msg-ai-media">
                                    <VideoGenResultVideo
                                      src={gen.videoUrl}
                                      videoClassName="msg-ai-media-video"
                                      showDownload={hasToken}
                                      downloadDisabled={
                                        !hasToken
                                        || !gen.taskId
                                        || gen.status !== 'completed'
                                        || !gen.videoUrl
                                        || videoDownloading
                                      }
                                      downloadLabel={videoDownloading ? t('chat.videoGenDownloading') : t('chat.videoGenDownload')}
                                      downloading={videoDownloading}
                                      onDownload={() => void handleDownloadVideo(gen)}
                                      onVideoError={() => {
                                        // 播放失败只触发重新探测，不本地定性；
                                        // 但同一世代最多自动重探 2 次，避免“探测 200 → 浏览器解码失败 → 再探测”死循环
                                        if (!isProbeTarget) return;
                                        const rec = videoErrorReprobeRef.current;
                                        const count = rec.genId === gen.id ? rec.count : 0;
                                        if (count >= 2) {
                                          setVideoContentProbe('unavailable');
                                          return;
                                        }
                                        videoErrorReprobeRef.current = { genId: gen.id, count: count + 1 };
                                        setVideoContentProbe('checking');
                                        setProbeAttempt((n) => n + 1);
                                      }}
                                    />
                                  </div>
                                )
                              ) : gen.status === 'failed' ? (
                                <div className="msg-bubble msg-bubble--ai" style={{ color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca', whiteSpace: 'pre-wrap' }}>
                                  {gen.errorMessage || t('chat.videoStatusFailed')}
                                </div>
                              ) : gen.status === 'unknown' && !gen.taskId ? (
                                <div className="msg-bubble msg-bubble--ai" style={{ color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                  {t('chat.videoGenDraftHint')}
                                </div>
                              ) : (
                                <div className="msg-bubble msg-bubble--ai video-gen-run">
                                  <div className="video-gen-run__status">
                                    <span className="chat-spinner video-gen-run__spinner" />
                                    <span>{progressHint(gen.status === 'queued' ? 'queued' : 'in_progress')}</span>
                                  </div>
                                  {typeof gen.progress === 'number' && (
                                    <div className="video-gen-run__progress">
                                      <span className="video-gen-run__progress-label">{t('chat.videoGenProgressLabel')}</span>
                                      <span className="video-gen-run__progress-track">
                                        <span
                                          className="video-gen-run__progress-fill"
                                          style={{ width: `${Math.max(0, Math.min(100, Math.round(gen.progress)))}%` }}
                                        />
                                      </span>
                                      <span className="video-gen-run__progress-value">
                                        {Math.max(0, Math.min(100, Math.round(gen.progress)))}%
                                      </span>
                                    </div>
                                  )}
                                  {gen.pollWarning ? (
                                    <p className="video-gen-poll-warning">{gen.pollWarning}</p>
                                  ) : null}
                                  {gen.taskId ? <VideoGenTaskMeta taskId={gen.taskId} /> : null}
                                  <VideoGenCancelButton
                                    gen={gen}
                                    cancelling={Boolean(gen.taskId && cancellingTaskIds.has(gen.taskId))}
                                    onCancel={() => {
                                      if (!activeSessionId) return;
                                      void cancelGeneration(activeSessionId, gen);
                                    }}
                                  />
                                </div>
                              )}
                              {gen.status === 'completed' && gen.videoUrl && (
                                <p className="video-gen-result-footnote">{t('chat.videoGenVideoRetentionHint')}</p>
                              )}
                              {/* 进行中的任务 ID 已收进气泡底部（方案 B），这里只补终态，避免重复两遍 */}
                              {gen.taskId && (gen.status === 'completed' || gen.status === 'failed') ? (
                                <VideoGenTaskMeta taskId={gen.taskId} />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="chat-composer-pane">
                <div className={`chat-input-area${showVideoCenteredWelcome ? ' chat-input-area--text-welcome' : ''}`}>
                  <div className="chat-input-wrap">
                    <div
                      className={[
                        'chat-input-box',
                        'video-gen-input-box',
                        useOmniComposerChrome ? 'video-gen-input-box--omni' : '',
                        isFrameComposerLayout ? 'video-gen-input-box--frames' : '',
                        isFrameComposerFirstOnly ? 'video-gen-input-box--frames-first-only' : '',
                        isPromptOnlyComposer ? 'video-gen-input-box--prompt-only' : '',
                        hasSyncedMediaComposerRow ? 'video-gen-input-box--media-row' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div
                        className={[
                          'video-gen-composer-top',
                          useOmniComposerChrome ? 'video-gen-composer-top--omni' : '',
                          isFrameComposerLayout ? 'video-gen-composer-top--frames' : '',
                          isFrameComposerFirstOnly ? 'video-gen-composer-top--frames-first-only' : '',
                          isPromptOnlyComposer ? 'video-gen-composer-top--prompt-only' : '',
                          hasSyncedMediaComposerRow ? 'video-gen-composer-top--media-row' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {showComposerMediaSlots ? (
                        <div className="video-gen-composer-slots">
                          {happyHorseMode === 'video-edit' ? (
                            <div className="video-gen-omni-ref-anchor">
                              <ComposerUploadZone
                                mode="multi-ref"
                                variant="desktop"
                                attachments={composerZoneAttachments}
                                maxCount={omniRefMaxCount}
                                disabled={!hasToken || isComposerSubmitting}
                                onTriggerPick={() => attachmentInputRef.current?.click()}
                                onRemove={(id) => setPendingAttachments((prev) => prev.filter((x) => x.id !== id))}
                              />
                            </div>
                          ) : isPromptOnlyComposer ? null : isFrameGenMode(videoGenMode) ? (
                            <ComposerUploadZone
                              mode="frames"
                              layout={frameUploadLayout}
                              variant="desktop"
                              disabled={!hasToken || isComposerSubmitting}
                              firstFrame={firstFrameAttachment}
                              lastFrame={lastFrameAttachment}
                              firstLabel={frameFirstLabel}
                              lastLabel={t('chat.videoGenLastFrame')}
                              onTriggerPickFirst={() => frameFirstInputRef.current?.click()}
                              onTriggerPickLast={() => frameLastInputRef.current?.click()}
                              onRemoveFirst={() => setFirstFrameAttachment(null)}
                              onRemoveLast={() => setLastFrameAttachment(null)}
                            />
                          ) : (
                            <div className="video-gen-omni-ref-anchor">
                              <ComposerUploadZone
                                mode="multi-ref"
                                variant="desktop"
                                attachments={composerZoneAttachments}
                                maxCount={omniRefMaxCount}
                                disabled={!hasToken || isComposerSubmitting}
                                onTriggerPick={() => attachmentInputRef.current?.click()}
                                onRemove={(id) => setPendingAttachments((prev) => prev.filter((x) => x.id !== id))}
                              />
                            </div>
                          )}
                        </div>
                        ) : null}
                        <textarea
                          id="video-gen-prompt"
                          ref={promptRef}
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          rows={1}
                          className="chat-textarea"
                          aria-label={t('chat.placeholderVideoGen')}
                          placeholder={
                            videoGenMode === 'first_last'
                              ? t('chat.placeholderVideoGenFirstLast')
                              : t('chat.placeholderVideoGen')
                          }
                          disabled={!hasToken || isComposerSubmitting}
                          onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                          }}
                        />
                      </div>

                      <input ref={frameFirstInputRef} type="file" accept={isMiniMaxH3 ? MINIMAX_H3_IMAGE_ACCEPT : 'image/*'} style={{ display: 'none' }} onChange={(e) => handleFrameSlotPick(e, 'first')} />
                      <input ref={frameLastInputRef} type="file" accept={isMiniMaxH3 ? MINIMAX_H3_IMAGE_ACCEPT : 'image/*'} style={{ display: 'none' }} onChange={(e) => handleFrameSlotPick(e, 'last')} />
                      <input ref={attachmentInputRef} type="file" accept={composerAttachmentAccept} multiple style={{ display: 'none' }} onChange={handleAttachmentPick} />

                      <ComposerToolbar
                        variant="video"
                        modelPicker={
                          <div className="model-picker-wrap model-picker-wrap--composer">
                            <ComposerModelPicker
                              open={videoModelPickerOpen}
                              onOpenChange={onVideoModelPopoverOpenChange}
                              disabled={!hasToken || isComposerSubmitting || videoPricingAll.length === 0}
                              pickModelHighlight={hasToken && !selectedModel}
                              pillLabel={videoComposerPillLabel}
                              pillEmpty={!selectedModel}
                              selectModelAriaLabel={t('chat.selectModel')}
                              {...videoComposerPickerPanelProps}
                            />
                          </div>
                        }
                        afterModel={
                          <>
                            {composerModeOptions.length > 0 ? (
                              <div className="video-gen-dropdown-wrap">
                                <button
                                  type="button"
                                  className="video-gen-toolbar-pill"
                                  disabled={!hasToken || isComposerSubmitting}
                                  onClick={() => {
                                    setModeMenuOpen((v) => !v);
                                    setVisualMenuOpen(false);
                                    setDurationMenuOpen(false);
                                  }}
                                >
                                  {t(videoGenModeI18nKey(videoGenMode))}
                                  <DownOutlined style={{ fontSize: 14 }} />
                                </button>
                                {modeMenuOpen && (
                                  <>
                                    <div className="video-gen-dropdown-overlay" onClick={() => setModeMenuOpen(false)} />
                                    <div className="video-gen-dropdown-panel video-gen-dropdown-panel--mode">
                                      {composerModeOptions.map((mode) => (
                                        <button
                                          key={mode}
                                          type="button"
                                          className={`video-gen-dropdown-item${videoGenMode === mode ? ' is-active' : ''}`}
                                          onClick={() => applyVideoGenMode(mode)}
                                        >
                                          {t(videoGenModeI18nKey(mode))}
                                          {videoGenMode === mode ? <span className="video-gen-dropdown-check">✓</span> : null}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : happyHorseMode ? (
                              <span className="video-gen-toolbar-pill video-gen-toolbar-pill--static" title={t(`chat.videoGenHappyHorseMode_${happyHorseMode}` as 'chat.videoGenHappyHorseMode_t2v')}>
                                {t(`chat.videoGenHappyHorseMode_${happyHorseMode}` as 'chat.videoGenHappyHorseMode_t2v')}
                              </span>
                            ) : null}

                            <div className="video-gen-dropdown-wrap">
                              <button
                                type="button"
                                className="video-gen-toolbar-pill"
                                disabled={!hasToken || isComposerSubmitting}
                                onClick={() => {
                                  setVisualMenuOpen((v) => !v);
                                  setModeMenuOpen(false);
                                  setDurationMenuOpen(false);
                                }}
                              >
                                {t('chat.videoGenVisualMenu')}
                                <span className="video-gen-toolbar-pill-sub">
                                  {videoResolutionDraft}
                                  {videoAspectRatioOptions.length > 0 ? ` · ${videoAspectRatioDraft}` : ''}
                                </span>
                                <DownOutlined style={{ fontSize: 14 }} />
                              </button>
                              {visualMenuOpen && (
                                <>
                                  <div className="video-gen-dropdown-overlay" onClick={() => setVisualMenuOpen(false)} />
                                  <div className="video-gen-dropdown-panel video-gen-dropdown-panel--visual">
                                    <div className="video-gen-visual-section-title">{t('chat.videoGenResolutionLabel')}</div>
                                    <div className="video-gen-visual-grid video-gen-visual-grid--3">
                                      {videoResolutionOptions.map((x) => (
                                        <button
                                          key={x}
                                          type="button"
                                          className={`video-gen-visual-chip${videoResolutionDraft === x ? ' is-active' : ''}`}
                                          onClick={() => setVideoResolutionDraft(x)}
                                        >
                                          {x}
                                        </button>
                                      ))}
                                    </div>
                                    {videoAspectRatioOptions.length > 0 ? (
                                      <>
                                        <div className="video-gen-visual-section-title">{t('chat.videoGenAspectRatioLabel')}</div>
                                        <div className="video-gen-visual-grid video-gen-visual-grid--4">
                                          {videoAspectRatioOptions.map((x) => (
                                            <button
                                              key={x}
                                              type="button"
                                              className={`video-gen-visual-chip${videoAspectRatioDraft === x ? ' is-active' : ''}`}
                                              onClick={() => setVideoAspectRatioDraft(x)}
                                            >
                                              {x}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="video-gen-dropdown-wrap">
                              <button
                                type="button"
                                className="video-gen-toolbar-pill"
                                disabled={!hasToken || isComposerSubmitting}
                                onClick={() => {
                                  setDurationMenuOpen((v) => !v);
                                  setModeMenuOpen(false);
                                  setVisualMenuOpen(false);
                                }}
                              >
                                {clampDurationRange(parseVideoDurationDraft(videoDurationDraft), durationMinSec, durationMaxSec)}s
                                <DownOutlined style={{ fontSize: 14 }} />
                              </button>
                              {durationMenuOpen && (
                                <>
                                  <div className="video-gen-dropdown-overlay" onClick={() => setDurationMenuOpen(false)} />
                                  <div className="video-gen-dropdown-panel video-gen-dropdown-panel--duration">
                                    {Array.from(
                                      { length: durationMaxSec - durationMinSec + 1 },
                                      (_, i) => durationMinSec + i,
                                    ).map((sec) => (
                                      <button
                                        key={sec}
                                        type="button"
                                        className={`video-gen-dropdown-item${clampDurationRange(parseVideoDurationDraft(videoDurationDraft), durationMinSec, durationMaxSec) === sec ? ' is-active' : ''}`}
                                        onClick={() => {
                                          setVideoDurationDraft(String(sec));
                                          setDurationMenuOpen(false);
                                        }}
                                      >
                                        {sec}s
                                        {clampDurationRange(parseVideoDurationDraft(videoDurationDraft), durationMinSec, durationMaxSec) === sec ? <span className="video-gen-dropdown-check">✓</span> : null}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        }
                        trailing={
                          <>
                            <button
                              type="button"
                              className="input-tool-btn"
                              onClick={() => {
                                void pollCurrentTask();
                                void pollAllPendingTasks();
                              }}
                              disabled={!hasToken || !currentSessionHasPending}
                              title={t('chat.videoGenPollNowTitle')}
                            >
                              <ReloadOutlined style={{ fontSize: 14 }} />
                            </button>
                            <button
                              type="button"
                              className="chat-send-btn"
                              onClick={() => void handleSubmit()}
                              disabled={!canSubmit}
                              title={t('sendMessage')}
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
                          </>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
      {imageLightboxUrl && (
        <div className="chat-image-lightbox" role="dialog" aria-modal="true" onClick={() => setImageLightboxUrl(null)}>
          <button type="button" className="chat-image-lightbox__close" onClick={(e) => { e.stopPropagation(); setImageLightboxUrl(null); }}>×</button>
          <img src={imageLightboxUrl} alt="" className="chat-image-lightbox__img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
//王璟琪
