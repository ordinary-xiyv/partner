import React from 'react';
import { getVoiceAvatarUrl } from '../../features/speechGen/voiceAvatars';

export interface SpeechVoiceAvatarProps {
  voice?: string;
  className?: string;
}

export function SpeechVoiceAvatar({ voice, className }: SpeechVoiceAvatarProps) {
  const src = getVoiceAvatarUrl(voice);
  if (!src) {
    return <span className={className} aria-hidden />;
  }
  return <img className={className} src={src} alt="" aria-hidden draggable={false} />;
}
