declare module 'react-turnstile' {
  import type { FC } from 'react';

  export interface TurnstileProps {
    sitekey: string;
    onVerify?: (token: string) => void;
    onExpire?: () => void;
    theme?: 'light' | 'dark' | 'auto';
  }

  const Turnstile: FC<TurnstileProps>;
  export default Turnstile;
}
