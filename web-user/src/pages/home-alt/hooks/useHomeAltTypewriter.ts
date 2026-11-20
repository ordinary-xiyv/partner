import { useEffect, useState } from 'react';

function waitWithCancel(
  duration: number,
  timers: number[],
): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, duration);
    timers.push(id);
  });
}

/** Matches global-ai-network-hero.html typewriter timing. */
export function useHomeAltTypewriter(
  phrases: string[],
  isReducedMotion: boolean,
): string {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const wait = (duration: number) => waitWithCancel(duration, timers);

    async function runTypewriter(): Promise<void> {
      if (phrases.length === 0) {
        setDisplayText('');
        return;
      }

      if (isReducedMotion) {
        setDisplayText(phrases[0] ?? '');
        return;
      }

      let phraseIndex = 0;
      while (!cancelled) {
        const phrase = phrases[phraseIndex] ?? '';
        const characters = Array.from(phrase);

        for (let i = 1; i <= characters.length; i += 1) {
          if (cancelled) return;
          setDisplayText(characters.slice(0, i).join(''));
          await wait(82 + Math.random() * 42);
        }

        if (cancelled) return;
        await wait(3000);

        for (let i = characters.length - 1; i >= 0; i -= 1) {
          if (cancelled) return;
          setDisplayText(characters.slice(0, i).join(''));
          await wait(30 + Math.random() * 20);
        }

        phraseIndex = (phraseIndex + 1) % phrases.length;
        if (cancelled) return;
        await wait(380);
      }
    }

    void runTypewriter();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [phrases, isReducedMotion]);

  return displayText;
}
