import { AdminStatHighlightCard } from '../AdminStatHighlightCard';
import React from 'react';
import { Form, Input, InputNumber, Radio, Card, theme, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { fromQuota, getCurrencySymbol, renderAmount, toQuota } from '../../utils';
import '../user/quota-adjust-drawer.css';

export const QUOTA_PRECISION = 4;
export const QUOTA_STEP = 0.01;

export type QuotaAdjustMode = 'set' | 'add' | 'sub';

export type QuotaAdjustFormValues = {
  kind: QuotaAdjustMode;
  amount?: number;
  remark?: string;
};

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

export function computeAfterDisplay(beforeDisplay: number, kind: QuotaAdjustMode, amount: number) {
  if (kind === 'add') return beforeDisplay + amount;
  if (kind === 'sub') return beforeDisplay - amount;
  return amount;
}

function computePreview(beforeDisplay: number, kind: QuotaAdjustMode, amount: unknown) {
  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 0 ? numericAmount : null;
  let afterDisplay = beforeDisplay;
  if (validAmount != null) {
    afterDisplay = computeAfterDisplay(beforeDisplay, kind, validAmount);
  }
  return {
    afterDisplay,
    deltaDisplay: afterDisplay - beforeDisplay,
    validAmount,
  };
}

function QuotaAdjustPreviewCard({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  const bg = `linear-gradient(180deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 100%)`;

  return (
    <Card
      className="lynx-interactive-card quota-adjust-drawer__summary-card"
      hoverable
      variant="outlined"
      styles={{
        body: {
          padding: `${token.paddingXL}px ${token.paddingXL}px ${token.paddingLG}px`,
          background: bg,
        },
      }}
      style={{
        width: '100%',
        borderRadius: token.borderRadiusLG * 1.25,
        overflow: 'hidden',
      }}
    >
      {children}
    </Card>
  );
}

function QuotaAdjustPreview({
  beforeUnits,
  beforeDisplay,
  kind,
  amount,
  qpu,
  t,
}: {
  beforeUnits: number;
  beforeDisplay: number;
  kind: QuotaAdjustMode;
  amount: unknown;
  qpu: number;
  t: (key: string) => string;
}) {
  const { token } = theme.useToken();
  const preview = computePreview(beforeDisplay, kind, amount);
  const deltaLabel = kind === 'add'
    ? t('users.quotaAdjust.deltaAdd')
    : kind === 'sub'
      ? t('users.quotaAdjust.deltaSub')
      : null;
  const afterText = preview.validAmount != null
    ? renderAmount(toQuota(preview.afterDisplay, qpu), QUOTA_PRECISION, qpu)
    : renderAmount(beforeUnits, QUOTA_PRECISION, qpu);

  return (
    <QuotaAdjustPreviewCard>
      <div className="quota-adjust-drawer__preview-rows">
        <div className="quota-adjust-drawer__preview-row">
          <span>{t('users.quotaAdjust.before')}</span>
          <span className="quota-adjust-drawer__preview-value">
            {renderAmount(beforeUnits, QUOTA_PRECISION, qpu)}
          </span>
        </div>
        {deltaLabel && preview.validAmount != null ? (
          <div className="quota-adjust-drawer__preview-row">
            <span>{deltaLabel}</span>
            <span
              className={[
                'quota-adjust-drawer__preview-value',
                kind === 'sub'
                  ? 'quota-adjust-drawer__preview-value--delta-sub'
                  : 'quota-adjust-drawer__preview-value--delta-add',
              ].join(' ')}
            >
              {kind === 'sub' ? '−' : '+'}
              {' '}
              {renderAmount(toQuota(Math.abs(preview.deltaDisplay), qpu), QUOTA_PRECISION, qpu)}
            </span>
          </div>
        ) : null}
      </div>
      <Typography.Text
        strong
        style={{
          display: 'block',
          fontSize: token.fontSizeLG,
          fontWeight: token.fontWeightStrong,
          color: token.colorTextSecondary,
          lineHeight: token.lineHeightLG,
          marginTop: token.marginMD,
          marginBottom: token.marginSM,
        }}
      >
        {t('users.quotaAdjust.after')}
      </Typography.Text>
      <div
        className="quota-adjust-drawer__preview-after-value"
        style={{
          fontSize: token.fontSizeHeading1,
          fontWeight: token.fontWeightStrong,
          color: token.colorPrimary,
          lineHeight: 1.15,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {afterText}
      </div>
    </QuotaAdjustPreviewCard>
  );
}

export function QuotaAdjustFormBody({
  beforeUnits,
  qpu,
  t,
}: {
  beforeUnits: number;
  qpu: number;
  t: (key: string) => string;
}) {
  const currencySymbol = getCurrencySymbol();
  const beforeDisplay = fromQuota(beforeUnits, qpu);

  return (
    <>
      <AdminStatHighlightCard
        variant="primary"
        title={t('users.quotaAdjust.currentQuota')}
        value={renderAmount(beforeUnits, QUOTA_PRECISION, qpu)}
      />

      <div className="quota-adjust-drawer__fields">
        <Form.Item
          name="kind"
          label={t('users.quotaAdjust.modeLabel')}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <Radio.Group
            block
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: t('users.quotaAdjust.modeSet'), value: 'set' },
              { label: t('users.quotaAdjust.modeAdd'), value: 'add' },
              { label: t('users.quotaAdjust.modeSub'), value: 'sub' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="amount"
          label={`${t('users.quotaAdjust.amountLabel')} (${currencySymbol})`}
          rules={[
            { required: true, message: t('users.quotaAdjust.amountRequired') },
            { type: 'number', min: 0, message: t('users.quotaAdjust.amountRequired') },
          ]}
        >
          <InputNumber
            style={numberInputStyle}
            min={0}
            precision={QUOTA_PRECISION}
            step={QUOTA_STEP}
            placeholder="0.0000"
          />
        </Form.Item>

        <Form.Item
          name="remark"
          label={t('users.quotaAdjust.remarkLabel')}
          rules={[{ required: true, whitespace: true, message: t('users.quotaAdjust.remarkRequired') }]}
        >
          <Input allowClear maxLength={255} />
        </Form.Item>
      </div>

      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.kind !== cur.kind || prev.amount !== cur.amount}>
        {({ getFieldValue }) => (
          <QuotaAdjustPreview
            beforeUnits={beforeUnits}
            beforeDisplay={beforeDisplay}
            kind={(getFieldValue('kind') as QuotaAdjustMode) ?? 'add'}
            amount={getFieldValue('amount')}
            qpu={qpu}
            t={t}
          />
        )}
      </Form.Item>

      <div className="quota-adjust-drawer__hint">
        <InfoCircleOutlined className="quota-adjust-drawer__hint-icon" aria-hidden />
        <span>{t('users.quotaAdjust.auditHint')}</span>
      </div>
    </>
  );
}
