/** 图像对话可选比例 → OpenAI 兼容 size 参数 */
export const IMAGE_ASPECT_RATIO_OPTIONS = [
  { ratio: '1:1', labelKey: 'chat.imageAspectSquare', size: '1024x1024' },
  { ratio: '16:9', labelKey: 'chat.imageAspectLandscape', size: '1792x1024' },
  { ratio: '9:16', labelKey: 'chat.imageAspectPortrait', size: '1024x1792' },
  { ratio: '4:3', labelKey: 'chat.imageAspectGeneral', size: '1024x768' },
  { ratio: '3:4', labelKey: 'chat.imageAspectCover', size: '768x1024' },
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_OPTIONS)[number]['ratio'];

export const DEFAULT_IMAGE_ASPECT_RATIO: ImageAspectRatio = '16:9';

export function resolveImageSizeFromRatio(ratio: ImageAspectRatio): string {
  const found = IMAGE_ASPECT_RATIO_OPTIONS.find((o) => o.ratio === ratio);
  return found?.size ?? '1024x1024';
}

/** 按已选模型过滤可用比例；暂无后端元数据时返回全部，DALL·E 3 仅三种尺寸 */
export function resolveImageAspectRatioOptions(modelNames: string[]): typeof IMAGE_ASPECT_RATIO_OPTIONS[number][] {
  if (modelNames.length === 0) {
    return [...IMAGE_ASPECT_RATIO_OPTIONS];
  }
  const onlyDalle3 = modelNames.every((m) => /dall[- ]?e[- ]?3/i.test(m));
  if (onlyDalle3) {
    return IMAGE_ASPECT_RATIO_OPTIONS.filter((o) =>
      ['1:1', '16:9', '9:16'].includes(o.ratio),
    );
  }
  return [...IMAGE_ASPECT_RATIO_OPTIONS];
}

export function normalizeImageAspectRatioDraft(
  draft: ImageAspectRatio,
  modelNames: string[],
): ImageAspectRatio {
  const options = resolveImageAspectRatioOptions(modelNames);
  if (options.some((o) => o.ratio === draft)) return draft;
  return options[0]?.ratio ?? DEFAULT_IMAGE_ASPECT_RATIO;
}
