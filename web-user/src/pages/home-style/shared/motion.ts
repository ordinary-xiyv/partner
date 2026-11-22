import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * 首次绘制前执行。
 *
 * 入场动画必须在这里起 —— 用 useEffect 的话浏览器已经画过一帧完整内容，
 * 紧接着 GSAP 把元素压到 opacity:0 再淡回来，首屏会「闪一下」。
 * 这是本项目跑在纯客户端（Vite SPA，无 SSR），layout effect 是安全的；
 * 留一个 typeof window 兜底，防止将来哪天被套进服务端渲染。
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 首页动效。
 *
 * 四条硬规则（都是踩过的坑，不是风格偏好）：
 *
 * 1. 一律 fromTo，绝不用 from。
 *    gsap.from() 会让元素先停在起始态（通常 opacity:0），等 ScrollTrigger
 *    触发才动。如果页面被无头浏览器截图、或被打印、或用户禁了 JS，
 *    元素就永久停在不可见状态——整块空白，看起来像渲染失败。
 *
 * 2. 终态必须与 CSS 里写的默认样式一致。
 *    也就是说 CSS 里元素本来就是可见、位置正常的，GSAP 只是让「进入视口」
 *    这个瞬间有个过渡。反过来做（CSS 写 opacity:0 等 JS 补）会让
 *    JS 加载失败时整页空白。
 *
 * 3. 尊重 prefers-reduced-motion。
 *    系统打开了减弱动效，就不动——尤其是视差和位移，对前庭敏感人群
 *    是真实的不适源，不是"审美偏好"。
 *
 * 4. 绝不因为动效没跑完就让内容不可见（本文件最重要的一条）。
 *    规则 2 只保证「不启动时是好的」，但还有第三种状态：
 *    启动了、跑到一半、然后 ticker 停摆 —— 后台标签页被节流、
 *    设备休眠唤醒、低端机长任务卡顿，都会让 GSAP 的时间轴停在中间。
 *    此时元素被内联样式钉在 opacity:0.3 上，且不会自己回来。
 *    实测截图就是这个状态：指标数字停在 "0W+"、第一张卡片半透明。
 *
 *    所以本文件的每个 hook 都做两件事：
 *      a) 动画跑完 onComplete 里 clearProps，把元素交还给 CSS 终态，
 *         而不是留一身内联样式；
 *      b) 挂一个保底定时器：若元素已经进了视口、动画却始终没跑完，
 *         就直接置为终态。宁可没有动效，也不能有看不见的内容。
 *
 * 另外：动画只在「进入视口」时跑一次（once），不做来回反复。
 * 反复触发的视差在长页面上会让人晕，而且 ScrollTrigger 数量翻倍。
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 元素是否已经在首屏（或正在视口内）。
 *
 * 首屏元素不挂 ScrollTrigger —— 它本来就在视口里，触发器恒成立，
 * 挂上去只是白白引入一层「要等 ScrollTrigger 计算完才动」的时序依赖。
 * 这是上面规则 4 最容易出问题的地方：首屏内容的动效挂上 scrollTrigger，
 * 一旦 refresh 时机不巧，触发器就再也不触发。
 */
function isInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  return rect.top < vh && rect.bottom > 0;
}

/** 保底等待时长：超过这个时间还没跑完、且元素已在视口内，就直接给终态 */
const FAILSAFE_MS = 1500;

/**
 * 区块入场：整体上移淡入。
 *
 * 模板写法：
 *   <section ref={useReveal()}>…</section>
 * 子元素要错开时给它们加 data-reveal-item，会按顺序依次入场。
 */
