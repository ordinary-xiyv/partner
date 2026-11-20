/** 组装 POST /v1/images/generations 请求体（文生图 / 图生图） */
export function buildImageGenerationsRequestBody(
  model: string,
  prompt: string,
  referenceImageUrls: string[],
  size?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    response_format: 'url',
  };
  if (size) {
    body.size = size;
  }
  const refs = referenceImageUrls.map((u) => u.trim()).filter(Boolean);
  if (refs.length === 1) {
    body.image = refs[0];
  } else if (refs.length > 1) {
    body.image = refs;
  }
  return body;
}
