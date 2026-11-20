import { notifyApiError } from '../lib/notifyApi';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  GlobalOutlined,
  PlusOutlined,
  SearchOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Select, Spin } from 'antd';
import type { InputRef } from 'antd';

import { getTokenKey, getTokens } from '../api';
import { pickPreferredToken } from '../components/token/tokenDisplay';
import { useUser } from '../contexts/UserContext';
import { fetchCatalogPickerModels } from '../features/chat/catalogPickerModels';
import { buildSpeechWelcomePaneProps, SPEECH_WELCOME_CARD_VOICE_MAP } from '../features/speechGen/buildSpeechWelcomePaneProps';
import { createSpeech } from '../features/speechGen/speechApi';
import { findTtsVoice, normalizeTtsVoice, pickVoiceText } from '../features/speechGen/qwenTtsVoices';
import { runSpeechSubmitGate } from '../features/speechGen/speechSubmitGate';
import type { SpeechGeneration, SpeechLanguageType, SpeechSession } from '../features/speechGen/speechTypes';
import {
  ComposerModelPicker,
  ModelIcon,
  modalityCategory,
  resolveModelIconName,
  type PricingModelRow,
} from '../components/model-picker';
import { ComposerToolbar } from '../components/composer-toolbar';
import { ChatWelcomePane, chatWelcomePaneAriaLabel } from '../components/chat-welcome';
import type { WelcomeApplyPayload } from '../components/chat-welcome';
import { SpeechGenAudioPlayer, SpeechVoiceAvatar, SpeechVoicePickerModal } from '../components/speech-gen';
import { ConvSidebarMoreMenu } from '../components/conv-sidebar-more-menu/ConvSidebarMoreMenu';
import { ConvSidebarRenameInput } from '../components/conv-sidebar-more-menu/ConvSidebarRenameInput';
import { convSidebarClass } from '../ui/selectableNav';
import { notify } from '../ui/notify';
import { clearMessagesScrollCache, useMessagesScroll } from '../hooks/useMessagesScroll';
import {
  createBlankSpeechSession,
  finalizeInterruptedSpeechSessions,
  genSpeechGenerationId,
  loadPersistedActiveSessionId,
  loadSpeechComposerPrefs,
  loadSpeechSessions,
  runSpeechSessionMutation,
  savePersistedActiveSessionId,
  saveSpeechComposerPrefs,
  saveSpeechSessions,
  sessionTitleFromText,
  shouldSkipSpeechPersistSync,
  subscribeSpeechPersist,
  updateSpeechGenerationInStorage,
} from './speech/speechGenSession';
import './chat-page.css';
import './speech-gen.css';

const SPEECH_TEXT_MAX = 5000;

const SPEECH_LANGUAGE_OPTIONS: { value: SpeechLanguageType; labelKey: string }[] = [
  { value: 'Auto', labelKey: 'speechGen.langAuto' },
  { value: 'Chinese', labelKey: 'speechGen.langChinese' },
  { value: 'English', labelKey: 'speechGen.langEnglish' },
  { value: 'German', labelKey: 'speechGen.langGerman' },
  { value: 'Italian', labelKey: 'speechGen.langItalian' },
  { value: 'Portuguese', labelKey: 'speechGen.langPortuguese' },
  { value: 'Spanish', labelKey: 'speechGen.langSpanish' },
  { value: 'Japanese', labelKey: 'speechGen.langJapanese' },
  { value: 'Korean', labelKey: 'speechGen.langKorean' },
  { value: 'French', labelKey: 'speechGen.langFrench' },
  { value: 'Russian', labelKey: 'speechGen.langRussian' },
];

function statusTone(status: SpeechGeneration['status'], t: (k: string) => string) {
  if (status === 'completed') {
    return { text: t('chat.videoStatusCompleted'), labelColor: '#0f766e', bgColor: '#ccfbf1', className: 'speech-gen-status-tag--ok' };
  }
  if (status === 'failed') {
    return { text: t('speechGen.statusFailed'), labelColor: '#b91c1c', bgColor: '#fee2e2', className: 'speech-gen-status-tag--failed' };
  }
  return { text: t('speechGen.statusGenerating'), labelColor: '#a16207', bgColor: '#fef9c3', className: 'speech-gen-status-tag--pending' };
}

