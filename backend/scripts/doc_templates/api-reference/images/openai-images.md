# 文生图（OpenAI Images）

**POST** `/v1/images/generations`

Seedream 系列 **image** 类 model，如 `doubao-seedream-5.0-lite`。

| 参数 | 必填 | 说明 |
|------|------|------|
| model | 是 | image 类 model id |
| prompt | 是 | 图片描述 |
| size | 否 | 如 `1024x1024` |
| response_format | 否 | `url` 或 `b64_json` |

**响应**：OpenAI Images 兼容格式，**未在生产逐字段实测，见 OpenAI 官方文档**。

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/images/generations" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-5.0-lite","prompt":"一只橘猫","size":"1024x1024","response_format":"url"}'
```

## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |

## 请求示例

```json
{
  "model": "doubao-seedream-5.0-lite",
  "prompt": "一只在月球上的橘猫，赛博朋克风格",
  "size": "1024x1024",
  "response_format": "url"
}
```

## 响应

### 200 — OpenAI Images 兼容 JSON

```json
{
  "created": 1780882800,
  "data": [
    {
      "url": "https://example-cdn.volcengine.com/generated/abc123.png",
      "revised_prompt": "一只在月球上的橘猫，赛博朋克风格"
    }
  ]
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
