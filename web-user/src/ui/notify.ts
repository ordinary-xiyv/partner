import { createElement } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

let messageApi: MessageInstance | null = null;

export function bindNotifyMessage(api: MessageInstance) {
  messageApi = api;
}

function getMessage(): MessageInstance {
  if (!messageApi) {
    throw new Error('notify is not initialized; wrap app with NotifyProvider');
  }
  return messageApi;
}

function durationForText(text: string, base: number): number {
  if (text.length <= 48) return base;
  if (text.length <= 120) return base + 1;
  return Math.min(base + 3, 8);
}

function messageKey(type: string, text: string): string {
  return `${type}:${text.slice(0, 80)}`;
}

function messageContent(text: string) {
  return createElement('div', { className: 'lynx-message-bubble', title: text }, text);
}

function open(
  type: 'success' | 'error' | 'warning' | 'info',
  content: string,
  baseDuration: number,
) {
  const duration = durationForText(content, baseDuration);
  return getMessage()[type]({
    content: messageContent(content),
    duration,
    key: messageKey(type, content),
  });
}

export const notify = {
  success(content: string, duration = 3) {
    return open('success', content, duration);
  },
  error(content: string, duration = 4) {
    return open('error', content, duration);
  },
  warning(content: string, duration = 3) {
    return open('warning', content, duration);
  },
  info(content: string, duration = 3) {
    return open('info', content, duration);
  },
};
