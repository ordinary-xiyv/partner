# 列出素材

**GET** `/api/lynx/volc-assets`


分页列出当前 Token 可见素材。虚拟人推荐 `scope=mine` + `group_type=AIGC`；可按 `group_id` 筛某一 AIGC 组。

响应 `data.items[]` 为 AssetView；生成视频请使用 `asset_ref`（非 id）。

| Query | 枚举/默认 | 说明 |
|-------|-----------|------|
| scope | all / mine / official，默认 all | all=官方+我的；mine=仅我的；official=仅官方 |
| group_type | AIGC / LivenessFace | 虚拟人填 AIGC |
| group_id | — | AIGC 火山组 id（POST /groups 返回） |
| status | pending / Processing / Active / Failed | 精确匹配，区分大小写 |
| asset_type | Image / Video | 精确匹配，区分大小写 |

```bash
curl "{{baseUrl}}/api/lynx/volc-assets?page=1&page_size=20" \
  -H "Authorization: Bearer sk-your-api-key"
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| page | query | 否 | 页码，从 1 开始 |
| page_size | query | 否 | 每页条数，最大 100 |
| scope | query | 否 | all=官方+我的（默认）；mine=仅我的；official=仅官方 |
| asset_type | query | 否 | 素材类型（火山 AssetType，区分大小写） |
| status | query | 否 | 素材状态（区分大小写；Processing、Active、Failed 首字母大写） |
| group_type | query | 否 | 素材组类型 |
| group_id | query | 否 | 火山侧 AIGC 素材组 id（POST /volc-assets/groups 返回的 group_id） |
| face_group_id | query | 否 | Lynx 真人组 id |


## 响应

### 200 — 成功（2026-06-07 生产实测）


```json

{
  "success": true,
  "message": "",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "page_size": 20
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
