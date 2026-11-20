import API from './index';
import type {
  BalanceAlertMine,
  BalanceAlertSaveBody,
  BalanceAlertSaveResult,
} from '../types/balanceAlert';

interface LynxApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export const getMineBalanceAlert = () =>
  API.get<LynxApiResponse<BalanceAlertMine>>('/api/lynx/balance-alert/mine');

export const saveMineBalanceAlert = (body: BalanceAlertSaveBody) =>
  API.put<LynxApiResponse<BalanceAlertSaveResult>>('/api/lynx/balance-alert/mine', body);
