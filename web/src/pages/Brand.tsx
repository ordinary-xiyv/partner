import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  ColorPicker,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  ExportOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  AppPageHeader,
  BrandLogo,
  BrandPreview,
  PagePanel,
  PageStack,
  UseMockNotice,
  dealerApi,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
  readableOnPrimary,
} from '@lynx/shared';
import type { TenantBrand, TenantBrandUpdatePayload, TenantDomain } from '@lynx/shared';

const { Text } = Typography;

/** 常用品牌色：经销商大多不想调色盘，给几个稳妥的起点 */
const PRESET_COLORS = [
  { hex: '#6d51fe', name: '平台紫' },
  { hex: '#2563eb', name: '科技蓝' },
  { hex: '#0d9488', name: '青绿' },
  { hex: '#16a34a', name: '翠绿' },
  { hex: '#d97706', name: '琥珀' },
  { hex: '#dc2626', name: '珊瑚红' },
  { hex: '#db2777', name: '品红' },
  { hex: '#475569', name: '石墨灰' },
];

type FormValues = {
  name: string;
  short_name?: string;
  page_title: string;
  tagline?: string;
  api_base_url?: string;
  support_email?: string;
  support_phone?: string;
  support_wechat?: string;
  support_note?: string;
};

function toFormValues(brand: TenantBrand): FormValues {
  return {
    name: brand.name,
    short_name: brand.short_name,
    page_title: brand.page_title,
    tagline: brand.tagline,
    api_base_url: brand.api_base_url,
    support_email: brand.support?.email,
    support_phone: brand.support?.phone,
    support_wechat: brand.support?.wechat,
    support_note: brand.support?.note,
  };
}