export function useReveal<T extends HTMLElement = HTMLElement>(options?: {
  /** 子元素错开间隔（秒）。0 表示整块一起动 */
  stagger?: number;
  /** 位移距离（px）。0 表示只淡入 */
  y?: number;
}) {
  const ref = useRef<T | null>(null);
  const stagger = options?.stagger ?? 0;
  const y = options?.y ?? 24;

  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const targets =
      stagger > 0
        ? Array.from(el.querySelectorAll<HTMLElement>('[data-reveal-item]'))
        : [el];
    if (targets.length === 0) return;

    /*
     * 首屏元素不挂 ScrollTrigger。
     *
     * 它本来就在视口里，start:'top 88%' 恒成立 —— 触发器只是多绕一层：
     * 要等 ScrollTrigger 首轮 refresh 算出位置、才把动画放进队列。
     * 而 refresh 依赖布局稳定（字体加载、模型卡片撑开高度都会改变
     * trigger 的 offsetTop）。这中间的空窗就是截图里那张「第一张卡
     * 半透明、后面两张正常」的由来 —— 后两张因为 stagger 还没轮到，
     * 反而老老实实停在 CSS 可见态。
     *
     * 去掉触发器后动画在 layout effect 里直接起跑，没有空窗。
     */
    const inFirstScreen = isInViewport(el);
    let finished = false;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: stagger || 0,
          /*
           * 首屏元素要 immediateRender:true —— 但这里和规则 1 不冲突。
           *
           * 规则 1 防的是「起始态永久残留」。首屏元素此刻已经确认
           * 进了视口、动画正在 layout effect 里同步起跑，不存在
           * 「等一个永远不会来的触发器」这种情况；而且下面那个保底
           * 定时器会在 1.5s 后无条件把元素拉回 CSS 终态。
           *
           * 反过来若用 false，起始态不会预先应用，浏览器会先画出
           * 完整内容、GSAP 第一帧再把它压回 opacity:0 —— 首屏闪一下。
           */
          immediateRender: inFirstScreen,
          onComplete: () => {
            finished = true;
            // 交还给 CSS：动画只是"入场的那一下"，不该留下持久的内联样式。
            // 留着内联 opacity/transform 的话，后续任何 hover/主题切换
            // 的 CSS 都可能被它压住（内联优先级高于类选择器）。
            gsap.set(targets, { clearProps: 'opacity,transform' });
          },
          ...(inFirstScreen
            ? {}
            : {
                scrollTrigger: {
                  trigger: el,
                  start: 'top 88%',
                  once: true,
                },
              }),
        },
      );
    }, el);

    /*
     * 保底：元素已进视口、动画却始终没跑完 → 无条件置回 CSS 终态。
     *
     * 触发场景不是"理论上的"：后台标签页被浏览器节流到 1fps、
     * 设备休眠唤醒、低端机长任务把主线程占住 —— 都会让 tween 停在中间。
     * 这时元素被内联 opacity 钉在半透明上，且永远不会自己回来。
     * 宁可没有动效，也不能有看不见的内容。
     */
    const failsafeId = window.setTimeout(() => {
      if (finished) return;
      if (!isInViewport(el)) return;
      gsap.killTweensOf(targets);
      ScrollTrigger.getAll().forEach((t) => {
        if (t.trigger === el) t.kill();
      });
      gsap.set(targets, { clearProps: 'opacity,transform' });
    }, FAILSAFE_MS);

    return () => {
      window.clearTimeout(failsafeId);
      ctx.revert();
    };
  }, [stagger, y]);

  return ref;
}

