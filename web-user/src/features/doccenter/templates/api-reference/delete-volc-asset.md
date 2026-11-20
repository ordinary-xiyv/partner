# 删除素材

**DELETE** `/api/lynx/volc-assets/{id}`


真人 / 虚拟共用本接口。先调用火山 `DeleteAsset`，成功后再本地软删；上游失败则不删本地。
`status=Failed` 时 `fail_reason` / `message` 透传火山 `GetAsset.Result.Error`（如合规审核「素材可能侵权」）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| id | path | 是 | 素材记录 id（Lynx 侧 UUID，非火山 asset_id） |


## 响应

### 200 — 成功时 data.id 为已删记录 id


```json

{
  "success": true,
  "message": "",
  "data": {
    "id": "uuid"
  }
}

```

### 404


```json

{
  "success": false,
  "message": "素材不存在",
  "data": null
}

```
