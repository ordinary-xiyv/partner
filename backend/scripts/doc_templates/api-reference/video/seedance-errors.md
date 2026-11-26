# Seedance 视频 API 错误响应

本文适用于以下视频生成接口：

| 操作 | 接口 |
|---|---|
| 创建任务 | `POST /api/v3/contents/generations/tasks` |
| 查询任务 | `GET /api/v3/contents/generations/tasks/{id}` |

视频生成采用异步任务。请求被拒绝时会返回 HTTP 错误；任务创建成功后，生成过程也可能失败。这两种情况的响应方式不同。以下错误码为常见示例，具体原因以实际响应中的 `error.code` 和 `error.message` 为准。

## 1. 请求被拒绝：HTTP 错误响应

创建或查询请求被拒绝时，HTTP 状态码为 `4xx` 或 `5xx`，响应体格式如下：

```json
{
  "error": {
    "code": "InvalidParameter",
    "message": "One or more parameters specified in the request are not valid. (request id: <request-id>)",
    "param": "",
    "type": "BadRequest"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `error.code` | string | 具体错误码；优先用它判断错误原因。不同原因可能具有相同的 HTTP 状态码。 |
| `error.message` | string | 错误说明，可能附带请求 ID；用于展示和排查，不建议按文案做程序判断。 |
| `error.param` | string | 与错误有关的参数名；无法明确定位时为空字符串。 |
| `error.type` | string | 错误类别，例如 `BadRequest`、`Unauthorized`、`Forbidden`、`TooManyRequests`。 |

如需排查问题，请保存 HTTP 状态码、完整响应体、调用时间和 `message` 中的请求 ID。

### 输入图片被版权策略拦截

以下示例对应图片触发版权限制时的创建请求错误。**HTTP 400 表示任务没有创建成功**，不会产生可轮询的任务 ID。

```json
{
  "error": {
    "code": "InputImageSensitiveContentDetected.PolicyViolation",
    "message": "The request failed because the input image may be related to copyright restrictions. (request id: <request-id>)",
    "param": "",
    "type": "BadRequest"
  }
}
```

遇到该错误时，请确认输入图片的使用授权，并在必要时更换素材后重新提交。

### 鉴权失败

```http
HTTP/1.1 401 Unauthorized
```

```json
{
  "error": {
    "code": "AuthenticationError",
    "message": "认证失败 (request id: <request-id>)",
    "param": "",
    "type": "Unauthorized"
  }
}
```

检查 `Authorization: Bearer sk-<API_TOKEN>` 是否正确、令牌是否有效，以及令牌是否有权使用相应模型。`message` 的具体文字可能随失败原因变化。

## 2. 已创建任务，生成过程失败

创建接口返回 `id` 只表示任务已受理。随后调用查询接口，若 HTTP 请求成功，响应仍为 **HTTP 200**；应继续检查任务 `status`。`status` 为 `failed` 时，读取任务对象中的 `error.code` 和 `error.message`：

```json
{
  "id": "cgt-<task-id>",
  "model": "doubao-seedance-2-0-260128",
  "status": "failed",
  "created_at": 1790000000,
  "updated_at": 1790000030,
  "error": {
    "code": "OutputVideoSensitiveContentDetected",
    "message": "The output video may contain sensitive information."
  }
}
```

任务成功时，`status` 为 `succeeded`，`error` 为 `null`；此时读取 `content.video_url`。排队或运行中时继续轮询。失败任务响应中的 `error` 应读取 `code` 和 `message`；`type`、`param` 不一定返回。

## 3. 常见错误码与处理

| HTTP 状态或任务状态 | 常见 `error.code` | 说明与处理 |
|---|---|---|
| 400 | `MissingParameter` | 缺少必填参数；检查 `model`、`content` 等字段。 |
| 400 | `InvalidParameter` | 字段类型、值或参数组合不符合要求；结合 `message` 和 `param` 修改请求。 |
| 400 | `InputImageSensitiveContentDetected.PolicyViolation` | 输入图片可能涉及版权限制；检查授权并更换图片。 |
| 400 | `InputImageSensitiveContentDetected.PrivacyInformation` | 输入图片可能涉及真人隐私限制；更换符合要求的素材。 |
| 400 | `InputTextSensitiveContentDetected`、`InputVideoSensitiveContentDetected` | 输入文本或视频触发内容限制；按错误说明调整输入。 |
| 401 | `AuthenticationError` | 令牌缺失或无效；修正鉴权信息。 |
| 403 | `AccessDenied` 等 | 当前令牌或账户无权访问目标资源；检查权限。 |
| 404 | `NotFound` 等 | 任务或目标资源不存在，或当前账户无法访问；确认任务 ID 与账户。 |
| 429 | `QuotaExceeded`、`ServerOverloaded`、`RateLimitExceeded.*` 等 | 限额或负载限制；按 `error.code` 判断原因，采用退避重试。 |
| 500 / 503 | `InternalServiceError`、`NoAvailableService` 等 | 服务暂时不可用；稍后重试，持续发生时提供请求 ID 排查。 |
| 任务 `failed` | 以查询结果为准，例如 `OutputVideoSensitiveContentDetected` | 任务已终止；检查 `error.code`、`error.message` 后决定是否修改输入并创建新任务。 |

上表仅列出常见情况。不同模型和请求场景可能返回其他错误码，请以实际响应为准。

## 4. 客户端处理顺序

1. 先检查 HTTP 状态码。若为 `4xx` 或 `5xx`，读取 `error`；此时不要把错误响应当作任务对象。
2. 创建请求返回成功时保存 `id`，再按 `id` 查询任务。
3. 查询请求返回 HTTP 200 后检查 `status`。`queued`、`running` 继续轮询；`failed` 读取任务中的 `error`；`succeeded` 读取视频地址。
4. 对参数、鉴权和内容限制错误，先修正请求再提交。对 `429` 或暂时性 `5xx`，设置退避和重试上限。创建请求超时或连接中断时，先核查是否已有任务，避免盲目重复创建。

## 5. `/content` 下载接口

`GET /api/v3/contents/generations/tasks/{id}/content` 是视频下载接口。成功时返回视频数据；下载失败时也可能返回 JSON，但其错误体采用下载接口的格式，例如：

```json
{
  "error": {
    "message": "Task not found",
    "type": "invalid_request_error"
  }
}
```

下载接口的 `error.code` 可能缺省，不要用创建或查询任务接口的四字段规则解析它。下载前可先查询任务状态，并优先使用成功响应中的 `content.video_url`。