export default function SpeechGen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useUser();
  const userId = user?.id;

  const [sessions, setSessions] = useState<SpeechSession[]>(() => loadSpeechSessions(userId));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const initial = loadSpeechSessions(userId);
    const saved = loadPersistedActiveSessionId(userId);
    if (saved && initial.some((s) => s.id === saved)) return saved;
    return initial[0]?.id ?? null;
  });

  const savedPrefs = loadSpeechComposerPrefs(userId);
  const [tokenKey, setTokenKey] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [pricingModels, setPricingModels] = useState<PricingModelRow[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    typeof savedPrefs?.model === 'string' ? savedPrefs.model : '',
  );
  const [selectedVoice, setSelectedVoice] = useState(
    () => normalizeTtsVoice(savedPrefs?.voice),
  );
  const [languageType, setLanguageType] = useState<SpeechLanguageType>(
    (typeof savedPrefs?.languageType === 'string' ? savedPrefs.languageType : 'Auto') as SpeechLanguageType,
  );
  const [modelSearch, setModelSearch] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [submittingSessionId, setSubmittingSessionId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const renameSessionInputRef = useRef<InputRef>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const sessionsRef = useRef(sessions);

  const isComposerSubmitting = submittingSessionId != null && submittingSessionId === activeSessionId;

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const showCenteredWelcome = !activeSession || activeSession.generations.length === 0;

  const {
    onScroll: handleMessagesScroll,
    scrollToEnd,
    scrollIfStuckToBottom,
  } = useMessagesScroll({
    scrollRef: messagesScrollRef,
    sessionId: activeSessionId,
    scopeKey: 'speech',
    userId,
    contentLength: activeSession?.generations.length ?? 0,
    showEmpty: showCenteredWelcome,
    viewportKey: isMobileViewport,
  });

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  /** 与视频/文本一致：无会话时补一条空白「新对话」 */
  useLayoutEffect(() => {
    let list = loadSpeechSessions(userId);
    if (list.length === 0) {
      const blank = createBlankSpeechSession(t('chat.newChatTitle'));
      list = [blank];
      saveSpeechSessions(list, userId);
    } else {
      const next = finalizeInterruptedSpeechSessions(list);
      if (list.some((s) => s.generations.some((g) => g.status === 'pending'))) {
        saveSpeechSessions(next, userId);
        list = next;
      }
    }
    setSessions(list);
    sessionsRef.current = list;
    const saved = loadPersistedActiveSessionId(userId);
    const chosen = saved && list.some((s) => s.id === saved) ? saved : list[0]!.id;
    setActiveSessionId(chosen);
  }, [userId, t]);

  useEffect(() => {
    savePersistedActiveSessionId(userId, activeSessionId);
  }, [activeSessionId, userId]);

  useEffect(() => {
    saveSpeechComposerPrefs({ model: selectedModel, voice: selectedVoice, languageType }, userId);
  }, [selectedModel, selectedVoice, languageType, userId]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= 768);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return subscribeSpeechPersist(() => {
      if (shouldSkipSpeechPersistSync()) return;
      setSessions(loadSpeechSessions(userId));
    });
  }, [userId]);

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
    let cancelled = false;
    setTokenLoading(true);
    void (async () => {
      try {
        const res = await getTokens({ p: 0, page_size: 50 });
        if (cancelled) return;
        if (res.data?.success) {
          const items: { id: number; status: number; key?: string; default?: boolean }[] =
            res.data?.data?.items || res.data?.data || [];
          const active = pickPreferredToken(items);
          if (active) {
            try {
              const keyRes = await getTokenKey(active.id);
              const key = keyRes.data?.data?.key || '';
              setTokenKey(key.startsWith('sk-') ? key : `sk-${key}`);
            } catch {
              setTokenKey(null);
            }
          } else {
            setTokenKey(null);
          }
        } else {
          setTokenKey(null);
        }
      } catch {
        if (!cancelled) setTokenKey(null);
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogPickerModels()
      .then((rows) => {
        if (cancelled) return;
        setPricingModels(rows);
        const audioModels = rows.filter((p) => modalityCategory(p.modalities) === 'audio');
        setSelectedModel((prev) => {
          if (prev && audioModels.some((m) => m.model_name === prev)) return prev;
          return audioModels[0]?.model_name ?? '';
        });
      })
      .catch(() => {
        if (!cancelled) setPricingModels([]);
      });
    return () => { cancelled = true; };
  }, []);

  const speechPricingAll = useMemo(
    () => pricingModels
      .filter((p) => modalityCategory(p.modalities) === 'audio')
      .sort((a, b) => a.model_name.localeCompare(b.model_name)),
    [pricingModels],
  );

  const filteredModelsForPicker = useMemo(() => {
    const raw = modelSearch.trim().toLowerCase();
    if (!raw) return speechPricingAll;
    const tokens = raw.split(/\s+/).filter(Boolean);
    return speechPricingAll.filter((p) => {
      const hay = `${p.model_name} ${p.display_name ?? ''} ${p.usage_description ?? ''}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [speechPricingAll, modelSearch]);

  const modelMetaMap = useMemo(() => {
    const map = new Map<string, { displayName: string; img: string }>();
    for (const p of pricingModels) {
      // 图标优先级：内置图标（手动指定 / 名字正则）→ 供应商 logo → other
      const builtinImg = resolveModelIconName(p.model_img, p.model_name);
      const providerKey = (p.provider_key || '').trim();
      map.set(p.model_name, {
        displayName: (p.display_name?.trim()) || p.model_name,
        img: builtinImg !== 'other'
          ? builtinImg
          : (providerKey ? `provider:${providerKey}` : 'other'),
      });
    }
    return map;
  }, [pricingModels]);

  const resolveModelLabel = useCallback((modelName: string) => {
    const meta = modelMetaMap.get(modelName);
    return meta?.displayName || modelName;
  }, [modelMetaMap]);

  const resolveModelIcon = useCallback((modelName: string) => {
    const meta = modelMetaMap.get(modelName);
    return resolveModelIconName(meta?.img, modelName);
  }, [modelMetaMap]);

  const composerPillLabel = useMemo(() => {
    if (!selectedModel) return t('chat.addModelsPromptCenter');
    const short = resolveModelLabel(selectedModel);
    return short.length > 36 ? `${short.slice(0, 34)}…` : short;
  }, [selectedModel, resolveModelLabel, t]);

  const composerPickerPanelProps = useMemo(
    () => ({
      selectionMode: 'single' as const,
      showBulkActions: false,
      selectedModelIds: selectedModel ? [selectedModel] : [],
      totalSelectableModels: speechPricingAll.length,
      resolveModelLabel,
      modelSearch,
      onModelSearchChange: setModelSearch,
      selectionLocked: isComposerSubmitting,
      onClearModels: () => setSelectedModel(''),
      modelsInPickerTab: filteredModelsForPicker,
      onToggleModel: (name: string) => setSelectedModel((prev) => (prev === name ? '' : name)),
      resolveModelIconName: resolveModelIcon,
    }),
    [
      selectedModel,
      speechPricingAll.length,
      resolveModelLabel,
      modelSearch,
      isComposerSubmitting,
      filteredModelsForPicker,
      resolveModelIcon,
    ],
  );

  const filteredSessions = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((session) => {
      const blob = [session.title, ...session.generations.map((g) => `${g.text} ${g.model} ${g.voice}`)].join(' ');
      return blob.toLowerCase().includes(q);
    });
  }, [sessions, sidebarSearch]);

  const selectedVoiceMeta = useMemo(() => findTtsVoice(selectedVoice), [selectedVoice]);

  const speechWelcomeProps = useMemo(() => buildSpeechWelcomePaneProps(t), [t]);

  const applySessionMutation = useCallback((mutator: (prev: SpeechSession[]) => SpeechSession[]) => {
    const { next } = runSpeechSessionMutation(userId, mutator, sessionsRef.current);
    setSessions(next);
    sessionsRef.current = next;
  }, [userId]);

  const handleCreateSession = useCallback(() => {
    const hasComposerDraft = draftText.trim().length > 0;
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
    const blank = createBlankSpeechSession(t('chat.newChatTitle'));
    applySessionMutation((prev) => [blank, ...prev]);
    setActiveSessionId(blank.id);
    setDraftText('');
    setSidebarSearch('');
  }, [activeSessionId, applySessionMutation, draftText, sessions, t]);

  const deleteSession = useCallback((id: string) => {
    const isOnlySession = sessions.length === 1 && sessions[0]?.id === id;
    clearMessagesScrollCache('speech', userId, id);

    if (isOnlySession) {
      const reset = createBlankSpeechSession(t('chat.newChatTitle'));
      clearMessagesScrollCache('speech', userId, reset.id);
      applySessionMutation(() => [reset]);
      setActiveSessionId(reset.id);
      setDraftText('');
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
  }, [activeSessionId, applySessionMutation, sessions, t, userId]);

  const commitSessionRename = useCallback((id: string, title: string) => {
    const nextTitle = title.trim() || t('chat.newChatTitle');
    applySessionMutation((prev) => prev.map((s) => (s.id === id ? { ...s, title: nextTitle } : s)));
    setRenamingSessionId(null);
  }, [applySessionMutation, t]);

  const ensureActiveSession = useCallback(() => {
    if (activeSessionId && sessionsRef.current.some((s) => s.id === activeSessionId)) {
      return activeSessionId;
    }
    const blank = createBlankSpeechSession(t('chat.newChatTitle'));
    applySessionMutation((prev) => [blank, ...prev]);
    setActiveSessionId(blank.id);
    return blank.id;
  }, [activeSessionId, applySessionMutation, t]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        handleCreateSession();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCreateSession]);

  const handleSubmit = useCallback(async () => {
    const text = draftText.trim();
    if (!runSpeechSubmitGate(
      {
        hasToken: Boolean(tokenKey),
        hasModel: Boolean(selectedModel),
        hasVoice: Boolean(selectedVoice),
        hasContent: Boolean(text),
      },
      {
        missingToken: t('chat.missingTokenDescShort'),
        selectModel: t('chat.selectModelFirst'),
        selectVoice: t('speechGen.selectVoicePrompt'),
        enterContent: t('speechGen.enterContentPrompt'),
      },
    )) {
      return;
    }

    const sessionId = ensureActiveSession();
    const genId = genSpeechGenerationId();
    const now = Date.now();
    const pendingGen: SpeechGeneration = {
      id: genId,
      createdAt: now,
      model: selectedModel,
      text,
      voice: selectedVoice,
      languageType,
      status: 'pending',
    };

    applySessionMutation((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      // 与视频/文本对话一致：仅首条生成写入侧栏 title（第一句话）
      const title = s.generations.length === 0
        ? sessionTitleFromText(text, s.title)
        : s.title;
      return { ...s, title, generations: [...s.generations, pendingGen] };
    }));
    setDraftText('');
    setSubmittingSessionId(sessionId);
    scrollToEnd();

    const result = await createSpeech({
      token: tokenKey!,
      model: selectedModel,
      text,
      voice: selectedVoice,
      languageType,
    });

    const { next } = updateSpeechGenerationInStorage(userId, sessionId, genId, (g) => {
      if (!result.ok) {
        return { ...g, status: 'failed', errorMessage: result.message };
      }
      return {
        ...g,
        status: 'completed',
        audioUrl: result.audioUrl,
        requestId: result.requestId,
        usageTotalTokens: result.usageTotalTokens,
      };
    });
    setSessions(next);
    sessionsRef.current = next;
    setSubmittingSessionId(null);
    scrollIfStuckToBottom();

    if (!result.ok) {
      notifyApiError(result.message);
    }
  }, [
    draftText,
    tokenKey,
    selectedModel,
    selectedVoice,
    languageType,
    ensureActiveSession,
    applySessionMutation,
    userId,
    scrollToEnd,
    scrollIfStuckToBottom,
    t,
  ]);

  const handleWelcomeApply = useCallback((payload: WelcomeApplyPayload) => {
    if (payload.kind !== 'text' && payload.kind !== 'image') return;
    const activeHasMessages = activeSessionId != null
      && (sessions.find((s) => s.id === activeSessionId)?.generations.length ?? 0) > 0;
    if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId) || activeHasMessages) {
      handleCreateSession();
    }
    setDraftText(payload.prompt);
    if (payload.cardId) {
      const mappedVoice = SPEECH_WELCOME_CARD_VOICE_MAP[payload.cardId];
      if (mappedVoice && findTtsVoice(mappedVoice)) {
        setSelectedVoice(mappedVoice);
      }
    }
    promptRef.current?.focus();
  }, [activeSessionId, sessions, handleCreateSession]);

  const speechWelcomeAriaLabel = chatWelcomePaneAriaLabel(
    speechWelcomeProps.title,
    t('speechGen.welcomeTitle'),
  );

  const speechWelcomeEl = (
    <ChatWelcomePane
      {...speechWelcomeProps}
      disabled={!tokenKey || isComposerSubmitting}
      onApply={handleWelcomeApply}
    />
  );

  if (tokenLoading) {
    return (
      <div className="chat-page">
        <div className="chat-center-screen">
          <Spin />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  const hasToken = Boolean(tokenKey);

  const composerTextarea = (
    <div className="speech-gen-composer-top">
      <textarea
        id="speech-gen-prompt"
        ref={promptRef}
        value={draftText}
        onChange={(e) => {
          const next = e.target.value.slice(0, SPEECH_TEXT_MAX);
          setDraftText(next);
        }}
        rows={1}
        className="chat-textarea"
        aria-label={t('speechGen.placeholder')}
        placeholder={t('speechGen.placeholder')}
        disabled={!hasToken || isComposerSubmitting}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
    </div>
  );

  const voiceTrigger = (
    <button
      type="button"
      className={`speech-gen-voice-trigger${selectedVoiceMeta ? ' speech-gen-voice-trigger--has-value' : ''}`}
      disabled={!hasToken || isComposerSubmitting}
      onClick={() => setVoiceModalOpen(true)}
    >
      <SpeechVoiceAvatar
        voice={selectedVoiceMeta ? selectedVoice : undefined}
        className={`speech-gen-voice-trigger__avatar${selectedVoiceMeta ? '' : ' speech-gen-voice-trigger__avatar--empty'}`}
      />
      <span className="speech-gen-voice-trigger__name">
        {selectedVoiceMeta ? pickVoiceText(selectedVoiceMeta.label, i18n.language) : t('speechGen.selectVoice')}
      </span>
      <SwapOutlined className="speech-gen-voice-trigger__swap" />
    </button>
  );

  const languageSelect = (
    <Select
      className="speech-gen-lang-select speech-gen-lang-select--has-value"
      value={languageType}
      disabled={!hasToken || isComposerSubmitting}
      onChange={(v: SpeechLanguageType) => setLanguageType(v)}
      suffixIcon={<GlobalOutlined />}
      options={SPEECH_LANGUAGE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.labelKey),
      }))}
    />
  );

  const sendButton = (
    <button
      type="button"
      className="chat-send-btn"
      onClick={() => { void handleSubmit(); }}
      disabled={isComposerSubmitting}
      aria-label={t('speechGen.generate')}
    >
      <svg className="chat-send-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 18V7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7.5 11.5L12 7L16.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  const composerBlock = (
    <div className="chat-composer-pane">
      <div className={`chat-input-area${showCenteredWelcome ? ' chat-input-area--text-welcome' : ''}`}>
        <div className="chat-input-wrap">
          <div className="chat-input-box speech-gen-input-box">
            {composerTextarea}
            <ComposerToolbar
              variant="speech"
              modelPicker={(
                <div className="model-picker-wrap model-picker-wrap--composer">
                  <ComposerModelPicker
                    open={modelPickerOpen}
                    onOpenChange={setModelPickerOpen}
                    disabled={!hasToken || isComposerSubmitting || speechPricingAll.length === 0}
                    pickModelHighlight={hasToken && !selectedModel}
                    pillLabel={composerPillLabel}
                    pillEmpty={!selectedModel}
                    selectModelAriaLabel={t('chat.selectModel')}
                    {...composerPickerPanelProps}
                  />
                </div>
              )}
              afterModel={(
                <div className="speech-gen-toolbar-extras">
                  {voiceTrigger}
                  {languageSelect}
                </div>
              )}
              trailing={sendButton}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneration = (gen: SpeechGeneration) => {
    const tone = statusTone(gen.status, t);
    const voiceMeta = findTtsVoice(gen.voice);
    const modelShort = (gen.model || '').split('/').pop() || gen.model;

    return (
      <div key={gen.id} className="message-group message-group--speech-gen">
        <div className="msg-row msg-row--user">
          <div className="msg-avatar msg-avatar--user" aria-hidden>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="msg-user-content-col">
            <div className="msg-bubble msg-bubble--user">{gen.text}</div>
          </div>
        </div>
        <div className="msg-row msg-row--assistant">
          <div className="video-gen-result">
            <div className="msg-block-head">
              <div className="msg-avatar msg-avatar--ai" aria-hidden>
                <ModelIcon
                  label={modelShort}
                  iconName={resolveModelIcon(gen.model)}
                  className="msg-model-icon"
                />
              </div>
              <div className="msg-ai-model-name">
                {modelShort}
                <span className={`speech-gen-status-tag ${tone.className}`} style={{ marginLeft: 8 }}>
                  {tone.text}
                </span>
              </div>
            </div>
            {gen.status === 'completed' && gen.audioUrl ? (
              <>
                <SpeechGenAudioPlayer src={gen.audioUrl} timestamp={gen.createdAt} />
              </>
            ) : gen.status === 'failed' ? (
              <div className="msg-bubble msg-bubble--ai msg-bubble--error">
                <p className="msg-bubble-error-text">{gen.errorMessage || t('speechGen.generationFailed')}</p>
              </div>
            ) : (
              <div className="msg-bubble msg-bubble--ai" style={{ color: 'var(--text-secondary)' }}>
                <Spin size="small" style={{ marginRight: 8 }} />
                {t('speechGen.statusGenerating')}
                {voiceMeta ? ` · ${pickVoiceText(voiceMeta.label, i18n.language)}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const sidebarList = (
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
  );

  return (
    <div className="chat-page">
      <SpeechVoicePickerModal
        open={voiceModalOpen}
        value={selectedVoice}
        onClose={() => setVoiceModalOpen(false)}
        onConfirm={(voice) => {
          setSelectedVoice(voice);
          setVoiceModalOpen(false);
        }}
      />
      <div className="chat-root">
        <div className={`chat-body speech-gen-body${sidebarCollapsed ? ' chat-body--sidebar-collapsed' : ''}`}>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? t('chat.showSidebar') : t('chat.hideSidebar')}
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
                  onClick={handleCreateSession}
                >
                  {t('newChat')}
                </Button>
                <div className="sidebar-search">
                  <span className="sidebar-search-icon"><SearchOutlined style={{ fontSize: 14 }} /></span>
                  <input
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder={t('chat.searchRooms')}
                    className="sidebar-search-input"
                  />
                </div>
              </div>
              {sidebarList}
            </div>
          </aside>

          <main className="chat-main speech-gen-main">
            <div className="chat-main-shell">
              {!hasToken && (
                <div className="chat-token-notice">
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
              <header className="chat-main-title-bar">
                <h1 className="chat-main-title">{activeSession?.title || t('chat.newChatTitle')}</h1>
              </header>
              {showCenteredWelcome ? (
                <section className="chat-welcome-pane" aria-label={speechWelcomeAriaLabel}>
                  {speechWelcomeEl}
                </section>
              ) : (
                <div
                  className="chat-messages-area"
                  style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}
                >
                  <div
                    ref={messagesScrollRef}
                    className="chat-messages-inner"
                    onScroll={handleMessagesScroll}
                  >
                    {activeSession!.generations.map(renderGeneration)}
                  </div>
                </div>
              )}
              {composerBlock}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
