# 获取素材详情

**GET** `/api/lynx/volc-assets/{id}`


**真人 / 虚拟共用本接口**。`sync=true` 时从火山同步最新状态。

```bash
curl "{{baseUrl}}/api/lynx/volc-assets/{id}?sync=true" \
  -H "Authorization: Bearer sk-your-api-key"
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| id | path | 是 | 素材记录 id（Lynx 侧 UUID，非火山 asset_id） |
| sync | query | 否 | 为 true 或 1 时从火山同步最新 status |


## 响应

### 200 — 成功时 data 为 AssetView

### 404 — 素材不存在（实测）


```json

{
  "success": false,
  "message": "素材不存在",
  "data": null
}

```
