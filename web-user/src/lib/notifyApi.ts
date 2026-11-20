import { notify } from '../ui/notify';
import { formatApiMessage, formatApiMessageFromError, type FormatApiMessageOptions } from './formatApiMessage';

export function notifyApiSuccess(
  message?: string | null,
  options?: FormatApiMessageOptions,
) {
  notify.success(
    formatApiMessage(message, { fallbackKey: options?.fallbackKey ?? 'notify.operationSuccess' }),
  );
}

export function notifyApiError(
  message?: string | null,
  options?: FormatApiMessageOptions,
) {
  notify.error(
    formatApiMessage(message, { fallbackKey: options?.fallbackKey ?? 'notify.operationFailed' }),
  );
}

export function notifyApiErrorFromErr(err: unknown, options?: FormatApiMessageOptions) {
  notify.error(formatApiMessageFromError(err, options));
}

/** When response has success flag */
export function notifyFromApiResponse(
  res: { data?: { success?: boolean; message?: string } },
  options?: { successKey?: string; errorKey?: string },
): boolean {
  if (res.data?.success) {
    notifyApiSuccess(res.data.message, { fallbackKey: options?.successKey ?? 'notify.operationSuccess' });
    return true;
  }
  notifyApiError(res.data?.message, { fallbackKey: options?.errorKey ?? 'notify.operationFailed' });
  return false;
}
