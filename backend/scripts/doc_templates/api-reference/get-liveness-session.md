# 查询真人认证会话

**GET** `/api/lynx/volc-assets/liveness/sessions/{session_id}`


轮询认证结果。**platform 模式**：火山回调平台后自动落库。**client 模式**：须在调用方 **POST complete** 之后才会变为 `succeeded`。

| status | 含义 |
|--------|------|
| pending | 未完成（未 complete 或真人未刷脸） |
| succeeded | 成功，有 face_group_id |
| failed | 失败，见 fail_reason |
| expired | 超时，重新创建会话 |


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| session_id | path | 是 |  |


## 响应

### 200

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```

### 404 — 会话不存在
