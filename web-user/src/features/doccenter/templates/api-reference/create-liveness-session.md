# 创建真人认证会话

**POST** `/api/lynx/volc-assets/liveness/sessions`


创建真人 H5 活体认证会话，返回 `h5_url` 供终端用户打开。会话有效期约 **120 秒**。

**使用流程**
1. 调用本接口，将 `data.h5_url` 展示给真人扫码/打开
2. 真人完成 H5 后，按 `callback_mode` 获取结果：
   - **platform**（未传 `callback_url`）：平台自动处理，轮询 **GET session** 或监听 `webhook_url`
   - **client**（传入 `callback_url`）：火山浏览器跳转到您的 https 地址，再调 **POST complete**
3. `status=succeeded` 后，用 `data.face_group_id` 调用 **POST /volc-assets/import**

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/liveness/sessions" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"模特小美","language":"zh"}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "display_name": "模特小美",
  "language": "zh",
  "callback_url": "https://your-app.com/liveness/callback",
  "webhook_url": "https://your-app.com/hooks/liveness"
}
```


## 响应

### 200 — 成功时 data 为 LivenessSessionView


```json

{
  "success": true,
  "message": "",
  "data": {
    "session_id": "sess_a1b2c3d4",
    "status": "pending",
    "callback_mode": "platform",
    "volc_callback_url": "{{baseUrl}}/api/lynx/volc-assets/liveness/callback?session_id=sess_a1b2c3d4",
    "h5_url": "https://liveness.volcengine.com/h5/...",
    "display_name": "模特小美",
    "expires_at": 1780883120
  }
}

```

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```

### 503 — 火山素材 API 未配置


```json

{
  "success": false,
  "message": "素材服务暂不可用，请稍后重试或联系支持",
  "data": null
}

```
