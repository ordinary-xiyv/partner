import { notify } from '../../ui/notify';

/** 发送前统一校验：token → 模型 → 内容 */
export type ComposerSubmitGateReason = 'missing_token' | 'no_model' | 'no_content';

export type ComposerSubmitGateInput = {
  hasToken: boolean;
  hasModel: boolean;
  hasContent: boolean;
};

export type ComposerSubmitGateMessages = {
  missingToken: string;
  selectModel: string;
  enterContent: string;
};

export function checkComposerSubmitGate(input: ComposerSubmitGateInput): ComposerSubmitGateReason | null {
  if (!input.hasToken) return 'missing_token';
  if (!input.hasModel) return 'no_model';
  if (!input.hasContent) return 'no_content';
  return null;
}

export function notifyComposerSubmitBlocked(
  reason: ComposerSubmitGateReason,
  messages: ComposerSubmitGateMessages,
): void {
  const text =
    reason === 'missing_token'
      ? messages.missingToken
      : reason === 'no_model'
        ? messages.selectModel
        : messages.enterContent;
  notify.info(text);
}

/** @returns true 表示可以继续发送 */
export function runComposerSubmitGate(
  input: ComposerSubmitGateInput,
  messages: ComposerSubmitGateMessages,
): boolean {
  const reason = checkComposerSubmitGate(input);
  if (reason == null) return true;
  notifyComposerSubmitBlocked(reason, messages);
  return false;
}
