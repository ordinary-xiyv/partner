import { message as staticMessage } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

/**
 * 全局消息提示。
 * 页面内禁止直接 import { message } from 'antd'，统一走这里，便于后续接入 i18n。
 *
 * 关于为什么要 bind：
 * antd 的静态 `message.xxx` 拿不到 ConfigProvider 的主题上下文，
 * 暗色模式下会弹出一块白底提示，控制台还会警告
 * 「Static function can not consume context like dynamic theme」。
 * ThemeProvider 内部会调用 bindMessage(useApp().message) 换成带上下文的实例，
 * 之后这里所有调用都走实例方法。
 */
let bound: MessageInstance | null = null;

/** 由 ThemeProvider 在 AntdApp 内部调用，接管消息实例 */
export function bindMessage(api: MessageInstance | null): void {
  bound = api;
}

export const notify = {
  success(content: string) {
    void (bound ?? staticMessage).success(content);
  },
  error(content: string) {
    void (bound ?? staticMessage).error(content);
  },
  warning(content: string) {
    void (bound ?? staticMessage).warning(content);
  },
  info(content: string) {
    void (bound ?? staticMessage).info(content);
  },
};

export function notifyApiSuccess(text = '操作成功') {
  notify.success(text);
}

export function notifyApiError(err: unknown, fallback = '操作失败') {
  notify.error(extractErrorMessage(err) || fallback);
}

/** 从 axios 错误 / 后端响应体中尽力提取可读文案 */
export function extractErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const anyErr = err as {
    message?: string;
    response?: { data?: { message?: string; error?: { message?: string } } };
  };
  const fromBody = anyErr.response?.data?.message || anyErr.response?.data?.error?.message;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;
  if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
  return '';
}
