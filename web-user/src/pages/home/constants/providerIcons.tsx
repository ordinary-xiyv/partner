import React from 'react';
import Claude from '@lobehub/icons/es/Claude/components/Mono';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono';
import Google from '@lobehub/icons/es/Google/components/Mono';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono';
import zhipuIcon from '../../../assets/model_icons/zhipu.png';
import type { HomeProviderName } from '../types';

const ZhipuIcon: React.FC = () => (
  <img src={zhipuIcon} alt="Zhipu" style={{ width: 42, height: 42 }} />
);

export const PROVIDER_AVATAR: Record<HomeProviderName, { bg: string; color: string }> = {
  OpenAI: { bg: '#000', color: '#fff' },
  Anthropic: { bg: '#F1F0E8', color: '#141413' },
  Google: { bg: '#4285F4', color: '#fff' },
  DeepSeek: { bg: '#4D6BFE', color: '#fff' },
  GLM: { bg: 'black', color: 'white' },
};

export const PROVIDER_ICON: Record<
  HomeProviderName,
  React.ComponentType<{ size?: number | string; color?: string; style?: React.CSSProperties }>
> = {
  OpenAI,
  Anthropic: Claude,
  Google,
  DeepSeek,
  GLM: ZhipuIcon,
};

export const CORE_FEATURE_PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'DeepSeek'] as const;
