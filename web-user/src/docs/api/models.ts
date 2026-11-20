import type { DocArticle, DocLang } from '../types';

const modelsApiContent = {
	zh: (baseUrl: string): string => `# Models API

本页描述常见的“模型可用性”相关接口：

1. OpenAI 兼容：\`GET /v1/models\`  
2. 平台定价列表：\`GET /api/pricing\`  
3. 公共模型目录：\`GET /api/lynx/catalog/models\`

---

## 1) OpenAI 兼容模型列表

\`\`\`
GET ${baseUrl}/v1/models
\`\`\`

### 用途

- 获取当前可调用的模型 ID 列表（用于模型选择与 SDK 预检查）
- 通常与 \`/v1/chat/completions\`、\`/v1/embeddings\` 等配套使用

### 示例

\`\`\`bash
curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer sk-your-api-key"
\`\`\`

### 典型响应（示意）

\`\`\`json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o-mini", "object": "model" },
    { "id": "deepseek-chat", "object": "model" }
  ]
}
\`\`\`

---

## 2) 平台定价列表

\`\`\`
GET ${baseUrl}/api/pricing
\`\`\`

### 用途

- 返回平台可见模型与计费字段（\`model_ratio\`、\`completion_ratio\`、\`model_price\` 等）
- 可用于展示、筛选或计算预估成本

### 典型字段（示意）

| 字段 | 说明 |
|---|---|
| \`model_name\` | 模型 ID |
| \`quota_type\` | 计费类型（0=按量，1=按次） |
| \`model_ratio\` | 输入倍率或基础价格系数 |
| \`completion_ratio\` | 输出倍率 |
| \`model_price\` | 按次价格（当 \`quota_type=1\`） |

> 注意：价格展示是否做汇率换算，取决于你的客户端配置。

---

## 3) 公共模型目录（对外展示）

\`\`\`
GET ${baseUrl}/api/lynx/catalog/models
\`\`\`

### 查询参数

| 参数 | 类型 | 说明 |
|---|---|---|
| \`provider\` | string | 按供应商筛选 |
| \`featured\` | boolean | 仅精选模型（\`true\`） |
| \`search\` | string | 模糊搜索模型名/描述 |

### 示例

\`\`\`bash
curl "${baseUrl}/api/lynx/catalog/models?provider=OpenAI&featured=true"
\`\`\`

目录接口与真实可调用模型不一定 1:1；建议上线前仍以 \`/v1/models\` 做运行时校验。
`,
	en: (baseUrl: string): string => `# Models API

This page covers common model-availability related endpoints:

1. OpenAI-compatible: \`GET /v1/models\`  
2. Platform pricing list: \`GET /api/pricing\`  
3. Public catalog: \`GET /api/lynx/catalog/models\`

---

## 1) OpenAI-compatible model list

\`\`\`
GET ${baseUrl}/v1/models
\`\`\`

### Purpose

- Fetch callable model IDs for model selection and SDK/runtime checks
- Commonly used with \`/v1/chat/completions\`, \`/v1/embeddings\`, etc.

### Example

\`\`\`bash
curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer sk-your-api-key"
\`\`\`

### Typical response (illustrative)

\`\`\`json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o-mini", "object": "model" },
    { "id": "deepseek-chat", "object": "model" }
  ]
}
\`\`\`

---

## 2) Platform pricing list

\`\`\`
GET ${baseUrl}/api/pricing
\`\`\`

### Purpose

- Returns model pricing/billing fields (\`model_ratio\`, \`completion_ratio\`, \`model_price\`, etc.)
- Useful for display, filtering, and rough cost estimation

### Typical fields

| Field | Meaning |
|---|---|
| \`model_name\` | Model ID |
| \`quota_type\` | Billing type (0=token, 1=request) |
| \`model_ratio\` | Input ratio/base unit |
| \`completion_ratio\` | Output ratio |
| \`model_price\` | Per-request price when \`quota_type=1\` |

> Final displayed currency may be converted by your client-side settings.

---

## 3) Public model catalog

\`\`\`
GET ${baseUrl}/api/lynx/catalog/models
\`\`\`

### Query params

| Param | Type | Description |
|---|---|---|
| \`provider\` | string | Filter by provider |
| \`featured\` | boolean | Featured only (\`true\`) |
| \`search\` | string | Fuzzy search over model/provider/description |

### Example

\`\`\`bash
curl "${baseUrl}/api/lynx/catalog/models?provider=OpenAI&featured=true"
\`\`\`

Catalog entries are display-oriented and may not perfectly match runtime callable models; use \`/v1/models\` for final runtime validation.
`,
};

export function GetModelsApiContent(baseUrl: string, lang: DocLang): string {
	return modelsApiContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'models',
	groupKey: 'api',
	order: 15,
	label: { zh: 'Models 与定价', en: 'Models & Pricing' },
	getContent: GetModelsApiContent,
};

