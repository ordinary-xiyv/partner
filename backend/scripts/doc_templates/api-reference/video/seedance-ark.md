# 视频生成 API（Seedance · 火山 Ark 协议兼容）

> 版本：2026-10-20 · 适用平台：本平台
> 本文档介绍火山 Ark 协议兼容的视频生成接口。可用模型以 `GET /v1/models` 返回结果为准。
> OpenAI Video 风格接口（`/v1/videos`）的请求格式见本文附录 A。

## 1. 概述

平台提供火山引擎 **Seedance** 系列视频生成能力，采用**异步任务**模式：

```text
① 创建任务 → 返回 {"id":"cgt-xxx"}
        ↓
② 使用返回的 id 查询任务状态
             queued / running / succeeded / failed / cancelled / expired
        ↓
③ status=succeeded → 读取 content.video_url 或使用 /content 下载
```

视频采用异步任务。客户端按任务 ID 轮询；生成和网络耗时不作 SLA 承诺，客户端超时后保留 ID 查询，避免盲目重复创建。

### 可用模型

模型 ID 以 `GET /v1/models` 返回为准。常用模型及对应分辨率如下：

| 系列                | 模型 ID                                                                        | 可用分辨率                    |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------ |
| Seedance 2.0 标准版  | `doubao-seedance-2-0-260128`                                                 | 480p / 720p / 1080p / 4k |
| Seedance 2.0 Fast | `doubao-seedance-2-0-fast-260128`                                            | 480p / 720p              |
| Seedance 2.0 Mini | `doubao-seedance-2-0-mini-260615`                                            | 480p / 720p              |
| Seedance 2.5      | `doubao-seedance-2-5-260628`                                                 | 480p / 720p / 1080p      |

> Fast / Mini **不支持 1080p**。具体可用模型与价格请以控制台显示为准。

## 2. 鉴权

所有接口使用模型 **API 令牌**（`sk-` 开头）：

```http
Authorization: Bearer sk-<API_TOKEN>
Content-Type: application/json
```

获取方式：登录控制台 → 令牌管理 → 新建令牌。素材库接口使用**同一个令牌**。

## 3. 接口总览

```text
Base URL: {{baseUrl}}
```

| 操作 | 方法 | 路径 |
|---|---|---|
| 查询模型 | `GET` | `/v1/models` |
| **创建视频任务** | `POST` | `/api/v3/contents/generations/tasks` |
| **查询任务状态** | `GET` | `/api/v3/contents/generations/tasks/{task_id}` |
| **下载视频** | `GET` | `/api/v3/contents/generations/tasks/{task_id}/content` |

查询任务时使用创建响应中的 `id`。任务成功后可读取 `content.video_url`，或调用 `/content` 下载。

## 4. 创建任务

```http
POST /api/v3/contents/generations/tasks
```

### 4.1 请求示例

```json
{
  "model": "doubao-seedance-2-0-mini-260615",
  "content": [
    {"type": "text", "text": "一只橘猫在阳光草地上打滚，镜头缓慢推近"}
  ],
  "resolution": "480p",
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": false,
  "watermark": false
}
```

### 4.2 顶层字段与模型支持

`model` 和非空 `content[]` 为必填字段，其他参数放在请求体顶层。此接口不接受顶层 `prompt`、`metadata`、`images`、`seconds` 或旧版 `task_type`；未知字段也会返回 400。`/v1/videos` 的请求体不能直接用于此接口。

下表“通用”表示参数说明没有单列 Seedance 型号限制；仍需符合所用模型的要求。`1.0 Pro` 包含 `1.0 Pro Fast`；`2.0 系列`包含标准版、Fast、Mini。

