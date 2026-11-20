import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface UseHomeHeroTypewriterOptions {
  phrases: string[];
  phraseIndex: number;
  isReducedMotion: boolean;
  isPaused?: boolean;
}

/** Hero 标题打字机：删除旧词 → 打出新词 */
export function useHomeHeroTypewriter({
  phrases,
  phraseIndex,
  isReducedMotion,
  isPaused = false,
}: UseHomeHeroTypewriterOptions) {
  const [displayText, setDisplayText] = useState(() => phrases[phraseIndex] ?? '');
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const textRef = useRef(displayText);

  useEffect(() => {
    textRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    const phrase = phrases[phraseIndex] ?? '';
    if (!phrase) return undefined;

    timelineRef.current?.kill();

    if (isReducedMotion || isPaused) {
      setDisplayText(phrase);
      textRef.current = phrase;
      return undefined;
    }

    const tl = gsap.timeline();
    timelineRef.current = tl;

    const current = textRef.current;

    if (current.length > 0) {
      const deleteState = { len: current.length };
      tl.to(deleteState, {
        len: 0,
        duration: Math.max(0.25, current.length * 0.028),
        ease: 'none',
        onUpdate: () => {
          const next = current.slice(0, Math.round(deleteState.len));
          textRef.current = next;
          setDisplayText(next);
        },
      });
    }

    const typeState = { len: 0 };
    tl.to(typeState, {
      len: phrase.length,
      duration: Math.max(0.45, phrase.length * 0.052),
      ease: 'none',
      onUpdate: () => {
        const next = phrase.slice(0, Math.round(typeState.len));
        textRef.current = next;
        setDisplayText(next);
      },
    });

    return () => {
      timelineRef.current?.kill();
    };
  }, [phraseIndex, phrases, isReducedMotion, isPaused]);

  return displayText;
}
