export type BalanceAlertChannel = {
  enabled: boolean;
  bound: boolean;
  display: string;
};

export type BalanceAlertMine = {
  enabled: boolean;
  threshold_amount: string;
  current_balance_amount: string;
  currency_symbol: string;
  sms: BalanceAlertChannel;
  email: BalanceAlertChannel;
};

export type BalanceAlertSaveBody = {
  enabled: boolean;
  threshold_amount: string;
  sms_enabled: boolean;
  email_enabled: boolean;
};

export type BalanceAlertSaveResult = {
  enabled: boolean;
  threshold_amount: string;
  sms_enabled: boolean;
  email_enabled: boolean;
};
