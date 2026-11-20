# 删除真人参考素材

**DELETE** `/api/lynx/volc-assets/{id}`


先删上游素材，再删本地记录；`status=Failed` 时见 `fail_reason`。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token，格式 Bearer sk-... |
| id | path | 是 |  |


## 响应

### 200 — 成功

### 404 — 素材不存在
