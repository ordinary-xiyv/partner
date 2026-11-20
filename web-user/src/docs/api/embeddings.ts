import type { DocArticle, DocLang } from '../types';

const embeddingsApiContent = {
	zh: (baseUrl: string): string => `# Embeddings API

与 **OpenAI Embeddings** 兼容的向量接口，用于语义检索、聚类、相似度、RAG 文档向量化等。可用模型以控制台中已配置的嵌入模型为准。

## 端点

\`\`\`
POST ${baseUrl}/v1/embeddings
\`\`\`

## 认证

| 请求头 | 说明 |
|--------|------|
| \`Authorization\` | \`Bearer sk-...\` |
| \`Content-Type\` | \`application/json\` |

## 请求体

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`model\` | string | 是 | 嵌入模型 ID（如 \`text-embedding-3-small\`、\`text-embedding-ada-002\` 等，须渠道支持） |
| \`input\` | string / string[] | 是 | 单条文本，或**字符串数组**批量请求；每条会对应返回数组中的一项 |
| \`encoding_format\` | string | 否 | \`float\`（默认，常规 JSON 数组）或 \`base64\`（部分实现支持，减小 JSON 体积） |
| \`dimensions\` | integer | 否 | 部分模型（如 text-embedding-3-*）支持**截断维度**，在精度与体积间取舍；不传则使用模型默认维度 |
| \`user\` | string | 否 | 终端用户标识，便于统计与滥用追踪（可选） |

**关于 \`input\`：**

- 单条：\`"input": "一段文本"\`
- 批量：\`"input": ["第一句", "第二句", "第三句"]\`
- 单条请求里数组元素数量上限、单条文本最大 token 数以**上游模型与渠道**为准；批量过大可能被拒绝或截断。

## 响应体（成功）

典型 JSON 包含：

| 字段 | 说明 |
|------|------|
| \`object\` | 一般为 \`list\` |
| \`model\` | 实际使用的嵌入模型名 |
| \`data\` | 数组，与 \`input\` 条数一致；每项含 \`object\`（\`embedding\`）、\`embedding\`（浮点向量）、\`index\`（与请求中的顺序对应） |
| \`usage\` | \`prompt_tokens\`、\`total_tokens\` 等 |

读取向量时：单条输入用 \`data[0].embedding\`；批量时按 \`data[i].index\` 或数组顺序对齐原文本。

## 向量用途简述

- **检索 / RAG**：将查询与文档块分别嵌入，用余弦相似度或向量库（如 pgvector、Milvus）做最近邻搜索。  
- **聚类 / 去重**：对 \`embedding\` 做聚类或两两相似度过滤。  
- **分类特征**：把文本变成固定维向量再接传统机器学习模型（视场景而定）。

## 错误与限流

HTTP 非 2xx 时多为 JSON，含 \`error\` 描述；模型未配置、密钥无效、文本超长、请求体过大等均可能失败。

## 请求示例（单条）

\`\`\`bash
curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
\`\`\`

## 请求示例（批量）

\`\`\`bash
curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "First document sentence.",
      "Second document sentence."
    ]
  }'
\`\`\`
`,
	en: (baseUrl: string): string => `# Embeddings API

**OpenAI-compatible** embeddings for semantic search, clustering, similarity, RAG chunking, etc. Available **models** depend on your configured channels.

## Endpoint

\`\`\`
POST ${baseUrl}/v1/embeddings
\`\`\`

## Authentication

| Header | Value |
|--------|--------|
| \`Authorization\` | \`Bearer sk-...\` |
| \`Content-Type\` | \`application/json\` |

## Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`model\` | string | Yes | Embedding model ID (e.g. \`text-embedding-3-small\`, \`text-embedding-ada-002\`) — must be supported by the channel |
| \`input\` | string / string[] | Yes | A single string, or an **array of strings** for batching; each string maps to one item in \`data[]\` |
| \`encoding_format\` | string | No | \`float\` (default, normal JSON array) or \`base64\` (if implemented) |
| \`dimensions\` | integer | No | Some models (e.g. text-embedding-3-*) support **reduced dimensionality**; omit for the model default |
| \`user\` | string | No | End-user id for analytics / abuse tracking (optional) |

**Notes on \`input\`:**

- Single: \`"input": "one piece of text"\`
- Batch: \`"input": ["first", "second", "third"]\`
- Max strings per request and max tokens per string are defined by the **upstream model and channel**; oversized batches may be rejected.

## Successful response

Typical JSON:

| Field | Description |
|-------|-------------|
| \`object\` | Often \`list\` |
| \`model\` | Embedding model used |
| \`data\` | Array aligned with \`input\`; each item has \`object\` (\`embedding\`), \`embedding\` (float vector), \`index\` |
| \`usage\` | \`prompt_tokens\`, \`total_tokens\`, etc. |

Use \`data[0].embedding\` for a single input; for batches, match by order or \`data[i].index\`.

## What embeddings are for

- **Search / RAG**: Embed queries and document chunks, then cosine similarity or a vector DB (pgvector, Milvus, …).  
- **Clustering / dedup**: Cluster vectors or filter by pairwise similarity.  
- **Features**: Fixed-size vectors for downstream ML (when appropriate).

## Errors and limits

Non-2xx bodies usually include an \`error\` object. Failures may come from unknown models, invalid keys, text too long, or payload limits.

## Example (single input)

\`\`\`bash
curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
\`\`\`

## Example (batch input)

\`\`\`bash
curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "First document sentence.",
      "Second document sentence."
    ]
  }'
\`\`\`
`,
};

export function GetEmbeddingsApiContent(baseUrl: string, lang: DocLang): string {
	return embeddingsApiContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'embeddings',
	groupKey: 'api',
	order: 40,
	label: { zh: 'Embeddings', en: 'Embeddings' },
	getContent: GetEmbeddingsApiContent,
};
