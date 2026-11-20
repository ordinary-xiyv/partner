# 创建素材

**POST** `/api/lynx/volc-assets`


与 import 类似，登记公网 URL。需平台已配置火山素材 API（否则 503）。

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/ref.mp4","asset_type":"Video","name":"参考视频"}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "url": "https://example.com/ref.mp4",
  "asset_type": "Video",
  "name": "参考视频"
}
```


## 响应

### 200 — 成功时 data 为 AssetView

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```

### 503 — 火山素材 API 未配置（需重编部署 API 镜像）


```json

{
  "success": false,
  "message": "素材服务暂不可用，请稍后重试或联系支持",
  "data": null
}

```
