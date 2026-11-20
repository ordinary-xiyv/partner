import { ComposerFrameUploadZone, type ComposerFrameUploadZoneProps } from './ComposerFrameUploadZone';
import { ComposerRefUploadZone, type ComposerRefUploadZoneProps } from './ComposerRefUploadZone';

export type ComposerUploadZoneMultiRefProps = {
  mode: 'multi-ref';
} & ComposerRefUploadZoneProps;

export type ComposerUploadZoneFramesProps = {
  mode: 'frames';
} & ComposerFrameUploadZoneProps;

export type ComposerUploadZoneProps = ComposerUploadZoneMultiRefProps | ComposerUploadZoneFramesProps;

/**
 * Composer 上传统一入口：`multi-ref` 多参考叠卡；`frames` 首尾帧或仅首帧。
 */
export function ComposerUploadZone(props: ComposerUploadZoneProps) {
  if (props.mode === 'multi-ref') {
    const { mode: _mode, ...rest } = props;
    return <ComposerRefUploadZone {...rest} />;
  }
  const { mode: _mode, ...rest } = props;
  return <ComposerFrameUploadZone {...rest} />;
}
