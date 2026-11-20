import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Spin, Switch, Typography } from 'antd';
import { createTokenAKSK, getTokenAKSK, resetTokenAKSK, setTokenAKSKEnabled } from '../../api';
import type { Token } from '../../types';
import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';

type Credential = { access_key: string; enabled: boolean };
type Issued = { access_key: string; secret_key: string };

export function TokenAKSKModal({ token, onClose }: { token: Token | null; onClose: () => void }) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    setCredential(null);
    setIssued(null);
    if (!token) return;
    setLoadingStatus(true);
    let active = true;
    void getTokenAKSK(token.id).then((res) => {
      if (active && res.data.success) setCredential(res.data.data as Credential | null);
      else if (active) notifyApiError(res.data.message);
    }).catch((err) => { if (active) notifyApiErrorFromErr(err); })
      .finally(() => { if (active) setLoadingStatus(false); });
    return () => { active = false; };
  }, [token]);

  const issue = async (reset: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = reset ? await resetTokenAKSK(token.id) : await createTokenAKSK(token.id);
      if (!res.data.success) { notifyApiError(res.data.message); return; }
      const data = res.data.data as Issued;
      setIssued(data);
      const status = await getTokenAKSK(token.id);
      if (status.data.success) setCredential(status.data.data as Credential);
    } catch (err) { notifyApiErrorFromErr(err); }
    finally { setBusy(false); }
  };

  const toggle = async (enabled: boolean) => {
    if (!token || !credential) return;
    setBusy(true);
    try {
      const res = await setTokenAKSKEnabled(token.id, enabled);
      if (res.data.success) {
        setCredential({ ...credential, enabled });
        notifyApiSuccess('AK/SK 状态已更新');
      } else notifyApiError(res.data.message);
    } catch (err) { notifyApiErrorFromErr(err); }
    finally { setBusy(false); }
  };

  return <Modal title={`AK/SK · ${token?.name ?? ''}`} open={!!token} onCancel={onClose}
    footer={<Button onClick={onClose}>关闭</Button>} destroyOnClose maskClosable={false}>
    {loadingStatus ? <Spin /> : !credential ? <Button loading={busy} onClick={() => void issue(false)}>生成 AK/SK</Button> : <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>Access Key</Typography.Text>
      <Input readOnly value={credential.access_key} />
      <Space><Switch checked={credential.enabled} disabled={busy} onChange={(value) => void toggle(value)} />启用 AK/SK</Space>
      <Button loading={busy} danger onClick={() => Modal.confirm({ title: '重置 AK/SK？', content: '旧 AK 和 SK 将立即失效。', onOk: () => issue(true) })}>重置凭据</Button>
    </Space>}
    {issued && <div style={{ marginTop: 20 }}>
      <Typography.Text strong>请立即保存 Secret Key，关闭后无法再次查看。</Typography.Text>
      <Input.Password readOnly value={issued.secret_key} visibilityToggle />
    </div>}
  </Modal>;
}
