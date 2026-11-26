# wan3.0-video

## 流程

创建 `POST /v1/videos` → 查询`GET /v1/videos/{task_id}`（`status` 至 `completed`）→ 下载`GET /v1/videos/{task_id}/content`

## 创建视频任务

### 文生视频

**适用**

- `wan3.0-video`

- `wan3.0-video-prime`

**请求头**

|参数|位置|必填|说明|
|---|---|---|---|
|Authorization|header|是|API Token。控制台「令牌管理」创建，格式 `Bearer sk-...`|
|Content\-Type|header|是|POST 请求固定为 `application/json`|

**输入参数**

**请求示例**

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "wan3.0-video",
    "prompt": "清晨的山间湖泊，薄雾缓慢掠过水面，一艘木船从画面右侧驶向中央；电影感广角，镜头缓慢推进，自然光。",
    "duration": 5,
    "resolution": "480p",
    "ratio": "16:9",
    "watermark": false
  }'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "id": "task_XXXXX",
    "task_id": "task_XXXXX",
    "object": "video",
    "model": "wan3.0-video",
    "status": "queued",
    "progress": 0,
    "created_at": 1789031662
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

- `wan3.0-video`

- `wan3.0-video-prime`

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
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "content": [
    {
      "type": "text",
      "text": "从首帧自然过渡到尾帧"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://example.com/start.jpg" },
      "role": "first_frame"
    }
  ],
  "resolution": "480P",
  "duration": 5,
  "ratio": "adaptive",
  "watermark": false
}'
```

首尾帧：

```Bash
curl -X POST '{{baseUrl}}/v1/videos' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
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
  "resolution": "480P",
  "duration": 5，
  "ratio": "adaptive",
  "watermark": false
}'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "id": "task_XXXXX",
    "task_id": "task_XXXXX",
    "object": "video",
    "model": "wan3.0-video",
    "status": "queued",
    "progress": 0,
    "created_at": 1789031662
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

- `wan3.0-video`

- `wan3.0-video-prime`

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
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
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
  "resolution": "480P",
  "duration": 5,
  "ratio": "adaptive",
  "watermark": true
}'
```

### 响应

#### 200 — 任务已创建

```JSON
{
    "id": "task_XXXXX",
    "task_id": "task_XXXXX",
    "object": "video",
    "model": "wan3.0-video",
    "status": "queued",
    "progress": 0,
    "created_at": 1789031662
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
  -H "Authorization: Bearer $API_KEY"
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
    "completed_at": 1789026306,
    "created_at": 1789026213,
    "id": "task_XXXXX",
    "metadata": {
        "lynx_output_download_url": "",
        "lynx_output_file_id": "",
        "lynx_output_ready": true,
        "lynx_output_url": "",
        "out_download_url": "",
        "output_status": "",
        "url": ""
    },
    "model": "wan3.0-video",
    "object": "video",
    "progress": 100,
    "status": "completed",
    "usage": {
        "SR": 480,
        "duration": 5,
        "fps": 30,
        "output_video_duration": 5,
        "ratio": "16:9",
        "video_count": 1
    }
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
  -H "Authorization: Bearer $API_KEY" \
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
