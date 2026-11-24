# 删除真人组

**DELETE** `/api/lynx/volc-assets/face-groups/{face_group_id}`


先删除火山侧组内素材与 LivenessFace 组，并删除组内全部素材记录。
Path 参数为 Lynx `face_group_id`（非火山 group_id）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| face_group_id | path | 是 |  |


## 响应

### 200


```json

{
  "success": true,
  "message": "",
  "data": {
    "face_group_id": "uuid"
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

### 404 — 真人组不存在
