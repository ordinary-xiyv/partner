import { useEffect, useState } from 'react';

function waitWithCancel(duration: number, timers: number[]): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, duration);
    timers.push(id);
  });
}

/** Types full source once, pauses, clears, then loops. */
export function useHomeAltCodeTypewriter(source: string, isReducedMotion: boolean): string {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const wait = (duration: number) => waitWithCancel(duration, timers);

    async function run(): Promise<void> {
      if (!source) {
        setDisplayText('');
        return;
      }

      if (isReducedMotion) {
        setDisplayText(source);
        return;
      }

      while (!cancelled) {
        const characters = Array.from(source);
        for (let i = 1; i <= characters.length; i += 1) {
          if (cancelled) return;
          setDisplayText(characters.slice(0, i).join(''));
          await wait(16 + Math.random() * 22);
        }

        if (cancelled) return;
        await wait(2800);

        for (let i = characters.length - 1; i >= 0; i -= 1) {
          if (cancelled) return;
          if (i % 3 === 0 || i < 8) {
            setDisplayText(characters.slice(0, i).join(''));
            await wait(8);
          }
        }
        setDisplayText('');
        if (cancelled) return;
        await wait(420);
      }
    }

    void run();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [source, isReducedMotion]);

  return displayText;
}
