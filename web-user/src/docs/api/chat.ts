import type { DocArticle, DocLang } from '../types';

const chatApiContent = {
	zh: (baseUrl: string): string => `# Chat Completions API

与 **OpenAI Chat Completions** 兼容的对话接口，用于多轮聊天、单轮问答等。实际可用模型以控制台中已配置的渠道为准。

## 端点

\`\`\`
POST ${baseUrl}/v1/chat/completions
\`\`\`

## 认证

在请求头中携带平台发放的 API Key（与「API Keys / 令牌」页面一致）：

| 请求头 | 说明 |
|--------|------|
| \`Authorization\` | \`Bearer sk-...\` |
| \`Content-Type\` | \`application/json\` |

部分部署也可通过网关约定的其它头传递用户身份；以你当前环境文档为准。

## 请求体（常用字段）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`model\` | string | 是 | 模型 ID，须与上游渠道支持的名称一致（如 \`gpt-4o-mini\`、\`deepseek-chat\` 等） |
| \`messages\` | array | 是 | 对话消息列表，见下文「消息结构」 |
| \`temperature\` | number | 否 | 采样温度，一般 \`0\`–\`2\`，默认约 \`1\`；越低越稳定，越高越随机 |
| \`top_p\` | number | 否 | 核采样，与 \`temperature\` 二选一调节即可，常用 \`0\`–\`1\` |
| \`max_tokens\` | number | 否 | 模型回复的最大 token 数（上限受模型与渠道限制） |
| \`stream\` | boolean | 否 | \`true\` 时以 **SSE** 流式返回增量内容；\`false\` 或未传则一次性返回完整 JSON |
| \`stop\` | string / string[] | 否 | 遇到该字符串（或多个之一）时停止生成 |
| \`frequency_penalty\` | number | 否 | 频率惩罚，\`-2.0\`–\`2.0\` |
| \`presence_penalty\` | number | 否 | 存在惩罚，\`-2.0\`–\`2.0\` |
| \`n\` | integer | 否 | 每条输入生成几条候选回复，默认 \`1\`（是否生效取决于上游） |
| \`response_format\` | object | 否 | 如 \`{ "type": "json_object" }\` 等，需模型与渠道支持 |
| \`tools\` / \`tool_choice\` | array / object | 否 | 函数调用 / 工具调用，需模型与渠道支持 |

未列出的字段若与 OpenAI 官方一致，可能被转发至上游；**最终以渠道与网关实现为准**。

## 消息结构 \`messages\`

每条元素为对象，至少包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| \`role\` | string | \`system\`（系统提示）、\`user\`（用户）、\`assistant\`（助手历史）、部分场景下 \`tool\` |
| \`content\` | string 或数组 | 文本用字符串即可；**多模态（视觉）** 时为片段数组，见下 |

**纯文本示例：**

\`\`\`json
[
  { "role": "system", "content": "你是一个简洁的助手。" },
  { "role": "user", "content": "用一句话介绍什么是 RAG。" }
]
\`\`\`

**多模态（文本 + 图片 URL 或 base64 data URL）示例：**

\`\`\`json
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "这张图里有什么？" },
      { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
    ]
  }
]
\`\`\`

是否支持图片、最大张数与格式以**具体模型与渠道**为准。

## 非流式响应（\`stream: false\`）

典型 JSON 结构包含：

- \`id\`：请求 ID  
- \`object\`：\`chat.completion\`  
- \`created\`：时间戳  
- \`model\`：实际使用的模型名  
- \`choices[]\`：数组，每项含 \`index\`、\`message\`（\`role\`、\`content\`，部分模型含 \`reasoning_content\` 等）、\`finish_reason\`  
- \`usage\`：\`prompt_tokens\`、\`completion_tokens\`、\`total_tokens\` 等  

业务上一般读取 \`choices[0].message.content\` 作为回复正文。

## 流式响应（\`stream: true\`）

- \`Content-Type\` 多为 \`text/event-stream\`
- 正文为多行 **SSE**：以 \`data: \` 开头，每行一段 JSON；流结束常有 \`data: [DONE]\`
- 增量内容通常在 \`choices[0].delta.content\`；需客户端拼接为完整回复
- 部分实现会在最后一个 chunk 附带 \`usage\`，视上游而定

## 错误与限流

HTTP 非 2xx 时，响应体多为 JSON，常见字段如 \`error\`（含 \`message\`、\`type\`、\`code\` 等）。  
密钥无效、额度不足、模型未配置、上游超时等均可能返回错误，请根据 \`message\` 与 HTTP 状态排查。

## 请求示例（curl）

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "What is AI?" }
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'
\`\`\`
`,
	en: (baseUrl: string): string => `# Chat Completions API

**OpenAI-compatible** chat endpoint for multi-turn dialogue and Q&A. Which **models** work depends on the channels configured in your console.

## Endpoint

\`\`\`
POST ${baseUrl}/v1/chat/completions
\`\`\`

## Authentication

Send your platform API key (same as **API Keys / Tokens** in the dashboard):

| Header | Value |
|--------|--------|
| \`Authorization\` | \`Bearer sk-...\` |
| \`Content-Type\` | \`application/json\` |

Your deployment may support additional headers; follow your operator’s guide if different.

## Request body (common fields)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`model\` | string | Yes | Model ID as accepted by the upstream channel (e.g. \`gpt-4o-mini\`, \`deepseek-chat\`) |
| \`messages\` | array | Yes | Conversation turns; see **Message shape** below |
| \`temperature\` | number | No | Sampling temperature, often \`0\`–\`2\`, default ~\`1\` |
| \`top_p\` | number | No | Nucleus sampling, typically \`0\`–\`1\` |
| \`max_tokens\` | number | No | Max tokens in the assistant reply (still capped by model/channel) |
| \`stream\` | boolean | No | \`true\` → **SSE** stream of deltas; \`false\` or omitted → one JSON response |
| \`stop\` | string / string[] | No | Stop when this string (or any of these) is generated |
| \`frequency_penalty\` | number | No | \`-2.0\`–\`2.0\` |
| \`presence_penalty\` | number | No | \`-2.0\`–\`2.0\` |
| \`n\` | integer | No | Number of completions per input, default \`1\` (if upstream supports it) |
| \`response_format\` | object | No | e.g. \`{ "type": "json_object" }\` when supported |
| \`tools\` / \`tool_choice\` | array / object | No | Tool/function calling when supported |

Other OpenAI-style fields may be forwarded upstream; **actual support depends on the channel and gateway**.

## Message shape (\`messages\`)

Each item is an object with at least:

| Field | Type | Description |
|-------|------|-------------|
| \`role\` | string | \`system\`, \`user\`, \`assistant\`, or \`tool\` where applicable |
| \`content\` | string or array | Plain string for text; for **vision**, an array of parts (below) |

**Text-only example:**

\`\`\`json
[
  { "role": "system", "content": "You are a concise assistant." },
  { "role": "user", "content": "Explain RAG in one sentence." }
]
\`\`\`

**Multimodal (text + image URL or base64 data URL) example:**

\`\`\`json
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "What is in this image?" },
      { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
    ]
  }
]
\`\`\`

Image support, max images, and formats depend on the **model and channel**.

## Non-streaming response (\`stream: false\`)

Typical JSON includes:

- \`id\`, \`object\` (\`chat.completion\`), \`created\`, \`model\`
- \`choices[]\`: each with \`index\`, \`message\` (\`role\`, \`content\`; some models add \`reasoning_content\`, etc.), \`finish_reason\`
- \`usage\`: \`prompt_tokens\`, \`completion_tokens\`, \`total_tokens\`, etc.

Usually read **\`choices[0].message.content\`** as the assistant text.

## Streaming response (\`stream: true\`)

- \`Content-Type\` is often \`text/event-stream\`
- Body is **SSE** lines starting with \`data: \`; stream may end with \`data: [DONE]\`
- Deltas often carry text in \`choices[0].delta.content\` — concatenate client-side
- Some implementations attach \`usage\` on the last chunk

## Errors and limits

Non-2xx responses are usually JSON with an \`error\` object (\`message\`, \`type\`, \`code\`, etc.).  
Invalid keys, quota, missing models, or upstream timeouts all map to errors here.

## Example (curl)

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "What is AI?" }
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'
\`\`\`
`,
};

export function GetChatApiContent(baseUrl: string, lang: DocLang): string {
	return chatApiContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'chat',
	groupKey: 'api',
	order: 10,
	label: { zh: 'Chat Completions', en: 'Chat Completions' },
	getContent: GetChatApiContent,
};
