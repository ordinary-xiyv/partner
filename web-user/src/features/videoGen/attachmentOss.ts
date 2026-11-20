import { type GenMediaBizRef, uploadGenInputVideoToOss } from './genMediaUpload';

export type VideoOssUploadCallbacks = {
  onStart: (rowId: string, preview: string, sizeBytes: number) => void;
  onProgress?: (rowId: string, percent: number) => void;
  onSuccess: (rowId: string, publicUrl: string, fileId: string) => void;
  onError: (rowId: string, message: string) => void;
};

/** 将本地视频文件上传至 gen-media 公网读 OSS（与欢乐马 video-edit 相同链路） */
export async function uploadLocalVideoFileToGenMediaOss(
  file: File,
  rowId: string,
  readPreview: (file: File) => Promise<string>,
  callbacks: VideoOssUploadCallbacks,
  bizRef: GenMediaBizRef = 'video_edit',
): Promise<void> {
  const preview = await readPreview(file);
  callbacks.onStart(rowId, preview, file.size);
  try {
    const { public_url: publicUrl, file_id: fileId } = await uploadGenInputVideoToOss(
      file,
      bizRef,
      (percent) => callbacks.onProgress?.(rowId, percent),
    );
    callbacks.onSuccess(rowId, publicUrl, fileId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '上传失败';
    callbacks.onError(rowId, msg);
    throw err;
  }
}
