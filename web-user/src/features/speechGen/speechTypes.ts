export type SpeechLanguageType =
  | 'Auto'
  | 'Chinese'
  | 'English'
  | 'German'
  | 'Italian'
  | 'Portuguese'
  | 'Spanish'
  | 'Japanese'
  | 'Korean'
  | 'French'
  | 'Russian';

export type SpeechGenerationStatus = 'pending' | 'completed' | 'failed';

export type SpeechGeneration = {
  id: string;
  createdAt: number;
  model: string;
  text: string;
  voice: string;
  languageType: SpeechLanguageType;
  status: SpeechGenerationStatus;
  audioUrl?: string;
  requestId?: string;
  errorMessage?: string;
  usageTotalTokens?: number;
};

export type SpeechSession = {
  id: string;
  createdAt: number;
  title: string;
  generations: SpeechGeneration[];
};

export type SpeechComposerPrefs = {
  model: string;
  voice: string;
  languageType: SpeechLanguageType;
};
