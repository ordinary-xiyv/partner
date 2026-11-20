# 通用：OpenAI Chat 参数与响应

适用于 **DeepSeek、智谱 GLM、通义 Qwen、Kimi、MiniMax、豆包 Seed** 等 text 类 model。  
Endpoint：`POST /v1/chat/completions` · Base URL：`https://tokens.lynxtoncloud.com/v1`

## 请求头

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| Authorization | Header | 是 | string | `Bearer sk-...`，控制台「令牌管理」创建的完整 Key |
| Content-Type | Header | 是 | string | 固定 `application/json` |

## Body 参数（application/json）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | model id，须与 `GET /v1/models` 返回的 `data[].id` **完全一致**（含大小写） |
| messages | array | 是 | 对话消息列表，见下表 |
| stream | boolean | 否 | 默认 `false`；`true` 时响应为 SSE（`text/event-stream`） |
| max_tokens | integer | 否 | 模型回复的最大 token 数 |
| temperature | number | 否 | 采样温度，一般 0–2，默认由上游 model 决定 |
| top_p | number | 否 | 核采样，与 temperature 二选一调节即可 |
| stop | string / array | 否 | 停止词 |

### messages[] 元素

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role | string | 是 | `system` / `user` / `assistant` / `tool` |
| content | string 或 array | 是 | 纯文本；**视觉 model** 可为多模态数组，见下方示例 |

**多模态 content 示例（视觉 model）：**

```json
[
  { "type": "text", "text": "这张图里有什么？" },
  { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
]
```

## 请求示例

```json
{
  "model": "deepseek-v4-flash",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 512,
  "temperature": 0.7
}
```

## 响应字段（非流式，HTTP 200）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 本次补全 id，如 `chatcmpl-...` |
| object | string | 固定 `chat.completion` |
| created | integer | Unix 时间戳（秒） |
| model | string | 实际使用的 model id |
| choices | array | 生成结果列表 |
| choices[].index | integer | 结果序号，通常为 0 |
| choices[].message.role | string | 固定 `assistant` |
| choices[].message.content | string | **助手回复正文**（业务主要读取此字段） |
| choices[].message.reasoning_content | string | 部分推理 model 额外返回，可忽略 |
| choices[].finish_reason | string | 结束原因，如 `stop` |
| usage.prompt_tokens | integer | 输入 token 数 |
| usage.completion_tokens | integer | 输出 token 数 |
| usage.total_tokens | integer | 合计 token 数 |

## 响应示例（非流式）

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
        "content": "Hi!"
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

## 流式响应（stream: true）

- `Content-Type`：`text/event-stream`
- 每行以 `data: ` 开头，末尾可能有 `data: [DONE]`
- 增量文本在 `choices[0].delta.content`，客户端需逐块拼接

## 错误响应

| 状态码 | 说明 |
|--------|------|
| 401 | Token 无效或未携带 |
| 403 | IP 白名单或额度不足 |
| 429 | 限流 |

错误体通常为 OpenAI 格式：

```json
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```
