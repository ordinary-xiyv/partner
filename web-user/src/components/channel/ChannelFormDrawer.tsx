import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Col, Collapse, Form, Input, InputNumber, Row, Select, Typography,
} from 'antd';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { addChannel, getAdminGroups, getChannel, updateChannel } from '../../api';
import { useChannelTypes } from '../../hooks/useChannelTypes';
import type { AdminGroup, Channel } from '../../types';
import {
  buildGroupSelectOptions,
  formatChannelGroups,
  parseChannelGroups,
  type GroupSelectOption,
} from './channelGroup';

const TYPE_BASE_URLS: Record<number, string> = {
  1: 'https://api.openai.com',
  14: 'https://api.anthropic.com',
  15: 'https://aip.baidubce.com',
  16: 'https://open.bigmodel.cn',
  17: 'https://dashscope.aliyuncs.com',
  20: 'https://openrouter.ai/api',
  24: 'https://generativelanguage.googleapis.com',
  25: 'https://api.moonshot.cn',
  27: 'https://api.perplexity.ai',
  34: 'https://api.cohere.ai',
  40: 'https://api.siliconflow.cn',
  42: 'https://api.mistral.ai',
  43: 'https://api.deepseek.com',
  45: 'https://ark.cn-beijing.volces.com',
  48: 'https://api.x.ai',
  4: 'http://localhost:11434',
};

const IMAGE_B64_PARAM_OVERRIDE = '{\n  "response_format": "b64_json"\n}';

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

function parseModels(models?: string): string[] {
  if (!models?.trim()) return [];
  return models.split(',').map((s) => s.trim()).filter(Boolean);
}

function validateParamOverrideJson(value: unknown): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

type ChannelFormValues = {
  name: string;
  type: number;
  key?: string;
  base_url?: string;
  models?: string[];
  group: string[];
  priority?: number;
  weight?: number;
  param_override?: string;
  material_upstream_type?: string;
};

