import { useEffect } from 'react';
import { App } from 'antd';
import { bindNotifyMessage } from './notify';

/** Mount inside antd App to wire module-level notify.* */
export function NotifyBinder() {
  const { message } = App.useApp();
  useEffect(() => {
    bindNotifyMessage(message);
  }, [message]);
  return null;
}
