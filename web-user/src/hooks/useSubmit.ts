import { useRef, useState, useCallback } from 'react';

/**
 * useSubmit - 防重入提交 hook
 *
 * 解决的问题：
 * 1. React setState 是异步的，disabled={loading} 来不及在第二次点击前生效
 * 2. 用户快速多次点击或按 Enter 会触发多次请求
 *
 * 用法：
 *   const { submitting, submit } = useSubmit();
 *   const handleSubmit = submit(async () => { ... });
 *   <button disabled={submitting} onClick={handleSubmit}>提交</button>
 */
export function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef(false);

  const submit = useCallback(<T extends unknown[]>(fn: (...args: T) => Promise<void>) => {
    return async (...args: T) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setSubmitting(true);
      try {
        await fn(...args);
      } finally {
        setSubmitting(false);
        lockRef.current = false;
      }
    };
  }, []);

  return { submitting, submit };
}
