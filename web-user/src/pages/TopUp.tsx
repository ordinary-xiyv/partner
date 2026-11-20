import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import type { TagProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Spin, Tag, Modal, Input, Button, Table } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { AppEmpty, AppPageHeader } from '../ui/appLayout';
import {
  getTopUpInfo, topUp as redeemTopUp,
  requestEpay, requestStripePay, requestCreemPay,
  getUserTopUps,
  getPaymentInfo, requestNativePay, queryPaymentStatus,
} from '../api';
import { getMyComplimentaryQuotas } from '../api/complimentaryQuota';
import { renderAmount, formatTime, getCurrencySymbol, formatMoneyMajorUnits, fromQuota, getCurrencyRate } from '../utils';
import type { ComplimentaryQuota } from '../types';
import dayjs from 'dayjs';
import { localListPagination } from '../utils/tablePagination';
import { getUserDisplayQuota } from '../utils/quotaDisplay';
import { QuotaAmount } from '../components/QuotaAmount';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { WechatPayIcon, AlipayIcon, StripeIcon } from '../components/PaymentIcons';
import { useUser } from '../contexts/UserContext';
import WalletIcon from '../assets/icons/svg/topup/wallet.svg?react';
import PieIcon from '../assets/icons/svg/topup/pie.svg?react';
import GiftIcon from '../assets/icons/svg/topup/gift.svg?react';
import './top-up.css';

interface CampaignDiscount {
  id: number;
  rate: number;
  starts_at?: number;
  ends_at?: number | null;
  once_only?: boolean;
  eligible?: boolean;
  reason?: string;
  max_discountable_amount?: number;
  max_reduction?: number;
  contact_sales_amount?: number;
  sales_qr_url?: string;
}

interface TopUpInfo {
  enable_online_topup: boolean;
  enable_stripe_topup: boolean;
  enable_creem_topup: boolean;
  creem_products: string;
  pay_methods: { name: string; type: string; color?: string; min_topup?: string }[];
  min_topup: number;
  stripe_min_topup: number;
  amount_options: number[];
  discount: Record<string, number>;
  campaign_discount?: CampaignDiscount | null;
}

interface CreemProduct {
  productId: string;
  name: string;
  price: number;
  currency: string;
  quota: number;
}

interface NativeChannel {
  name: string;
  type: string;
}

interface TopUpRecord {
  id: number;
  amount: number;
  money: number;
  trade_no: string;
  payment_method: string;
  status: string;
  create_time: number;
}

type GiftCreditStatus = 'active' | 'exhausted' | 'expired';

interface GiftCreditItem {
  id: string | number;
  amount: number;
  title: string;
  issuedAt: string;
  expiresAt: string;
  status: GiftCreditStatus;
}

function mapComplimentaryStatus(status: number): GiftCreditStatus {
  if (status === 1) return 'exhausted';
  if (status === 2) return 'expired';
  return 'active';
}

function formatGiftTime(value: number | string | null | undefined): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'number') return value > 0 ? formatTime(value) : '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '-';
}

function mapComplimentaryToGiftItem(
  record: ComplimentaryQuota,
  qpu: number,
  neverExpiresLabel: string,
): GiftCreditItem {
  const remark = (record.remark || '').trim();
  return {
    id: record.id,
    amount: fromQuota(record.amount, qpu) * getCurrencyRate(),
    title: remark || record.source || '-',
    issuedAt: formatGiftTime(record.created_at),
    expiresAt:
      record.expired_at != null && record.expired_at > 0
        ? formatTime(record.expired_at)
        : neverExpiresLabel,
    status: mapComplimentaryStatus(record.status),
  };
}

type AppTagColor = NonNullable<TagProps['color']>;

const statusColor: Record<string, AppTagColor> = {
  pending: 'orange',
  success: 'green',
  failed: 'red',
  closed: 'default',
};

function campaignAppliesToPayMethod(payMethod: string): boolean {
  return payMethod !== 'creem' && payMethod !== 'stripe';
}

