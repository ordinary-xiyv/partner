import API from './index';

export const listPaymentChannels = () => API.get('/api/lynx/payment/channels');

export const createPaymentChannel = (data: any) =>
  API.post('/api/lynx/payment/channels', data);

export const updatePaymentChannel = (id: number, data: any) =>
  API.put(`/api/lynx/payment/channels/${id}`, data);

export const deletePaymentChannel = (id: number) =>
  API.delete(`/api/lynx/payment/channels/${id}`);

export const updateChannelStatus = (id: number, data: { status?: string; enabled?: boolean }) =>
  API.put(`/api/lynx/payment/channels/${id}/status`, data);
