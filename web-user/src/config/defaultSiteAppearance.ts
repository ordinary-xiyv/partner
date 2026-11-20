import type { TFunction } from 'i18next';
import { DEFAULT_SITE_BRAND_EN, DEFAULT_SITE_BRAND_ZH } from './siteBrand';
import { getDocsHomeUrl } from './docs';
import type { SiteAppearance } from '../types/siteAppearance';
import { buildDefaultMarketingBannerConfig } from './defaultMarketingBanner';
import { buildDefaultCustomerServiceConfig } from './defaultCustomerService';
import { buildDefaultFooterBrandConfig } from './defaultFooterBrand';
import { buildDefaultLoginMediaConfig } from './defaultLoginMedia';

const TTS_APP_URL = 'http://124.174.93.46:8081/';

/** 与当前 Footer.tsx 默认五列结构对齐 */
export function buildDefaultSiteAppearance(t: TFunction, docsUrl: string = getDocsHomeUrl()): SiteAppearance {
  return {
    brand_name_zh: DEFAULT_SITE_BRAND_ZH,
    brand_name_en: DEFAULT_SITE_BRAND_EN,
    copyright_text: '',
    terms_label: t('footer.terms'),
    privacy_label: t('footer.privacy'),
    beian_label: '浙ICP备2026017573号-1',
    layout_config: {
      show_theme_switcher: true,
      show_language_switcher: true,
    },
    header_config: {
      enabled: true,
      items: [
        {
          id: 'models',
          label_zh: t('header.navModels'),
          label_en: t('header.navModels'),
          type: 'internal',
          path: '/models',
          visible: true,
          sort: 10,
        },
        {
          id: 'app-plaza',
          label_zh: t('header.navAppPlaza'),
          label_en: t('header.navAppPlaza'),
          type: 'dropdown',
          visible: true,
          sort: 20,
          dropdown_items: [
            {
              id: 'tts',
              label_zh: t('header.navTtsApp'),
              label_en: t('header.navTtsApp'),
              href: TTS_APP_URL,
              visible: true,
              sort: 10,
            },
          ],
        },
        {
          id: 'chat',
          label_zh: t('header.navChat'),
          label_en: t('header.navChat'),
          type: 'internal',
          path: '/dashboard',
          visible: true,
          sort: 30,
        },
        {
          id: 'enterprise',
          label_zh: t('header.navEnterprise'),
          label_en: t('header.navEnterprise'),
          type: 'internal',
          path: '/enterprise/apply',
          visible: true,
          sort: 40,
        },
        {
          id: 'pricing',
          label_zh: t('header.navPricing'),
          label_en: t('header.navPricing'),
          type: 'internal',
          path: '/pricing',
          visible: true,
          sort: 50,
        },
        {
          id: 'docs',
          label_zh: t('header.navDocs'),
          label_en: t('header.navDocs'),
          type: 'internal',
          path: docsUrl,
          visible: true,
          sort: 60,
        },
      ],
    },
    footer_copyright_config: {
      enabled: true,
    },
    footer_columns_config: {
      enabled: true,
      columns: [
        {
          id: 'about',
          title_zh: t('footer.aboutTitle'),
          title_en: t('footer.aboutTitle'),
          visible: true,
          sort: 10,
          links: [
            { id: 'about-co', label_zh: t('footer.aboutCompany'), label_en: t('footer.aboutCompany'), type: 'internal', path: '/about', visible: true, sort: 10 },
            { id: 'about-ent', label_zh: t('footer.aboutEnterprise'), label_en: t('footer.aboutEnterprise'), type: 'internal', path: '/enterprise/apply', visible: true, sort: 20 },
            { id: 'about-trust', label_zh: t('footer.aboutTrust'), label_en: t('footer.aboutTrust'), type: 'internal', path: '/trust', visible: true, sort: 30 },
            { id: 'about-legal', label_zh: t('footer.aboutLegal'), label_en: t('footer.aboutLegal'), type: 'internal', path: '/legal', visible: true, sort: 40 },
            { id: 'about-news', label_zh: t('footer.aboutNews'), label_en: t('footer.aboutNews'), type: 'internal', path: '/news', visible: true, sort: 50 },
          ],
        },
        {
          id: 'billing',
          title_zh: t('footer.billingTitle'),
          title_en: t('footer.billingTitle'),
          visible: true,
          sort: 20,
          links: [
            { id: 'bill-topup', label_zh: t('footer.billingTopup'), label_en: t('footer.billingTopup'), type: 'internal', path: '/topup', visible: true, sort: 10 },
            { id: 'bill-rec', label_zh: t('footer.billingRecords'), label_en: t('footer.billingRecords'), type: 'internal', path: '/billing', visible: true, sort: 20 },
            { id: 'bill-sub', label_zh: t('footer.billingSubscription'), label_en: t('footer.billingSubscription'), type: 'internal', path: '/subscription', visible: true, sort: 30 },
            { id: 'bill-acct', label_zh: t('footer.billingAccount'), label_en: t('footer.billingAccount'), type: 'internal', path: '/profile', visible: true, sort: 40 },
          ],
        },
        {
          id: 'products',
          title_zh: t('footer.productsTitle'),
          title_en: t('footer.productsTitle'),
          visible: true,
          sort: 30,
          links: [
            { id: 'prod-api', label_zh: t('footer.productsApi'), label_en: t('footer.productsApi'), type: 'internal', path: docsUrl, visible: true, sort: 10 },
            { id: 'prod-models', label_zh: t('footer.productsModels'), label_en: t('footer.productsModels'), type: 'internal', path: '/models', visible: true, sort: 20 },
            { id: 'prod-chat', label_zh: t('footer.productsChat'), label_en: t('footer.productsChat'), type: 'internal', path: '/dashboard', visible: true, sort: 30 },
          ],
        },
        {
          id: 'support',
          title_zh: t('footer.supportTitle'),
          title_en: t('footer.supportTitle'),
          visible: true,
          sort: 40,
          links: [
            { id: 'sup-docs', label_zh: t('footer.supportDocs'), label_en: t('footer.supportDocs'), type: 'internal', path: docsUrl, visible: true, sort: 10 },
            { id: 'sup-consult', label_zh: t('footer.supportConsulting'), label_en: t('footer.supportConsulting'), type: 'internal', path: '/consulting', visible: true, sort: 20 },
            { id: 'sup-ann', label_zh: t('footer.supportAnnouncements'), label_en: t('footer.supportAnnouncements'), type: 'internal', path: '/announcements', visible: true, sort: 30 },
            { id: 'sup-plans', label_zh: t('footer.supportPlans'), label_en: t('footer.supportPlans'), type: 'internal', path: '/support-plans', visible: true, sort: 40 },
            { id: 'sup-status', label_zh: t('footer.supportStatus'), label_en: t('footer.supportStatus'), type: 'internal', path: '/status-page', visible: true, sort: 50 },
          ],
        },
        {
          id: 'links',
          title_zh: t('footer.linksTitle'),
          title_en: t('footer.linksTitle'),
          visible: false,
          sort: 50,
          links: [
            { id: 'link-openai', label_zh: 'OpenAI', label_en: 'OpenAI', type: 'external', href: 'https://openai.com', visible: true, sort: 10 },
            { id: 'link-anthropic', label_zh: 'Anthropic', label_en: 'Anthropic', type: 'external', href: 'https://anthropic.com', visible: true, sort: 20 },
            { id: 'link-google', label_zh: 'Google AI', label_en: 'Google AI', type: 'external', href: 'https://ai.google', visible: true, sort: 30 },
            { id: 'link-deepseek', label_zh: 'DeepSeek', label_en: 'DeepSeek', type: 'external', href: 'https://deepseek.com', visible: true, sort: 40 },
          ],
        },
      ],
    },
    footer_brand_config: buildDefaultFooterBrandConfig(),
    marketing_banner_config: buildDefaultMarketingBannerConfig(),
    customer_service_config: buildDefaultCustomerServiceConfig(),
    login_media_config: buildDefaultLoginMediaConfig(),
  };
}
