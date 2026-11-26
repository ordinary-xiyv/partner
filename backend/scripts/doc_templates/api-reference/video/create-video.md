# 创建视频任务

**POST** `/v1/videos`

**OpenAI Video API 兼容**（`POST /v1/videos`），Seedance 参数通过 `metadata` 扩展传递。

流程：`POST /v1/videos` → 轮询 `GET /v1/videos/{task_id}`（`status` 至 `completed`）→ `GET /v1/videos/{task_id}/content`

| 参数 | 必填 | 说明 |
|------|------|------|
| model | 是 | video 类 model id，如 `doubao-seedance2.0` |
| prompt | 是 | 视频描述 |
| metadata.duration | 否 | 时长（秒）；可与顶层 `duration` 等效 |
| metadata.resolution | 否 | 如 `1080p`（小写 p；`1080P` 网关会规范） |
| metadata.ratio | 否 | 如 `16:9` |
| metadata.img_url | 否 | 简单图生视频单图 URL |
| metadata.content | 否 | Seedance 2.0 多模态内容；私域素材用 `asset://` 见下方 Schema |

文生视频 curl（可正常调用 Seedance 2.0）：

```bash
curl -X POST "{{baseUrl}}/v1/videos" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedance2.0","prompt":"一只猫在草地上奔跑","metadata":{"duration":5,"resolution":"1080p","ratio":"16:9"}}'
```

## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |

## 请求示例

```json
{
  "model": "doubao-seedance2.0",
  "prompt": "一只橙色机械猫在未来城市屋顶奔跑，电影感",
  "metadata": {
    "duration": 5,
    "resolution": "1080p",
    "ratio": "16:9"
  }
}
```

## 响应

### 200 — 任务已创建（OpenAI Video 兼容）

```json
{
  "id": "video_abc123def456",
  "object": "video",
  "model": "doubao-seedance2.0",
  "status": "queued",
  "progress": 0,
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
