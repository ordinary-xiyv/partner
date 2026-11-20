import type { DocArticle, DocLang } from '../types';

const authenticationContent = {
	zh: (baseUrl: string): string => `# 认证

## Bearer Token

所有 API 请求都需要在 Header 中携带：

\`\`\`
Authorization: Bearer sk-your-api-key
\`\`\`

## 请求示例

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hi"}]}'
\`\`\`

## 常见错误

| 状态码 | 说明 |
|---|---|
| 401 | Key 无效或过期 |
| 403 | 权限不足 |
| 429 | 触发限流 |
| 500 | 服务端异常 |
`,
	en: (baseUrl: string): string => `# Authentication

## Bearer Token

Every request must include:

\`\`\`
Authorization: Bearer sk-your-api-key
\`\`\`

## Request Example

\`\`\`bash
curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hi"}]}'
\`\`\`

## Common Errors

| Status | Description |
|---|---|
| 401 | Invalid/expired key |
| 403 | Forbidden |
| 429 | Rate limited |
| 500 | Internal error |
`,
};

export function GetAuthenticationContent(baseUrl: string, lang: DocLang): string {
	return authenticationContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'authentication',
	groupKey: 'docs',
	order: 20,
	label: { zh: '认证', en: 'Authentication' },
	getContent: GetAuthenticationContent,
};

