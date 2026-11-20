# 导入同人参考素材

**POST** `/api/lynx/volc-assets/import`


与虚拟人共用 `POST /api/lynx/volc-assets/import`。

**流程**：创建活体会话 → 真人完成 H5 → 取 `face_group_id` → 调本接口 → 用 `data.asset_ref` 生成视频。

`url` 与 `file_id` 二选一；`asset_type` 为 `Image` 或 `Video`（区分大小写，默认 Image）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token，格式 Bearer sk-... |
| Content-Type | header | 是 |  |


## 请求示例

```json
{
  "face_group_id": "8c927458-0b91-4b0e-9c90-50b8aa7de9ed",
  "url": "https://your-cdn.example.com/full-body.jpg",
  "asset_type": "Image",
  "name": "全身参考",
  "wait_active": true
}
```


## 响应

### 200 — 成功

### 401 — 未授权
