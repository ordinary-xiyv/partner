import type { DocArticle, DocLang } from '../types';

const sdkGuideContent = {
	zh: (baseUrl: string): string => `# SDK 与生产接入建议

本平台优先兼容 OpenAI 风格接口，建议通过官方或兼容 SDK 接入。

## 1) OpenAI SDK（Node.js）

\`\`\`bash
npm i openai
\`\`\`

\`\`\`ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}/v1',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(resp.choices[0]?.message?.content);
\`\`\`

## 2) OpenAI SDK（Python）

\`\`\`bash
pip install openai
\`\`\`

\`\`\`python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}/v1"
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}]
)

print(resp.choices[0].message.content)
\`\`\`

## 3) 生产环境建议

- **超时**：为请求设置合理超时，避免连接长时间挂起  
- **重试**：仅对可重试错误（429/5xx）做指数退避重试  
- **幂等**：重试逻辑要避免重复写入业务状态  
- **日志**：记录模型名、耗时、状态码、错误码，不要记录敏感密钥  
- **降级**：上游异常时可切备用模型或返回兜底文案  

## 4) 安全建议

- API Key 存放在服务端环境变量，不要下发到前端仓库  
- 前端直连仅用于调试或受控场景  
- 多租户场景建议使用服务端代理做鉴权、审计和额度控制

## 5) 版本与回滚

- 将模型名与 baseURL 设为配置项  
- 部署前做小流量验证  
- 保留旧模型与旧参数一段时间，方便快速回滚
`,
	en: (baseUrl: string): string => `# SDK & Production Integration Tips

This platform is OpenAI-style compatible. Prefer official or compatible SDKs.

## 1) OpenAI SDK (Node.js)

\`\`\`bash
npm i openai
\`\`\`

\`\`\`ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}/v1',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(resp.choices[0]?.message?.content);
\`\`\`

## 2) OpenAI SDK (Python)

\`\`\`bash
pip install openai
\`\`\`

\`\`\`python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}/v1"
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}]
)

print(resp.choices[0].message.content)
\`\`\`

## 3) Production checklist

- **Timeouts**: set explicit request timeouts  
- **Retries**: exponential backoff only for retryable errors (429/5xx)  
- **Idempotency**: prevent duplicate side effects during retries  
- **Logging**: include model/latency/status/error; never log secrets  
- **Fallback**: switch model or return safe fallback on upstream failures  

## 4) Security tips

- Keep API keys in server-side env vars  
- Frontend-direct calls are for limited/debug scenarios only  
- For multi-tenant apps, use backend proxy for auth/audit/quota control

## 5) Versioning & rollback

- Keep model IDs and baseURL configurable  
- Canary before full rollout  
- Keep previous model/params for fast rollback
`,
};

export function GetSdkGuideContent(baseUrl: string, lang: DocLang): string {
	return sdkGuideContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'sdk-guide',
	groupKey: 'docs',
	order: 25,
	label: { zh: 'SDK 与生产接入', en: 'SDK & Production' },
	getContent: GetSdkGuideContent,
};

