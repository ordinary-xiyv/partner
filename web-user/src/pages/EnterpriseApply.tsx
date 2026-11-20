import {notifyApiError, notifyApiErrorFromErr} from '../lib/notifyApi';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { submitEnterpriseApplication } from '../api';

type InputProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  label: string;
  required?: boolean;
  maxLength?: number;
};

function TextInput({ value, onChange, placeholder, type = 'text', label, required, maxLength }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: 'var(--bg-card)',
          border: `1px solid ${focused ? '#2F54EB' : 'var(--border-default)'}`,
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 14,
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'all 0.2s ease',
          boxSizing: 'border-box',
          boxShadow: focused ? '0 0 0 4px rgba(47,84,235,0.08)' : 'none',
        }}
      />
    </div>
  );
}

function Textarea({ value, onChange, placeholder, label, rows = 5 }: InputProps & { rows?: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: 'var(--bg-card)',
          border: `1px solid ${focused ? '#2F54EB' : 'var(--border-default)'}`,
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 14,
          color: 'var(--text-primary)',
          outline: 'none',
          resize: 'vertical',
          transition: 'all 0.2s ease',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          boxShadow: focused ? '0 0 0 4px rgba(47,84,235,0.08)' : 'none',
        }}
      />
    </div>
  );
}

