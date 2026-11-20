import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import type { TagProps } from 'antd';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Table, Typography, Tag, Spin, Modal, Button} from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { createSubscriptionOrder, getPlans, getMySubscriptions, queryPaymentStatus } from '../api';
import { CloseOutlined } from '@ant-design/icons';
import { formatTime, renderAmount, formatMinorMoney } from '../utils';
import { useCurrency, formatQuota } from '../hooks/useCurrency';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { useUser } from '../contexts/UserContext';
import type { Plan, Subscription } from '../types';
import { AlipayIcon, WechatPayIcon } from '../components/PaymentIcons';
import { PlanOfferCard } from '../components/PlanOfferCard';
import { AppEmpty, AppPageHeader } from '../ui/appLayout';
import { borderedRowBtnProps } from '../ui/tableRowActionButtons';

const { Text } = Typography;
type AppTagColor = NonNullable<TagProps['color']>;

type NativePayMethod = 'wechat_native' | 'alipay_native';
type PollingStatus = 'polling' | 'success' | 'timeout';

interface SubscriptionOrderPayload {
  trade_no: string;
  order?: {
    plan_name?: string;
    pay_amount?: number;
    quota?: number;
    duration?: number;
  };
  code_url?: string;
  pay_url?: string;
}

const statusColor: Record<string, AppTagColor> = {
  active: 'green',
  expired: 'default',
  cancelled: 'red',
  pending: 'orange',
  success: 'green',
  failed: 'red',
  closed: 'default',
};

