import type { SpeechLanguageType } from './speechTypes';
import { resolveSpeechLanguageType } from './speechLanguageResolve';
import { toTtsApiVoice } from './qwenTtsVoices';
import i18n from '../../i18n';
import { isInterruptedFetchError, isInterruptedFetchMessage } from '../chat/generationInterrupt';

export type CreateSpeechParams = {
  token: string;
  model: string;
  text: string;
  voice: string;
  languageType: SpeechLanguageType;
};

export type CreateSpeechSuccess = {
  ok: true;
  audioUrl: string;
  requestId?: string;
  usageTotalTokens?: number;
};

export type CreateSpeechFailure = {
  ok: false;
  message: string;
};

export type CreateSpeechResult = CreateSpeechSuccess | CreateSpeechFailure;

type BailianTtsResponse = {
  output?: { audio?: { url?: string } };
  usage?: { total_tokens?: number; completion_tokens?: number };
  request_id?: string;
  code?: string;
  message?: string;
  error?: { message?: string };
};

function parseErrorMessage(raw: string, fallback: string): string {
  try {
    const j = JSON.parse(raw) as BailianTtsResponse & { error?: { message?: string } };
    return j?.error?.message || j?.message || fallback;
  } catch {
    return raw.trim() ? raw.slice(0, 200) : fallback;
  }
}

export async function createSpeech(params: CreateSpeechParams): Promise<CreateSpeechResult> {
  try {
    const languageType = resolveSpeechLanguageType(params.text, params.languageType);

    const resp = await fetch('/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.token}`,
      },
      body: JSON.stringify({
        model: params.model,
        input: params.text,
        voice: toTtsApiVoice(params.voice),
        language_type: languageType,
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return { ok: false, message: parseErrorMessage(raw, `HTTP ${resp.status}`) };
    }

    let data: BailianTtsResponse;
    try {
      data = JSON.parse(raw) as BailianTtsResponse;
    } catch {
      return { ok: false, message: 'Invalid JSON response' };
    }

    if (data.code) {
      return { ok: false, message: data.message || data.code };
    }

    const audioUrl = data.output?.audio?.url?.trim();
    if (!audioUrl) {
      return { ok: false, message: 'No audio URL in response' };
    }

    return {
      ok: true,
      audioUrl,
      requestId: data.request_id,
      usageTotalTokens: data.usage?.total_tokens ?? data.usage?.completion_tokens,
    };
  } catch (err) {
    if (isInterruptedFetchError(err)) {
      return { ok: false, message: i18n.t('chat.taskInterrupted') };
    }
    const message = err instanceof Error ? err.message : 'Network error';
    if (isInterruptedFetchMessage(message)) {
      return { ok: false, message: i18n.t('chat.taskInterrupted') };
    }
    return { ok: false, message };
  }
}