function parseChannelSettings(raw?: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export interface ChannelFormDrawerProps {
  open: boolean;
  editingChannel: Channel | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 渠道新增 / 编辑抽屉（样式与 UserFormDrawer、GroupFormDrawer 一致） */
export function ChannelFormDrawer({
  open,
  editingChannel,
  onClose,
  onSuccess,
}: ChannelFormDrawerProps) {
  const { t } = useTranslation();
  const { options: channelTypeOptions, loading: channelTypesLoading } = useChannelTypes();
  const [form] = Form.useForm<ChannelFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupSelectOption[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [channelSettings, setChannelSettings] = useState<Record<string, unknown>>({});
  const [channelMaterialSettings, setChannelMaterialSettings] = useState<Record<string, unknown>>({});

  const channelType = Form.useWatch('type', form);
  const baseUrl = Form.useWatch('base_url', form);
  const keyValue = Form.useWatch('key', form);
  const paramOverrideValue = Form.useWatch('param_override', form);

  const fetchGroupOptions = useCallback(async (currentGroups?: string[]) => {
    setGroupsLoading(true);
    try {
      const res = await getAdminGroups();
      if (res.data.success) {
        setGroupOptions(buildGroupSelectOptions((res.data.data || []) as AdminGroup[], currentGroups));
      }
    } catch {
      /* ignore */
    }
    setGroupsLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setShowKey(false);
    if (editingChannel) {
      const groups = parseChannelGroups(editingChannel.group);
      const initialSettings = parseChannelSettings(editingChannel.settings);
      const initialMaterialSettings = parseChannelSettings(editingChannel.material_settings);
      setChannelSettings(initialSettings);
      setChannelMaterialSettings(initialMaterialSettings);
      form.setFieldsValue({
        name: editingChannel.name ?? '',
        type: editingChannel.type ?? 1,
        key: '',
        base_url: editingChannel.base_url || TYPE_BASE_URLS[editingChannel.type ?? 1] || '',
        models: parseModels(editingChannel.models),
        group: groups,
        priority: editingChannel.priority ?? 0,
        weight: editingChannel.weight ?? 0,
        param_override: editingChannel.param_override ?? '',
        material_upstream_type: String(initialMaterialSettings.upstream_type ?? ''),
      });
      setAdvancedOpen(!!editingChannel.param_override?.trim());
      void fetchGroupOptions(groups);

      const loadDetail = async () => {
        setDetailLoading(true);
        try {
          const res = await getChannel(editingChannel.id);
          if (res.data.success && res.data.data) {
            const ch = res.data.data as Channel;
            const paramOverride = ch.param_override ?? '';
            const settings = parseChannelSettings(ch.settings);
            const materialSettings = parseChannelSettings(ch.material_settings);
            setChannelSettings(settings);
            setChannelMaterialSettings(materialSettings);
            form.setFieldValue('param_override', paramOverride);
            form.setFieldValue('material_upstream_type', String(materialSettings.upstream_type ?? ''));
            setAdvancedOpen(!!paramOverride.trim());
          }
        } catch {
          /* keep list snapshot */
        }
        setDetailLoading(false);
      };
      void loadDetail();
    } else {
      form.resetFields();
      setChannelSettings({});
      setChannelMaterialSettings({});
      form.setFieldsValue({
        type: 1,
        base_url: TYPE_BASE_URLS[1] || '',
        models: [],
        group: ['default'],
        priority: 0,
        weight: 0,
        param_override: '',
        material_upstream_type: '',
      });
      setAdvancedOpen(false);
      void fetchGroupOptions(['default']);
    }
  }, [open, editingChannel, form, fetchGroupOptions]);

  const handleFinish = async (fv: ChannelFormValues) => {
    const name = fv.name.trim();
    if (!name) {
      notifyApiError(t('channelNameRequired'), { toastId: 'ch-error' });
      return;
    }
    const key = (fv.key ?? '').trim();
    if (!editingChannel && !key) {
      notifyApiError(t('apiKeyRequired'), { toastId: 'ch-error' });
      return;
    }

    setSubmitting(true);
    try {
      const models = (fv.models ?? []).map((m) => m.trim()).filter(Boolean).join(', ');
      const values: Record<string, unknown> = {
        name,
        type: fv.type,
        base_url: (fv.base_url ?? '').trim(),
        models,
        group: formatChannelGroups(fv.group ?? []),
        priority: fv.priority ?? 0,
        weight: fv.weight ?? 0,
        param_override: (fv.param_override ?? '').trim(),
      };
      const materialSettings = { ...channelMaterialSettings };
      const materialUpstreamType = (fv.material_upstream_type ?? '').trim();
      if (materialUpstreamType) {
        materialSettings.upstream_type = materialUpstreamType;
      } else {
        delete materialSettings.upstream_type;
      }
      values.settings = JSON.stringify(channelSettings);
      values.material_settings = JSON.stringify(materialSettings);
      if (key) values.key = key;

      const res = editingChannel
        ? await updateChannel({ ...values, id: editingChannel.id })
        : await addChannel({ channel: { ...values, key }, mode: 'single' });

      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        onClose();
        onSuccess();
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSubmitting(false);
  };

  const applyImagePreset = () => {
    form.setFieldValue('param_override', IMAGE_B64_PARAM_OVERRIDE);
    setAdvancedOpen(true);
    notifyApiSuccess(t('channelParamOverrideImagePresetApplied'));
  };

  const title = editingChannel
    ? `${t('editChannel')} #${editingChannel.id}`
    : t('newChannel');

  const defaultBaseUrl = TYPE_BASE_URLS[channelType ?? 1];

  return (
    <FormDrawer
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      loading={submitting || detailLoading}
      destroyOnClose
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        colon={false}
        labelAlign="left"
        validateTrigger={[]}
        onFinish={(v) => void handleFinish(v)}
      >
        <Form.Item
          name="name"
          label={t('channelName')}
          rules={[{ required: true, whitespace: true, message: t('fieldRequired') }]}
        >
          <Input allowClear placeholder={t('channelNamePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="type"
          label={t('channelType')}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <Select
            showSearch
            loading={channelTypesLoading}
            optionFilterProp="label"
            options={channelTypeOptions}
            onChange={(val: number) => {
              if (!editingChannel) {
                form.setFieldValue('base_url', TYPE_BASE_URLS[val] || '');
              }
            }}
          />
        </Form.Item>

        <Form.Item
          name="material_upstream_type"
          label="素材接口上游"
          extra="统一素材接口和引用平台素材的视频模型渠道需要配置；不使用统一素材的旧渠道可留空。"
        >
          <Select
            allowClear
            placeholder="选择素材上游"
            options={[
              { value: 'volcengine', label: '火山官方' },
              { value: 'bonkeai', label: 'BonkeAI' },
              { value: 'vvdanceai', label: 'VVDance' },
              { value: 'moma', label: '移动云 MoMA' },
              { value: '100eai', label: '100eai' },
              { value: 'artsmcp', label: 'artsmcp（虚拟素材库）' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="key"
          label={(
            <span>
              {t('apiKey')}
              {!editingChannel && <Typography.Text type="danger"> *</Typography.Text>}
              {editingChannel && (
                <Typography.Text type="secondary" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {t('keyKeepIfEmpty')}
                </Typography.Text>
              )}
            </span>
          )}
          rules={editingChannel ? [] : [{ required: true, whitespace: true, message: t('fieldRequired') }]}
        >
          <Input.TextArea
            rows={3}
            allowClear
            placeholder={editingChannel ? t('keyPlaceholderEdit') : t('keyPlaceholderNew')}
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              ...(showKey || !keyValue ? {} : { filter: 'blur(4px)' }),
            }}
          />
        </Form.Item>
        {!!keyValue && (
          <div style={{ marginTop: -16, marginBottom: 16, textAlign: 'right' }}>
            <Button
              type="text"
              size="small"
              icon={showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setShowKey((v) => !v)}
            />
          </div>
        )}

        <Form.Item
          name="base_url"
          label={t('baseUrlLabel')}
          extra={
            defaultBaseUrl && (baseUrl ?? '') !== defaultBaseUrl ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('channelOfficialDefault')}
                {defaultBaseUrl}
                {' '}
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => form.setFieldValue('base_url', defaultBaseUrl)}
                >
                  {t('restoreDefault')}
                </Button>
              </Typography.Text>
            ) : undefined
          }
        >
          <Input allowClear placeholder={defaultBaseUrl || t('channelBaseUrlPlaceholderExample')} />
        </Form.Item>

        <Form.Item
          name="models"
          label={t('supportedModels')}
          extra={t('modelInputDesc')}
        >
          <Select
            mode="tags"
            tokenSeparators={[',']}
            placeholder={t('modelInputHint')}
            options={[]}
            open={false}
          />
        </Form.Item>

        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('dispatchConfig')}
        </Typography.Text>

        <Form.Item
          name="group"
          label={t('group')}
          rules={[
            {
              required: true,
              type: 'array',
              min: 1,
              message: t('fieldRequired'),
            },
          ]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder={t('selectGroup')}
            loading={groupsLoading}
            options={groupOptions}
          />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="priority"
              label={t('priority')}
              extra={t('priority_hint')}
            >
              <InputNumber style={numberInputStyle} min={0} precision={0} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="weight"
              label={t('weight')}
              extra={t('weight_hint')}
            >
              <InputNumber style={numberInputStyle} min={0} precision={0} />
            </Form.Item>
          </Col>
        </Row>

        <Collapse
          ghost
          activeKey={advancedOpen ? ['advanced'] : []}
          onChange={(keys) => setAdvancedOpen(keys.includes('advanced'))}
          style={{ marginTop: 8 }}
          items={[{
            key: 'advanced',
            label: (
              <Typography.Text strong>
                {t('channelAdvancedConfig')}
                {!!paramOverrideValue?.trim() && (
                  <Typography.Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                    ({t('channelParamOverride')})
                  </Typography.Text>
                )}
              </Typography.Text>
            ),
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={t('channelParamOverrideImageHint')}
                  description={(
                    <div>
                      <Typography.Paragraph style={{ marginBottom: 8, fontSize: 12 }}>
                        {t('channelParamOverrideOssHint')}
                      </Typography.Paragraph>
                      <Button size="small" onClick={applyImagePreset}>
                        {t('channelParamOverrideImagePreset')}
                      </Button>
                    </div>
                  )}
                />
                <Form.Item
                  name="param_override"
                  label={t('channelParamOverride')}
                  extra={t('channelParamOverrideHint')}
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (validateParamOverrideJson(value)) return;
                        throw new Error(t('channelParamOverrideInvalid'));
                      },
                    },
                  ]}
                >
                  <Input.TextArea
                    rows={5}
                    allowClear
                    placeholder={IMAGE_B64_PARAM_OVERRIDE}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </Form.Item>
              </>
            ),
          }]}
        />
      </Form>
    </FormDrawer>
  );
}
