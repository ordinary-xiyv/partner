import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getTokens, getTokenKey, getPricing } from '../api';
import { pickPreferredToken } from '../components/token/tokenDisplay';

interface PlaygroundMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 从 chat completion JSON 中提取助手可见正文（非流式 message / 流式 _streamed_content） */
function extractPlaygroundAssistantText(parsed: unknown): { text: string; reasoning: string } {
  if (!parsed || typeof parsed !== 'object') return { text: '', reasoning: '' };
  const o = parsed as Record<string, unknown>;

  if (o.error !== undefined && !Array.isArray(o.choices)) {
    const err = o.error;
    if (typeof err === 'string') return { text: err, reasoning: '' };
    if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string') {
      return { text: (err as Record<string, unknown>).message as string, reasoning: '' };
    }
    try {
      return { text: JSON.stringify(err), reasoning: '' };
    } catch {
      return { text: String(err), reasoning: '' };
    }
  }

  if (typeof o._streamed_content === 'string') {
    return { text: o._streamed_content, reasoning: '' };
  }

  const choices = o.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { text: '', reasoning: '' };
  const c0 = choices[0] as Record<string, unknown>;
  const msg = c0.message as Record<string, unknown> | undefined;
  let reasoning = '';
  if (msg && typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    reasoning = msg.reasoning_content;
  }
  if (msg && typeof msg.content === 'string') {
    return { text: msg.content, reasoning };
  }
  const delta = c0.delta as Record<string, unknown> | undefined;
  if (delta && typeof delta.content === 'string') {
    return { text: delta.content, reasoning };
  }
  return { text: '', reasoning };
}

