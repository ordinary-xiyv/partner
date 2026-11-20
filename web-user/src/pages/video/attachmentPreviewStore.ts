/** 参考图/附件 base64 预览：localStorage strip 后由 IndexedDB 恢复（仅前端展示） */

const DB_NAME = 'lynxton_video_attachment_previews_v1';
const STORE_NAME = 'previews';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export function attachmentPreviewStoreKey(generationId: string, attachmentId: string): string {
  return `${generationId}\u0000${attachmentId}`;
}

export async function putAttachmentPreview(
  generationId: string,
  attachmentId: string,
  dataUrl: string,
): Promise<void> {
  const url = dataUrl.trim();
  if (!url.startsWith('data:')) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('indexedDB write failed'));
      };
      tx.objectStore(STORE_NAME).put(url, attachmentPreviewStoreKey(generationId, attachmentId));
    });
  } catch {
    /* quota / private mode — 忽略，仍可用内存缓存 */
  }
}

export async function getAttachmentPreview(
  generationId: string,
  attachmentId: string,
): Promise<string | undefined> {
  try {
    const db = await openDb();
    return await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('indexedDB read failed'));
      };
      const req = tx.objectStore(STORE_NAME).get(attachmentPreviewStoreKey(generationId, attachmentId));
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === 'string' && v.trim() ? v : undefined);
      };
      req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
    });
  } catch {
    return undefined;
  }
}

export async function hydrateAttachmentPreviewMemoryCache(
  sessions: Array<{ generations: Array<{ id: string; attachments: Array<{ id: string; preview?: string; ossPublicUrl?: string }> }> }>,
  memoryCache: Map<string, string>,
): Promise<boolean> {
  const tasks: Promise<void>[] = [];
  let scheduled = 0;
  for (const s of sessions) {
    for (const g of s.generations) {
      for (const att of g.attachments) {
        if (att.ossPublicUrl?.trim() || att.preview?.trim()) continue;
        const key = attachmentPreviewStoreKey(g.id, att.id);
        if (memoryCache.has(key)) continue;
        scheduled += 1;
        tasks.push(
          getAttachmentPreview(g.id, att.id).then((url) => {
            if (url) memoryCache.set(key, url);
          }),
        );
      }
    }
  }
  if (scheduled === 0) return false;
  await Promise.all(tasks);
  return true;
}
