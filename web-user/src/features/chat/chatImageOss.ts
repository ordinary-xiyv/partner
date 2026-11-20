import API, { getStorageFileDownloadUrl } from '../../api';
import type { LynxStorageUploadInitData } from '../../types';

const CHAT_IMAGE_BIZ_TYPE = 'chat_image';

export type ChatImageOssUploadResult = {
  file_id: string;
  url: string;
};

async function initChatImageUpload(file: File, bizRef: string): Promise<LynxStorageUploadInitData> {
  const contentType = file.type?.trim() || 'image/jpeg';
  const res = await API.post<{ success: boolean; data?: LynxStorageUploadInitData; message?: string }>(
    '/api/lynx/storage/uploads',
    {
      biz_type: CHAT_IMAGE_BIZ_TYPE,
      biz_ref: bizRef,
      original_name: file.name,
      content_type: contentType,
      size_bytes: file.size,
    },
  );
  if (!res.data?.success || !res.data.data?.file_id) {
    throw new Error(res.data?.message || '申请上传失败');
  }
  return res.data.data;
}

async function proxyChatImageUpload(
  fileId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const res = await API.post<{ success: boolean; message?: string }>(
    `/api/lynx/storage/files/${encodeURIComponent(fileId)}/upload`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (event) => {
        if (!onProgress) return;
        const total = event.total ?? file.size;
        if (total > 0) {
          onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
        }
      },
    },
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || '上传失败');
  }
}

/** 对话附图：init → 代传 → 预签名下载 URL（私有桶，供展示与上游短时拉取） */
export async function uploadChatImageToOss(
  file: File,
  bizRef: string,
  onProgress?: (percent: number) => void,
): Promise<ChatImageOssUploadResult> {
  if (!file.size) {
    throw new Error('图片文件为空，无法上传');
  }
  const ref = bizRef.trim() || 'pending';
  onProgress?.(0);
  const init = await initChatImageUpload(file, ref);
  const fileId = init.file_id?.trim();
  if (!fileId) {
    throw new Error('申请上传失败');
  }
  await proxyChatImageUpload(fileId, file, (uploadPct) => {
    onProgress?.(5 + Math.round(uploadPct * 0.85));
  });
  onProgress?.(92);
  const dl = await getStorageFileDownloadUrl(fileId);
  const url = dl.data?.data?.url?.trim();
  if (!dl.data?.success || !url) {
    throw new Error(dl.data?.message || '获取图片链接失败');
  }
  onProgress?.(100);
  return { file_id: fileId, url };
}

export async function deleteStorageFiles(fileIds: string[]): Promise<void> {
  const unique = [...new Set(fileIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.allSettled(
    unique.map((id) => API.delete(`/api/lynx/storage/files/${encodeURIComponent(id)}`)),
  );
}
