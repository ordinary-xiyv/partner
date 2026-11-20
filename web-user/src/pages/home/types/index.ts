import type React from 'react';

export type ModelCatalogStat =
  | { phase: 'loading' }
  | { phase: 'ready'; count: number }
  | { phase: 'error' };

export type HomeProviderName = 'OpenAI' | 'Anthropic' | 'Google' | 'DeepSeek' | 'GLM';

export interface HomeHighlightCard {
  title: string;
  desc: string;
  cta: string;
  to: string;
  visual: React.ReactNode;
}

export interface HomeStatItem {
  value: React.ReactNode;
  label: string;
  note: string;
}

export interface HomeFeaturedModel {
  name: string;
  provider: HomeProviderName;
  useCase: string;
  fit: string;
}

export interface HomeAnnouncementItem {
  title: string;
  desc: string;
  date: string;
  tag: string;
}
