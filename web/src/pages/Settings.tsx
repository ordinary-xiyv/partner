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
  notifyApiError,
  notifyApiSuccess,
} from '@lynx/shared';
import { useDealerAuth } from '../auth';

const { Text } = Typography;

type Tab = 'profile' | 'password';

export default function Settings() {
  const { profile, refresh } = useDealerAuth();
  /*
   * 初始密码未改时默认落在密码页 —— 用户是被 RequireAuth 强制送到这里的，
   * 停在「商户信息」Tab 上会让人以为没什么要做的。
   */
  const mustChangePassword = Boolean(profile?.password_change_required);
  const [tab, setTab] = useState<Tab>(mustChangePassword ? 'password' : 'profile');
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
      /*
       * 改密成功后后端会把 partner_password_change_required 置 false，
       * 但本地 profile 还是旧值，RequireAuth 会继续把人锁在 /settings。
       * refresh() 重新拉一次 /me 才能解开。
       */
      await refresh();
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

      {mustChangePassword && (
        <Alert
          type="warning"
          showIcon
          message="请先修改初始密码"
          description="你正在使用平台分配的初始密码。修改后才能查看客户、用量与账单数据。"
        />
      )}

      <PagePanel padded>
        <div className="lynx-section-title">商户信息</div>
        {/*
         * 只列后端 /me 真的返回的 4 个字段。
         *
         * 上一版这里有「代理等级 / 客户折扣 / 佣金比例 / 客户数量 / 开户时间」五项，
         * 后端一个都不返回，前端靠硬编码填了「钻石代理」「8.2 折」「12%」，
         * 而下方还写着「由平台运营配置」—— 等于把编造的数字说成平台配置。
         * 这些字段要恢复，前提是后端先返回它们。
         */}
        <DescGrid
          items={[
            { label: '商户 ID', value: profile?.id ?? '-' },
            { label: '商户编码', value: profile?.merchant_code ?? '-' },
            { label: '商户名称', value: profile?.display_name ?? '-' },
            {
              label: '初始密码',
              value: profile?.password_change_required ? (
                <Tag color="warning">待修改</Tag>
              ) : (
                <Tag color="success">已修改</Tag>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-tertiary)' }}>
          代理等级、折扣与佣金比例需要平台运营在后台配置并提供查询接口，伙伴端暂不展示。
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
