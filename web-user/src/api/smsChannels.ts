import API from './index';
import type {
  SmsChannel,
  SmsChannelCreatePayload,
  SmsChannelUpdatePayload,
  SmsDriverDescriptor,
  SmsTestSendPayload,
  SmsTestSendResult,
} from '../types/smsChannel';

interface LynxApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export const listSmsDrivers = () =>
  API.get<LynxApiResponse<SmsDriverDescriptor[]>>('/api/lynx/admin/sms-channels/drivers');

export const listSmsChannels = () =>
  API.get<LynxApiResponse<SmsChannel[]>>('/api/lynx/admin/sms-channels');

export const getSmsChannel = (id: number) =>
  API.get<LynxApiResponse<SmsChannel>>(`/api/lynx/admin/sms-channels/${id}`);

export const createSmsChannel = (data: SmsChannelCreatePayload) =>
  API.post<LynxApiResponse<null>>('/api/lynx/admin/sms-channels', data);

export const updateSmsChannel = (id: number, data: SmsChannelUpdatePayload) =>
  API.put<LynxApiResponse<null>>(`/api/lynx/admin/sms-channels/${id}`, data);

export const deleteSmsChannel = (id: number) =>
  API.delete<LynxApiResponse<null>>(`/api/lynx/admin/sms-channels/${id}`);

export const enableSmsChannel = (id: number) =>
  API.post<LynxApiResponse<null>>(`/api/lynx/admin/sms-channels/${id}/enable`);

export const disableSmsChannel = (id: number) =>
  API.post<LynxApiResponse<null>>(`/api/lynx/admin/sms-channels/${id}/disable`);

export const testSendSmsChannel = (id: number, data: SmsTestSendPayload) =>
  API.post<LynxApiResponse<SmsTestSendResult>>(`/api/lynx/admin/sms-channels/${id}/test-send`, data);
