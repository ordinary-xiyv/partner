import type { DocArticle, DocLang } from '../types';

const errorsDebugContent = {
	zh: (): string => `# 错误调试

本页用于快速定位常见 API 异常，按“现象 → 原因 → 处理”排查。

## 错误响应优先读取顺序

发生非 2xx 时，建议客户端按以下顺序取错误信息：

1. \`error.message\`
2. \`message\`
3. 原始响应体（兜底日志）

---

## 常见状态码排查

### 400 / 422 参数错误

**常见现象**
- 请求被立即拒绝
- 提示 model/messages/input 格式不正确

**优先检查**
- \`model\` 是否拼写正确
- \`messages\` 是否为数组、每项是否有 \`role\` + \`content\`
- Embeddings 的 \`input\` 是否为 string 或 string[]

### 401 未认证

**常见现象**
- 返回 unauthorized / invalid key

**优先检查**
- 是否携带 \`Authorization: Bearer sk-...\`
- Key 是否过期/被禁用
- 代理层是否丢了 Authorization 头

### 403 无权限

**常见现象**
- key 有效但被拒绝

**优先检查**
- 当前 key 是否有该模型访问权限
- 账户是否处于受限状态

### 404 资源不存在

**常见现象**
- 路径或模型不存在

**优先检查**
- URL 是否正确（\`/v1/chat/completions\`、\`/v1/embeddings\`）
- 模型是否在当前渠道可用

### 429 限流 / 配额

**常见现象**
- 高频调用时偶发失败

**建议处理**
- 指数退避重试（1s→2s→4s + 随机抖动）
- 限制客户端并发
- 降低请求峰值或缩短上下文

### 5xx 上游/网关异常

**常见现象**
- 500/502/503/504 间歇失败

**建议处理**
- 短期重试 + 熔断
- 关键路径准备模型回退策略

---

## 流式请求专用排查

当 \`stream: true\` 出现异常时：

1. 确认按 SSE 逐行处理 \`data: \`
2. 确认处理 \`data: [DONE]\`
3. 确认做了 buffer 拼接（不能按 chunk 直接 JSON.parse）

---

## 建议记录的诊断信息

- 请求时间、模型名、状态码
- 是否 stream
- 首个错误 message
- 请求耗时（客户端）

> 注意：日志中不要记录完整 API Key。
`,
	en: (): string => `# Error Debugging

Use this page to quickly troubleshoot API failures with a symptom → cause → action approach.

## Error message extraction order

For non-2xx responses, read errors in this order:

1. \`error.message\`
2. \`message\`
3. Raw response body (fallback logging)

---

## Common status code troubleshooting

### 400 / 422 Invalid request

**Typical symptoms**
- Immediate rejection
- Errors about model/messages/input shape

**Check first**
- \`model\` spelling
- \`messages\` is an array with valid \`role\` + \`content\`
- Embeddings \`input\` is string or string[]

### 401 Unauthorized

**Typical symptoms**
- unauthorized / invalid key

**Check first**
- \`Authorization: Bearer sk-...\` is present
- key is active and not expired
- proxy is forwarding Authorization header

### 403 Forbidden

**Typical symptoms**
- key works elsewhere but blocked here

**Check first**
- model access permission for this key
- account policy restrictions

### 404 Not found

**Typical symptoms**
- endpoint/model not found

**Check first**
- endpoint path is correct (\`/v1/chat/completions\`, \`/v1/embeddings\`)
- model exists in current channel

### 429 Rate limit / quota

**Typical symptoms**
- intermittent failures under burst traffic

**Recommended handling**
- exponential backoff retry (1s→2s→4s + jitter)
- client-side concurrency control
- reduce spikes / shorten context

### 5xx Upstream / gateway issues

**Typical symptoms**
- intermittent 500/502/503/504

**Recommended handling**
- short retries + circuit breaker
- fallback model strategy for critical paths

---

## Streaming-specific checks

When \`stream: true\` fails:

1. Parse SSE \`data:\` lines correctly
2. Handle \`data: [DONE]\`
3. Use rolling buffer (do not JSON.parse raw chunks directly)

---

## Diagnostic fields worth logging

- timestamp, model, status code
- stream on/off
- first error message
- client latency

> Never log full API keys in plain text.
`,
};

export function GetErrorsDebugContent(_baseUrl: string, lang: DocLang): string {
	return errorsDebugContent[lang]();
}

export const article: DocArticle = {
	key: 'errors',
	groupKey: 'api',
	order: 30,
	label: { zh: '错误调试', en: 'Error Debugging' },
	getContent: GetErrorsDebugContent,
};