const paymentMethodLabelKey: Record<NativePayMethod, string> = {
  wechat_native: 'topUp.methodWechatNative',
  alipay_native: 'topUp.methodAlipayNative',
};

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 16,
  overflow: 'hidden',
};

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const { refresh: refreshUser } = useUser();
  const qpu = useQuotaPerUnit();
  const cc = useCurrency();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [payMethod, setPayMethod] = useState<NativePayMethod>('wechat_native');
  const [paying, setPaying] = useState(false);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [alipayWaiting, setAlipayWaiting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [pollingTradeNo, setPollingTradeNo] = useState('');
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>('polling');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  const availablePlans = useMemo(() => plans.filter((plan) => plan.status === 1), [plans]);

  const minPlanPrice = useMemo(() => {
    if (availablePlans.length === 0) return null;
    return Math.min(...availablePlans.map((plan) => plan.price));
  }, [availablePlans]);

  const plansDisplayOrder = useMemo(
    () => [...availablePlans].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id),
    [availablePlans],
  );

  const fetchData = useCallback(async (keepLoading = true) => {
    if (keepLoading) setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([getPlans(), getMySubscriptions()]);
      if (pRes.data.success) setPlans(pRes.data.data || []);
      if (sRes.data.success) setSubs(sRes.data.data || []);
    } catch {
      /* ignore */
    } finally {
      if (keepLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  const refreshAfterPayment = useCallback(async () => {
    await Promise.allSettled([fetchData(false), refreshUser()]);
  }, [fetchData, refreshUser]);

  const closePurchaseFlow = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPurchaseVisible(false);
    setQrModalVisible(false);
    setAlipayWaiting(false);
    setQrCodeUrl('');
    setPollingTradeNo('');
    setPollingStatus('polling');
    pollingCountRef.current = 0;
    setPaying(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPollingTradeNo('');
    setPollingStatus('polling');
    pollingCountRef.current = 0;
  }, []);

  const startPolling = useCallback((tradeNo: string) => {
    stopPolling();
    setPollingTradeNo(tradeNo);
    setPollingStatus('polling');
    pollingCountRef.current = 0;

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1;
      if (pollingCountRef.current > 100) {
        stopPolling();
        setPollingStatus('timeout');
        return;
      }

      try {
        const res = await queryPaymentStatus(tradeNo);
        if (res.data.success && res.data.data?.status === 'success') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPollingStatus('success');
          notifyApiSuccess(t('operationSuccess') || '支付成功');
          await refreshAfterPayment();
          setTimeout(() => {
            closePurchaseFlow();
            setSelectedPlan(null);
          }, 1200);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
  }, [closePurchaseFlow, refreshAfterPayment, stopPolling, t]);

  const openPurchaseModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setPayMethod('wechat_native');
    setPurchaseVisible(true);
    setPaying(false);
  };

  const closePurchaseModal = () => {
    if (paying) return;
    setPurchaseVisible(false);
    setSelectedPlan(null);
    setPayMethod('wechat_native');
  };

  const payMethodLabel = (method?: string) => {
    if (!method) return '—';
    return t(paymentMethodLabelKey[method as NativePayMethod] || method, method);
  };

  const handleCreateOrder = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const res = await createSubscriptionOrder({
        plan_id: selectedPlan.id,
        payment_method: payMethod,
      });
      if (!res.data.success) {
        notifyApiError(res.data.message || t('operationFailed'));
        setPaying(false);
        return;
      }

      const data = (res.data.data || {}) as SubscriptionOrderPayload;
      const tradeNo = data.trade_no;
      if (!tradeNo) {
        notifyApiError(t('operationFailed'));
        setPaying(false);
        return;
      }

      if (payMethod === 'alipay_native') {
        if (data.pay_url) window.open(data.pay_url, '_blank');
        setAlipayWaiting(true);
      } else {
        setQrCodeUrl(data.code_url || '');
        setQrModalVisible(true);
      }
      setPurchaseVisible(false);
      startPolling(tradeNo);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notifyApiError(msg || t('operationFailed'));
    } finally {
      setPaying(false);
    }
  };

  const paymentButtonStyle = (method: NativePayMethod): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 14,
    cursor: 'pointer',
    border: `1px solid ${payMethod === method ? 'var(--accent-primary)' : 'var(--border-default)'}`,
    background: payMethod === method ? 'rgb(from var(--theme-color-primary) r g b / 0.08)' : 'var(--bg-card)',
    color: 'var(--text-primary)',
    transition: 'all 0.15s ease',
  });

  const subColumns = [
    { title: t('planName'), dataIndex: 'plan_name', key: 'plan_name', width: 160 },
    {
      title: t('planQuota'), dataIndex: 'quota', key: 'quota', width: 120,
      render: (v: number) => renderAmount(v, 4, qpu),
    },
    { title: t('startAt'), dataIndex: 'start_at', key: 'start_at', width: 160, render: (v: number) => formatTime(v) },
    { title: t('expireAt'), dataIndex: 'expire_at', key: 'expire_at', width: 160, render: (v: number) => formatTime(v) },
    {
      title: t('status'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag>,
    },
    { title: t('orderNo'), dataIndex: 'order_no', key: 'order_no', width: 180 },
    {
      title: t('payAmount'), dataIndex: 'pay_amount', key: 'pay_amount', width: 120,
      render: (v: number) => formatMinorMoney(v, cc.rate, cc.symbol),
    },
    {
      title: t('payMethod'), dataIndex: 'pay_method', key: 'pay_method', width: 140,
      render: (method: string) => payMethodLabel(method),
    },
    { title: t('createdAt'), dataIndex: 'created_at', key: 'created_at', width: 160, render: (v: number) => formatTime(v) },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <AppPageHeader
        title={t('availablePlans')}
        subtitle={t('subscribePageSubtitle')}
        actions={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: t('planCount'), value: String(availablePlans.length) },
              { label: t('startingFrom'), value: minPlanPrice != null ? formatMinorMoney(minPlanPrice, cc.rate, cc.symbol) : '—' },
              { label: t('mySubscriptions'), value: String(subs.length) },
            ].map((item) => (
              <div key={item.label} style={{ ...panelStyle, minWidth: 120, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        }
      />

      <div style={{ ...panelStyle, padding: 20, marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{t('availablePlans')}</div>
            <Text style={{ color: 'var(--text-tertiary)' }}>
              {t('subscribePlanHint')}
            </Text>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('subscribePaymentMethodsHint')}
          </div>
        </div>

        <div className="plan-offer-grid">
          {plansDisplayOrder.map((plan) => {
            const isRecommended = plan.recommended === true;
            return (
              <PlanOfferCard
                key={plan.id}
                variant="card"
                title={plan.name}
                description={plan.description || t('subscribePlanFallbackDesc')}
                priceText={formatMinorMoney(plan.price, cc.rate, cc.symbol)}
                pricePeriodHint={`/ ${plan.duration} ${t('days')}`}
                quotaLabel={t('planQuota')}
                quotaText={formatQuota(plan.quota, cc, qpu)}
                durationLabel={t('planDuration')}
                durationText={`${plan.duration} ${t('days')}`}
                effectiveTimeLabel={t('subscribeDelivery')}
                effectiveTimeText={t('subscribeInstantActivation')}
                recommendedTag={isRecommended ? <Tag color="blue">{t('recommended')}</Tag> : undefined}
                buyLabel={t('subscribeBuyNow')}
                onBuy={() => openPurchaseModal(plan)}
                footerHint={t('subscribeSupportNativePay')}
              />
            );
          })}
        </div>

        {availablePlans.length === 0 && (
          <AppEmpty icon="🧾" message={t('subscribeEmptyPlans')} />
        )}
      </div>

      <div style={panelStyle}>
        <div style={{ padding: '18px 20px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{t('mySubscriptions')}</div>
          <Text style={{ color: 'var(--text-tertiary)' }}>
            {t('subscribeRecordsHint')}
          </Text>
        </div>
        {subs.length === 0 ? (
          <AppEmpty icon="📦" message={t('subscribeEmptyRecords')} />
        ) : (
          <Table columns={subColumns} dataSource={subs} rowKey="id" scroll={{ x: 'max(100%, 1300px)' }} pagination={false} />
        )}
      </div>

      <Modal
        title={t('subscribeConfirmTitle')}
        open={purchaseVisible}
        onCancel={closePurchaseModal}
        onOk={handleCreateOrder}
        okText={paying ? t('loading') : t('subscribeConfirmPay')}
        cancelText={t('cancel')}
        confirmLoading={paying}
        centered
        width={560}
      >
        {selectedPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <PlanOfferCard
              variant="modal"
              title={selectedPlan.name}
              description={selectedPlan.description || t('subscribePlanFallbackDesc')}
              priceText={formatMinorMoney(selectedPlan.price, cc.rate, cc.symbol)}
              quotaLabel={t('planQuota')}
              quotaText={formatQuota(selectedPlan.quota, cc, qpu)}
              durationLabel={t('planDuration')}
              durationText={`${selectedPlan.duration} ${t('days')}`}
              effectiveTimeLabel={t('subscribeDelivery')}
              effectiveTimeText={t('subscribeInstantActivation')}
            />

            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                {t('payMethod')}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <button type="button" style={paymentButtonStyle('wechat_native')} onClick={() => setPayMethod('wechat_native')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <WechatPayIcon size={18} />
                    <span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{t('topUp.methodWechatNative')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('subscribeWechatDesc')}</div>
                    </span>
                  </span>
                  <span style={{ color: payMethod === 'wechat_native' ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>
                    {payMethod === 'wechat_native' ? '✓' : ''}
                  </span>
                </button>
                <button type="button" style={paymentButtonStyle('alipay_native')} onClick={() => setPayMethod('alipay_native')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlipayIcon size={18} />
                    <span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{t('topUp.methodAlipayNative')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('subscribeAlipayDesc')}</div>
                    </span>
                  </span>
                  <span style={{ color: payMethod === 'alipay_native' ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>
                    {payMethod === 'alipay_native' ? '✓' : ''}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={null}
        open={qrModalVisible}
        footer={null}
        onCancel={() => { setQrModalVisible(false); stopPolling(); }}
        width={420}
        closable
        centered
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ textAlign: 'center', padding: '32px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            <WechatPayIcon size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {t('topUp.wechatPay')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            {selectedPlan?.name || t('subscribeConfirmTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            {t('subscribeScanPayHint')}
          </div>

          {qrCodeUrl ? (
            <div style={{ display: 'inline-block', padding: 16, background: '#ffffff', borderRadius: 16, marginBottom: 20, boxShadow: '0 8px 28px var(--border-default)' }}>
              <QRCodeSVG value={qrCodeUrl} size={220} level="M" />
            </div>
          ) : (
            <Spin />
          )}

          {selectedPlan && (
            <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              {formatQuota(selectedPlan.quota, cc, qpu)} · {selectedPlan.duration} {t('days')}
            </div>
          )}
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            {selectedPlan ? formatMinorMoney(selectedPlan.price, cc.rate, cc.symbol) : ''}
          </div>
          {pollingTradeNo && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Trade No: {pollingTradeNo}
            </div>
          )}

          {pollingStatus === 'polling' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13 }}>
              <Spin size="small" />
              {t('topUp.waitingForPayment')}
            </div>
          )}
          {pollingStatus === 'success' && (
            <div style={{ color: '#34d399', fontSize: 14, fontWeight: 700 }}>
              ✅ {t('topUp.paymentSuccess')}
            </div>
          )}
          {pollingStatus === 'timeout' && (
            <div style={{ color: '#f87171', fontSize: 13 }}>
              {t('topUp.paymentTimeout')}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={null}
        open={alipayWaiting && !qrModalVisible}
        footer={null}
        onCancel={() => { setAlipayWaiting(false); stopPolling(); }}
        width={420}
        closable
        centered
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ textAlign: 'center', padding: '32px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            <AlipayIcon size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {t('topUp.alipay')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            {selectedPlan?.name || t('subscribeConfirmTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            {t('subscribeAlipayWaitingHint')}
          </div>

          {selectedPlan && (
            <>
              <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
                {formatQuota(selectedPlan.quota, cc, qpu)} · {selectedPlan.duration} {t('days')}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
                {formatMinorMoney(selectedPlan.price, cc.rate, cc.symbol)}
              </div>
            </>
          )}

          {pollingTradeNo && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Trade No: {pollingTradeNo}
            </div>
          )}

          {pollingStatus === 'polling' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>
              <Spin size="small" />
              {t('topUp.waitingForResult')}
            </div>
          )}
          {pollingStatus === 'success' && (
            <div style={{ color: '#34d399', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
              ✅ {t('topUp.paymentSuccessConfirm')}
            </div>
          )}
          {pollingStatus === 'timeout' && (
            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>
              {t('topUp.waitingTimeout')}
            </div>
          )}

          <Button {...borderedRowBtnProps} icon={<CloseOutlined />} onClick={() => { setAlipayWaiting(false); stopPolling(); }}>
            {t('topUp.close')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
