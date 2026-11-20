import type { ChatUserContentPart } from '../videoGen/videoTaskModel';

type MessageLike = {
  role: string;
  content?: string | ChatUserContentPart[];
};

type ConversationLike = {
  id: string;
  messages: MessageLike[];
};

export function collectChatImageFileIdsFromContent(
  content: string | ChatUserContentPart[] | undefined,
): string[] {
  if (typeof content === 'string' || !Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const part of content) {
    if (part.type !== 'image_url') continue;
    const id = part.file_id?.trim();
    if (id) ids.push(id);
  }
  return ids;
}

export function collectChatImageFileIdsFromMessages(messages: MessageLike[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    ids.push(...collectChatImageFileIdsFromContent(m.content));
  }
  return ids;
}

/** 删除某会话时，去掉仍被其它会话引用的 file_id（例如复制会话） */
export function chatImageFileIdsToDelete(
  targetConv: ConversationLike | undefined,
  allConversations: ConversationLike[],
  extraFileIds: string[] = [],
): string[] {
  if (!targetConv) {
    return [...new Set(extraFileIds.map((id) => id.trim()).filter(Boolean))];
  }
  const candidates = [...new Set([
    ...collectChatImageFileIdsFromMessages(targetConv.messages),
    ...extraFileIds.map((id) => id.trim()).filter(Boolean),
  ])];
  if (candidates.length === 0) return [];
  const want = new Set(candidates);
  const still = new Set<string>();
  for (const conv of allConversations) {
    if (conv.id === targetConv.id) continue;
    for (const id of collectChatImageFileIdsFromMessages(conv.messages)) {
      if (want.has(id)) still.add(id);
    }
  }
  return candidates.filter((id) => !still.has(id));
}
