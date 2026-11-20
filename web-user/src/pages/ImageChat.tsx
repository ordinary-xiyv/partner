import ChatShell from './chat/ChatShell';

/** 图像对话：与文本对话共用 ChatShell（含会话滚动位置恢复、流式跟底等） */
export default function ImageChat() {
  return <ChatShell modelPickerFilter="img" />;
}
