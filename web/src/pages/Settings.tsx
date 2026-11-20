import React, { useState } from 'react';
import { Alert, Button, Form, Input, Segmented, Tag, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import {
  AppPageHeader,
  DescGrid,
  PagePanel,
  PageStack,
  UseMockNotice,
  dealerApi,
  formatDiscount,
  formatPercent,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
} from '@lynx/shared';
import { useDealerAuth } from '../auth';

const { Text } = Typography;

type Tab = 'profile' | 'password';

export default function Settings() {
  const { profile, refresh } = useDealerAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.new_password !== values.confirm_password) {
        notifyApiError(null, '两次输入的新密码不一致');
        return;
      }
      setSaving(true);
      await dealerApi.changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      notifyApiSuccess('密码修改成功');
      form.resetFields();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return;
      notifyApiError(err, '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageStack gap={20}>
      <AppPageHeader title="账号设置" subtitle="查看账户信息与安全设置" />

      <UseMockNotice />

      <PagePanel padded>
        <div className="lynx-section-title">商户信息</div>
        <DescGrid
          items={[
            { label: '商户 ID', value: profile?.id ?? '-' },
            { label: '商户编码', value: profile?.username ?? '-' },
            { label: '名称', value: profile?.display_name ?? '-' },
            {
              label: '代理等级',
              value: (
                <Tag color={profile?.level === 'diamond' ? 'blue' : profile?.level === 'gold' ? 'orange' : 'default'}>
                  {profile?.level === 'diamond' ? '钻石代理' : profile?.level === 'gold' ? '金牌代理' : '银牌代理'}
                </Tag>
              ),
            },
            { label: '客户折扣', value: formatDiscount(profile?.discount_rate ?? 1) },
            { label: '佣金比例', value: formatPercent(profile?.commission_rate ?? 0) },
            { label: '客户数量', value: profile?.sub_user_count ?? 0 },
            { label: '开户时间', value: formatTime(profile?.created_at) },
          ]}
        />
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-tertiary)' }}>
          代理等级、折扣与佣金比例由平台运营配置，如需调整请联系平台。
        </div>
      </PagePanel>

      <PagePanel padded>
        <div className="lynx-section-title">安全设置</div>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: '修改密码', value: 'password' },
            { label: '登录记录', value: 'profile' },
          ]}
          style={{ marginBottom: 20 }}
        />

        {tab === 'password' ? (
          <Form form={form} layout="vertical" style={{ maxWidth: 380 }} requiredMark={false}>
            <Form.Item
              name="old_password"
              label="当前密码"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="new_password"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                // 与后端一致：partner/backend 的 PartnerChangePasswordAPI
                // 校验 new_password 长度为 12–72，前端挡在 8 会让 8~11 位的
                // 密码在这里通过、到后端才被拒，提示还很生硬。
                { min: 12, message: '密码至少 12 位' },
                { max: 72, message: '密码不能超过 72 位' },
              ]}
            >
              <Input.Password placeholder="12-72 位" autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label="确认新密码"
              rules={[{ required: true, message: '请再次输入新密码' }]}
            >
              <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
              保存修改
            </Button>
          </Form>
        ) : (
          <Alert
            type="info"
            showIcon
            message="登录记录功能待接入"
            description={
              <span style={{ fontSize: 12 }}>
                该模块需要伙伴后端提供 <code>GET /api/partner/login-history</code> 接口，目前尚未实现。
              </span>
            }
          />
        )}
      </PagePanel>
    </PageStack>
  );
}
