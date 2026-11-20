/** 与聊天页 `ChatShellScope` 一致，供选择模型组件复用且避免 components 反向依赖 pages */
export type ModelPickerScope = 'text' | 'image';

/** 与定价行 `modalities` 解析结果一致，用于过滤可选模型 */
export type ModelPickerCategory = 'text' | 'image' | 'video';

/** 各入口传入：文本对话 text、图像对话 img（仅图像类）、视频生成 video（仅视频类） */
export type ModelPickerFilterMode = 'text' | 'img' | 'video';