export default function Brand() {
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string>('');
  const [remountKey, setRemountKey] = useState(0);

  /** 表单控 + 即时预览：不点保存也能看到结果 */
  const [draft, setDraft] = useState<TenantBrandUpdatePayload>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, d] = await Promise.all([dealerApi.fetchDealerBrand(), dealerApi.fetchDealerDomains()]);
      setBrand(b);
      setDomains(d);
      setDraft({});
    } catch (err) {
      notifyApiError(err, '品牌配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 预览用的合成品牌：原始值 + 草稿覆盖。
   * 单独维护一个对象，避免把「还没保存的值」直接写进 brand 状态——
   * 那样一旦保存失败，页面上看起来已经是新值了，会误导经销商以为改成功了。
   */
  const previewBrand: TenantBrand | null = useMemo(() => {
    if (!brand) return null;
    return {
      ...brand,
      ...draft,
      support: {
        ...brand.support,
        ...(draft.support ?? {}),
      },
    };
  }, [brand, draft]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const payload: TenantBrandUpdatePayload = {
        name: values.name.trim(),
        short_name: values.short_name?.trim() || values.name.trim().slice(0, 1),
        page_title: values.page_title.trim(),
        tagline: values.tagline?.trim() || undefined,
        api_base_url: values.api_base_url?.trim() || undefined,
        primary_color: draft.primary_color || brand?.primary_color,
        logo_url: draft.logo_url ?? brand?.logo_url,
        favicon_url: draft.favicon_url ?? brand?.favicon_url,
        support: {
          email: values.support_email?.trim() || undefined,
          phone: values.support_phone?.trim() || undefined,
          wechat: values.support_wechat?.trim() || undefined,
          note: values.support_note?.trim() || undefined,
        },
      };
      const next = await dealerApi.updateDealerBrand(payload);
      setBrand(next);
      setDraft({});
      setRemountKey((k) => k + 1);
      notifyApiSuccess('品牌配置已保存，客户域名下即刻生效');
    } catch (err) {
      notifyApiError(err, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRecheck = async (host: string) => {
    setChecking(host);
    try {
      const next = await dealerApi.recheckDealerDomain(host);
      setDomains((list) => list.map((d) => (d.host === host ? next : d)));
      if (next.status === 'active') notifyApiSuccess(`${host} 已生效`);
      else notifyApiError(null, `${host} 仍未生效，请检查 DNS 解析`);
    } catch (err) {
      notifyApiError(err, '检测失败');
    } finally {
      setChecking('');
    }
  };

  /**
   * logo 上传：这里只做本地预览（读成 data URL）。
   * 真实联调时把 beforeUpload 换成上传到对象存储，再把返回的 URL 写进 logo_url。
   */
  const logoUploadProps: UploadProps = {
    accept: 'image/png,image/jpeg,image/svg+xml,image/webp',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > 512 * 1024) {
        notifyApiError(null, 'logo 建议小于 512KB，否则首屏加载会变慢');
        return Upload.LIST_IGNORE;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setDraft((d) => ({ ...d, logo_url: String(reader.result) }));
        notifyApiSuccess('logo 已载入预览，点保存后生效');
      };
      reader.readAsDataURL(file);
      return false;
    },
  };

  if (loading && !brand) {
    return (
      <PageStack gap={20}>
        <AppPageHeader title="品牌设置" subtitle="配置你的客户在专属域名下看到的形象" />
        <PagePanel padded>
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <LoadingOutlined style={{ fontSize: 20, marginBottom: 10, display: 'block' }} />
            正在加载品牌配置…
          </div>
        </PagePanel>
      </PageStack>
    );
  }

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="品牌设置"
        subtitle="配置你的客户在专属域名下看到的形象"
        actions={
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            重新加载
          </Button>
        }
      />

      <UseMockNotice />

      {/* 关键概念澄清：域名只决定皮肤，不决定权限 */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="域名决定「看到谁的品牌」，登录账号决定「能看到谁的数据」"
        description={
          <span style={{ fontSize: 12, lineHeight: 1.7 }}>
            你的客户访问你绑定的域名时，会看到这里配置的 logo、品牌名与主色。
            但这只是外观——客户能查到的始终只有自己账号下的数据，改域名或换浏览器都不会多看到别人一条记录。
            域名绑定由平台配置，这里只读展示。
          </span>
        }
      />

      <Row gutter={[16, 16]}>
        {/* ---------- 左：表单 ---------- */}
        <Col xs={24} xl={14}>
          <PagePanel padded>
            <div className="lynx-section-title">基础信息</div>
            <Form
              key={remountKey}
              layout="vertical"
              requiredMark={false}
              initialValues={brand ? toFormValues(brand) : undefined}
              onFinish={handleSave}
              onValuesChange={(changed: Partial<FormValues>) => {
                // 只把「影响预览」的字段同步进草稿
                const next: TenantBrandUpdatePayload = {};
                if (changed.name !== undefined) {
                  next.name = changed.name;
                  next.short_name = (changed.short_name || changed.name).trim().slice(0, 1);
                }
                if (changed.short_name !== undefined) next.short_name = changed.short_name;
                if (changed.page_title !== undefined) next.page_title = changed.page_title;
                if (changed.tagline !== undefined) next.tagline = changed.tagline;
                if (changed.api_base_url !== undefined) next.api_base_url = changed.api_base_url;
                const supportKeys: Array<keyof FormValues> = [
                  'support_email',
                  'support_phone',
                  'support_wechat',
                  'support_note',
                ];
                const supportChanged = supportKeys.filter((k) => changed[k] !== undefined);
                if (supportChanged.length) {
                  next.support = {
                    ...(draft.support ?? {}),
                    ...(changed.support_email !== undefined ? { email: changed.support_email } : {}),
                    ...(changed.support_phone !== undefined ? { phone: changed.support_phone } : {}),
                    ...(changed.support_wechat !== undefined ? { wechat: changed.support_wechat } : {}),
                    ...(changed.support_note !== undefined ? { note: changed.support_note } : {}),
                  };
                }
                setDraft((d) => ({ ...d, ...next }));
              }}
            >
              <Row gutter={12}>
                <Col xs={24} sm={14}>
                  <Form.Item
                    name="name"
                    label="品牌名"
                    rules={[
                      { required: true, message: '请输入品牌名' },
                      { max: 24, message: '建议不超过 24 个字，侧栏空间有限' },
                    ]}
                    extra="显示在你的客户控制台侧栏、登录页与浏览器标题"
                  >
                    <Input placeholder="如：云启智能" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item
                    name="short_name"
                    label="首字标记"
                    extra="没上传 logo 时用它，留空取品牌名首字"
                  >
                    <Input placeholder="如：云" maxLength={1} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="tagline"
                label="一句话介绍"
                extra="登录页副标题与首页品牌区展示，留空则不显示"
              >
                <Input placeholder="如：企业级大模型接入服务" maxLength={40} />
              </Form.Item>

              <Form.Item
                name="page_title"
                label="浏览器标题"
                rules={[{ required: true, message: '请输入浏览器标题' }]}
                extra="显示在浏览器标签页，建议带上品牌名"
              >
                <Input placeholder="如：云启智能 · API 控制台" maxLength={60} />
              </Form.Item>

              <Form.Item
                name="api_base_url"
                label="接口基地址"
                extra="接入文档与首页会展示这个地址；留空则用平台默认地址"
              >
                <Input placeholder="https://api.your-domain.com/v1" />
              </Form.Item>

              <Divider style={{ margin: '4px 0 16px' }} />

              <div className="lynx-section-title">品牌色</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <ColorPicker
                  value={previewBrand?.primary_color ?? '#6d51fe'}
                  onChangeComplete={(c) => setDraft((d) => ({ ...d, primary_color: c.toHexString() }))}
                  showText
                  size="middle"
                />
                <Space size={6} wrap>
                  {PRESET_COLORS.map((p) => (
                    <Tooltip title={p.name} key={p.hex}>
                      <button
                        type="button"
                        aria-label={p.name}
                        onClick={() => setDraft((d) => ({ ...d, primary_color: p.hex }))}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border:
                            previewBrand?.primary_color?.toLowerCase() === p.hex
                              ? '2px solid var(--text-primary)'
                              : '1px solid var(--border-default)',
                          background: p.hex,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    </Tooltip>
                  ))}
                </Space>
              </div>

              <div className="lynx-section-title">Logo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
                <BrandLogo
                  name={previewBrand?.name || '品牌'}
                  shortName={previewBrand?.short_name}
                  logoUrl={previewBrand?.logo_url}
                  size={44}
                  radius={12}
                />
                <Space size={8} wrap>
                  <Upload {...logoUploadProps}>
                    <Button icon={<UploadOutlined />}>上传 logo</Button>
                  </Upload>
                  {previewBrand?.logo_url ? (
                    <Button onClick={() => setDraft((d) => ({ ...d, logo_url: '' }))} danger type="text">
                      移除
                    </Button>
                  ) : null}
                </Space>
                <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  建议正方形、透明底，小于 512KB。不上传则用「品牌色方块 + 首字」。
                </Text>
              </div>

              <Divider style={{ margin: '16px 0' }} />

              <div className="lynx-section-title">客服联系方式</div>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="support_email" label="邮箱">
                    <Input placeholder="support@your-domain.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="support_phone" label="电话">
                    <Input placeholder="400-000-0000" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="support_wechat" label="微信 / 企业微信">
                    <Input placeholder="your-wechat-id" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="support_note" label="服务时间说明">
                    <Input placeholder="工作日 9:00 - 21:00" maxLength={30} />
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                  保存配置
                </Button>
                <Button
                  onClick={() => {
                    setDraft({});
                    setRemountKey((k) => k + 1);
                  }}
                  disabled={saving}
                >
                  撤销改动
                </Button>
              </Space>
            </Form>
          </PagePanel>
        </Col>

        {/* ---------- 右：预览 + 域名 ---------- */}
        <Col xs={24} xl={10}>
          <PageStack gap={16}>
            <PagePanel padded>
              <div className="lynx-section-title">
                <span>实时预览</span>
                {Object.keys(draft).length > 0 ? (
                  <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>
                    未保存
                  </Tag>
                ) : (
                  <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    与线上一致
                  </Text>
                )}
              </div>
              {previewBrand ? <BrandPreview brand={previewBrand} /> : null}
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                按钮文字色会根据主色自动选择黑或白（
                <Text style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                  {previewBrand ? readableOnPrimary(previewBrand.primary_color) : '-'}
                </Text>
                ），避免浅色主色上出现白字看不清。
              </div>
            </PagePanel>

            <PagePanel padded>
              <div className="lynx-section-title">
                <span>我的域名</span>
                <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  只读
                </Text>
              </div>

              {domains.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
                  还没有绑定域名。请联系平台为你的账户绑定专属域名。
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {domains.map((d) => (
                    <div
                      key={d.host}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <DomainStatusIcon status={d.status} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            fontFamily: 'ui-monospace, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {d.host}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {d.kind === 'primary' ? '主域名' : '备用域名'}
                          {d.verified_at ? ` · 检测于 ${formatTime(d.verified_at, 'MM-DD HH:mm')}` : ''}
                        </div>
                      </div>
                      <Tag
                        color={d.status === 'active' ? 'green' : d.status === 'pending' ? 'orange' : 'red'}
                        style={{ margin: 0, fontSize: 11 }}
                      >
                        {d.status === 'active' ? '已生效' : d.status === 'pending' ? '待解析' : '异常'}
                      </Tag>
                      {d.status === 'active' ? (
                        <Tooltip title="在新标签页打开">
                          <Button
                            type="text"
                            size="small"
                            icon={<ExportOutlined />}
                            href={`https://${d.host}`}
                            target="_blank"
                            rel="noreferrer"
                          />
                        </Tooltip>
                      ) : (
                        <Button
                          type="text"
                          size="small"
                          loading={checking === d.host}
                          onClick={() => handleRecheck(d.host)}
                        >
                          重新检测
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  lineHeight: 1.7,
                }}
              >
                域名由平台统一绑定与备案校验，经销商端不提供新增 / 删除入口。
                需要更换域名请联系平台运营。
              </div>
            </PagePanel>
          </PageStack>
        </Col>
      </Row>
    </PageStack>
  );
}

function DomainStatusIcon({ status }: { status: TenantDomain['status'] }) {
  if (status === 'active') {
    return <CheckCircleFilled style={{ color: '#16a34a', fontSize: 14, flexShrink: 0 }} />;
  }
  if (status === 'pending') {
    return <LoadingOutlined style={{ color: '#d97706', fontSize: 14, flexShrink: 0 }} />;
  }
  return <ExclamationCircleFilled style={{ color: '#dc2626', fontSize: 14, flexShrink: 0 }} />;
}
