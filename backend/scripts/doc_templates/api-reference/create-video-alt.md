# 创建视频任务（别名路径）

**POST** `/v1/video/generations`


与 `POST /v1/videos` 相同。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "model": "doubao-seedance2.0",
  "prompt": "海浪拍打礁石",
  "metadata": {
    "duration": 5,
    "ratio": "16:9"
  }
}
```


## 响应

### 200 — 同 POST /v1/videos

### 401 — Token 无效


```json

{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}

```
