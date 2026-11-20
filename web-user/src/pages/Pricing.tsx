import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Spin, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchAllCatalogModels } from '../api/catalog';
import { notifyApiErrorFromErr } from '../lib/notifyApi';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { getCurrencySymbol, getCurrencyRate, formatMoneyMajorUnits } from '../utils';
import { useUser } from '../contexts/UserContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import Header from '../components/Header';
import { getDocsAppHref, getDocsHomeUrl, resolveDocLang } from '../config/docs';
import '../pages/Pricing.css';

interface PricingItem {
  model_name: string;
  quota_type: number;
  model_ratio: number;
  completion_ratio: number;
  model_price: number;
  enable_groups: string[];
  owner_by?: string;
  _input_price?: number;
  _output_price?: number;
}

type CellValue = true | false | string | React.ReactNode;

interface FeatureRow {
  label: string;
  sub?: string;
  subHref?: string;
  values: [CellValue, CellValue, CellValue];
}

interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const PLANS = [
  { key: 'free', labelKey: 'pricingPlanFree', highlight: false, descKey: 'pricingPlanFreeDesc' },
  { key: 'payg', labelKey: 'pricingPlanPayg', highlight: true, emphasis: 'soft', descKey: 'pricingPlanPaygDesc' },
  { key: 'ent', labelKey: 'pricingPlanEnt', highlight: false, descKey: 'pricingPlanEntDesc' },
];

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'pricingSectionCore',
    rows: [
      {
        label: 'pricingFeatureAvailableModels',
        sub: 'pricingFeatureBrowseModels',
        subHref: '/models',
        values: ['pricingFeatureBasicModels', 'pricingFeatureAllModels', 'pricingFeatureAllModels'],
      },
      {
        label: 'pricingFeatureApiCalls',
        sub: 'pricingFeatureIntegrationDocs',
        subHref: '/docs',
        values: [true, true, true],
      },
      { label: 'pricingFeatureLogsExport', values: [true, true, true] },
      { label: 'pricingFeatureTokenManagement', values: [true, true, true] },
      { label: 'pricingFeatureMultiKeyRotation', values: [false, true, true] },
      { label: 'pricingFeatureAutoRouting', sub: 'pricingFeatureLearnMore', values: [false, true, true] },
    ],
  },
  {
    title: 'pricingSectionTeam',
    rows: [
      { label: 'pricingFeatureOrgMultiTenant', sub: 'pricingFeatureTeamQuota', values: [false, true, true] },
      { label: 'pricingFeatureRoleManagement', values: [false, true, true] },
      { label: 'pricingFeatureDeptQuota', values: [false, true, true] },
      { label: 'pricingFeatureAuditLogs', values: [false, true, true] },
    ],
  },
  {
    title: 'pricingSectionEnterprise',
    rows: [
      { label: 'pricingFeatureEnterpriseCredit', sub: 'pricingFeatureMonthlyBilling', values: [false, false, true] },
      { label: 'pricingFeatureReseller', values: [false, false, true] },
      { label: 'pricingFeatureReconciliation', values: [false, false, true] },
      { label: 'pricingFeatureCSM', values: [false, false, true] },
      { label: 'pricingFeatureSLA', values: [false, false, true] },
      { label: 'pricingFeaturePrivateDeploy', values: [false, false, 'pricingFeatureOptional'] },
    ],
  },
];

function Check() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="11" fill="#16a34a" />
      <path d="M6.5 11l3 3 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="10.5" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M8 8l6 6M14 8l-6 6" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CellVal({ v }: { v: CellValue }) {
  if (v === true) return <Check />;
  if (v === false) return <Cross />;
  return <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>;
}

const QPU = 500_000;

function calcPrice(item: PricingItem, _qpu: number) {
  if (item.quota_type === 1) return { type: 'fixed' as const, price: item.model_price };
  const inputPer1M = item._input_price ?? item.model_ratio;
  const outputPer1M = item._output_price ?? item.model_ratio * item.completion_ratio;
  return { type: 'token' as const, inputPer1M, outputPer1M };
}