/**
 * 数字滚动：从 0 数到目标值。
 *
 * 注意「先把终值写进 DOM，再让 GSAP 从 0 数起」这个顺序。
 * 反过来（DOM 里先写 0）在不执行 JS 的环境里会一直显示 0 ——
 * 首页核心指标全变成 0，比没有动效糟得多。
 *
 * value 参数接受 "100+" / "99.9%" 这种带单位的字符串，只对数字部分做补间。
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(value: string) {
  const ref = useRef<T | null>(null);

  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    // 拆出数字与前后缀："99.9%" → 99.9 + "%"；"2W+" → 2 + "W+"
    const match = value.match(/^([^\d]*)([\d.]+)([\s\S]*)$/);
    if (!match) return;
    const [, prefix, numText, suffix] = match;
    const target = Number(numText);
    if (!Number.isFinite(target)) return;
    const decimals = numText.includes('.') ? numText.split('.')[1].length : 0;

    /*
     * 不挂 ScrollTrigger。
     *
     * 数字滚动只用在 hero 里的核心指标（100+ / 2W+ / 70% / 99.9%），
     * 全都在首屏。给它挂滚动触发器是纯多余的时序依赖：
     * 触发器要等 ScrollTrigger 首轮 refresh 才算得出 start 位置，
     * 而 refresh 又依赖布局稳定（字体加载完、模型卡片撑开高度）。
     * 这段时间里数字已经不是 DOM 里的终值了（immediateRender 已把它
     * 改成 0），用户看到的就是 "0W+"。截图里正是这个状态。
     *
     * 去掉触发器后，tween 在 layout effect 里就开始跑，1.4s 内必然收尾。
     */
    let finished = false;
    // 补间跑在 state 上而不是 el 上，所以要留住引用才杀得掉它
    const state = { n: 0 };

    const ctx = gsap.context(() => {
      gsap.fromTo(
        state,
        { n: 0 },
        {
          n: target,
          duration: 1.4,
          ease: 'power2.out',
          /*
           * 这里和 useReveal 相反，必须是 true。
           *
           * 数字滚动没有"CSS 终态"可退守 —— 它的终态就是 DOM 里原本那个
           * 文本节点。如果起始态不立即渲染，GSAP 会在第一帧才把 DOM 改成
           * "0"，中间会闪一下终值再跳回 0，很难看。
           *
           * 代价是停摆时 DOM 里会永久留着中间值，所以下面那个保底定时器
           * 必须无条件写回 value（而不是只清样式）。两者是配套的。
           */
          immediateRender: true,
          onUpdate: () => {
            el.textContent = `${prefix}${state.n.toFixed(decimals)}${suffix}`;
          },
          onComplete: () => {
            finished = true;
            // 收尾写回原字符串，避免 toFixed 把 "100" 写成 "100.0"
            // 或丢掉原始单位写法
            el.textContent = value;
          },
        },
      );
    }, el);

    /*
     * 保底：数字是最容易出问题的一处 —— tween 一停摆，DOM 里就永久
     * 留着 "0W+" 这种中间值，而它已经覆盖了原本正确的终值。
     * 所以这里无条件写回 value，不像 useReveal 那样只清内联样式。
     */
    const failsafeId = window.setTimeout(() => {
      if (finished) return;
      gsap.killTweensOf(state);
      el.textContent = value;
    }, FAILSAFE_MS);

    return () => {
      window.clearTimeout(failsafeId);
      ctx.revert();
      // revert 会恢复 DOM 内容，但保险起见再写一次终值
      el.textContent = value;
    };
  }, [value]);

  return ref;
}

/**
 * 细线生长：一条 1px 的分割线从左展开。
 *
 * 用 scaleX 而不是改 width：width 会触发 layout，几十条线一起动就是长任务；
 * transform 走合成层，不碰布局。
 */
export function useGrowLine<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    /*
     * 首屏不挂 ScrollTrigger；首屏外才挂。
     *
     * immediateRender 恒为 false 是这里的关键：这条线的 CSS 默认就是
     * 完整长度（scaleX 未设置即 1）。起始态（scaleX:0）从不预先应用，
     * 所以动画停摆时它就是一条完整的线 —— 而不是一条消失的线。
     */
    const inFirstScreen = isInViewport(el);
    let finished = false;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.9,
          ease: 'power2.inOut',
          immediateRender: false,
          onComplete: () => {
            finished = true;
            gsap.set(el, { clearProps: 'transform' });
          },
          ...(inFirstScreen
            ? {}
            : { scrollTrigger: { trigger: el, start: 'top 92%', once: true } }),
        },
      );
    }, el);

    const failsafeId = window.setTimeout(() => {
      if (finished) return;
      if (!isInViewport(el)) return;
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform' });
    }, FAILSAFE_MS);

    return () => {
      window.clearTimeout(failsafeId);
      ctx.revert();
    };
  }, []);

  return ref;
}

/**
 * 滚动视差：元素随滚动轻微位移。
 *
 * 幅度刻意压得很小（默认 18px）。首页是阅读型页面，不是宣传片；
 * 幅度一大就会让人觉得内容在"飘"，反而干扰读文本。
 *
 * 视差是唯一一个「持续跟着滚动、不该 clearProps」的动效 ——
 * 它没有终态，全程由滚动位置驱动。所以这里不做 clearProps，
 * 但同样尊重 reduced-motion。
 */
export function useParallax<T extends HTMLElement = HTMLElement>(strength = 18) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: -strength / 2 },
        {
          y: strength / 2,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [strength]);

  return ref;
}

/** 页面卸载时统一清理，避免路由切换后 ScrollTrigger 残留导致后续页面位置错乱 */
export function useScrollTriggerCleanup() {
  useEffect(() => {
    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);
}
