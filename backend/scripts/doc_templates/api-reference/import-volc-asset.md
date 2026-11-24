# 导入素材（推荐）

**POST** `/api/lynx/volc-assets/import`


**真人 / 虚拟共用本接口**（同一后端、同一路径）。用 **公网 HTTPS URL** 或 `file_id` 登记素材，可选 `wait_active: true` 等待 Active。

登记公网素材 URL 或已上传 `file_id`，创建素材并可选等待审核通过（Active）。

**虚拟人（AIGC）流程**：`url`/`file_id` 二选一 → 可选 `group_id`（须为本账号已创建/使用过的组，见 GET /groups）→ 取 `data.asset_ref` 用于视频生成。

**真人人像**：须先完成 H5 认证，Body 必填 `face_group_id`（真人组 status=verified）；详见「真人人像库」目录下本接口副本。

| 字段 | 虚拟人 | 真人人像 | 说明 |
|------|--------|----------|------|
| url / file_id | 二选一必填 | 二选一必填 | 公网 HTTPS URL 或平台 file_id（须 public_read） |
| face_group_id | 不传 | **必填** | 真人组 id，来自 GET session / GET face-groups |
| group_id | 可选 | 不传 | AIGC 火山组 id；须属当前账号；省略则用默认组 |
| asset_type | 可选 | 可选 | Image 或 Video，默认 Image |
| wait_active | 可选 | 可选 | true 阻塞至 Active 或 Failed |

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/import" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-cdn.example.com/avatar-ref.mp4","asset_type":"Video","name":"虚拟人参考","wait_active":true}'
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "url": "https://your-cdn.example.com/avatar-ref.mp4",
  "asset_type": "Video",
  "name": "虚拟人参考",
  "wait_active": true
}
```


## 响应

### 200 — 成功时 data 为 AssetView


```json

{
  "success": true,
  "message": "",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "scope": "user",
    "asset_ref": "asset://asset-20260318035710-abc123",
    "name": "虚拟人参考",
    "asset_type": "Video",
    "status": "Active",
    "source_url": "https://your-cdn.example.com/avatar-ref.mp4",
    "created_at": 1780883000
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