export default function EnterpriseApply() {
  const { t } = useTranslation();
  const location = useLocation();

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const submittingRef = useRef(false);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [estimatedUsage, setEstimatedUsage] = useState('');
  const [businessDesc, setBusinessDesc] = useState('');

  useEffect(() => {
    if (location.hash === '#contact') {
      requestAnimationFrame(() => {
        const el = document.getElementById('contact');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stats = useMemo(() => [1, 2, 3, 4].map((i) => ({
    value: t(`enterprise.stat${i}Value`),
    label: t(`enterprise.stat${i}Label`),
    note: t(`enterprise.stat${i}Note`),
  })), [t]);

  const featureGroups = useMemo(() => [
    {
      eyebrow: t('enterprise.featureGroup1Eyebrow'),
      title: t('enterprise.featureGroup1Title'),
      desc: t('enterprise.featureGroup1Desc'),
      items: [1, 2, 3].map((i) => ({ title: t(`enterprise.feature${i}Title`), desc: t(`enterprise.feature${i}Desc`) })),
    },
    {
      eyebrow: t('enterprise.featureGroup2Eyebrow'),
      title: t('enterprise.featureGroup2Title'),
      desc: t('enterprise.featureGroup2Desc'),
      items: [4, 5, 6].map((i) => ({ title: t(`enterprise.feature${i}Title`), desc: t(`enterprise.feature${i}Desc`) })),
    },
  ], [t]);

  const fitCards = useMemo(() => [1, 2, 3].map((i) => ({
    title: t(`enterprise.fit${i}Title`),
    desc: t(`enterprise.fit${i}Desc`),
    points: [1, 2, 3].map((j) => t(`enterprise.fit${i}Point${j}`)),
  })), [t]);

  const processSteps = useMemo(() => [1, 2, 3, 4].map((i) => ({
    title: t(`enterprise.process${i}Title`),
    desc: t(`enterprise.process${i}Desc`),
  })), [t]);

  const trustPoints = useMemo(() => [1, 2, 3, 4].map((i) => t(`enterprise.trustPoint${i}`)), [t]);
  const contactSteps = useMemo(() => [1, 2, 3, 4].map((i) => t(`enterprise.contactStep${i}`)), [t]);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1100;
  const sectionX = isMobile ? 16 : isTablet ? 24 : 40;
  const heroGrid = isMobile || isTablet ? '1fr' : 'minmax(0,1.1fr) minmax(320px,0.9fr)';
  const statsGrid = isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';
  const fitGrid = isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
  const processGrid = isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';
  const contactGrid = isMobile || isTablet ? '1fr' : 'minmax(0,0.95fr) minmax(340px,1.05fr)';
  const featureGrid = isMobile || isTablet ? '1fr' : 'minmax(220px,0.42fr) minmax(0,0.58fr)';
  const formGrid = isMobile ? '1fr' : '1fr 1fr';

  const validate = () => {
    const company = companyName.trim();
    const contact = contactName.trim();
    const email = contactEmail.trim();
    if (!company) { notifyApiError(t('enterprise.companyNameRequired')); return false; }
    if (company.length > 30) { notifyApiError('公司名称需在30字以内'); return false; }
    if (!contact) { notifyApiError(t('enterprise.contactNameRequired')); return false; }
    if (contact.length > 20) { notifyApiError('用户名需在20字以内'); return false; }
    if (!email) { notifyApiError(t('enterprise.emailRequired')); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notifyApiError(t('enterprise.emailInvalid'));
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validate()) return;
    const email = contactEmail.trim();
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await submitEnterpriseApplication({
        company_name: companyName,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: email,
        estimated_usage: estimatedUsage,
        business_desc: businessDesc,
      });
      if (res.data.success) {
        setSubmitted(true);
      } else {
        notifyApiError(res.data.message || t('enterprise.submissionFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'enterprise.submissionFailed' });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <Header />

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: `68px ${sectionX}px 36px` }}>
        <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: heroGrid, gap: isMobile ? 18 : 28, alignItems: 'stretch' }}>
          <div style={{ paddingRight: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(47,84,235,0.12)', background: 'rgba(47,84,235,0.06)', color: '#2F54EB', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 18 }}>
              {t('enterprise.badge')}
            </div>
            <h1 className="landing-hero-title" style={{ fontSize: 'clamp(38px,5.5vw,62px)', lineHeight: 1.04, letterSpacing: '-0.05em', margin: '0 0 18px', fontWeight: 820, maxWidth: 720 }}>
              {t('enterprise.heroTitle')}
            </h1>
            <p className="landing-hero-subtitle" style={{ fontSize: 17, lineHeight: 1.85, color: 'var(--text-secondary)', maxWidth: 660, margin: '0 0 24px' }}>
              {t('enterprise.heroSubtitle')}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
              <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2F54EB', color: '#fff', borderRadius: 12, padding: '13px 22px', textDecoration: 'none', fontWeight: 700, boxShadow: '0 14px 34px rgba(47,84,235,0.20)', width: isMobile ? '100%' : 'auto' }}>
                {t('enterprise.contactButton')}
              </a>
              <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-hover)', color: 'var(--text-primary)', borderRadius: 12, padding: '13px 22px', textDecoration: 'none', fontWeight: 600, background: 'var(--bg-base)', width: isMobile ? '100%' : 'auto' }}>
                {t('enterprise.pricingButton')}
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              {trustPoints.map((item) => (
                <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: '#16a34a' }}>●</span>
                  {item}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: fitGrid, gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ padding: '18px 16px', borderRadius: 18, border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, marginBottom: 8 }}>{t(`enterprise.heroCard${i}Eyebrow`)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t(`enterprise.heroCard${i}Title`)}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-tertiary)' }}>{t(`enterprise.heroCard${i}Desc`)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderRadius: 24, padding: 24, background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))', color: '#fff', boxShadow: '0 28px 80px rgba(15,23,42,0.22)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 'auto -30px -40px auto', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.34), rgba(59,130,246,0))' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.66)', marginBottom: 6 }}>{t('enterprise.solutionEyebrow')}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{t('enterprise.solutionTitle')}</div>
                </div>
                <span style={{ padding: '6px 10px', borderRadius: 999, background: 'var(--border-default)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: 'rgba(255,255,255,0.86)' }}>{t('enterprise.solutionBadge')}</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,0.78)', margin: '0 0 18px' }}>{t('enterprise.solutionDesc')}</p>
              <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-default)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t(`enterprise.solutionRow${i}Title`)}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.66)' }}>{t(`enterprise.solutionRow${i}Desc`)}</div>
                    </div>
                    <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700, whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{t(`enterprise.solutionRow${i}Meta`)}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 16px 0', borderTop: '1px solid var(--border-default)', display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>{t('enterprise.solutionFootnote')}</div>
                <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, width: '100%', borderRadius: 12, background: '#fff', color: '#0f172a', textDecoration: 'none', fontWeight: 700 }}>
                  {t('enterprise.solutionCta')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `28px ${sectionX}px` }}>
          <div className="grid-4col" style={{ display: 'grid', gridTemplateColumns: statsGrid, gap: 16 }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{ padding: '18px 18px 16px', borderRadius: 18, border: '1px solid rgba(15,23,42,0.06)' }}>
                <div style={{ fontSize: 34, fontWeight: 820, letterSpacing: '-0.04em', marginBottom: 6 }}>{stat.value}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--text-tertiary)' }}>{stat.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: `88px ${sectionX}px 24px` }}>
        <div style={{ maxWidth: 700, marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 10 }}>{t('enterprise.featureSectionEyebrow')}</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', lineHeight: 1.12, letterSpacing: '-0.04em', margin: '0 0 12px' }}>{t('enterprise.featuresTitle')}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', margin: 0 }}>{t('enterprise.featuresSubtitle')}</p>
        </div>
        <div style={{ display: 'grid', gap: 20 }}>
          {featureGroups.map((group) => (
            <div key={group.title} style={{ border: '1px solid var(--border-default)', borderRadius: 24, padding: 24, background: 'var(--bg-card)' }}>
              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: featureGrid, gap: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>{group.eyebrow}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, marginBottom: 10 }}>{group.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{group.desc}</div>
                </div>
                <div style={{ display: 'grid', gap: 14 }}>
                  {group.items.map((item) => (
                    <div key={item.title} style={{ padding: '18px 18px', borderRadius: 18, background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{item.title}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-tertiary)' }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: `48px ${sectionX}px 24px` }}>
        <div style={{ maxWidth: 720, marginBottom: 26 }}>
          <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 10 }}>{t('enterprise.fitEyebrow')}</div>
          <h2 style={{ fontSize: 'clamp(26px,3.6vw,38px)', margin: '0 0 12px', letterSpacing: '-0.03em' }}>{t('enterprise.fitTitle')}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', margin: 0 }}>{t('enterprise.fitSubtitle')}</p>
        </div>
        <div className="grid-3col" style={{ display: 'grid', gridTemplateColumns: fitGrid, gap: 16 }}>
          {fitCards.map((card) => (
            <div key={card.title} style={{ padding: 22, borderRadius: 22, border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{card.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 14 }}>{card.desc}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {card.points.map((point) => (
                  <div key={point} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                    <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `80px ${sectionX}px` }}>
          <div style={{ maxWidth: 680, marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 10 }}>{t('enterprise.processEyebrow')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.8vw,38px)', margin: '0 0 12px', letterSpacing: '-0.03em' }}>{t('enterprise.processTitle')}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)', margin: 0 }}>{t('enterprise.processSubtitle')}</p>
          </div>
          <div className="grid-4col" style={{ display: 'grid', gridTemplateColumns: processGrid, gap: 16 }}>
            {processSteps.map((step, index) => (
              <div key={step.title} style={{ padding: 22, borderRadius: 20, border: '1px solid var(--border-default)', background: 'var(--bg-base)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(47,84,235,0.1)', color: '#2F54EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: 14 }}>{index + 1}</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{step.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-tertiary)' }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" style={{ maxWidth: 1180, margin: '0 auto', padding: `88px ${sectionX}px 96px` }}>
        <div className="landing-contact-grid" style={{ display: 'grid', gridTemplateColumns: contactGrid, gap: 28, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 12, color: '#2F54EB', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 10 }}>{t('enterprise.contactEyebrow')}</div>
            <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '0 0 14px', letterSpacing: '-0.04em' }}>{t('enterprise.contactSectionTitle')}</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.85, margin: '0 0 20px', maxWidth: 560 }}>{t('enterprise.contactSectionDescription')}</p>

            <div style={{ padding: 22, borderRadius: 22, background: 'var(--bg-card)', border: '1px solid var(--border-default)', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t('enterprise.contactWhatToPrepareTitle')}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {contactSteps.map((step) => (
                  <div key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
                    <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: 22, borderRadius: 22, background: 'linear-gradient(180deg, rgba(47,84,235,0.06), rgba(47,84,235,0.02))', border: '1px solid rgba(47,84,235,0.12)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{t('enterprise.contactCommitmentTitle')}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 12 }}>{t('enterprise.contactCommitmentDesc')}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                    {t(`enterprise.contactCommitmentItem${i}`)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            {submitted ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 24, padding: '52px 36px', textAlign: 'center', boxShadow: '0 18px 50px rgba(15,23,42,0.06)' }}>
                <CheckCircleOutlined style={{ fontSize: 56, color: '#22c55e', marginBottom: 18 }} />
                <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{t('enterprise.submissionSuccessTitle')}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 22 }}>{t('enterprise.submissionSuccessDescription')}</p>
                <div style={{ display: 'grid', gap: 8, marginBottom: 24, textAlign: 'left', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>{t(`enterprise.submissionSuccessItem${i}`)}</div>
                  ))}
                </div>
                <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 22px', borderRadius: 12, textDecoration: 'none', background: '#2F54EB', color: '#fff', fontWeight: 700 }}>
                  {t('enterprise.backToHome')}
                </Link>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 24, padding: 26, boxShadow: '0 22px 64px rgba(15,23,42,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t('enterprise.formTitle')}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{t('enterprise.formIntro')}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('enterprise.formSlaHint')}</div>
                </div>

                <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: formGrid, gap: 14 }}>
                  <TextInput label={t('enterprise.formCompanyName')} required maxLength={30} value={companyName} onChange={setCompanyName} placeholder={t('enterprise.formCompanyNamePlaceholder')} />
                  <TextInput label={t('enterprise.formContactName')} required maxLength={20} value={contactName} onChange={setContactName} placeholder={t('enterprise.formContactNamePlaceholder')} />
                </div>
                <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: formGrid, gap: 14 }}>
                  <TextInput label={t('enterprise.formEmail')} required type="email" value={contactEmail} onChange={setContactEmail} placeholder={t('enterprise.formEmailPlaceholder')} />
                  <TextInput label={t('enterprise.formPhone')} type="tel" value={contactPhone} onChange={setContactPhone} placeholder={t('enterprise.formPhonePlaceholder')} />
                </div>
                <TextInput label={t('enterprise.formEstimatedUsage')} value={estimatedUsage} onChange={setEstimatedUsage} placeholder={t('enterprise.formEstimatedUsagePlaceholder')} />
                <Textarea label={t('enterprise.formBusinessDescription')} value={businessDesc} onChange={setBusinessDesc} placeholder={t('enterprise.formBusinessDescPlaceholder')} rows={5} />

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ width: '100%', minHeight: 48, borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, background: '#2F54EB', color: '#fff', opacity: loading ? 0.75 : 1, boxShadow: '0 14px 34px rgba(47,84,235,0.18)' }}
                >
                  {loading ? <Spin size="small" /> : t('enterprise.formSubmitButton')}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.7 }}>
                  {t('enterprise.formDisclaimer')}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
