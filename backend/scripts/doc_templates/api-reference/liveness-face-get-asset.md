# 获取真人素材详情

**GET** `/api/lynx/volc-assets/{id}`


`id` 为 import 返回的 `data.id`。Query `sync=true` 或 `sync=1` 时从上游同步最新 status。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token，格式 Bearer sk-... |
| id | path | 是 |  |
| sync | query | 否 | true 或 1 时同步上游状态 |


## 响应

### 200

### 404 — 素材不存在
