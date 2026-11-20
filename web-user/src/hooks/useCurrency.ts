import { useStatus } from '../contexts/StatusContext';

export interface CurrencyConfig {
  symbol: string;
  rate: number;
  decimals: number;
}

export function useCurrency(): CurrencyConfig {
  const { lynxConfig } = useStatus();
  return {
    symbol: lynxConfig.currency_symbol,
    rate: lynxConfig.currency_rate,
    decimals: 4,
  };
}

/** Format a USD amount to locale currency string */
export function formatUSD(usdAmount: number, config: CurrencyConfig): string {
  const amount = usdAmount * config.rate;
  if (!Number.isFinite(amount)) return config.symbol + (0).toFixed(4);
  return config.symbol + amount.toFixed(4);
}

/** Format quota to locale currency string (quota → USD → locale currency) */
export function formatQuota(quota: number, config: CurrencyConfig, quotaPerUnit = 500000): string {
  if (!quota || isNaN(quota)) return config.symbol + '0.0000';
  const usd = quota / quotaPerUnit;
  return formatUSD(usd, config);
}
