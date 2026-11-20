import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyApiError, notifyApiSuccess } from '../../lib/notifyApi';
import SpeechWaveSvg from '../../assets/speech-gen/speech-wave.svg?react';

function formatAudioTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isValidDuration(sec: number): boolean {
  return Number.isFinite(sec) && sec > 0;
}

async function decodeBlobDurationSec(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.duration;
  } finally {
    await ctx.close();
  }
}

async function resolveSpeechAudioSrc(src: string): Promise<{ playSrc: string; duration: number }> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error('fetch failed');
  const blob = await resp.blob();
  const duration = await decodeBlobDurationSec(blob);
  if (!isValidDuration(duration)) throw new Error('invalid duration');
  return { playSrc: URL.createObjectURL(blob), duration };
}

export interface SpeechGenAudioPlayerProps {
  src: string;
  timestamp?: number;
  onDownload?: () => void;
  downloading?: boolean;
}

export function SpeechGenAudioPlayer({
  src,
  timestamp,
  onDownload,
  downloading = false,
}: SpeechGenAudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const [playSrc, setPlaySrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const applyDuration = useCallback((next: number) => {
    if (!isValidDuration(next)) return;
    durationRef.current = next;
    setDuration(next);
  }, []);

  const syncFromAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const elDuration = el.duration;
    if (isValidDuration(elDuration)) {
      applyDuration(elDuration);
    }
    setCurrent(el.currentTime);
  }, [applyDuration]);

  useEffect(() => {
    let cancelled = false;

    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    durationRef.current = 0;
    setLoadError(false);
    setLoading(true);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const resolve = async () => {
      try {
        const resolved = await resolveSpeechAudioSrc(src);
        if (cancelled) {
          URL.revokeObjectURL(resolved.playSrc);
          return;
        }
        objectUrlRef.current = resolved.playSrc;
        setPlaySrc(resolved.playSrc);
        applyDuration(resolved.duration);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setPlaySrc(src);
        setLoading(false);
      }
    };

    void resolve();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src, applyDuration]);

  useEffect(() => {
    if (!playing) return undefined;
    let frameId = 0;
    const tick = () => {
      syncFromAudio();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, syncFromAudio]);

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  const stampLabel = useMemo(
    () => (timestamp ? formatStamp(timestamp) : ''),
    [timestamp],
  );

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el || loadError || loading) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
      syncFromAudio();
    } catch {
      setLoadError(true);
    }
  }, [playing, loadError, loading, syncFromAudio]);

  const seekToRatio = useCallback((ratio: number) => {
    const el = audioRef.current;
    const d = durationRef.current;
    if (!el || d <= 0) return;
    const next = Math.min(Math.max(0, ratio), 1) * d;
    el.currentTime = next;
    setCurrent(next);
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || loadError || loading) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    seekToRatio((e.clientX - rect.left) / rect.width);
  }, [loadError, loading, seekToRatio]);

  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload();
      return;
    }
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error('fetch failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lynxton-speech-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifyApiSuccess(t('speechGen.downloadSuccess'));
    } catch {
      notifyApiError(t('speechGen.downloadFailed'));
    }
  }, [onDownload, src, t]);

  const handleAudioMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const d = e.currentTarget.duration;
    if (isValidDuration(d)) applyDuration(d);
  }, [applyDuration]);

  const handleAudioEnded = useCallback(() => {
    setPlaying(false);
    const d = durationRef.current;
    if (d > 0) {
      setCurrent(d);
    }
  }, []);

  return (
    <div className="speech-gen-audio-player">
      <audio
        ref={audioRef}
        src={playSrc || undefined}
        preload="auto"
        onLoadedMetadata={handleAudioMetadata}
        onDurationChange={handleAudioMetadata}
        onTimeUpdate={syncFromAudio}
        onEnded={handleAudioEnded}
        onError={() => setLoadError(true)}
      />

      <button
        type="button"
        className="speech-gen-audio-player__play"
        onClick={() => { void togglePlay(); }}
        disabled={loadError || loading}
        aria-label={playing ? t('speechGen.pause') : t('speechGen.play')}
      >
        {playing ? (
          <span className="speech-gen-audio-player__pause-icon" aria-hidden />
        ) : (
          <span className="speech-gen-audio-player__play-icon" aria-hidden />
        )}
      </button>

      <div className="speech-gen-audio-player__center">
        <div
          className={`speech-gen-audio-player__wave${playing ? ' is-playing' : ''}`}
          aria-hidden
        >
          <SpeechWaveSvg className="speech-gen-audio-player__wave-svg speech-gen-audio-player__wave-inactive" />
          <SpeechWaveSvg
            className="speech-gen-audio-player__wave-svg speech-gen-audio-player__wave-active"
            style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}
          />
        </div>
        <div className="speech-gen-audio-player__progress-row">
          <span className="speech-gen-audio-player__time">
            {loadError ? '--:--' : formatAudioTime(current)}
          </span>
          <div
            ref={trackRef}
            className="speech-gen-audio-player__track"
            onClick={handleTrackClick}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={current}
            aria-label={t('speechGen.play')}
            tabIndex={loadError || loading ? -1 : 0}
            onKeyDown={(e) => {
              if (loadError || loading || duration <= 0) return;
              const step = duration * 0.05;
              if (e.key === 'ArrowRight') seekToRatio((current + step) / duration);
              if (e.key === 'ArrowLeft') seekToRatio((current - step) / duration);
            }}
          >
            <div className="speech-gen-audio-player__fill" style={{ width: `${progress}%` }} />
            <span
              className="speech-gen-audio-player__thumb"
              style={{ left: `${progress}%` }}
              aria-hidden
            />
          </div>
          <span className="speech-gen-audio-player__time">
            {loadError ? '--:--' : formatAudioTime(duration)}
          </span>
        </div>
      </div>

      <div className="speech-gen-audio-player__aside">
        {stampLabel ? (
          <span className="speech-gen-audio-player__stamp">{stampLabel}</span>
        ) : (
          <span className="speech-gen-audio-player__stamp speech-gen-audio-player__stamp--empty" />
        )}
        <button
          type="button"
          className="speech-gen-audio-player__download"
          disabled={downloading || loadError}
          onClick={() => { void handleDownload(); }}
        >
          {t('speechGen.download')}
        </button>
      </div>
    </div>
  );
}
