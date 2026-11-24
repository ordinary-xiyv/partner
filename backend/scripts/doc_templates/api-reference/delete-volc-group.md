# 删除 AIGC 素材组

**DELETE** `/api/lynx/volc-assets/groups/{group_id}`


先删除火山侧组内素材与组本身，并删除组内全部素材记录。
Path 参数 `group_id` 为 **火山侧** id（与 POST groups 返回的 `data.group_id` 一致）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| group_id | path | 是 |  |


## 响应

### 200 — 成功


```json

{
  "success": true,
  "message": "",
  "data": {
    "group_id": "grp-xxxx"
  }
}

```

### 404 — 组不存在或无权访问