| 字段 | 类型 | 用途与取值 | 适用模型 |
|---|---|---|---|
| `model` | string | 必填；使用 `/v1/models` 返回的可用视频模型 ID | 以当前 API 令牌可用的模型列表为准 |
| `content` | object[] | 必填、非空；文本和参考素材按顺序排列，见第 7 节 | 输入组合因型号和任务类型不同 |
| `resolution` | string | 视频清晰度；见下方分辨率矩阵 | 各型号不同 |
| `ratio` | string | `21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`adaptive` | 各型号均受任务类型限制 |
| `duration` | integer | 输出秒数；`-1` 为智能时长 | 2.5：`-1` 或 4–30；2.0 系列：`-1` 或 4–15；1.0 Pro：2–12 |
| `frames` | integer | 精确帧数：29–289 且满足 `25+4n`；与 `duration` 同传时官方以 `frames` 为准 | 仅 1.0 Pro |
| `seed` | integer | 随机种子，`-1`–`2147483647`；默认 `-1` 表示随机 | 仅 1.0 Pro |
| `camera_fixed` | boolean | 是否固定镜头；参考图任务不支持 | 仅 1.0 Pro |
| `watermark` | boolean | 是否添加右下角 AI 生成水印，默认 `false` | 通用 |
| `generate_audio` | boolean | 是否生成同步音频，默认 `true`；不等同于输入参考音频 | 2.5、2.0 系列 |
| `return_last_frame` | boolean | 是否返回尾帧，默认 `false`；查询结果读取 `content.last_frame_url` | 通用 |
| `output_format` | string | `mp4`（默认）或 `mov` | 仅 2.5 |
| `bitrate_mode` | string | 可选；可接受 `high` 、`standard`| 以所用模型支持情况为准 |
| `callback_url` | string | 接收任务状态通知的 URL | 通用 |
| `service_tier` | string | `default` 在线；`flex` 离线 | `flex` 仅 1.0 Pro；2.0/2.5 不支持 |
| `execution_expires_after` | integer | 过期秒数 3600–259200，默认 172800 | 通用 |
| `draft` | boolean | 样片模式，默认 `false`；`true` 时只生成 480p 样片 | 仅 2.5 |
| `tools` | object[] | 当前官方工具：`[{"type":"web_search"}]` | 2.5、2.0 系列 |
| `omni_reference_task_type` | string | `auto`（默认）、`reference`、`edit`、`extend` | 仅 2.5 |
| `priority` | integer | 同 Endpoint 队列优先级 0–9，默认 0；`flex` 不支持设置 | 2.5、2.0 系列 |
| `safety_identifier` | string | 终端用户标识，最多 64 个英文字符；建议传稳定哈希 | 通用 |

**分辨率矩阵**
| 型号 | `resolution` 可选值 | 官方默认值 | `duration` |
|---|---|---|---|
| Seedance 2.5 | `480p`、`720p`、`1080p` | `720p` | `-1` 或 4–30 秒；默认 `-1` |
| Seedance 2.0 标准版 | `480p`、`720p`、`1080p`、`4k` | `720p` | `-1` 或 4–15 秒 |
| Seedance 2.0 Fast / Mini | `480p`、`720p` | `720p` | `-1` 或 4–15 秒 |
| Seedance 1.0 Pro / Pro Fast | `480p`、`720p`、`1080p` | `1080p` | 2–12 秒 |

`ratio=adaptive` 控制智能**宽高比**；`duration=-1` 控制智能**时长**。Seedance 2.5 的编辑任务要求 `ratio=adaptive`、`duration=-1` 和至少一段参考视频；延长任务要求 `ratio=adaptive` 和参考视频；首帧/首尾帧任务要求 `ratio=adaptive`。[Seedance 2.5 任务规则](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)。不符合模型要求的请求会返回错误。

建议中文提示词不超过 **500 字**、英文不超过 **1000 词**；这是效果建议，不是接口的长度上限。

### 4.3 成功响应

```json
{"id": "cgt-20261019091809-qncop"}
```

**务必保存 `id`**。HTTP 200 只代表任务创建成功，不代表视频已生成。

创建、查询和下载均使用创建响应中的 `id`，不要根据任务 ID 前缀推断其格式。查询失败时可查看响应中的 `error.code` 和 `error.message`。

### 4.4 curl 示例

```bash
curl -sS -X POST '{{baseUrl}}/api/v3/contents/generations/tasks' \
  -H 'Authorization: Bearer sk-<API_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "doubao-seedance-2-0-mini-260615",
    "content": [{"type": "text", "text": "一只橘猫在阳光草地上打滚，镜头缓慢推近"}],
    "resolution": "480p",
    "ratio": "16:9",
    "duration": 5
  }'
