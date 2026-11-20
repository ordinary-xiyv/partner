# Claude（Anthropic 兼容）

> **可用性**：Claude 是否出现在你的账户中，以 `GET /v1/models` 为准。  
> 当前平台标准模型索引（2026-06-07 实测）未包含 Claude；若后续上架，按本文接入即可。

## 接入方式

使用 **Anthropic Messages API**，不是 OpenAI Chat Completions。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/messages` |
| Base URL | `https://tokens.lynxtoncloud.com` |

## 鉴权（二选一）

```http
Authorization: Bearer sk-your-api-key
```

或 Anthropic 原生 Header：

```http
x-api-key: sk-your-api-key
anthropic-version: 2023-06-01
```

## 请求头

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | Header | 二选一 | `Bearer sk-...` |
| x-api-key | Header | 二选一 | Anthropic SDK 风格 |
| anthropic-version | Header | 否 | Anthropic SDK 需带，如 `2023-06-01` |
| Content-Type | Header | 是 | `application/json` |

## Body 参数（application/json）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | Claude model id |
| max_tokens | integer | 是 | 最大输出 token |
| messages | array | 是 | `[{ "role": "user", "content": "..." }]`，role 为 user 或 assistant |
| stream | boolean | 否 | SSE 流式，默认 false |
| system | string | 否 | 系统提示 |

## curl 示例

```bash
curl https://tokens.lynxtoncloud.com/v1/messages \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Anthropic SDK

```python
import anthropic

client = anthropic.Anthropic(
    api_key="sk-...",
    base_url="https://tokens.lynxtoncloud.com",
)
message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
print(message.content[0].text)
```

## 响应结构（非流式）

`type: message` 的 JSON 响应示例：

```json
{
  "id": "msg_01ABCxyz",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-20250514",
  "content": [
    { "type": "text", "text": "Hello! How can I help you today?" }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 15
  }
}
```

业务上读取 `content[]` 中 `type: text` 的 `text` 字段。流式为 SSE 事件（`message_start`、`content_block_delta`、`message_stop` 等）。

## 相关 API 参考

- `POST /v1/messages`（Anthropic 兼容，含完整 Response 数据模型）
