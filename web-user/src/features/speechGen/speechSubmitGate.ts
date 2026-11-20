import { notify } from '../../ui/notify';

export type SpeechSubmitGateReason = 'missing_token' | 'no_model' | 'no_voice' | 'no_content';

export type SpeechSubmitGateInput = {
  hasToken: boolean;
  hasModel: boolean;
  hasVoice: boolean;
  hasContent: boolean;
};

export type SpeechSubmitGateMessages = {
  missingToken: string;
  selectModel: string;
  selectVoice: string;
  enterContent: string;
};

export function checkSpeechSubmitGate(input: SpeechSubmitGateInput): SpeechSubmitGateReason | null {
  if (!input.hasToken) return 'missing_token';
  if (!input.hasModel) return 'no_model';
  if (!input.hasVoice) return 'no_voice';
  if (!input.hasContent) return 'no_content';
  return null;
}

export function runSpeechSubmitGate(
  input: SpeechSubmitGateInput,
  messages: SpeechSubmitGateMessages,
): boolean {
  const reason = checkSpeechSubmitGate(input);
  if (reason == null) return true;
  const text =
    reason === 'missing_token'
      ? messages.missingToken
      : reason === 'no_model'
        ? messages.selectModel
        : reason === 'no_voice'
          ? messages.selectVoice
          : messages.enterContent;
  notify.info(text);
  return false;
}