function fmt(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return formatMoneyMajorUnits(0);
  if (x !== 0 && Math.abs(x) < 0.0001) return x.toExponential(4);
  return formatMoneyMajorUnits(x);
}

const PROVIDERS = [
  { name: 'OpenAI', color: '#10a37f', match: (n: string) => /^(gpt|o1|o3|o4)/.test(n) },
  { name: 'Anthropic', color: '#d97706', match: (n: string) => n.startsWith('claude') },
  { name: 'Google', color: '#4285f4', match: (n: string) => n.startsWith('gemini') },
  { name: 'DeepSeek', color: '#6366f1', match: (n: string) => n.startsWith('deepseek') },
  { name: 'Qwen', color: '#f97316', match: (n: string) => n.startsWith('qwen') },
  { name: 'GLM', color: '#8b5cf6', match: (n: string) => /^(glm|chatglm)/.test(n) },
  { name: 'Moonshot', color: '#06b6d4', match: (n: string) => /^(moonshot|kimi)/.test(n) },
  { name: 'Mistral', color: '#f59e0b', match: (n: string) => /^(mistral|mixtral)/.test(n) },
  { name: 'Meta', color: '#1877f2', match: (n: string) => /^(llama|meta)/.test(n) },
];

function getProvider(name: string, ownerBy?: string) {
  const n = name.toLowerCase();
  const byModel = PROVIDERS.find((p) => p.match(n));
  if (byModel) return byModel;
  if (ownerBy) {
    const known = PROVIDERS.find((p) => p.name.toLowerCase() === ownerBy.toLowerCase());
    if (known) return known;
    return { name: ownerBy, color: '#6b7280' };
  }
  return { name: 'OTHER_PROVIDER', color: '#6b7280' };
}

