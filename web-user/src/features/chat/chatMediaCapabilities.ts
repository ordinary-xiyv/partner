import {
  type AttachmentFileKind,
  buildAcceptAttribute,
  fileToAttachmentKind,
  parseModelInputTypeFlags,
} from '../modelInputTypes';

export type ChatPricingModelRow = {
  model_name: string;
  modalities?: string;
  input_types?: string;
};

function modelSupportsImageFromModalities(modalities?: string): boolean {
  return /image|vision/.test((modalities || '').toLowerCase());
}

function modelSupportsVideoFromModalities(modalities?: string): boolean {
  return /video/.test((modalities || '').toLowerCase());
}

function rowSupportsImage(row: ChatPricingModelRow | undefined): boolean {
  const flags = parseModelInputTypeFlags(row?.input_types);
  if (flags.isExplicit) return flags.image;
  return modelSupportsImageFromModalities(row?.modalities);
}

function rowSupportsVideo(row: ChatPricingModelRow | undefined): boolean {
  const flags = parseModelInputTypeFlags(row?.input_types);
  if (flags.isExplicit) return flags.video;
  return modelSupportsVideoFromModalities(row?.modalities);
}

/** 多模型取交集：所有已选模型均须支持该类型才可上传（仅图/视频附件，与语音合成无关） */
export function resolveChatAllowedAttachmentKinds(
  modelNames: string[],
  pricingModels: ChatPricingModelRow[],
): { image: boolean; video: boolean } {
  if (modelNames.length === 0) {
    return { image: true, video: false };
  }
  let image = true;
  let video = true;
  for (const name of modelNames) {
    const row = pricingModels.find((p) => p.model_name === name);
    image = image && rowSupportsImage(row);
    video = video && rowSupportsVideo(row);
  }
  return { image, video };
}

export function resolveChatAttachmentAccept(
  modelNames: string[],
  pricingModels: ChatPricingModelRow[],
): string {
  const kinds = resolveChatAllowedAttachmentKinds(modelNames, pricingModels);
  return buildAcceptAttribute(kinds) || 'image/*';
}

export function isAttachmentKindAllowed(
  kind: AttachmentFileKind,
  allowed: { image: boolean; video: boolean },
): boolean {
  return kind === 'image' ? allowed.image : allowed.video;
}

export function unsupportedModelsForAttachmentKind(
  kind: AttachmentFileKind,
  modelNames: string[],
  pricingModels: ChatPricingModelRow[],
): string[] {
  return modelNames.filter((name) => {
    const row = pricingModels.find((p) => p.model_name === name);
    if (kind === 'image') return !rowSupportsImage(row);
    return !rowSupportsVideo(row);
  });
}

export { fileToAttachmentKind };
