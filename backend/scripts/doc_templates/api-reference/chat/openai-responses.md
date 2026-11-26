# 文本生成（OpenAI Responses API）

**POST** `/v1/responses`

OpenAI 官方 **Responses** 协议，供 `client.responses.create()` 等客户端使用。

| 参数 | 必填 | 说明 |
|------|------|------|
| model | 是 | text 类 model id |
| input | 否 | 字符串或结构化 input 数组 |
| stream | 否 | 流式开关 |

**响应**：遵循 [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses) 官方结构；网关可能对部分 model 做 Chat 转换，**本页不提供未实测的响应字段表**。

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/responses" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-flash","input":"Hello"}'
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
  "input": "Hello"
}
```

## 响应

### 200 — 成功；JSON 结构见 OpenAI 官方 Responses 文档

### 401 — Token 无效

```json
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```
