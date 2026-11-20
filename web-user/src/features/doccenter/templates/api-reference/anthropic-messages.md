# Claude Messages（Anthropic 格式）

**POST** `/v1/messages`


Anthropic **Messages API**。仅当 `GET /v1/models` 返回 Claude model 时可用。

鉴权：`Authorization: Bearer sk-...` 或 `x-api-key` + `anthropic-version: 2023-06-01`

| 参数 | 必填 | 说明 |
|------|------|------|
| model | 是 | Claude model id |
| max_tokens | 是 | 最大输出 |
| messages | 是 | `[{ "role": "user", "content": "..." }]` |

**响应**：遵循 [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) 官方结构；**本页不提供未实测的响应字段表**。

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/messages" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |
| x-api-key | header | 否 | Anthropic 风格鉴权（与 Authorization 二选一） |
| anthropic-version | header | 否 | Anthropic SDK 版本号 |


## 请求示例

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ]
}
```


## 响应

### 200 — 成功；JSON 结构见 Anthropic 官方文档

### 401 — Token 无效


```json

{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}

```
