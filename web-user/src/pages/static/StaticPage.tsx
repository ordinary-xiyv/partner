import React from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

interface StaticPageProps {
  title: string;
  children: React.ReactNode;
}

export default function StaticPage({ title, children }: StaticPageProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 860, margin: '0 auto', padding: '80px 40px 72px', width: '100%' }}>
        <div style={{ maxWidth: 760 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24, letterSpacing: '-0.03em' }}>{title}</h1>
          <div
            style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--text-secondary)' }}
            className="static-page-content"
          >
            {children}
          </div>
        </div>
      </main>
      <Footer />
      <style>{`
        .static-page-content p { margin: 0 0 18px; }
        .static-page-content h2 {
          margin: 36px 0 12px;
          font-size: 20px;
          line-height: 1.35;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        .static-page-content ul {
          margin: 0 0 12px 0;
          padding-left: 20px;
        }
        .static-page-content li { margin: 0 0 8px; }
        .static-page-content .static-page-cta {
          margin-top: 36px;
          padding: 22px 24px;
          border-radius: 16px;
          border: 1px solid var(--border-default);
          background: var(--bg-card);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .static-page-content .static-page-cta strong {
          display: block;
          margin-bottom: 8px;
          font-size: 16px;
          color: var(--text-primary);
        }
        .static-page-content .static-page-cta p {
          margin: 0;
        }
        .static-page-content .static-page-cta-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .static-page-content .static-page-cta-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 16px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          color: var(--text-primary);
          border: 1px solid var(--border-default);
          background: var(--bg-base);
        }
        .static-page-content .static-page-cta-actions a:first-child {
          background: #2F54EB;
          color: #fff;
          border-color: #2F54EB;
        }
        .static-page-content .static-hero-note {
          padding: 22px 24px;
          border-radius: 18px;
          border: 1px solid rgba(47,84,235,0.12);
          background: linear-gradient(135deg, rgba(47,84,235,0.08), rgba(255,255,255,0.92));
          margin-bottom: 22px;
        }
        .static-page-content .static-hero-note strong {
          display: block;
          font-size: 16px;
          line-height: 1.7;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .static-page-content .static-hero-note p {
          margin: 0;
        }
        .static-page-content .static-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin: 0 0 18px;
        }
        .static-page-content .static-feature-card {
          padding: 22px 24px;
          border-radius: 18px;
          border: 1px solid var(--border-default);
          background: var(--bg-card);
        }
        .static-page-content .static-feature-card h2 {
          margin-top: 0;
        }
        .static-page-content .static-highlight-card {
          padding: 24px;
          border-radius: 20px;
          border: 1px solid rgba(15,23,42,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94));
        }
        .static-page-content .static-kicker {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(47,84,235,0.08);
          color: #2F54EB;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        @media (max-width: 768px) {
          .static-page-content .static-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
