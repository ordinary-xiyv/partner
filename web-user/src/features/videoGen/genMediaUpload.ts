import API from '../../api';
import type { LynxStorageUploadInitData } from '../../types';

export type GenMediaPublicUrlResult = {
  public_url: string;
  file_id: string;
  public_readable?: boolean;
  probe_message?: string;
};

export type GenMediaBizRef = 'video_edit' | 'seedance_ref';

/** 申请生成输入视频上传（公网读 OSS，供上游拉取） */
export async function initGenMediaVideoUpload(
  file: File,
  bizRef: GenMediaBizRef = 'video_edit',
): Promise<LynxStorageUploadInitData> {
  const contentType = file.type?.trim() || 'video/mp4';
  const res = await API.post<{ success: boolean; data?: LynxStorageUploadInitData; message?: string }>(
    '/api/lynx/gen-media/uploads',
    {
      original_name: file.name,
      content_type: contentType,
      size_bytes: file.size,
      biz_ref: bizRef,
    },
  );
  if (!res.data?.success || !res.data.data?.file_id) {
    throw new Error(res.data?.message || '申请上传失败');
  }
  return res.data.data;
}

/** 服务端代传至 OSS（避免浏览器直传 CORS） */
export async function proxyGenMediaUpload(
  fileId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const res = await API.post<{ success: boolean; message?: string }>(
    `/api/lynx/gen-media/files/${encodeURIComponent(fileId)}/upload`,
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

/** 获取公网可读 URL（供上游拉取） */
export async function getGenMediaPublicUrl(fileId: string): Promise<GenMediaPublicUrlResult> {
  const res = await API.get<{ success: boolean; data?: GenMediaPublicUrlResult; message?: string }>(
    `/api/lynx/gen-media/files/${encodeURIComponent(fileId)}/public-url`,
  );
  if (!res.data?.success || !res.data.data?.public_url) {
    throw new Error(res.data?.message || '获取公网链接失败');
  }
  return res.data.data;
}

/** 完整流程：init → 代传 → 公网 URL（含匿名可读探测） */
export async function uploadGenInputVideoToOss(
  file: File,
  bizRef: GenMediaBizRef = 'video_edit',
  onProgress?: (percent: number) => void,
): Promise<GenMediaPublicUrlResult> {
  if (!file.size) {
    throw new Error('视频文件为空，无法上传');
  }
  onProgress?.(0);
  const init = await initGenMediaVideoUpload(file, bizRef);
  await proxyGenMediaUpload(init.file_id, file, (uploadPct) => {
    onProgress?.(5 + Math.round(uploadPct * 0.85));
  });
  onProgress?.(92);
  const result = await getGenMediaPublicUrl(init.file_id);
  onProgress?.(100);
  if (result.public_readable === false) {
    const hint = result.probe_message?.trim() || 'unknown';
    throw new Error(`视频公网链接不可读（${hint}），请检查 OSS Bucket 对 public/gen-input 的匿名读策略`);
  }
  return result;
}