```

### 4.5 样片模式（Seedance 2.5）

先以 `draft:true`、`resolution:"480p"` 生成样片；样片状态变为 `succeeded` 后，用同一模型、样片创建响应中的 `id` 和 `resolution:"1080p"` 生成正式视频。样片须属于当前账号，且两次请求须使用同一可用模型配置。

```json
{
  "model": "doubao-seedance-2-5-260628",
  "content": [{"type": "draft_task", "draft_task": {"id": "<样片创建响应中的 id>"}}],
  "resolution": "1080p"
}
```

正式视频仅支持 1080p；样片 ID 自创建起 7 天有效，两阶段分别计费。提示词、参考素材、`duration`、`ratio`、`seed`、`generate_audio`、`omni_reference_task_type` 会沿用样片设置，不要再次传入。可重新设置 `output_format`、`watermark`、`return_last_frame` 等参数，详见[Seedance 2.5 样片模式](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)。

## 5. 查询任务

```http
GET /api/v3/contents/generations/tasks/{task_id}
```

成功任务的响应示例（可选字段随模型和任务而变化）：

```json
{
    "content": {
        "video_url": "https://example.com/generated-video.mp4"
    },
    "created_at": 1792372723,
    "draft": false,
    "duration": 5,
    "execution_expires_after": 172800,
    "framespersecond": 24,
    "generate_audio": true,
    "id": "cgt-20261019091843-nm6ac",
    "model": "doubao-seedance-2-0-mini-260615",
    "output_format": "mp4",
    "priority": 0,
    "ratio": "16:9",
    "resolution": "480p",
    "seed": 83671,
    "service_tier": "default",
    "status": "succeeded",
    "updated_at": 1792372810,
    "usage": {
        "completion_tokens": 50638,
        "total_tokens": 50638
    }
}
```

主要字段：

| 字段 | 说明 |
|---|---|
| `status` | 火山原生枚举：`queued` / `running` / `succeeded` / `failed` / `cancelled` / `expired` |
| `created_at` / `updated_at` | 任务创建/状态更新时间的 Unix 时间戳（秒，UTC） |
| `resolution` / `ratio` / `duration` / `framespersecond` / `seed` 等 | 实际生成参数回显 |
| `usage.completion_tokens` / `usage.total_tokens` | 本次任务返回的 token 用量 |
| `safety_identifier` | 创建请求传了该字段时原样回显（未传则无此键） |
| `draft` / `draft_task_id` | 样片相关字段，仅在响应包含时使用 |
| `content.video_url` | 视频下载地址；请及时下载，火山官方链接有效期为 24 小时，Seedance 2.5 下载次数上限为 100 次 |
| `content.last_frame_url` | 尾帧图直链（请求含 `return_last_frame: true` 时返回） |

## 6. 下载视频

```http
GET /api/v3/contents/generations/tasks/{task_id}/content
```

任务 `succeeded` 后下载视频（二进制流或重定向）

示例：

```bash
curl -L "{{baseUrl}}/api/v3/contents/generations/tasks/{task_id}/content" \
  -H "Authorization: Bearer sk-your-api-key" \
  -o output.mp4
```

请求参数

| 参数          | 位置   | 必填 | 说明                                                    |
| :------------ | :----- | :--- | :------------------------------------------------------ |
| Authorization | header | 是   | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| task_id       | path   | 是   | 创建视频任务时返回的任务 id                             |

## 7. 参考素材（图 / 视频 / 音频）

所有输入均放在顶层 `content[]`。数组元素按提交顺序处理；图片、视频和音频应指定适用的 `role`。素材可使用公网 URL 或本账号素材库返回的 `asset://...` 引用。

| `content[]` 元素 | 必要字段 / `role` | 适用模型 |
|---|---|---|
| 文本 | `{"type":"text","text":"..."}` | 所列 Seedance 型号；部分多模态任务可不传文本 |
| 图片 | `image_url.url`；`first_frame`、`last_frame` 或 `reference_image` | 首帧/首尾帧：2.5、2.0 系列、1.0 Pro；多图参考：2.5、2.0 系列 |
| 视频 | `video_url.url`，`role:"reference_video"` | 2.5、2.0 系列 |
| 音频 | `audio_url.url`，`role:"reference_audio"` | 2.5、2.0 系列；2.0 系列不能只传音频 |
| 已有样片 | `draft_task.id`，填写已成功样片的创建响应 `id` | 仅 2.5，生成正式视频时使用 |
| 全模态参考输入 | Seedance 2.5 | Seedance 2.0 系列 |
|---|---|---|
| 参考图片 | 最多 30 张 | 最多 9 张 |
| 参考视频 | 最多 10 段，总时长不超过 30 秒 | 最多 3 段，总时长不超过 15 秒 |
| 参考音频 | 最多 10 段，总时长不超过 30 秒；可单独输入 | 最多 3 段，总时长不超过 15 秒；须搭配图片或视频 |

单张图片、单段音视频还须满足格式、大小、尺寸和时长限制，详见[素材限制](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)。

### 7.1 首帧图与素材库引用

```json
{
  "model": "doubao-seedance-2-5-260628",
  "content": [
    {"type": "text", "text": "人物缓缓转头，镜头保持稳定"},
    {"type": "image_url", "role": "first_frame", "image_url": {"url": "asset://asset-20260318035710-abc123"}}
  ],
  "duration": 5,
  "resolution": "720p",
  "ratio": "adaptive"
}
```