function formatTopupMoney(value: number, cents = false): string {
  if (!Number.isFinite(value)) return cents ? '0.00' : '0';
  const rounded = Math.round(value * 100) / 100;
  if (cents) return rounded.toFixed(2);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function quoteCampaignPay(amount: number, rate: number, maxDiscountable: number, maxReduction: number): number {
  if (!(amount > 0) || !(rate > 0) || rate >= 1) return amount;
  const discountable = Math.min(amount, maxDiscountable);
  const reduction = Math.min(discountable * (1 - rate), maxReduction);
  return Math.round((amount - reduction) * 100) / 100;
}

/** 实付比例 → 折扣数字：中文 0.95→95折、0.90→9折；其他语言仍用百分数 90 / 95 */
function rateToFoldN(rate: number, chineseFold: boolean): number {
  if (!(rate > 0) || rate >= 1) return 0;
  const percent = Math.round(rate * 100);
  if (percent <= 0 || percent >= 100) return 0;
  if (chineseFold && percent % 10 === 0) return percent / 10;
  return percent;
}

function isContactSalesPayData(data: unknown): data is { contact_sales?: boolean; sales_qr_url?: string } {
  return Boolean(data && typeof data === 'object' && (data as { contact_sales?: boolean }).contact_sales === true);
}

function parsePayMoney(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface TopUpProps {
  embedded?: boolean;
  onlineOnly?: boolean;
  enterpriseRecharge?: boolean;
}

export default function TopUp({ embedded = false, onlineOnly = false, enterpriseRecharge = false }: TopUpProps) {
  const { t, i18n } = useTranslation();
  const { user, refresh } = useUser();
  const displayQuota = getUserDisplayQuota(user);
  const qpu = useQuotaPerUnit();
  const currencySymbol = getCurrencySymbol();

  const methodIcon = (method: string) => {
    const m = method.toLowerCase();
    if (m.includes('wechat') || m.includes('wxpay')) return <WechatPayIcon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />;
    if (m.includes('alipay') || m.includes('ali')) return <AlipayIcon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />;
    if (m.includes('stripe')) return <StripeIcon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />;
    return null;
  };

  const localizePaymentMethodName = useCallback((method: string, fallbackName?: string) => {
    const keyMap: Record<string, string> = {
      alipay: 'topUp.methodAlipay',
      wechat: 'topUp.methodWechat',
      alipay_native: 'topUp.methodAlipayNative',
      wechat_native: 'topUp.methodWechatNative',
      stripe: 'topUp.methodStripe',
      creem: 'topUp.methodCreem',
    };
    const normalized = method.toLowerCase();
    if (keyMap[normalized]) return t(keyMap[normalized]);

    const rawName = (fallbackName || '').trim();
    const lowerName = rawName.toLowerCase();
    if (lowerName.includes('wechat') || rawName.includes('微信')) return t('topUp.methodWechat');
    if (lowerName.includes('alipay') || rawName.includes('支付宝')) return t('topUp.methodAlipay');
    if (lowerName.includes('stripe')) return t('topUp.methodStripe');
    if (lowerName.includes('creem')) return t('topUp.methodCreem');
    return rawName || method;
  }, [t]);

  const methodLabel = (method: string) => {
    const map: Record<string, string> = {
      alipay: t('topUp.methodAlipay'),
      wechat: t('topUp.methodWechat'),
      alipay_native: t('topUp.methodAlipayNative'),
      wechat_native: t('topUp.methodWechatNative'),
      stripe: t('topUp.methodStripe'),
      creem: t('topUp.methodCreem'),
    };
    return <>{methodIcon(method)}{map[method] || method}</>;
  };

  const [info, setInfo] = useState<TopUpInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'online' | 'redeem' | 'history' | 'gift'>('online');
  const [nativeChannels, setNativeChannels] = useState<NativeChannel[]>([]);
  const [amount, setAmount] = useState<number>(1);
  const [amountInput, setAmountInput] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('');
  const [creemProducts, setCreemProducts] = useState<CreemProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [paying, setPaying] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [salesContactMode, setSalesContactMode] = useState(false);
  const [payModalMoney, setPayModalMoney] = useState<number | null>(null);
  const [pollingTradeNo, setPollingTradeNo] = useState('');
  const [pollingStatus, setPollingStatus] = useState<'polling' | 'success' | 'timeout'>('polling');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);
  const [alipayWaiting, setAlipayWaiting] = useState(false);
  const [redeemKey, setRedeemKey] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [history, setHistory] = useState<TopUpRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [giftCredits, setGiftCredits] = useState<GiftCreditItem[]>([]);
  const [giftRemainQuota, setGiftRemainQuota] = useState(0);
  const [giftLoading, setGiftLoading] = useState(false);
  const [isCustomAmount, setIsCustomAmount] = useState(false);

  useEffect(() => {
    Promise.all([
      getTopUpInfo().then((res) => {
        if (res.data.success) {
          const d: TopUpInfo = res.data.data;
          if (d.pay_methods) {
            d.pay_methods = d.pay_methods.filter((method) => method.type !== 'custom1' && method.type !== 'alipay');
          }
          setInfo(d);
          if (d.amount_options?.length) {
            setAmount(d.amount_options[0]);
            setIsCustomAmount(false);
          } else {
            const defaultAmount = d.min_topup > 0 ? Math.max(1, Math.ceil(d.min_topup)) : 10;
            setAmount(defaultAmount);
            setIsCustomAmount(true);
            setAmountInput(String(defaultAmount));
          }
          try {
            if (d.creem_products && d.creem_products !== '[]') {
              setCreemProducts(JSON.parse(d.creem_products));
            }
          } catch {
            /* ignore */
          }
          return d;
        }
        return null;
      }).catch(() => null),
      getPaymentInfo().then((res) => {
        if (res.data.success) {
          const channels: NativeChannel[] = res.data.data?.channels || [];
          const filteredChannels = channels.filter((channel) => channel.type !== 'alipay_native');
          setNativeChannels(filteredChannels);
          return filteredChannels;
        }
        return [];
      }).catch(() => []),
    ]).then(([infoData, channels]) => {
      const ch = channels as NativeChannel[];
      const nativeKeywords = ch.map((c) => c.type.replace('_native', ''));
      if (infoData && infoData.pay_methods) {
        infoData.pay_methods = infoData.pay_methods.filter((m: { type: string; name: string }) => {
          const type = m.type.toLowerCase();
          const name = m.name.toLowerCase();
          if (nativeKeywords.includes('wechat') && (type.includes('wechat') || type.includes('wxpay') || name.includes('微信') || name.includes('wechat'))) return false;
          if (nativeKeywords.includes('alipay') && (type.includes('alipay') || type.includes('ali') || name.includes('支付宝') || name.includes('alipay'))) return false;
          return true;
        });
        setInfo({ ...infoData });
      }
      if (ch.length > 0) {
        setPayMethod(ch[0].type);
      } else if (infoData && infoData.pay_methods?.length) {
        setPayMethod(infoData.pay_methods[0].type);
      }
    }).finally(() => setLoading(false));
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await getUserTopUps({ page: 0, page_size: 20 });
      if (res.data.success) {
        const d = res.data.data;
        setHistory(d?.items || d || []);
      }
    } catch {
      /* ignore */
    }
    setHistoryLoading(false);
  };

  const fetchGiftCredits = useCallback(async () => {
    setGiftLoading(true);
    try {
      const res = await getMyComplimentaryQuotas();
      if (res.data.success && res.data.data) {
        const { quotas = [], total_remain = 0 } = res.data.data;
        setGiftRemainQuota(total_remain);
        setGiftCredits(
          quotas.map((item) => mapComplimentaryToGiftItem(item, qpu, t('noExpiration'))),
        );
      }
    } catch {
      /* ignore */
    }
    setGiftLoading(false);
  }, [qpu, t]);

  useEffect(() => {
    if (!onlineOnly) void fetchGiftCredits();
  }, [onlineOnly, fetchGiftCredits]);

  useEffect(() => {
    if (tab === 'history' && !onlineOnly) fetchHistory();
  }, [tab, onlineOnly]);

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  /** 支付成功后刷新活动折扣资格，避免页面仍展示已用完的一次性折扣 */
  const reloadTopUpCampaignInfo = useCallback(async () => {
    try {
      const res = await getTopUpInfo();
      if (!res.data.success || !res.data.data) return;
      const next: TopUpInfo = res.data.data;
      setInfo((prev) => {
        if (!prev) return next;
        return {
          ...prev,
          campaign_discount: next.campaign_discount,
          discount: next.discount,
        };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const startPolling = useCallback((tradeNo: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingCountRef.current = 0;
    setPollingStatus('polling');
    setPollingTradeNo(tradeNo);

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1;
      if (pollingCountRef.current > 100) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPollingStatus('timeout');
        return;
      }
      try {
        const res = await queryPaymentStatus(tradeNo);
        if (res.data.success && res.data.data?.status === 'success') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPollingStatus('success');
          notifyApiSuccess(t('operationSuccess') || '充值成功');
          refresh();
          void reloadTopUpCampaignInfo();
          setTimeout(() => {
            setQrModalVisible(false);
            setAlipayWaiting(false);
            setQrCodeUrl('');
            setPollingTradeNo('');
          }, 1500);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
  }, [refresh, reloadTopUpCampaignInfo, t]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPollingTradeNo('');
    setPollingStatus('polling');
  }, []);

  const isNativeMethod = (method: string) => method === 'alipay_native' || method === 'wechat_native';

  // 直接用充值信息接口返回的最低额（与系统设置 MinTopUp 同源）
  const minTopup = useMemo(() => {
    const n = Number(info?.min_topup);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [info?.min_topup]);

  // 整数充值：实际可输入的最低整数（如配置 0.1 → 至少 1）
  const inputMinAmount = useMemo(() => Math.max(1, Math.ceil(minTopup)), [minTopup]);

  const isAmountBelowMin = isCustomAmount && (
    amountInput === '' ||
    !/^\d+$/.test(amountInput) ||
    Number(amountInput) < minTopup
  );

  const handleOnlinePay = async () => {
    if (!payMethod) {
      notifyApiError(t('selectPayMethod'));
      return;
    }
    if (payMethod !== 'creem' && isAmountBelowMin) {
      notifyApiError(t('topupAmountBelowMin', { symbol: currencySymbol, min: inputMinAmount }));
      return;
    }
    setPaying(true);
    try {
      const campaign = info?.campaign_discount;
      const campaignEligible = campaignAppliesToPayMethod(payMethod)
        && campaign
        && campaign.eligible === true
        && typeof campaign.rate === 'number'
        && campaign.rate > 0
        && campaign.rate < 1;
      const contactCap = campaign?.contact_sales_amount ?? 10000;
      if (campaignEligible && amount > contactCap) {
        setSalesContactMode(true);
        setQrCodeUrl(campaign?.sales_qr_url || '');
        setQrModalVisible(true);
        setPaying(false);
        return;
      }
      if (isNativeMethod(payMethod)) {
        const res = await requestNativePay({ amount, payment_method: payMethod });
        if (res.data.message === 'success') {
          const data = res.data.data;
          if (isContactSalesPayData(data)) {
            setSalesContactMode(true);
            setQrCodeUrl(data.sales_qr_url || campaign?.sales_qr_url || '');
            setQrModalVisible(true);
            return;
          }
          const tradeNo = data.trade_no;
          setPayModalMoney(parsePayMoney(data.pay_money));
          setSalesContactMode(false);

          if (payMethod === 'alipay_native') {
            window.open(data.pay_url, '_blank');
            setAlipayWaiting(true);
            startPolling(tradeNo);
          } else if (payMethod === 'wechat_native') {
            setQrCodeUrl(data.code_url);
            setQrModalVisible(true);
            startPolling(tradeNo);
          }
        } else {
          notifyApiError(res.data.data || t('operationFailed'));
        }
      } else if (payMethod === 'stripe') {
        const res = await requestStripePay({
          amount,
          payment_method: 'stripe',
          success_url: window.location.origin + '/dashboard',
          cancel_url: window.location.origin + '/topup',
        });
        if (res.data.message === 'success') {
          window.open(res.data.url || res.data.data, '_blank');
        } else {
          notifyApiError(res.data.data || t('operationFailed'));
        }
      } else if (payMethod === 'creem') {
        if (!selectedProduct) {
          notifyApiError(t('selectProduct'));
          setPaying(false);
          return;
        }
        const res = await requestCreemPay({ product_id: selectedProduct, payment_method: 'creem' });
        if (res.data.message === 'success') {
          window.open(res.data.url || res.data.data, '_blank');
        } else {
          notifyApiError(res.data.data || t('operationFailed'));
        }
      } else {
        const res = await requestEpay({ amount, payment_method: payMethod });
        if (res.data.message === 'success') {
          const { url, data: params } = res.data;
          if (isContactSalesPayData(params)) {
            setSalesContactMode(true);
            setQrCodeUrl(params.sales_qr_url || campaign?.sales_qr_url || '');
            setQrModalVisible(true);
            return;
          }
          if (url) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = url;
            form.target = '_blank';
            Object.entries(params || {}).forEach(([k, v]) => {
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = k;
              input.value = String(v);
              form.appendChild(input);
            });
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
          }
        } else {
          notifyApiError(res.data.data || t('operationFailed'));
        }
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setPaying(false);
  };

  const handleRedeem = async () => {
    if (!redeemKey.trim()) return;
    setRedeeming(true);
    try {
      const res = await redeemTopUp({ key: redeemKey.trim() });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        setRedeemKey('');
        refresh();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notifyApiError(msg || t('operationFailed'));
    }
    setRedeeming(false);
  };

  const availablePayMethods = enterpriseRecharge ? [] : (info?.pay_methods || []);
  const creemEnabled = !enterpriseRecharge && info?.enable_creem_topup;
  const hasOnline = nativeChannels.length > 0 || (!enterpriseRecharge && info && (info.enable_online_topup || info.enable_stripe_topup || info.enable_creem_topup));
  const campaignRate = info?.campaign_discount?.rate;
  const hasCampaign = campaignAppliesToPayMethod(payMethod)
    && info?.campaign_discount?.eligible === true
    && typeof campaignRate === 'number'
    && campaignRate > 0
    && campaignRate < 1;
  const contactSalesAmount = info?.campaign_discount?.contact_sales_amount ?? 10000;
  const shouldContactSales = Boolean(hasCampaign && amount > contactSalesAmount);
  const maxDiscountable = info?.campaign_discount?.max_discountable_amount ?? 10000;
  const maxReduction = info?.campaign_discount?.max_reduction ?? 500;
  const tierDiscount = (info?.discount && amount && info.discount[amount]) ? info.discount[amount] : 1;
  const discount = hasCampaign ? campaignRate : tierDiscount;
  const payableAmount = !amount
    ? amount
    : shouldContactSales
      ? amount
      : hasCampaign
        ? quoteCampaignPay(amount, campaignRate, maxDiscountable, maxReduction)
        : discount < 1
          ? Math.round(amount * discount * 100) / 100
          : amount;
  const foldN = rateToFoldN(discount, i18n.language.toLowerCase().startsWith('zh'));
  const savedAmount = amount && payableAmount < amount
    ? Math.round((amount - payableAmount) * 100) / 100
    : 0;
  const finalDiscount = savedAmount > 0 && amount ? Math.round((savedAmount / amount) * 100) : 0;
  const quoteOption = (opt: number) => {
    const optionNeedsSales = Boolean(hasCampaign && opt > contactSalesAmount);
    const optionDiscount = optionNeedsSales ? 1 : (hasCampaign ? discount : (info?.discount?.[opt] ?? 1));
    const pay = optionNeedsSales
      ? opt
      : hasCampaign && optionDiscount < 1
        ? quoteCampaignPay(opt, campaignRate ?? 1, maxDiscountable, maxReduction)
        : optionDiscount < 1
          ? Math.round(opt * optionDiscount * 100) / 100
          : opt;
    const fold = rateToFoldN(optionDiscount, i18n.language.toLowerCase().startsWith('zh'));
    return { pay, fold };
  };
  const modalPayAmount = finalDiscount > 0
    ? (payModalMoney != null && payModalMoney < amount ? payModalMoney : payableAmount)
    : (payModalMoney ?? amount);
  const giftStatusLabel = useCallback((status: GiftCreditStatus) => {
    if (status === 'active') return t('topupGiftStatusActive');
    if (status === 'exhausted') return t('topupGiftStatusExhausted');
    return t('topupGiftStatusExpired');
  }, [t]);

  const historyStatusLabel = useCallback((status: string) => {
    const map: Record<string, string> = {
      success: t('success'),
      pending: t('billingPending'),
      failed: t('failed'),
      closed: t('cancelled'),
    };
    return map[status] || status;
  }, [t]);

  const historyColumns = useMemo<ColumnsType<TopUpRecord>>(() => [
    {
      title: t('createdAt'),
      dataIndex: 'create_time',
      key: 'create_time',
      width: 180,
      render: (v: number) => formatTime(v),
    },
    {
      title: t('payAmount'),
      dataIndex: 'money',
      key: 'money',
      width: 140,
      render: (v: number) => `${currencySymbol}${formatMoneyMajorUnits(v)}`,
    },
    {
      title: t('paymentMethod'),
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 160,
      render: (v: string) => methodLabel(v) || '-',
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={statusColor[s] || 'default'}>{historyStatusLabel(s)}</Tag>
      ),
    },
  ], [currencySymbol, historyStatusLabel, t]);

  const payMethodOptions = useMemo(() => {
    const items: { type: string; name: string; desc?: string; icon: React.ReactNode }[] = [];
    nativeChannels.forEach((ch) => {
      const isWechat = ch.type === 'wechat_native';
      const isAlipay = ch.type === 'alipay_native';
      items.push({
        type: ch.type,
        name: localizePaymentMethodName(ch.type, ch.name),
        desc: isWechat ? t('topupWechatPayHint') : isAlipay ? t('topupAlipayPayHint') : undefined,
        icon: isAlipay
          ? <AlipayIcon size={28} style={{ flexShrink: 0 }} />
          : isWechat
            ? <WechatPayIcon size={28} style={{ flexShrink: 0 }} />
            : null,
      });
    });
    availablePayMethods.forEach((m) => {
      const type = m.type.toLowerCase();
      const name = m.name.toLowerCase();
      const isWechat = type.includes('wechat') || type.includes('wxpay') || name.includes('微信') || name.includes('wechat');
      const isAlipay = type.includes('alipay') || type.includes('ali') || name.includes('支付宝') || name.includes('alipay');
      items.push({
        type: m.type,
        name: localizePaymentMethodName(m.type, m.name),
        desc: isWechat ? t('topupWechatPayHint') : isAlipay ? t('topupAlipayPayHint') : undefined,
        icon: isWechat
          ? <WechatPayIcon size={28} style={{ flexShrink: 0 }} />
          : isAlipay
            ? <AlipayIcon size={28} style={{ flexShrink: 0 }} />
            : m.type === 'stripe'
              ? <StripeIcon size={28} style={{ flexShrink: 0 }} />
              : null,
      });
    });
    if (creemEnabled) {
      items.push({
        type: 'creem',
        name: 'Creem',
        icon: (
          <span style={{
            width: 28, height: 28, borderRadius: 999,
            background: 'rgb(from var(--theme-color-primary) r g b / 0.15)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>C</span>
        ),
      });
    }
    return items;
  }, [nativeChannels, availablePayMethods, creemEnabled, localizePaymentMethodName, t]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin /></div>;

  const tabItems = onlineOnly ? [] : [
    { key: 'online' as const, label: t('onlineTopup') },
    { key: 'redeem' as const, label: t('redemptionCode') },
    { key: 'history' as const, label: t('topupHistory') },
    { key: 'gift' as const, label: t('topupGiftQuota') },
  ];

  const amountOptions = info?.amount_options || [];
  const presetSelected = !isCustomAmount && amountOptions.includes(amount);
  const selectedCreemProduct = creemProducts.find((p) => p.productId === selectedProduct);

  return (
    <>
      {!embedded && (
        <AppPageHeader
          title={t('topUp')}
          subtitle={t('topupSubtitle')}
        />
      )}

      <div className={`topup-page${embedded ? ' topup-page--embedded' : ''}`}>
      {!embedded && (
        <div className="topup-stats">
          {[
            { label: t('currentBalance'), value: <QuotaAmount quotaUnits={displayQuota} qpu={qpu} digits={4} showOverdraftLabel />, icon: <WalletIcon /> },
            { label: t('usedQuota'), value: renderAmount(user?.used_quota || 0, 4, qpu), icon: <PieIcon /> },
            { label: t('topupGiftQuota'), value: renderAmount(giftRemainQuota, 4, qpu), icon: <GiftIcon /> },
          ].map((card) => (
            <div key={card.label} className="topup-stat-card">
              <span className="topup-stat-card__icon">{card.icon}</span>
              <div className="topup-stat-card__body">
                <div className="topup-stat-card__label">{card.label}</div>
                <div className="topup-stat-card__value">{card.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="topup-main-card">
      {!onlineOnly && (
        <div className="topup-tabs" role="tablist">
          {tabItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`topup-tab${tab === item.key ? ' is-active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'online' && (
        <div className="topup-panel topup-panel--padded">
          {!hasOnline ? (
            <AppEmpty icon="💳" message={t('topupNoOnlineMethods')} />
          ) : (
            <div className="topup-checkout">
              <div className="topup-checkout__main">
              <div className="topup-checkout__section">
                <div className="topup-section-label">{t('topupSelectPayMethod')}</div>
                <div className="topup-pay-methods">
                  {payMethodOptions.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className={`topup-pay-method${payMethod === item.type ? ' is-active' : ''}`}
                      onClick={() => setPayMethod(item.type)}
                    >
                      <span className="topup-pay-method__main">
                        {item.icon}
                        <span className="topup-pay-method__text">
                          <span className="topup-pay-method__name">{item.name}</span>
                          {item.desc ? (
                            <span className="topup-pay-method__desc">{item.desc}</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="topup-pay-method__check">✓</span>
                    </button>
                  ))}
                </div>
              </div>

              {payMethod === 'creem' ? (
                <div className="topup-checkout__section">
                  <div className="topup-section-label">{t('selectProduct')}</div>
                  {creemProducts.length > 0 ? (
                    <div className="topup-creem-grid">
                      {creemProducts.map((p) => (
                        <button
                          key={p.productId}
                          type="button"
                          className={`topup-creem-card${selectedProduct === p.productId ? ' is-active' : ''}`}
                          onClick={() => setSelectedProduct(p.productId)}
                        >
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{p.name}</div>
                          <div style={{ fontSize: 13, color: 'var(--theme-color-primary)', fontWeight: 700 }}>{p.price} {p.currency?.toUpperCase()}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{renderAmount(p.quota, 4, qpu)}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <AppEmpty icon="📦" message={t('selectProduct')} />
                  )}
                </div>
              ) : (
                <div className="topup-checkout__section">
                  <div className="topup-section-label">{t('topupSelectAmount')}</div>
                  <div className="topup-amount-body">
                    <div className="topup-amount-grid">
                      {amountOptions.map((opt) => {
                        const quoted = quoteOption(opt);
                        return (
                        <button
                          key={opt}
                          type="button"
                          className={`topup-amount-btn${presetSelected && amount === opt ? ' is-active' : ''}`}
                          onClick={() => {
                            setIsCustomAmount(false);
                            setAmount(opt);
                          }}
                        >
                          {quoted.fold > 0 ? (
                            <span className="topup-amount-btn__badge">{t('topupDiscount.fold', { n: quoted.fold })}</span>
                          ) : null}
                          <span className="topup-amount-btn__credit">{currencySymbol}{opt}</span>
                          {quoted.fold > 0 ? (
                            <span className="topup-amount-btn__pay">
                              {t('topupDiscount.payAmount')} {currencySymbol}{formatTopupMoney(quoted.pay, true)}
                            </span>
                          ) : null}
                        </button>
                        );
                      })}
                    </div>
                    <div className="topup-amount-custom-row">
                      <label className={`topup-amount-field${isCustomAmount && isAmountBelowMin ? ' is-invalid' : ''}`}>
                        <span className="topup-amount-field__prefix">{t('topupCustomAmountLabel')}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="topup-amount-field__input"
                          value={amountInput}
                          placeholder=""
                          aria-label={t('topupCustomAmountLabel')}
                          maxLength={8}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next !== '' && !/^\d{1,8}$/.test(next)) return;
                            setIsCustomAmount(true);
                            setAmountInput(next);
                            setAmount(next === '' ? 0 : Number(next));
                          }}
                          onFocus={() => {
                            setIsCustomAmount(true);
                            if (amountInput !== '' && /^\d+$/.test(amountInput)) {
                              setAmount(Number(amountInput));
                            } else {
                              setAmount(0);
                            }
                          }}
                          onBlur={() => {
                            if (!isCustomAmount) return;
                            const raw = amountInput;
                            if (raw === '') return;
                            if (Number.isNaN(Number(raw)) || Number(raw) < minTopup) {
                              setAmountInput(String(inputMinAmount));
                              setAmount(inputMinAmount);
                              notifyApiError(t('topupAmountBelowMin', { symbol: currencySymbol, min: inputMinAmount }));
                              return;
                            }
                            const normalized = String(Number(raw));
                            setAmountInput(normalized);
                            setAmount(Number(normalized));
                          }}
                        />
                        {t('topupAmountUnit') ? (
                          <span className="topup-amount-field__suffix">{t('topupAmountUnit')}</span>
                        ) : null}
                      </label>
                      <span className={`topup-amount-custom__hint${isCustomAmount && isAmountBelowMin ? ' is-invalid' : ''}`}>
                        {`${t('minimum')}: ${currencySymbol}${inputMinAmount}，${t('onlySupportIntegerTopup')}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              </div>

              <aside className="topup-detail">
                <div className="topup-detail__title">{t('topupDiscount.detail')}</div>
                {payMethod === 'creem' ? (
                  <div className="topup-detail__row">
                    <span>{t('topupDiscount.payTotal')}</span>
                    <span>
                      {selectedCreemProduct
                        ? `${selectedCreemProduct.price} ${selectedCreemProduct.currency?.toUpperCase() || ''}`.trim()
                        : '—'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="topup-detail__row">
                      <span>{t('topupDiscount.creditTotal')}</span>
                      <span>{currencySymbol}{formatTopupMoney(amount || 0, true)}</span>
                    </div>
                    {savedAmount > 0 ? (
                      <div className="topup-detail__row topup-detail__row--off">
                        <span>{foldN > 0 ? t('topupDiscount.foldOff', { n: foldN }) : t('discount')}</span>
                        <span>-{currencySymbol}{formatTopupMoney(savedAmount, true)}</span>
                      </div>
                    ) : null}
                    <div className="topup-detail__row topup-detail__row--pay">
                      <span>{t('topupDiscount.payTotal')}</span>
                      <span>{currencySymbol}{formatTopupMoney(savedAmount > 0 ? payableAmount : (amount || 0), true)}</span>
                    </div>
                  </>
                )}
                <div className="topup-detail__total">
                  {payMethod === 'creem' ? (
                    <span className="topup-detail__price">
                      {selectedCreemProduct
                        ? `${selectedCreemProduct.price} ${selectedCreemProduct.currency?.toUpperCase() || ''}`.trim()
                        : '—'}
                    </span>
                  ) : (
                    <>
                      <span className="topup-detail__price">
                        {currencySymbol}{formatTopupMoney(savedAmount > 0 ? payableAmount : (amount || 0), true)}
                      </span>
                      {savedAmount > 0 ? (
                        <span className="topup-detail__saved">
                          {t('topupDiscount.saved')} {currencySymbol}{formatTopupMoney(savedAmount, true)}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                <Button
                  type="primary"
                  size="large"
                  className="topup-detail__action"
                  onClick={handleOnlinePay}
                  loading={paying}
                  disabled={!payMethod || (payMethod === 'creem' ? !selectedProduct : isAmountBelowMin)}
                >
                  {shouldContactSales ? t('contactSales') : t('payNow')}
                </Button>
              </aside>
            </div>
          )}
        </div>
      )}

      {tab === 'redeem' && (
        <div className="topup-panel topup-panel--padded topup-redeem">
          <div className="topup-redeem__title">{t('redemptionCode')}</div>
          <div className="topup-redeem__desc">{t('redemptionTip')}</div>
          <div className="topup-redeem__form">
            <Input
              className="topup-redeem__input"
              value={redeemKey}
              onChange={(e) => setRedeemKey(e.target.value)}
              placeholder={t('enterRedemptionCode')}
              onPressEnter={() => { if (!redeeming && redeemKey.trim()) handleRedeem(); }}
            />
            <Button
              type="primary"
              size="large"
              className="topup-action-btn"
              onClick={handleRedeem}
              loading={redeeming}
              disabled={!redeemKey.trim()}
            >
              {t('topupRedeemNow')}
            </Button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="topup-panel topup-history">
          <Table<TopUpRecord>
            className="topup-history__table"
            columns={historyColumns}
            dataSource={history}
            loading={historyLoading}
            rowKey="id"
            locale={{ emptyText: <AppEmpty icon="🧾" message={t('noTopupHistory')} /> }}
            pagination={localListPagination()}
            scroll={{ x: 'max(100%, 580px)' }}
          />
        </div>
      )}

      {tab === 'gift' && (
        <div className="topup-panel">
          <div className="topup-gift">
            <h2 className="topup-gift__title">{t('topupGiftDetailTitle')}</h2>
            <p className="topup-gift__desc">{t('topupGiftDetailDesc')}</p>
            {giftLoading ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : giftCredits.length === 0 ? (
              <div style={{ padding: '48px 0 24px' }}>
                <AppEmpty icon="🎁" message={t('topupGiftEmpty')} />
              </div>
            ) : (
              <div className="topup-gift__list">
                {giftCredits.map((item) => (
                  <div key={item.id} className="topup-gift-item">
                    <div className="topup-gift-item__amount">
                      <div className="topup-gift-item__amount-value">
                        <span className="topup-gift-item__currency">{currencySymbol}</span>
                        <span className="topup-gift-item__number">{item.amount.toFixed(2)}</span>
                      </div>
                      <div className="topup-gift-item__tag">{t('topupGiftLabel')}</div>
                    </div>
                    <div className="topup-gift-item__body">
                      <div className="topup-gift-item__body-head">
                        <div className="topup-gift-item__meta-title">{item.title}</div>
                        <div className={`topup-gift-item__status is-${item.status}`}>
                          {giftStatusLabel(item.status)}
                        </div>
                      </div>
                      <div className="topup-gift-item__meta">
                        <div className="topup-gift-item__meta-row">
                          <span className="topup-gift-item__meta-label">{t('topupGiftIssuedAt')}</span>
                          <span className="topup-gift-item__meta-value">{item.issuedAt}</span>
                        </div>
                        <div className="topup-gift-item__meta-row">
                          <span className="topup-gift-item__meta-label">{t('topupGiftExpiresAt')}</span>
                          <span className="topup-gift-item__meta-value">{item.expiresAt}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      </div>

      <Modal
        title={null}
        open={qrModalVisible}
        footer={null}
        onCancel={() => { setQrModalVisible(false); setSalesContactMode(false); stopPolling(); }}
        width={400}
        closable
        centered
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ textAlign: 'center', padding: '32px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            {salesContactMode ? (
              t('contactSales')
            ) : (
              <>
                <WechatPayIcon size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {t('topUp.wechatPay')}
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>
            {salesContactMode ? t('topupDiscount.contactSalesHint') : t('topupScanHint')}
          </div>

          {qrCodeUrl ? (
            salesContactMode ? (
              <div style={{ display: 'inline-block', padding: 16, background: '#ffffff', borderRadius: 16, marginBottom: 20, boxShadow: '0 8px 28px var(--border-default)' }}>
                <img src={qrCodeUrl} alt={t('customerService.qrAlt')} style={{ width: 220, height: 220, objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{ display: 'inline-block', padding: 16, background: '#ffffff', borderRadius: 16, marginBottom: 20, boxShadow: '0 8px 28px var(--border-default)' }}>
                <QRCodeSVG value={qrCodeUrl} size={220} level="M" />
              </div>
            )
          ) : (
            salesContactMode ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>{t('customerService.qrMissing')}</div>
            ) : (
              <Spin />
            )
          )}

          {!salesContactMode ? (
            <>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            {currencySymbol}{formatTopupMoney(Number(modalPayAmount || 0))}
          </div>
          {pollingTradeNo && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Trade No: {pollingTradeNo}</div>}

          {pollingStatus === 'polling' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13 }}>
              <Spin size="small" />
              {t('topUp.waitingForPayment')}
            </div>
          )}
          {pollingStatus === 'success' && <div style={{ color: '#34d399', fontSize: 14, fontWeight: 700 }}>✅ {t('topUp.paymentSuccess')}</div>}
          {pollingStatus === 'timeout' && <div style={{ color: '#f87171', fontSize: 13 }}>{t('topUp.paymentTimeout')}</div>}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{t('customerService.popupSubtitle')}</div>
          )}
        </div>
      </Modal>

      <Modal
        title={null}
        open={alipayWaiting && !qrModalVisible}
        footer={null}
        onCancel={() => { setAlipayWaiting(false); stopPolling(); }}
        width={400}
        closable
        centered
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ textAlign: 'center', padding: '32px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
            <AlipayIcon size={20} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {t('topUp.alipay')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24 }}>{t('topupAlipayWaitingHint')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
            {currencySymbol}{formatTopupMoney(Number(modalPayAmount || 0))}
          </div>

          {pollingStatus === 'polling' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>
              <Spin size="small" />
              {t('topUp.waitingForResult')}
            </div>
          )}
          {pollingStatus === 'success' && <div style={{ color: '#34d399', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>✅ {t('topUp.paymentSuccessConfirm')}</div>}
          {pollingStatus === 'timeout' && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{t('topUp.waitingTimeout')}</div>}

          <button
            onClick={() => { setAlipayWaiting(false); stopPolling(); }}
            style={{ padding: '10px 32px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}
          >
            {t('topUp.close')}
          </button>
        </div>
      </Modal>
      </div>
    </>
  );
}
