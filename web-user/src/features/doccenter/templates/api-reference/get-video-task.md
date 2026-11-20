# 查询视频任务

**GET** `/v1/videos/{task_id}`


轮询任务状态，直到 `status` 为 `completed` 或 `failed`（火山上游为 `succeeded` / `failed`）。

```bash
curl "{{baseUrl}}/v1/videos/{task_id}" \
  -H "Authorization: Bearer sk-your-api-key"
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| task_id | path | 是 | 创建视频任务时返回的任务 id |


## 响应

### 200 — 任务状态 JSON（OpenAI Video 兼容）


```json

{
  "id": "video_abc123def456",
  "object": "video",
  "model": "doubao-seedance2.0",
  "status": "in_progress",
  "progress": 45,
  "created_at": 1780882900
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
