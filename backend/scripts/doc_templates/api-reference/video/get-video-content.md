# 下载视频内容

**GET** `/v1/videos/{task_id}/content`

任务 `completed` 后下载视频（二进制流或重定向）。

```bash
curl -L "{{baseUrl}}/v1/videos/{task_id}/content" \
  -H "Authorization: Bearer sk-your-api-key" \
  -o output.mp4
```

## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| task_id | path | 是 | 创建视频任务时返回的任务 id |

## 响应

### 200 — 视频二进制或 302 重定向

### 401 — Token 无效

```json
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```