素材库 Action 返回 `AssetId` 时，引用为 `asset://<AssetId>`；REST `import` 返回 `asset_ref` 时直接使用该值。不要自行拼接素材 ID。首帧图也可使用公网可访问的 URL。

### 7.2 首尾帧与参考音视频

两张图片分别使用 `first_frame`、`last_frame`，并设置 `ratio:"adaptive"`。参考视频使用 `{"type":"video_url","role":"reference_video","video_url":{"url":"https://example.com/reference.mp4"}}`；参考音频使用对应的 `audio_url` 与 `reference_audio`。Seedance 2.5 编辑任务还须传 `duration:-1`，可用 `omni_reference_task_type:"edit"` 提前校验任务规则。

公网素材 URL 必须可直接下载，不能依赖用户登录态、Cookie 或仅内网可达。素材库引用仅限当前账号下状态为 Active 的素材。

## 8. 状态与轮询

| `status` | 含义 | 处理 |
|---|---|---|
| `queued` | 已排队 | 继续轮询 |
| `running` | 生成中 | 继续轮询 |
| `succeeded` | 已完成 | 读取 `content.video_url` 并及时持久化 |
| `failed` | 失败 | 终止，记录原因 |
| `cancelled` / `expired` | 已取消/已过期 | 终止并记录 |

建议每 **5～10 秒**查询一次，并设置业务侧等待超时；超时后可保留任务 ID 继续查询。视频 URL 有效期较短，任务成功后请及时下载。

## 9. 用量与计费

任务响应中的 `usage` 显示返回的 token 用量。实际费用以控制台展示的模型价格和账单记录为准；样片与正式视频分别创建任务、分别计费。

## 10. 错误处理

创建或查询请求被拒绝时，按 HTTP 状态码判断，并读取 `error.code`、`error.message`、`error.type` 和 `error.param`：

```json
{"error": {"code": "InvalidParameter", "message": "...", "param": "", "type": "BadRequest"}}
```

任务创建成功后，生成过程中的失败会在查询响应里体现：`status` 为 `failed`，`error` 包含 `code` 和 `message`；任务成功时 `error` 为 `null`。

常见错误：

| 错误信息关键词 | 原因 | 处理 |
|---|---|---|
| `AuthenticationError`（HTTP 401） | 令牌缺失、无效、过期或账号不可用 | 核对 `sk-` 令牌 |
| `MissingParameter` / `InvalidParameter`（HTTP 400） | 请求缺少必填字段，或字段类型、取值不正确 | 检查字段名、类型、取值 |
| 素材 `does not exist or does not belong to the current account` | 引用了不存在的 asset，或非本账号素材 | 核对素材归属 |
| `InputTextSensitiveContentDetected` | 提示词触发内容审核 | 调整提示词后重新提交 |
| `InputImageSensitiveContentDetected.PolicyViolation` | 输入图片涉及版权限制 | 更换有权使用的图片 |
| `InvalidParameter.DownloadFailed` | 素材 URL 无法被服务端下载 | 更换公网可直接下载的 HTTPS URL |
| 429 | 触发限流 | 退避重试 |
| 5xx | 服务暂时不可用 | 稍后重试；持续失败联系平台并附 task_id |

## 11. 对接建议

1. **保存原始响应**：创建与查询的 JSON 落库，便于对账排障；
2. **幂等**：创建超时重试可能产生重复任务，业务侧维护 `task_id ↔ 业务单号` 映射（**不要把单号写进提示词**）；
3. **及时保存视频**：`content.video_url` 可能过期，任务成功后请及时下载或转存；
4. **回调**：回调地址应可公网访问、快速返回 2xx，并处理重复通知；查询时使用创建响应中的任务 ID；
5. **限流**：遇到 429 时退避重试。

## 附录 A：OpenAI Video 风格模式（`/v1/videos`，可选）

另提供 OpenAI Video 风格入口。调用不同入口时，请分别使用对应的请求和响应格式：

| 差异项 | Ark 原生模式 | OpenAI Video 风格模式 |
|---|---|---|
| 创建/查询路径 | `/api/v3/contents/generations/tasks` | `/v1/videos`、`/v1/videos/{id}` |
| 提示词 | `content` 中的 `text` 项 | 顶层 `prompt` |
| 生成参数 | 顶层平铺 | 放在 `metadata` 内；参考素材放 `metadata.content` |
| 响应 `status` 语义 | `succeeded` 等火山词 | `completed` 等 OpenAI 词 |
| 素材引用 | 顶层 `content` 内 `asset://` | `metadata.content` 内 |

模型参数及取值可参考[创建视频生成任务 API](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)和[查询视频生成任务 API](https://docs.volcengine.com/docs/ark/get-video-generation-task-api?lang=zh)。
