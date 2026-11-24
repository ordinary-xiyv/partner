import type { TFunction } from 'i18next';
import { DEFAULT_SITE_BRAND_EN, DEFAULT_SITE_BRAND_ZH } from './siteBrand';
import { getDocsHomeUrl } from './docs';
import type { SiteAppearance } from '../types/siteAppearance';
import { buildDefaultCustomerServiceConfig } from './defaultCustomerService';
import { buildDefaultFooterBrandConfig } from './defaultFooterBrand';
import { buildDefaultLoginMediaConfig } from './defaultLoginMedia';

const TTS_APP_URL = 'http://124.174.93.46:8081/';

/**
 * 站点外观默认值。
 *
 * footer_columns_config.columns 固定为空数组：页脚五列导航已经下线，
 * Footer.tsx 只渲染版权行。字段本身保留，因为：
 *   · 平台侧 /api/lynx/branding/site 仍会下发这个结构，
 *     类型删了反而要在 merge 层做大范围兼容
 *   · siteAppearanceRouteAccess 仍在遍历它建「站内路径 → 是否有可见入口」
 *     映射；空数组对结果是中性的，不需要改那段逻辑
 */
export function buildDefaultSiteAppearance(t: TFunction, docsUrl: string = getDocsHomeUrl()): SiteAppearance {
  return {
    brand_name_zh: DEFAULT_SITE_BRAND_ZH,
    brand_name_en: DEFAULT_SITE_BRAND_EN,
    copyright_text: '',
    terms_label: t('footer.terms'),
    privacy_label: t('footer.privacy'),
    /*
     * 备案号默认留空。
     *
     * 原来这里写死了平台的 '浙ICP备2026017573号-1'。问题是这个默认值会被
     * 所有没配过页脚的站点继承 —— 分销商站在自己域名下挂平台的备案号，
     * 既误导访客（以为这站是平台运营的），也把平台拖进了不属于它的合规责任。
     *
     * 备案号的真实来源应该是平台运营在 /api/lynx/config/footer 里配的那一条，
     * 已经由 mergeSiteAppearance 从 footer 接口取值。这里再写死一份，
     * 只会在「接口没返回」时冒出来，属于纯粹的隐患。
     * 留空 = 没配就不显示，和「商户主动清空」表现一致。
     */
    beian_label: '',
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
      enabled: false,
      columns: [],
    },
    footer_brand_config: buildDefaultFooterBrandConfig(),
    customer_service_config: buildDefaultCustomerServiceConfig(),
    login_media_config: buildDefaultLoginMediaConfig(),
  };
}
