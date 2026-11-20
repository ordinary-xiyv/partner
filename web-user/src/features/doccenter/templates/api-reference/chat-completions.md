# 对话补全（OpenAI Chat Completions）

**POST** `/v1/chat/completions`


DeepSeek、GLM、Qwen、Kimi、豆包等 **text** 类 model 的主入口。

| 参数 | 必填 | 说明 |
|------|------|------|
| model | 是 | `GET /v1/models` 返回的 id |
| messages | 是 | `[{ "role": "user", "content": "..." }]` |
| stream | 否 | `true` 时 SSE 流式 |
| max_tokens | 否 | 最大输出 token |

回复正文：`choices[0].message.content`（部分模型另有 `reasoning_content`）。

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/chat/completions" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"say hi"}],"max_tokens":20}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {
      "role": "user",
      "content": "say hi"
    }
  ],
  "max_tokens": 20
}
```


## 响应

### 200 — 非流式 JSON（下方为生产实测示例）。流式时为 `text/event-stream`，不在此展开。



```json

{
  "id": "chatcmpl-c7c43d85-f836-9fc1-bccf-fc824648d950",
  "object": "chat.completion",
  "created": 1780882705,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hi!",
        "reasoning_content": "（部分推理模型返回，可忽略）"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 6,
    "completion_tokens": 52,
    "total_tokens": 58
  }
}

```

### 401 — Token 无效


```json

{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}

```
