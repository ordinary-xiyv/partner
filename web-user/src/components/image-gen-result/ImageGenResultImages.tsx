import { Image as AntdImage } from 'antd';
import { ImageGenResultImage } from './ImageGenResultImage';

/** 单张或多张生成图（antd PreviewGroup 切换预览） */
export function ImageGenResultImages({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  return (
    <AntdImage.PreviewGroup>
      <div className="image-gen-result-images">
        {urls.map((src, index) => (
          <ImageGenResultImage key={`${src}-${index}`} src={src} />
        ))}
      </div>
    </AntdImage.PreviewGroup>
  );
}
