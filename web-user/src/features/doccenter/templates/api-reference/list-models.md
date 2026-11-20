# 列出可用模型

**GET** `/v1/models`


返回当前 Token 可调用的 model 列表。`data[].id` 即后续请求 body 中的 `model` 字段。

**curl**

```bash
curl "{{baseUrl}}/v1/models" \
  -H "Authorization: Bearer sk-your-api-key"
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |


## 响应

### 200 — 成功（2026-06-07 生产实测）


```json

{
  "object": "list",
  "data": [
    {
      "id": "deepseek-v4-flash",
      "object": "model",
      "created": 1626777600,
      "owned_by": "custom",
      "supported_endpoint_types": [
        "openai"
      ],
      "modalities": "text"
    },
    {
      "id": "doubao-seedream-5.0-lite",
      "object": "model",
      "modalities": "image"
    },
    {
      "id": "doubao-seedance2.0",
      "object": "model",
      "modalities": "video"
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
