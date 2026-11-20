import type { DocArticle, DocLang } from '../types';

const streamingApiContent = {
	zh: (baseUrl: string): string => `# 流式输出（SSE）

当 \`stream: true\` 时，Chat Completions 以 **Server-Sent Events** 逐段返回内容。

## 端点

\`\`\`
POST ${baseUrl}/v1/chat/completions
\`\`\`

## 最小请求示例

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role":"user","content":"请分三点解释 RAG"}]
  }'
\`\`\`

## 返回格式说明

流中每行通常以 \`data: \` 开头，后面是 JSON。结束时通常出现：

\`\`\`
data: [DONE]
\`\`\`

增量正文常见字段：

\`\`\`json
{
  "choices": [
    {
      "delta": { "content": "..." }
    }
  ]
}
\`\`\`

## 客户端拼接逻辑

1. 逐块读取响应体  
2. 按换行拆分出每条 \`data:\`  
3. 跳过 \`[DONE]\`  
4. 解析 JSON，取 \`choices[0].delta.content\` 追加到缓冲区  

## Node.js 示例（fetch）

\`\`\`ts
const resp = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer sk-your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [{ role: 'user', content: 'Hello' }],
  }),
});

const reader = resp.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
let text = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith('data: ')) continue;
    const payload = s.slice(6);
    if (payload === '[DONE]') continue;
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) text += delta;
  }
}
\`\`\`

## 注意事项

- 流式请求更依赖网络稳定性，建议实现超时与取消（AbortController）  
- 部分上游会在最后 chunk 才给 \`usage\`，有些不会给  
- 若出现 JSON 分片不完整，务必做 buffer 续拼，不能逐 chunk 直接 JSON.parse
`,
	en: (baseUrl: string): string => `# Streaming (SSE)

With \`stream: true\`, Chat Completions returns incremental chunks via **Server-Sent Events**.

## Endpoint

\`\`\`
POST ${baseUrl}/v1/chat/completions
\`\`\`

## Minimal request

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role":"user","content":"Explain RAG in 3 bullets"}]
  }'
\`\`\`

## Response shape

Each SSE line usually starts with \`data: \` followed by JSON. The stream typically ends with:

\`\`\`
data: [DONE]
\`\`\`

Incremental text is commonly in:

\`\`\`json
{
  "choices": [
    {
      "delta": { "content": "..." }
    }
  ]
}
\`\`\`

## Client merge logic

1. Read response body as chunks  
2. Split by newline into \`data:\` entries  
3. Skip \`[DONE]\`  
4. Parse JSON and append \`choices[0].delta.content\`  

## Node.js example (fetch)

\`\`\`ts
const resp = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer sk-your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [{ role: 'user', content: 'Hello' }],
  }),
});

const reader = resp.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
let text = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith('data: ')) continue;
    const payload = s.slice(6);
    if (payload === '[DONE]') continue;
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) text += delta;
  }
}
\`\`\`

## Notes

- Streaming is more sensitive to network interruptions; implement timeout/cancel (AbortController)  
- \`usage\` may appear only in the final chunk (or not at all), depending on upstream  
- Handle partial JSON safely with a rolling buffer; do not parse per raw chunk
`,
};

export function GetStreamingApiContent(baseUrl: string, lang: DocLang): string {
	return streamingApiContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'streaming',
	groupKey: 'api',
	order: 20,
	label: { zh: '流式输出（SSE）', en: 'Streaming (SSE)' },
	getContent: GetStreamingApiContent,
};

