# 完成真人认证会话（调用方上报火山回调参数）

**POST** `/api/lynx/volc-assets/liveness/sessions/{session_id}/complete`


**client 模式**：真人完成 H5 后，火山将浏览器重定向到创建会话时传入的 `callback_url`，并附带 Query 参数（常见：`bytedToken`/`byted_token`、`resultCode`/`result_code`，以及平台注入的 `session_id`）。**platform 模式无需调用本接口。**

调用方服务端解析上述参数后，调用本接口完成会话绑定；成功时 `data.face_group_id` 可用于 `POST /volc-assets/import`。

`result_code` 为 `10000` 表示火山侧认证成功。

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/liveness/sessions/{session_id}/complete" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"byted_token":"xxx","result_code":"10000"}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |
| session_id | path | 是 |  |


## 请求示例

```json
{
  "byted_token": "from-volc-callback-query",
  "result_code": "10000"
}
```


## 响应

### 200 — 成功时 data 含 face_group_id

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```

### 404 — 会话不存在
