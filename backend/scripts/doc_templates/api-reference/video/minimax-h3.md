# Minimax H3

## 流程

创建 `POST /v1/videos` → 查询`GET /v1/videos/{task_id}`（`status` 至 `completed`）→ 下载`GET /v1/videos/{task_id}/content`

## 创建视频任务

### 文生视频

**适用**

- `minimax-video-h3`

- `minimax-video-h3-max`

**请求头**

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|Content\-Type|header|是|POST 请求固定为 `application/json`|

**输入参数**

文生视频不能传 `ratio: "adaptive"`。未传时默认 `16:9`。

**请求示例**

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H 'Authorization: Bearer sk-your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "minimax-video-h3",
  "prompt": "一只橙色小猫在窗台上看向镜头，镜头缓慢推进",
  "duration": 6,
  "resolution": "768P",
  "ratio": "16:9",
  "metadata": {
    "aigc_watermark": false
  }
}'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "created_at": 1788952445
    "id": "task_XXXXX"
    "model": "minimax-video-h3"
    "object": "video"
    "progress": 0
    "status": "queued"
    "task_id": "task_XXXXX"
}
```

#### 401 — Token 无效

```JSON
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

### 图生视频（首帧 / 首尾帧）

**适用**

- `minimax-video-h3`   首帧或首尾帧

- `minimax-video-h3-max`   首帧或首尾帧，不支持中间帧

**请求头**

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|Content\-Type|header|是|POST 请求固定为 `application/json`|

**输入参数**

**请求示例**

单张首帧：

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "minimax-video-h3",
  "prompt": "人物自然向前行走",
  "images": [
    "https://example.com/start.jpg"
  ],
  "resolution": "768P",
  "duration": 5，
  "ratio": "adaptive",
  "metadata": {
    "aigc_watermark": false
  }
}'
```

首尾帧：

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "minimax-video-h3",
  "prompt": "从首帧自然过渡到尾帧",
  "content": [
    {
      "type": "text",
      "text": "从首帧自然过渡到尾帧"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/start.jpg" },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/end.jpg" },
      "role": "last_frame"
    }
  ],
  "resolution": "768P",
  "duration": 5，
  "ratio": "adaptive",
  "metadata": {
    "aigc_watermark": false
  }
}'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "created_at": 1788952445
    "id": "task_XXXXX"
    "model": "minimax-video-h3"
    "object": "video"
    "progress": 0
    "status": "queued"
    "task_id": "task_XXXXX"
}
```

#### 401 — Token 无效

```JSON
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

### 多模态参考生视频

**适用**

- `minimax-video-h3`

**请求参数**

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|Content\-Type|header|是|POST 请求固定为 `application/json`|

**输入参数**

**content 数组元素子字段：**

**请求示例**

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "minimax-video-h3",
  "prompt": "参考图片中的角色，在参考视频的场景中自然运动",
  "content": [
    {
      "type": "text",
      "text": "参考图片中的角色，在参考视频的场景中自然运动"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/character.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://example.com/scene.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://example.com/music.mp3"
      },
      "role": "reference_audio"
    }
  ],
  "resolution": "768P",
  "duration": 5，
  "ratio": "adaptive",
  "metadata": {
    "aigc_watermark": false
  }
}'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "created_at": 1788952445
    "id": "task_XXXXX"
    "model": "minimax-video-h3"
    "object": "video"
    "progress": 0
    "status": "queued"
    "task_id": "task_XXXXX"
}
```

#### 401 — Token 无效

```JSON
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

## 查询视频任务

**GET** `/v1/videos/{task_id}`

轮询任务状态，直到 `status` 为 `completed` 或 `failed`（火山上游为 `succeeded` / `failed`）。

```Bash
curl "{{baseUrl}}/v1/videos/{task_id}" \
  -H "Authorization: Bearer sk-your-api-key"
```

### 请求参数

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|task\_id|path|是|创建视频任务时返回的任务 id|

### 响应

#### 200 — 任务状态 JSON

```JSON
{
    "completed_at": 1788952688
    "created_at": 1788952445
    "duration": 5
    "id": "task_xxxx"
    "metadata": {}
    "model": "minimax-video-h3"
    "object": "video"
    "progress": 100
    "ratio": "16:9"
    "resolution": "768P"
    "status": "completed"
    "task_id": "task_xxxx" # 任务ID, 后续查询任务获取视频时需要
    "usage": {"completion_tokens": 0, "total_tokens": 0}
}
```

#### 401 — Token 无效

```JSON
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

## 下载视频内容

**GET** `/v1/videos/{task_id}/content`

任务 `completed` 后下载视频（二进制流或重定向）

```Bash
curl -L "{{baseUrl}}/v1/videos/{task_id}/content" \
  -H "Authorization: Bearer sk-your-api-key" \
  -o output.mp4
```

### 请求参数

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|task\_id|path|是|创建视频任务时返回的任务 id|

### 响应

#### 200 — 视频二进制或 302 重定向

#### 401 — Token 无效

```JSON
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```
