import { buildAcceptAttribute, parseModelInputTypeFlags } from '../modelInputTypes';
import { getHappyHorseMode } from './happyHorse';
import {
  getMiniMaxH3Variant,
  MINIMAX_H3_IMAGE_ACCEPT,
  MINIMAX_H3_OMNI_ACCEPT,
} from './minimaxH3';

export type VideoGenComposerMode = 't2v' | 'first_frame' | 'omni_ref' | 'first_last';

export type ComposerMediaCapability = {
  supportsReferenceImage: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceAudio: boolean;
  acceptAttribute: string;
};

/** 视频对话 composer：按模型名、生成模式与 input_types 决定可上传的参考素材类型 */
export function resolveVideoGenComposerMediaCapability(
  model: string,
  videoGenMode: VideoGenComposerMode,
  inputTypes?: string,
): ComposerMediaCapability {
  const hhMode = getHappyHorseMode(model);
  const h3Variant = getMiniMaxH3Variant(model);

  if (h3Variant) {
    if (videoGenMode === 't2v') {
      return {
        supportsReferenceImage: false,
        supportsReferenceVideo: false,
        supportsReferenceAudio: false,
        acceptAttribute: '',
      };
    }
    if (videoGenMode === 'omni_ref' && h3Variant === 'h3') {
      return {
        supportsReferenceImage: true,
        supportsReferenceVideo: true,
        supportsReferenceAudio: true,
        acceptAttribute: MINIMAX_H3_OMNI_ACCEPT,
      };
    }
    return {
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsReferenceAudio: false,
      acceptAttribute: MINIMAX_H3_IMAGE_ACCEPT,
    };
  }

  if (hhMode === 't2v') {
    return {
      supportsReferenceImage: false,
      supportsReferenceVideo: false,
      supportsReferenceAudio: false,
      acceptAttribute: '',
    };
  }
  if (hhMode === 'i2v' || hhMode === 'r2v') {
    return {
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsReferenceAudio: false,
      acceptAttribute: 'image/*',
    };
  }
  if (hhMode === 'video-edit') {
    return {
      supportsReferenceImage: true,
      supportsReferenceVideo: true,
      supportsReferenceAudio: false,
      acceptAttribute: 'image/*,video/*',
    };
  }

  if (videoGenMode === 'first_last' || videoGenMode === 'first_frame') {
    return {
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsReferenceAudio: false,
      acceptAttribute: 'image/*',
    };
  }

  const flags = parseModelInputTypeFlags(inputTypes);
  return {
    supportsReferenceImage: flags.image,
    supportsReferenceVideo: flags.video,
    supportsReferenceAudio: false,
    acceptAttribute: buildAcceptAttribute({ image: flags.image, video: flags.video }) || 'image/*',
  };
}