export default function Playground() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tokenKey, setTokenKey] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Parameters
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(1.0);
  const [streamEnabled, setStreamEnabled] = useState(false);

  // Messages
  const [messages, setMessages] = useState<PlaygroundMessage[]>([
    { role: 'system', content: t('playground.defaultSystemPrompt') },
    { role: 'user', content: '' },
  ]);

  // Response
  const [response, setResponse] = useState<string>('');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [tokenStats, setTokenStats] = useState<{ prompt_tokens: number; completion_tokens: number; total_tokens: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);

  // Load token
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

  // Load models from pricing API
  // Response: { data: [{model_name, model_ratio, ...}] } (array)
  useEffect(() => {
    (async () => {
      try {
        const res = await getPricing();
        const data = res.data?.data || res.data;
        let names: string[] = [];
        if (Array.isArray(data)) {
          names = data
            .map((m: { model_name?: string }) => m.model_name)
            .filter((n): n is string => !!n)
            .sort();
        } else if (data && typeof data === 'object') {
          names = Object.keys(data).filter(k => isNaN(Number(k))).sort();
        }
        if (names.length > 0) {
          setModels(names);
          setSelectedModel(names[0]);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const filteredModels = useMemo(() =>
    models.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase())),
    [models, modelSearch]
  );

  const addMessage = useCallback(() => {
    setMessages(prev => [...prev, { role: 'user', content: '' }]);
  }, []);

  const removeMessage = useCallback((idx: number) => {
    setMessages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMessage = useCallback((idx: number, field: 'role' | 'content', value: string) => {
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }, []);

  const requestBody = useMemo(() => ({
    model: selectedModel,
    messages: messages.filter(m => m.content.trim()),
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    stream: streamEnabled,
  }), [selectedModel, messages, temperature, maxTokens, topP, streamEnabled]);

  const curlCommand = useMemo(() => {
    const baseUrl = window.location.origin;
    const body = JSON.stringify(requestBody, null, 2);
    return `curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${tokenKey || 'sk-xxx'}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  }, [requestBody, tokenKey]);

  const parsedResponseBody = useMemo(() => {
    if (!response.trim()) return null;
    try {
      return JSON.parse(response) as unknown;
    } catch {
      return null;
    }
  }, [response]);

  const formattedAssistantBlock = useMemo(() => {
    if (!response.trim()) return '';
    const parsed = parsedResponseBody;
    if (parsed === null) return response;
    const { text, reasoning } = extractPlaygroundAssistantText(parsed);
    const parts: string[] = [];
    if (reasoning) parts.push(reasoning);
    if (text) parts.push(text);
    if (parts.length > 0) return parts.join('\n\n---\n\n');
    return '';
  }, [response, parsedResponseBody]);

  const copyResponseText = viewMode === 'formatted' && formattedAssistantBlock
    ? formattedAssistantBlock
    : response;

  const handleSend = useCallback(async () => {
    if (!tokenKey || loading) return;
    setLoading(true);
    setResponse('');
    setTokenStats(null);
    setResponseTime(null);

    const start = performance.now();

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (streamEnabled) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let fullResponse: Record<string, unknown> = {};

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
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              fullResponse = parsed;
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                setResponse(JSON.stringify({ ...parsed, _streamed_content: fullContent }, null, 2));
              }
            } catch { /* skip */ }
          }
        }
        setResponseTime(performance.now() - start);
        if (fullResponse.usage) {
          setTokenStats(fullResponse.usage as typeof tokenStats);
        }
      } else {
        const data = await res.json();
        setResponseTime(performance.now() - start);
        setResponse(JSON.stringify(data, null, 2));
        if (data.usage) {
          setTokenStats(data.usage);
        }
      }
    } catch (err) {
      setResponse(JSON.stringify({ error: err instanceof Error ? err.message : t('unknownError') }, null, 2));
    } finally {
      setLoading(false);
    }
  }, [tokenKey, loading, requestBody, streamEnabled]);

  if (tokenLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        {t('loading')}
      </div>
    );
  }

  const hasToken = Boolean(tokenKey);

  const sliderStyle: React.CSSProperties = {
    width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex',
    justifyContent: 'space-between', alignItems: 'center',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 13,
    border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', margin: 'calc(-1 * var(--console-main-pad-y, 32px)) calc(-1 * var(--console-main-pad-x, 40px))', overflow: 'hidden' }}>
      {!hasToken && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '16px 20px', borderBottom: '1px solid var(--border-default)',
          background: 'linear-gradient(180deg, rgba(250, 204, 21, 0.08) 0%, rgba(250, 204, 21, 0.03) 100%)',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('playground.missingTokenTitle')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('playground.missingTokenDesc')}
            </div>
          </div>
          <button
            onClick={() => navigate('/tokens')}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-base)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}
          >
            {t('playground.goConfigureToken')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Parameters Panel */}
      <div style={{
        width: 280, minWidth: 280, borderRight: '1px solid var(--border-default)',
        padding: 16, overflowY: 'auto', background: 'var(--bg-base)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t('playgroundParameters')}
        </div>

        {/* Model */}
        <div>
          <div style={labelStyle}>{t('model')}</div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowModelDropdown(!showModelDropdown)} style={{
              ...inputStyle, textAlign: 'left', cursor: 'pointer',
            }}>
              {selectedModel}
            </button>
            {showModelDropdown && (
              <>
                <div onClick={() => setShowModelDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                  borderRadius: 8, width: '100%', maxHeight: 280, display: 'flex', flexDirection: 'column',
                  boxShadow: '0 8px 32px var(--border-default)',
                }}>
                  <div style={{ padding: 8 }}>
                    <input value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                      placeholder={t('search')} autoFocus style={inputStyle} />
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 220, padding: '0 4px 4px' }}>
                    {filteredModels.map(m => (
                      <button key={m} onClick={() => { setSelectedModel(m); setShowModelDropdown(false); setModelSearch(''); }}
                        style={{
                          display: 'block', width: '100%', padding: '6px 10px', borderRadius: 4,
                          border: 'none', background: m === selectedModel ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = m === selectedModel ? 'var(--bg-hover)' : 'transparent'; }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div style={labelStyle}>
            <span>{t('playgroundTemperature')}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{temperature.toFixed(1)}</span>
          </div>
          <input type="range" min={0} max={2} step={0.1} value={temperature}
            onChange={e => setTemperature(Number(e.target.value))} style={sliderStyle} />
        </div>

        {/* Max Tokens */}
        <div>
          <div style={labelStyle}>
            <span>{t('playgroundMaxTokens')}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{maxTokens}</span>
          </div>
          <input type="range" min={1} max={32000} step={1} value={maxTokens}
            onChange={e => setMaxTokens(Number(e.target.value))} style={sliderStyle} />
        </div>

        {/* Top P */}
        <div>
          <div style={labelStyle}>
            <span>{t('playgroundTopP')}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{topP.toFixed(2)}</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={topP}
            onChange={e => setTopP(Number(e.target.value))} style={sliderStyle} />
        </div>

        {/* Stream */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('playgroundStream')}</span>
          <button onClick={() => setStreamEnabled(!streamEnabled)} style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: streamEnabled ? 'var(--accent-primary)' : 'var(--bg-hover)',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 8, background: '#fff',
              position: 'absolute', top: 3, left: streamEnabled ? 21 : 3,
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      </div>

      {/* Request Area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-default)',
        minWidth: 0, background: 'var(--bg-elevated)',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-default)',
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
        }}>
          {t('playgroundMessages')}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              marginBottom: 12, border: '1px solid var(--border-default)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', background: 'var(--bg-base)',
              }}>
                <select value={msg.role} onChange={e => updateMessage(idx, 'role', e.target.value)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-default)',
                    borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)',
                    fontSize: 12, cursor: 'pointer',
                  }}>
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
                {messages.length > 1 && (
                  <button onClick={() => removeMessage(idx)} style={{
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    cursor: 'pointer', fontSize: 12, padding: '2px 4px',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                  >
                    {t('delete')}
                  </button>
                )}
              </div>
              <textarea
                value={msg.content}
                onChange={e => updateMessage(idx, 'content', e.target.value)}
                placeholder={msg.role === 'system' ? t('systemPrompt') : t('playgroundMessagePlaceholder', { role: msg.role })}
                style={{
                  width: '100%', minHeight: 60, padding: 10, border: 'none',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                  fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.5, boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          <button onClick={addMessage} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderRadius: 6, border: '1px dashed var(--border-default)',
            background: 'transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 12, width: '100%', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            + {t('playgroundAddMessage')}
          </button>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border-default)' }}>
          <button onClick={hasToken ? handleSend : () => navigate('/tokens')} disabled={hasToken ? loading : false} style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
            background: hasToken ? (loading ? 'var(--bg-hover)' : 'var(--accent-primary)') : 'var(--text-primary)',
            color: hasToken ? (loading ? 'var(--text-tertiary)' : 'var(--bg-base)') : 'var(--bg-base)',
            fontSize: 13, fontWeight: 600, cursor: hasToken ? (loading ? 'default' : 'pointer') : 'pointer',
            transition: 'all 0.15s',
          }}>
            {hasToken ? (loading ? t('playgroundSending') : t('sendRequest')) : t('playground.goConfigureToken')}
          </button>
        </div>
      </div>

      {/* Response Area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-base)',
      }}>
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['formatted', 'raw'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 12,
                background: viewMode === mode ? 'var(--bg-hover)' : 'transparent',
                color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}>
                {mode === 'formatted' ? t('playgroundFormatted') : t('rawResponse')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => {
              navigator.clipboard.writeText(copyResponseText);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }} style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11,
              background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {copied ? t('codeCopied') : t('copy')}
            </button>
            <button onClick={() => { setResponse(''); setTokenStats(null); setResponseTime(null); }} style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11,
              background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {t('reset')}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {response ? (
            viewMode === 'formatted' && formattedAssistantBlock ? (
              <div style={{
                margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {formattedAssistantBlock}
              </div>
            ) : (
              <pre style={{
                margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>
                {response}
              </pre>
            )
          ) : (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%',
              color: 'var(--text-tertiary)', fontSize: 13,
            }}>
              {t('playgroundResponsePlaceholder')}
            </div>
          )}
        </div>

        {/* Token stats */}
        {(tokenStats || responseTime !== null) && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border-default)',
            display: 'flex', gap: 16, flexWrap: 'wrap',
          }}>
            {tokenStats && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {t('playgroundPrompt')}: <span style={{ color: 'var(--text-secondary)' }}>{tokenStats.prompt_tokens}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {t('playgroundCompletion')}: <span style={{ color: 'var(--text-secondary)' }}>{tokenStats.completion_tokens}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {t('playgroundTotal')}: <span style={{ color: 'var(--text-secondary)' }}>{tokenStats.total_tokens}</span>
                </div>
              </>
            )}
            {responseTime !== null && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {t('duration')}: <span style={{ color: 'var(--text-secondary)' }}>{(responseTime / 1000).toFixed(2)}s</span>
              </div>
            )}
          </div>
        )}

        {/* cURL command */}
        <div style={{
          borderTop: '1px solid var(--border-default)', padding: '10px 16px',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              {t('curlCommand')}
            </span>
            <button onClick={() => navigator.clipboard.writeText(curlCommand)} style={{
              padding: '2px 8px', borderRadius: 4, border: 'none', fontSize: 10,
              background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {t('copy')}
            </button>
          </div>
          <pre style={{
            margin: 0, padding: 10, borderRadius: 6, background: 'var(--bg-elevated)',
            fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflowY: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            {curlCommand}
          </pre>
        </div>
      </div>
      </div>
    </div>
  );
}