function formatModelLabel(name: string) {
  return name
    .replace(/[-_]+/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/\b(gpt|glm|api|vl|omni|tts|asr|img|ui|v\d+)\b/gi, (m) => m.toUpperCase())
    .trim();
}

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const { openLogin } = useAuthModal();
  const qpu = useQuotaPerUnit() || QPU;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [search, setSearch] = useState('');
  const [provFilter, setProvFilter] = useState('');
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));

  const featureSections = useMemo(() => {
    const docsUrl = getDocsAppHref(getDocsHomeUrl(resolveDocLang(i18n.language)));
    return FEATURE_SECTIONS.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({
        ...row,
        subHref: row.subHref === '/docs' ? docsUrl : row.subHref,
      })),
    }));
  }, [i18n.language]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAllCatalogModels({ include_unavailable: false });
      const mapped: PricingItem[] = list.map((card) => ({
        model_name: card.name,
        quota_type: card.pricing_type === 'token' ? 0 : 1,
        model_ratio: 0,
        completion_ratio: 1,
        model_price: card.unit_price ?? 0,
        enable_groups: card.available_groups ?? [],
        owner_by: card.provider || '',
        _input_price: card.input_price ?? 0,
        _output_price: card.output_price ?? 0,
      }));
      setItems(mapped);
    } catch (err) {
      setItems([]);
      notifyApiErrorFromErr(err, { fallbackKey: 'notify.operationFailed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const allProviders = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; color: string }[] = [];
    for (const item of items) {
      const p = getProvider(item.model_name, item.owner_by);
      if (!seen.has(p.name)) {
        seen.add(p.name);
        result.push(p);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) result = result.filter((i) => i.model_name.toLowerCase().includes(search.toLowerCase()));
    if (provFilter) result = result.filter((i) => getProvider(i.model_name, i.owner_by).name === provFilter);
    return result;
  }, [items, search, provFilter]);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1100;
  const sectionPadding = isMobile ? '0 16px 56px' : isTablet ? '0 20px 72px' : '0 24px 88px';
  const heroTitleSize = isMobile ? 34 : isTablet ? 42 : 52;
  const decisionGrid = isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
  const faqGrid = isMobile ? '1fr' : '1fr 1fr';
  const enterpriseGrid = isMobile || isTablet ? '1fr' : 'minmax(0,0.95fr) minmax(280px,1.05fr)';

  const thBase: React.CSSProperties = {
    padding: '24px 24px 20px',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--bg-card)',
    backdropFilter: 'blur(12px)',
  };

  const tdBase: React.CSSProperties = {
    padding: '18px 24px',
    textAlign: 'center',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, rgb(from var(--theme-color-primary) r g b / 0.05) 0%, var(--bg-page) 16%, var(--bg-page) 100%)' }}>
      <Header />

      <div className="landing-section" style={{ maxWidth: 1080, margin: '0 auto', padding: sectionPadding }}>
        <div style={{ textAlign: 'center', padding: isMobile ? '48px 0 36px' : '72px 0 56px' }}>
          <div style={{ display: 'inline-flex', padding: '8px 14px', borderRadius: 999, background: 'rgb(from var(--theme-color-primary) r g b / 0.08)', color: 'var(--theme-color-primary)', fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
            {t('pricingEyebrow')}
          </div>
          <h1 style={{ fontSize: heroTitleSize, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px', letterSpacing: '-0.04em', lineHeight: 1.06 }}>
            {t('pricingTitle')}
          </h1>
          <p style={{ fontSize: isMobile ? 15 : 18, color: 'var(--text-secondary)', margin: '0 auto 32px', maxWidth: 760, lineHeight: 1.8 }}>
            {t('pricingSubtitle')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={user ? () => (window.location.href = '/dashboard') : openLogin}
              style={{
                padding: '12px 28px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--theme-color-primary)',
                color: 'var(--btn-primary-text, #fff)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 12px 28px rgb(from var(--theme-color-primary) r g b / 0.22)',
              }}
            >
              {user ? t('pricingGoDashboard') : t('pricingStartNow')}
            </button>
            <Link
              to="/enterprise/apply#contact"
              style={{
                padding: '12px 28px',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.08)',
                color: 'var(--text-primary)',
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
                background: 'var(--bg-card)',
              }}
            >
              {t('pricingContactSales')}
            </Link>
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ maxWidth: 760, marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-color-primary)', letterSpacing: '0.06em', marginBottom: 10 }}>{t('pricingDecisionEyebrow')}</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px', color: 'var(--text-primary)' }}>{t('pricingDecisionTitle')}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', margin: 0 }}>{t('pricingDecisionSubtitle')}</p>
          </div>
          <div className="grid-3col" style={{ display: 'grid', gridTemplateColumns: decisionGrid, gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ padding: 22, borderRadius: 20, border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 14px 36px rgba(15,23,42,0.04)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{t(`pricingDecision${i}Title`)}</div>
                <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 12 }}>{t(`pricingDecision${i}Desc`)}</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[1, 2].map((j) => (
                    <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.7, color: 'var(--text-tertiary)' }}>
                      <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                      <span>{t(`pricingDecision${i}Point${j}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="pricing-cards"
          style={{
            border: '1px solid rgba(15,23,42,0.08)',
            borderRadius: 24,
            overflow: 'hidden',
            // background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 22px 60px rgba(15,23,42,0.06)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', paddingLeft: 28 }} />
                {PLANS.map((plan) => (
                  <th
                    key={plan.key}
                    style={{
                      ...thBase,
                      borderLeft: '1px solid rgba(15,23,42,0.06)',
                      // background: plan.highlight ? 'linear-gradient(180deg, rgb(from var(--theme-color-primary) r g b / 0.08), rgb(from var(--theme-color-primary) r g b / 0.02))' : 'rgba(255,255,255,0.94)',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{t(plan.labelKey)}</div>
                    <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{t(plan.descKey)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureSections.map((section, sectionIndex) => (
                <React.Fragment key={section.title}>
                  <tr>
                    <td colSpan={4} style={{ padding: sectionIndex === 0 ? '12px 24px 10px' : '20px 24px 10px'}}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(15,23,42,0.06)', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                        {t(section.title)}
                      </div>
                    </td>
                  </tr>
                  {section.rows.map((row, rowIndex) => {
                    const isLast = rowIndex === section.rows.length - 1;
                    return (
                      <tr key={row.label} style={{ background: rowIndex % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.015)' }}>
                        <td style={{ ...tdBase, textAlign: 'left', paddingLeft: 28, borderBottom: isLast ? 'none' : '1px solid rgba(15,23,42,0.06)' }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{t(row.label)}</div>
                          {row.sub &&
                            (row.subHref ? (
                              <a
                                href={row.subHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 12, color: 'var(--theme-color-primary)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}
                              >
                                {t(row.sub)}
                              </a>
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{t(row.sub)}</div>
                            ))}
                        </td>
                        {row.values.map((v, ci) => (
                          <td
                            key={ci}
                            style={{
                              ...tdBase,
                              borderLeft: '1px solid rgba(15,23,42,0.06)',
                              borderBottom: isLast ? 'none' : '1px solid rgba(15,23,42,0.06)',
                              background: ci === 1 ? 'rgb(from var(--theme-color-primary) r g b / 0.02)' : 'transparent',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              <CellVal v={typeof v === 'string' ? t(v) : v} />
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              <tr>
                <td style={{ padding: '24px 24px 28px' }} />
                {PLANS.map((plan, pi) => (
                  <td
                    key={plan.key}
                    style={{
                      padding: '24px 24px 28px',
                      textAlign: 'center',
                      borderLeft: '1px solid rgba(15,23,42,0.06)',
                      background: pi === 1 ? 'var(--bg-elevated)' : 'transparent',
                    }}
                  >
                    {pi === 2 ? (
                      <Link
                        to="/enterprise/apply#contact"
                        style={{
                          display: 'inline-block',
                          padding: '10px 22px',
                          borderRadius: 10,
                          border: '1px solid rgba(15,23,42,0.08)',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: 'none',
                          background: 'var(--bg-card)',
                        }}
                      >
                        {t('pricingContactSales')}
                      </Link>
                    ) : (
                      <button
                        onClick={user ? () => (window.location.href = '/dashboard') : openLogin}
                        style={{
                          padding: '10px 22px',
                          borderRadius: 10,
                          border: pi === 1 ? '1px solid rgb(from var(--theme-color-primary) r g b / 0.14)' : '1px solid rgba(15,23,42,0.08)',
                          cursor: 'pointer',
                          background: pi === 1 ? 'rgb(from var(--theme-color-primary) r g b / 0.92)' : 'var(--bg-card)',
                          color: pi === 1 ? '#fff' : 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: 600,
                          boxShadow: pi === 1 ? '0 8px 18px rgb(from var(--theme-color-primary) r g b / 0.12)' : 'none',
                        }}
                      >
                        {user ? t('pricingDashboard') : t('pricingFreeSignUp')}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* <div style={{ marginTop: 84 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
              {t('pricingModelPricingTitle')}
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 760, lineHeight: 1.8 }}>
              {t('pricingModelPricingSubtitle')}
            </p>
          </div>

          <div
            style={{
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.92)',
              boxShadow: '0 18px 50px rgba(15,23,42,0.05)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '22px 24px 18px', background: 'linear-gradient(180deg, rgba(248,250,252,0.88), rgba(255,255,255,0.96))', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{t('pricingModelCatalogTitle')}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 620 }}>{t('pricingModelCatalogSubtitle')}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: isMobile ? 'normal' : 'nowrap', paddingTop: 2 }}>
                  {t('pricingModelCount', { count: filtered.length })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 16, flexWrap: 'wrap' }}>
                <Input
                  prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
                  placeholder={t('pricingSearchModels')}
                  value={search}
                  onChange={(v) => setSearch(v)}
                  showClear
                  style={{ width: isMobile ? '100%' : 240, minWidth: isMobile ? '100%' : undefined, flex: isMobile ? '1 1 100%' : undefined }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{ name: 'ALL_PROVIDER', color: '' }, ...allProviders].map((p) => {
                    const active = p.name === 'ALL_PROVIDER' ? !provFilter : provFilter === p.name;
                    return (
                      <button
                        key={p.name}
                        onClick={() => setProvFilter(p.name === 'ALL_PROVIDER' ? '' : provFilter === p.name ? '' : p.name)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: active ? 600 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          border: active ? '1px solid rgba(15,23,42,0.14)' : '1px solid rgba(15,23,42,0.06)',
                          background: active ? 'rgba(15,23,42,0.045)' : 'rgba(255,255,255,0.72)',
                          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.45)' : 'none',
                        }}
                      >
                        {p.name === 'ALL_PROVIDER' ? t('pricingAllProvider') : p.name === 'OTHER_PROVIDER' ? t('pricingOtherProvider') : p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin size="large" />
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                      {[t('pricingModelName'), t('pricingProvider'), t('pricingBilling'), t('pricingInputPer1m'), t('pricingOutputPer1m')].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '14px 16px',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            color: 'var(--text-secondary)',
                            textAlign: h === t('pricingModelName') ? 'left' : 'center',
                            borderBottom: '1px solid rgba(15,23,42,0.06)',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                          {t('pricingNoMatchedModels')}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item, idx) => {
                        const prov = getProvider(item.model_name, item.owner_by);
                        const p = calcPrice(item, qpu);
                        return (
                          <tr key={item.model_name} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.015)' }}>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>{formatModelLabel(item.model_name)}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.01em' }}>{item.model_name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: prov.color, opacity: 0.8 }} />
                                {prov.name === 'OTHER_PROVIDER' ? t('pricingOtherProvider') : prov.name}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '1px solid rgba(15,23,42,0.06)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {item.quota_type === 1 ? t('perRequest') : t('perToken')}
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '1px solid rgba(15,23,42,0.06)', fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
                              {p.type === 'fixed' ? <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span> : <span>{getCurrencySymbol()}{fmt(p.inputPer1M * getCurrencyRate())}</span>}
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '1px solid rgba(15,23,42,0.06)', fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
                              {p.type === 'fixed' ? (
                                <span>
                                  {getCurrencySymbol()}
                                  {fmt(p.price * getCurrencyRate())}
                                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/{t('pricingPerRequestUnit')}</span>
                                </span>
                              ) : (
                                <span>
                                  {getCurrencySymbol()}
                                  {fmt(p.outputPer1M * getCurrencyRate())}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div> */}

        <div style={{ marginTop: 84 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
              {t('pricingFaqTitle')}
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 760, lineHeight: 1.8 }}>
              {t('pricingFaqSubtitle')}
            </p>
          </div>

          <div className="pricing-comparison" style={{ display: 'grid', gridTemplateColumns: faqGrid, gap: 20 }}>
            {[
              { q: t('pricingFaqQ1'), a: t('pricingFaqA1') },
              { q: t('pricingFaqQ2'), a: t('pricingFaqA2') },
              { q: t('pricingFaqQ3'), a: t('pricingFaqA3') },
              { q: t('pricingFaqQ4'), a: t('pricingFaqA4') },
            ].map(({ q, a }) => (
              <div key={q} style={{ padding: 24, borderRadius: 18,border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 14px 36px rgba(15,23,42,0.04)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>{q}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 72, padding: isMobile ? 18 : 28, borderRadius: isMobile ? 18 : 24, background: 'linear-gradient(135deg, rgb(from var(--theme-color-primary) r g b / 0.10), rgba(255,255,255,0.96))', border: '1px solid rgb(from var(--theme-color-primary) r g b / 0.14)', boxShadow: '0 18px 50px rgba(15,23,42,0.05)' }}>
          <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: enterpriseGrid, gap: 24, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 10 }}>{t('pricingEnterpriseTitle')}</div>
              <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 14 }}>{t('pricingEnterpriseDesc')}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.7, color: 'var(--text-tertiary)' }}>
                    <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                    <span>{t(`pricingEnterprisePoint${i}`)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Link to="/enterprise/apply#contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 12, background: 'var(--theme-color-primary)', color: 'var(--btn-primary-text, #fff)', textDecoration: 'none', fontWeight: 700, boxShadow: '0 12px 28px rgb(from var(--theme-color-primary) r g b / 0.18)' }}>
                {t('pricingEnterprisePrimary')}
              </Link>
              <Link to="/trust" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 12, border: '1px solid rgba(15,23,42,0.08)', background: 'var(--bg-card)', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                {t('pricingEnterpriseSecondary')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
