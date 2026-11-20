import type { ChatUserContentPart } from '../videoGen/videoTaskModel';

type StripMessage = {
  role: string;
  content?: string | ChatUserContentPart[];
  [key: string]: unknown;
};

type StripConversation = {
  id: string;
  createdAt: number;
  messages: StripMessage[];
  [key: string]: unknown;
};

function stripContentPart(part: ChatUserContentPart): ChatUserContentPart {
  if (part.type === 'image_url') {
    const url = part.image_url.url.trim();
    const fileId = part.file_id?.trim();
    if (url.startsWith('data:')) {
      return fileId
        ? { type: 'image_url', image_url: { url: '' }, file_id: fileId }
        : { type: 'image_url', image_url: { url: '' } };
    }
  }
  if (part.type === 'video_url') {
    const url = part.video_url.url.trim();
    if (url.startsWith('data:')) {
      return { type: 'video_url', video_url: { url: '' } };
    }
  }
  return part;
}

function stripMessageContent(content: string | ChatUserContentPart[]): string | ChatUserContentPart[] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content;
  return content.map(stripContentPart);
}

/** 落盘前去掉消息中的 base64 媒体，避免 localStorage 超配额 */
export function stripChatConversationsForPersist<T extends StripConversation>(convs: T[]): T[] {
  return convs.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (m.role !== 'user' && m.role !== 'assistant') return m;
      if (m.content == null) return m;
      return { ...m, content: stripMessageContent(m.content as string | ChatUserContentPart[]) };
    }),
  }));
}
