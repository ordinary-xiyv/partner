/** 写入前合并内存与 localStorage，避免仅存在内存的新会话在 mutation 时被 LS 旧数据覆盖 */

export interface MergeableConversation {
  id: string;
  createdAt: number;
  messages: Array<{ streaming?: boolean; content?: unknown }>;
}

function messageContentLength(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) return content.length;
  return 0;
}

function pickNewerConversation<T extends MergeableConversation>(mem: T, ls: T): T {
  if (mem.messages.length !== ls.messages.length) {
    return mem.messages.length > ls.messages.length ? mem : ls;
  }
  const memStreaming = mem.messages.some((m) => m.streaming);
  const lsStreaming = ls.messages.some((m) => m.streaming);
  if (memStreaming !== lsStreaming) return memStreaming ? mem : ls;
  const memChars = mem.messages.reduce((n, m) => n + messageContentLength(m.content), 0);
  const lsChars = ls.messages.reduce((n, m) => n + messageContentLength(m.content), 0);
  return memChars >= lsChars ? mem : ls;
}

export function mergeConversationsForMutation<T extends MergeableConversation>(
  mem: T[],
  ls: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const c of ls) byId.set(c.id, c);
  for (const c of mem) {
    const existing = byId.get(c.id);
    if (!existing) {
      byId.set(c.id, c);
      continue;
    }
    byId.set(c.id, pickNewerConversation(c, existing));
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}
