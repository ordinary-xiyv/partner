import type { DocArticle, DocLang } from '../types';

const mediaModelCurlContent = {
  zh: (baseUrl: string): string => `# 图片与视频模型 curl 请求测试

> 模块：AI API 转发 - 图片/视频模型  
> 功能：图片生成、视频生成、视频任务查询、视频内容下载  
> API：\`POST /v1/images/generations\`、\`POST /v1/videos\`、\`GET /v1/videos/{task_id}\`、\`GET /v1/videos/{task_id}/content\`  
> 鉴权：\`Authorization: Bearer <API_TOKEN>\`

---

## 图片模型测试

### 文生图

\`\`\`bash
curl -sS -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "一只橙色机械猫坐在未来城市屋顶，电影感光影",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

**预期结果**：
- HTTP 200
- 返回 \`data\` 数组
- \`data[0].url\` 或 \`data[0].b64_json\` 有值（取决于渠道和模型返回格式）

### 指定 base64 返回

\`\`\`bash
curl -sS -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "极简风格的 SaaS 数据看板图标，白底",
    "n": 1,
    "size": "1024x1024",
    "response_format": "b64_json"
  }'
\`\`\`

**预期结果**：
- 返回 \`data[0].b64_json\`
- 如果渠道不支持 \`response_format=b64_json\`，可能返回上游参数错误

### 异常测试：无效 Token

\`\`\`bash
curl -i -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer sk-invalid-token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "test"
  }'
\`\`\`

**预期结果**：
- 返回 401 或鉴权失败错误

### 异常测试：空 prompt

\`\`\`bash
curl -i -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": ""
  }'
\`\`\`

**预期结果**：
- 返回参数校验错误或上游错误

---

## 视频模型测试

视频生成是异步任务。创建任务后先拿到 \`id\` 或 \`task_id\`，再轮询任务状态。

### 文生视频

\`\`\`bash
curl -sS -X POST "${baseUrl}/v1/videos" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance-1-0-pro-250528",
    "prompt": "一只黄色头发的猫在阳光下回头，电影感，稳定镜头",
    "duration": 5,
    "size": "720p",
    "metadata": {
      "duration": 5,
      "resolution": "720p",
      "ratio": "16:9",
      "aspect_ratio": "16:9"
    }
  }'
\`\`\`

**预期结果**：
- HTTP 200
- 返回 \`id\` 或 \`task_id\`
- \`status\` 通常为 \`queued\` 或 \`in_progress\`

### 图生视频

将 \`IMAGE_URL\` 替换为公网可访问图片地址，或使用较小的 \`data:image/jpeg;base64,...\`。

\`\`\`bash
export IMAGE_URL="https://example.com/input.jpg"

curl -sS -X POST "${baseUrl}/v1/videos" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"model\\": \\"doubao-seedance-1-0-pro-250528\\",
    \\"prompt\\": \\"让画面中的主体缓慢转头，背景轻微运镜，真实电影质感\\",
    \\"duration\\": 5,
    \\"size\\": \\"720p\\",
    \\"images\\": [\\"$IMAGE_URL\\"],
    \\"metadata\\": {
      \\"duration\\": 5,
      \\"resolution\\": \\"720p\\",
      \\"ratio\\": \\"16:9\\",
      \\"aspect_ratio\\": \\"16:9\\"
    }
  }"
\`\`\`

**预期结果**：
- HTTP 200
- 返回视频任务 ID
- 如果图片过大或网关 body 限制过小，可能返回 413

### 查询视频任务状态

将 \`TASK_ID\` 替换为创建视频接口返回的 \`id\` 或 \`task_id\`。

\`\`\`bash
curl -sS "${baseUrl}/v1/videos/$TASK_ID" \\
  -H "Authorization: Bearer $API_TOKEN"
\`\`\`

**预期结果**：
- 返回 \`status\`
- 常见状态：\`queued\`、\`in_progress\`、\`completed\`、\`failed\`
- \`completed\` 时可以继续下载视频内容

### 下载视频内容

\`\`\`bash
curl -L "${baseUrl}/v1/videos/$TASK_ID/content" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -o output.mp4
\`\`\`

**预期结果**：
- 生成 \`output.mp4\`
- 如果任务未完成，可能返回错误 JSON 或 404/400
`,
  en: (baseUrl: string): string => `# Image & Video Model cURL Tests

This page provides quick cURL examples for image/video generation and video task polling.

- Auth: \`Authorization: Bearer <API_TOKEN>\`
- APIs:
  - \`POST /v1/images/generations\`
  - \`POST /v1/videos\`
  - \`GET /v1/videos/{task_id}\`
  - \`GET /v1/videos/{task_id}/content\`

## Text to Image

\`\`\`bash
curl -sS -X POST "${baseUrl}/v1/images/generations" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-1",
    "prompt": "An orange mechanical cat on a futuristic rooftop",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

## Text to Video

\`\`\`bash
curl -sS -X POST "${baseUrl}/v1/videos" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "doubao-seedance-1-0-pro-250528",
    "prompt": "A cinematic cat turning back in sunlight",
    "duration": 5,
    "size": "720p",
    "metadata": {
      "duration": 5,
      "resolution": "720p",
      "ratio": "16:9",
      "aspect_ratio": "16:9"
    }
  }'
\`\`\`

## Query Video Task

\`\`\`bash
curl -sS "${baseUrl}/v1/videos/$TASK_ID" \\
  -H "Authorization: Bearer $API_TOKEN"
\`\`\`

## Download Video Content

\`\`\`bash
curl -L "${baseUrl}/v1/videos/$TASK_ID/content" \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -o output.mp4
\`\`\`
`,
};

export function GetMediaModelCurlContent(baseUrl: string, lang: DocLang): string {
  return mediaModelCurlContent[lang](baseUrl);
}

export const article: DocArticle = {
  key: 'media-model-curl',
  groupKey: 'docs',
  order: 2.5,
  label: { zh: '图片与视频模型接入文档', en: 'Image & Video Model Integration Documentation' },
  getContent: GetMediaModelCurlContent,
};

