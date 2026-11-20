# 列出真人参考素材

**GET** `/api/lynx/volc-assets`


与虚拟人共用 `GET /api/lynx/volc-assets`。

推荐 Query：`scope=mine`、`group_type=LivenessFace`、`face_group_id={认证返回 id}`、`status=Active`。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token，格式 Bearer sk-... |
| page | query | 否 |  |
| page_size | query | 否 |  |
| scope | query | 否 |  |
| group_type | query | 否 |  |
| face_group_id | query | 否 |  |
| status | query | 否 |  |
| asset_type | query | 否 |  |


## 响应

### 200

### 401 — 未授权
