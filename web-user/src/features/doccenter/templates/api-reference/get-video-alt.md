# 查询视频任务（别名路径）

**GET** `/v1/video/generations/{task_id}`


与 `GET /v1/videos/{task_id}` 相同。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| task_id | path | 是 | 创建视频任务时返回的任务 id |


## 响应

### 200

### 401 — Token 无效


```json

{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}

```
