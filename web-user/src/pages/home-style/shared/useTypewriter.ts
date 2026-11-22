import { useEffect, useMemo, useRef, useState } from 'react';
import type { highlightCode } from './highlightCode';

type Tokens = ReturnType<typeof highlightCode>;

/**
 * 打字机：把代码按字符逐段揭示，模拟「正在输入」。
 *
 * 抽成共享实现是因为两套首页骨架都要用（终端风格原本写在 TerminalSdk 里，
 * 纸感风格没有）。复制一份的后果很具体：将来调速度或修 rAF 兜底，
 * 只有一边跟着改，两套首页的动画节奏会不一致 —— 同一份品牌、同一段代码，
 * 切风格时手感突然变了。
 *
 * 三条约束（和 motion.ts 那套规则同源）：
 *
 * 1. 只 reveal、不修改 token 内容。
 *    代码本身是高亮后的 token 数组，这里用「已揭示字符数」去裁切最后的
 *    那个 token，而不是重新拼字符串 —— 重新拼会把 tok-key / tok-str
 *    的 span 边界打乱，高亮就失效了。
 *
 * 2. 尊重 prefers-reduced-motion：直接给全量，不做逐字。
 *    逐字动画对前庭敏感人群不是「审美偏好」问题；而且代码是要读的，
 *    盯着它一点点长出来本身也有点烦。
 *
 * 3. 必须有兜底：一旦 rAF 被节流（后台标签页、休眠唤醒），
 *    内容不能永久停在一半。超过估算时长仍未跑完就直接全给。
 *    宁可没有动画，也不能有「看不见的代码」。
 */
export function useTypewriter(tokens: Tokens, enabled: boolean, onDone?: () => void) {
  const total = useMemo(() => tokens.reduce((n, t) => n + t.text.length, 0), [tokens]);
  // 默认给全量：首帧就是完整内容，不依赖 JS 跑完 —— 与 motion.ts 的规则一致
  const [shown, setShown] = useState(total);

  /*
   * onDone 放进 ref：调用方每次渲染都会传一个新的箭头函数，
   * 直接进依赖数组会让效果反复重启，打字机永远停在开头。
   */
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || reduce || total === 0) {
      setShown(total);
      doneRef.current?.();
      return;
    }

    /*
     * 速度按总字符数反推，让三个片段的总时长接近。
     * 用固定「每字符毫秒」的话，13 行的 Python 会比 8 行的 curl 慢一倍，
     * 用户切 tab 时会先看到半天空白。
     */
    const durationMs = Math.min(1600, Math.max(900, total * 9));
    const stepMs = durationMs / Math.max(1, total);

    setShown(0);
    let raf = 0;
    let cancelled = false;
    const start = performance.now();

    const finish = () => {
      setShown(total);
      doneRef.current?.();
    };

    const tick = () => {
      if (cancelled) return;
      const elapsed = performance.now() - start;
      const next = elapsed / stepMs;
      if (next >= total) {
        finish();
        return;
      }
      setShown(Math.floor(next));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    // 兜底：rAF 停摆时也要把内容交出来
    const failsafe = window.setTimeout(() => {
      cancelled = true;
      cancelAnimationFrame(raf);
      finish();
    }, durationMs + 800);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, [tokens, total, enabled]);

  /** 按已揭示字符数裁切 token，保留原有的高亮类名 */
  return useMemo(() => {
    if (shown >= total) return tokens;
    const out: Tokens = [];
    let left = shown;
    for (const t of tokens) {
      if (left <= 0) break;
      if (t.text.length <= left) {
        out.push(t);
        left -= t.text.length;
      } else {
        out.push({ text: t.text.slice(0, left), cls: t.cls });
        left = 0;
      }
    }
    return out;
  }, [tokens, shown, total]);
}

/**
 * 「区块第一次进入视口时演一遍」的开关。
 *
 * 用两个状态而不是一个，是为了区分「还没开始」和「正在打」：
 *   armed=false → 完整显示（初始就是这个值，首帧不会空白）
 *   armed=true  → 交给 useTypewriter 逐字揭示
 * 演完 onDone 里 setArmed(false)，回到完整显示，且不会再次进入。
 *
 * 每次点 tab 都重打一遍会很烦：用户切过来是为了读那一段代码，
 * 不是为了再看一次动画。所以演完就把 armed 关掉，单向不可逆。
 */
export function useTypewriterOnVisible() {
  const [armed, setArmed] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setSeen(true);
      return;
    }

    /*
     * 首屏之外才需要观察；如果这个区块本来就在首屏（大屏短页面），
     * IntersectionObserver 会立刻回调一次，两条路径都能覆盖。
     */
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          setArmed(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return { ref, armed, disarm: () => setArmed(false) };
}
