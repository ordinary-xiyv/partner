# 获取真人组详情

**GET** `/api/lynx/volc-assets/face-groups/{face_group_id}`


按 Lynx `face_group_id` 查询单人组。`status` 为 `verified` 后方可 import 同人素材。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| face_group_id | path | 是 |  |


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

### 404 — 真人组不存在
