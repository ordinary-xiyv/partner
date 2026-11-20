import ChatShell from './chat/ChatShell';

/** 文本对话：仅文本模型与 /v1/chat/completions，路由 `/chat`；modelPickerFilter 驱动选择器过滤 */
export default function TextChat() {
  return <ChatShell modelPickerFilter="text" />;
}
