import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  ColorPicker,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  ExportOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  AppPageHeader,
  BrandLogo,
  BrandPreview,
  HomeStylePicker,
  PagePanel,
  PageStack,
  UseMockNotice,
  DEFAULT_HOME_STYLE,
  dealerApi,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
  parseHomeStyle,
  readableOnPrimary,
} from '@lynx/shared';
import type {
  HomeStyle,
  TenantBrand,
  TenantBrandUpdatePayload,
  TenantDomain,
  TenantSupport,
} from '@lynx/shared';
import type { BrandImageTarget } from '@lynx/shared';

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

/**
 * 表单只覆盖这 8 个核心字段，与 lc_distribution_merchants 上的 8 个 brand_* 列一一对应：
 *   name → brand_name        short_name → brand_short_name
 *   logo_url → brand_logo_url            primary_color → brand_primary_color
 *   page_title → brand_page_title        favicon_url → brand_favicon_url
 *   tagline → brand_tagline              api_base_url → brand_api_base_url
 *
 * 客服联系方式（brand_support）在下面单独一段，因为它是一个 jsonb 对象，
 * 不是单列；首页配置（brand_landing）本期不做。
 */
type FormValues = {
  name: string;
  short_name?: string;
  page_title: string;
  tagline?: string;
  api_base_url?: string;
  logo_url?: string;
  favicon_url?: string;
  support_email?: string;
  support_phone?: string;
  support_wechat?: string;
  support_note?: string;
  /* 页脚版权行。存在 brand_landing.footer，语义见 TenantLandingFooter */
  footer_copyright_text?: string;
  footer_terms_label?: string;
  footer_privacy_label?: string;
  footer_beian_label?: string;
  footer_enabled?: boolean;
};

function toFormValues(brand: TenantBrand): FormValues {
  const footer = brand.landing?.footer;
  return {
    name: brand.name,
    short_name: brand.short_name,
    page_title: brand.page_title,
    tagline: brand.tagline,
    api_base_url: brand.api_base_url,
    logo_url: brand.logo_url,
    favicon_url: brand.favicon_url,
    support_email: brand.support?.email,
    support_phone: brand.support?.phone,
    support_wechat: brand.support?.wechat,
    support_note: brand.support?.note,
    /*
     * null 和空串在这里必须区分开（见 TenantLandingFooter 的注释）：
     *   null  → 没配过，输入框留空，但不能当成「商户想清空」提交
     *   ''    → 商户明确清空，输入框也留空，但语义不同
     * 表单值没法表达这个差别，所以只填「有值」的情况；
     * 「是否明确清空过」由 buildPatch 比对 brand 原始值来判断。
     */
    footer_copyright_text: footer?.copyright_text ?? undefined,
    footer_terms_label: footer?.terms_label ?? undefined,
    footer_privacy_label: footer?.privacy_label ?? undefined,
    footer_beian_label: footer?.beian_label ?? undefined,
    /*
     * 没配过时显示「开启」。
     *
     * 这是客户站的实际表现：footer_copyright_config.enabled 的默认值是
     * true，商户没动过就是显示状态。界面跟着显示开启，才不会出现
     * 「后台看是关的、客户站却在显示」的错位。
     *
     * 注意 buildPatch 会区分「原始没配」和「用户真的关了」，所以
     * 这里显示 true 不会导致无改动也写库。
     */
    footer_enabled: footer?.enabled ?? true,
  };
}

/**
 * 解析图片字段「用户最终想要的值」。
 *
 * 为什么不能直接用 Form 里的 values.logo_url：
 *
 *   图片上传不走表单提交，而是在上传成功的瞬间由后端直接写库
 *   （见 uploadBrandImage 的注释）。上传完只会 setBrand(最新品牌)，
 *   Form 里的那个字段值仍然是上传前的旧值 —— antd 的 initialValues
 *   只在挂载或 key 变化时读一次，setBrand 不会回流到 Form。
 *
 *   结果就是点保存时出现：
 *     values.logo_url = ''        （Form 的旧值）
 *     brand.logo_url  = 'https…'  （刚上传的新值）
 *   两者不等 → 判定为「用户改过」→ 提交空串 → 把刚传的图清掉。
 *   页面上表现为「提示上传成功，但过一会儿图就没了」。
 *
 * 所以图片字段的意图只能看 draft：
 *   draft 里没有该键        → 用户没动过图片，保持服务端现值（不提交）
 *   draft 里是 url          → 用户上传/手填了这张，提交它
 *   draft 里是空串          → 用户点了「移除」，提交空串把它清掉
 *
 * 这样即使 Form 里的值再脏，也不会把已经写进库的 logo 误清除。
 */
function resolveImageField(
  draftValue: string | undefined,
  serverValue: string | undefined,
): string | undefined {
  // draft 没碰过 → 返回 undefined 表示「不纳入 patch」
  if (draftValue === undefined) return undefined;
  const next = draftValue.trim();
  // 与服务端现值相同就不必提交，避免无谓的写库
  return next === (serverValue ?? '') ? undefined : next;
}

/**
 * 只把「和线上不一致」的字段放进提交体。
 *
 * 后端的语义是「传了才写」，所以把整份配置无脑回传的后果是：这次请求没打算
 * 碰的列也被覆盖一遍。单人操作看不出问题，等将来有「平台运营改一下、
 * 商户自己也改一下」的并发场景，就会出现「我只改了标题，logo 怎么回到旧值了」。
 * 这里做 diff，让每次保存只改动用户真正动过的那几格。
 */
function buildPatch(
  brand: TenantBrand,
  values: FormValues,
  draft: TenantBrandUpdatePayload,
): TenantBrandUpdatePayload {
  const patch: TenantBrandUpdatePayload = {};
  const nextName = values.name.trim();
  const nextShort = values.short_name?.trim() ?? '';
  const nextTitle = values.page_title.trim();
  const nextTagline = values.tagline?.trim() ?? '';
  const nextAPI = values.api_base_url?.trim() ?? '';

  // 品牌名是必填列，且它会带动首字标记/标题的默认值，所以只要有变化就一起算
  if (nextName && nextName !== brand.name) patch.name = nextName;
  if (nextShort !== (brand.short_name ?? '')) patch.short_name = nextShort;
  if (nextTitle && nextTitle !== brand.page_title) patch.page_title = nextTitle;
  if (nextTagline !== (brand.tagline ?? '')) patch.tagline = nextTagline;
  if (nextAPI !== (brand.api_base_url ?? '')) patch.api_base_url = nextAPI;

  /*
   * 主色。
   *
   * 这一格不在 Form 里，改色只写 draft（见 ColorPicker / 预设色块的 onChangeComplete），
   * 所以必须从 draft 取，不能从 values 取。
   *
   * 注意这里是个**真实踩过的坑**：把全量提交改成只提交差异字段时，主色漏了进来，
   * 表现为「选完颜色点保存 → 提示没有改动，无需保存」。draft 明明有值，
   * 但 patch 是空的，所以走了空 patch 分支。加字段时务必回头核对每个 draft 键
   * 是否都有一条对应的 patch 出口。
   *
   * 比较时统一小写：ColorPicker 的 toHexString() 稳定输出小写，
   * 但库里的历史值可能是大写（#0D9488），不归一化会误判成「改过」而重复写库。
   */
  const nextPrimary = draft.primary_color?.trim().toLowerCase();
  if (nextPrimary && nextPrimary !== (brand.primary_color ?? '').toLowerCase()) {
    patch.primary_color = nextPrimary;
  }

  // 图片字段走 draft，理由见 resolveImageField 的注释
  const nextLogo = resolveImageField(draft.logo_url, brand.logo_url);
  const nextFavicon = resolveImageField(draft.favicon_url, brand.favicon_url);
  if (nextLogo !== undefined) patch.logo_url = nextLogo;
  if (nextFavicon !== undefined) patch.favicon_url = nextFavicon;

  const nextSupport = {
    email: values.support_email?.trim() || undefined,
    phone: values.support_phone?.trim() || undefined,
    wechat: values.support_wechat?.trim() || undefined,
    note: values.support_note?.trim() || undefined,
  };
  const prev = brand.support ?? {};
  const textChanged =
    nextSupport.email !== (prev.email || undefined) ||
    nextSupport.phone !== (prev.phone || undefined) ||
    nextSupport.wechat !== (prev.wechat || undefined) ||
    nextSupport.note !== (prev.note || undefined);

  /*
   * 二维码也住在 brand_support 里，但它不由表单管理 —— 上传成功时后端已经
   * 直接写库了。这里只需要处理「用户点了移除」这一种情况。
   *
   * 判断依据沿用 draft：draft.support 里出现 qr_code_url 且和服务端不一致，
   * 才算改动过。没有这个键就是「没碰过」。
   */
  const draftQR = draft.support?.qr_code_url;
  const serverQR = typeof prev.qr_code_url === 'string' ? prev.qr_code_url.trim() : '';
  const nextQR = draftQR === undefined ? undefined : draftQR.trim();
  const qrChanged = nextQR !== undefined && nextQR !== serverQR;

  /*
   * 四个子字段全空时也要提交 {}，否则「把人家的客服信息清空」这件事
   * 在 diff 里看起来是「没变化」，用户点了保存却什么都没变。
   *
   * 二维码的两种情形要分开处理：
   *   · 没碰过二维码 → 原样带上服务端值。brand_support 是整体替换语义，
   *     只提交四个文字键会把二维码顶掉 —— 现象就是「传完二维码、回头改个
   *     电话保存，二维码就没了」。
   *   · 点了移除     → 不要带，让它在库里被清成 null。
   */
  if (textChanged || qrChanged) {
    const merged: TenantSupport = { ...nextSupport };
    if (qrChanged) {
      // 移除：不写入这个键，整体替换时自然就没了
      if (nextQR) merged.qr_code_url = nextQR;
    } else if (serverQR) {
      merged.qr_code_url = serverQR;
    }
    /*
     * 全部为空时提交 {}（显式清空）。用 Object.keys 判断而不是逐个取反 ——
     * 二维码也算内容，只有二维码、没填任何文字联系方式的商户不该被当成「空」。
     */
    patch.support = Object.keys(merged).length > 0 ? merged : {};
  }

  /*
   * 首页风格。
   *
   * 后端对 landing 是「整体替换」语义（而不是深合并），所以这里必须
   * 把 brand.landing 里其余的字段一起带上，否则只提交 { layout_style }
   * 会把商户已经配好的首页标题、卖点、自助注册开关全部抹掉。
   *
   * 这一点很容易写错：界面上的选择器只管一个下拉，看起来改的就是一个字段；
   * 但真正在网络层发出去的是整个 jsonb 对象。把合并放在这里而不是
   * 放到后端做深合并，是因为后端那句「整体替换」的语义有明确理由
   * （卖点列表删除后不该复活，见 TenantBrandUpdatePayload 的注释），
   * 不能为了这一个字段就把那个语义改掉。
   */
  const draftStyle = draft.landing?.layout_style;
  /*
   * 只有 draft 里真的带了 layout_style 才参与比较。
   *
   * 这里曾经写成 `parseHomeStyle(draft.landing?.layout_style)`，
   * 而 parseHomeStyle(undefined) 会返回默认值 editorial —— 于是
   * 「用户只改了标语、压根没碰风格选择器」的那次保存，会被判成
   * 「用户把风格改成了 editorial」，把商户原选的 terminal 覆盖掉。
   * 现象就是：进去是终端网格，改点别的保存一下，客户站变成纸感编辑。
   *
   * 判断依据必须是「draft 里有没有这个键」，不是「解析出来是什么值」。
   * 这和 resolveImageField 的语义一致：没碰过 = 不纳入 patch。
   */
  if (draftStyle !== undefined) {
    const nextHomeStyle = parseHomeStyle(draftStyle);
    const prevHomeStyle = parseHomeStyle(brand.landing?.layout_style);
    if (nextHomeStyle !== prevHomeStyle) {
      patch.landing = {
        ...(brand.landing ?? {}),
        ...(patch.landing ?? {}),
        layout_style: nextHomeStyle,
      };
    }
  }

  /*
   * 页脚版权行。
   *
   * 和首页风格一样存在 brand_landing 里，所以同样要遵守「整体替换」的
   * 约束：必须把 landing 里其余字段一起带上，否则保存页脚会把商户
   * 已经配好的首页标题、卖点全部抹掉。上面那段 layout_style 的合并
   * 已经铺了底（patch.landing 里带着 brand.landing 的全部内容），
   * 这里只需把 footer 挂上去。
   *
   * 三态判断：表单值 trim 后与原始值比对。
   *   · 原本有值、现在被清空 → 提交空串（语义：隐藏这一项）
   *   · 原本没配、现在还是空 → 不提交（语义：没动过）
   * 少了这个区分，商户「什么都没改点保存」会把四个字段全写成空串，
   * 客户站的备案号、版权文字会一次性消失。
   */
  const prevFooter = brand.landing?.footer;
  const nextFooter: Record<string, unknown> = {};
  /** 真正的「有变化」。保持原值不算 —— 见下面 setFooterField 的注释 */
  let footerChanged = false;

  const setFooterField = (
    key: 'copyright_text' | 'terms_label' | 'privacy_label' | 'beian_label',
    nextValue: string | undefined,
  ) => {
    const prevValue = prevFooter?.[key];
    const normalized = nextValue?.trim() ?? '';
    const prevNormalized = typeof prevValue === 'string' ? prevValue.trim() : '';
    if (normalized === prevNormalized) {
      /*
       * 没变化。但如果原始数据里本来就有值，必须把它带回 nextFooter ——
       * landing 是整体替换语义，不带等于把商户原有的配置删掉。
       *
       * 注意这里**不能**把 footerChanged 置为 true：那会让「只改了标语」
       * 的一次保存顺带重写整块 footer，updated_at 也跟着空跳。
       * 保持原值是「为了不丢失」，不是「用户改了这个」。
       */
      if (typeof prevValue === 'string') {
        nextFooter[key] = prevValue;
      }
      return;
    }
    nextFooter[key] = normalized;
    footerChanged = true;
  };

  setFooterField('copyright_text', values.footer_copyright_text);
  setFooterField('terms_label', values.footer_terms_label);
  setFooterField('privacy_label', values.footer_privacy_label);
  setFooterField('beian_label', values.footer_beian_label);

  /*
   * 显隐开关。
   *
   * 基线必须是「表单打开时显示的那个值」，不能是「库里存没存过这个键」。
   *
   * 这里踩过一个死循环式的坑：早先写成
   *     prevFooterEnabled = 库里是布尔值 ? 它 : undefined
   *     if (prevFooterEnabled !== undefined && 变了) 才写库
   * 于是只要库里还没有 enabled，拨动开关就永远走不进写库分支 ——
   * 表现为：① 切开关点保存提示「没有改动，无需保存」；② 就算配合文字一起
   * 保存成功，footer 里依然不含 enabled，客户站拿到 null 回落到平台默认的
   * true，页脚照样显示。第一笔写入被自己的条件挡住了，之后永远写不进去。
   *
   * 正确做法：没配过时基线就是 toFormValues 显示的 true（客户站的真实表现），
   * 拿它跟表单值比较 ——
   *   · 没配 + 显示开 + 没动 → 相等 → 不写库（不凭空造 enabled: true）
   *   · 没配 + 显示开 + 关掉 → 不等 → 写 enabled: false ✅
   * 这样既不会无意义写库，也不会把用户的关闭动作吞掉。
   */
  const hasPrevFooterEnabled = typeof prevFooter?.enabled === 'boolean';
  const nextFooterEnabled = values.footer_enabled !== false;
  /** 表单打开时显示的值。没配过时与 toFormValues 保持一致，都是 true */
  const shownFooterEnabled = hasPrevFooterEnabled ? (prevFooter?.enabled as boolean) : true;
  if (nextFooterEnabled !== shownFooterEnabled) {
    nextFooter.enabled = nextFooterEnabled;
    footerChanged = true;
  } else if (hasPrevFooterEnabled) {
    // 没变也要带回去，理由同上：整体替换
    nextFooter.enabled = prevFooter?.enabled as boolean;
  }

  if (footerChanged) {
    patch.landing = {
      ...(brand.landing ?? {}),
      ...(patch.landing ?? {}),
      footer: nextFooter,
    };
  }

  return patch;
}

export default function Brand() {
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string>('');
  const [remountKey, setRemountKey] = useState(0);

  /**
   * 上传状态单独维护，不塞进 Form。
   *
   * 原因是上传是「异步副作用」而不是「表单值」：上传中要禁用按钮、显示进度条，
   * 而 Form 只知道最终值。混在一起会让 Form 的 validateTrigger 反复触发。
   */
  const [uploading, setUploading] = useState<'' | BrandImageTarget>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [form] = Form.useForm<FormValues>();

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
    if (!brand) return;
    // 传 draft：图片字段的改动意图记在这里，不在 Form 里（见 resolveImageField）
    const patch = buildPatch(brand, values, draft);
    if (Object.keys(patch).length === 0) {
      notifyApiSuccess('没有改动，无需保存');
      return;
    }
    setSaving(true);
    try {
      const next = await dealerApi.updateDealerBrand(patch);
      setBrand(next);
      setDraft({});
      setRemountKey((k) => k + 1);
      notifyApiSuccess('品牌配置已保存，客户站即刻生效');
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

      <Row gutter={[16, 16]}>
        {/* ---------- 左：表单 ---------- */}
        <Col xs={24} xl={14}>
          <PagePanel padded>
            <div className="lynx-section-title">基础信息</div>
            <Form
              key={remountKey}
              form={form}
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
                if (changed.logo_url !== undefined) next.logo_url = changed.logo_url;
                if (changed.favicon_url !== undefined) next.favicon_url = changed.favicon_url;
                /*
                 * 页脚五项也要进草稿。
                 *
                 * 原来这里只管「影响预览」的字段，页脚不在列 —— 而右侧的
                 * 「未保存 / 与线上一致」标签是看 Object.keys(draft) 的，
                 * 于是拨动「显示页脚」开关或改了版权文字之后，标签仍然写着
                 * 「与线上一致」。用户据此以为自己没改动，就不会去保存；
                 * 真去点了保存又撞上「没有改动，无需保存」，两处提示互相矛盾。
                 *
                 * 页脚确实不进预览面板（预览只画品牌名/logo/主色那一块），
                 * 但「有没有未保存改动」是全局判断，不该因为「不影响预览」
                 * 就漏掉。写进 draft.landing.footer 即可，buildPatch 仍然
                 * 从 Form values 取最终值，draft 在这里只承担「标记有改动」。
                 */
                const footerKeys: Array<keyof FormValues> = [
                  'footer_enabled',
                  'footer_copyright_text',
                  'footer_terms_label',
                  'footer_privacy_label',
                  'footer_beian_label',
                ];
                if (footerKeys.some((k) => changed[k] !== undefined)) {
                  next.landing = {
                    ...(draft.landing ?? brand?.landing ?? {}),
                    footer: {
                      ...(draft.landing?.footer ?? brand?.landing?.footer ?? {}),
                      ...(changed.footer_enabled !== undefined
                        ? { enabled: changed.footer_enabled }
                        : {}),
                      ...(changed.footer_copyright_text !== undefined
                        ? { copyright_text: changed.footer_copyright_text }
                        : {}),
                      ...(changed.footer_terms_label !== undefined
                        ? { terms_label: changed.footer_terms_label }
                        : {}),
                      ...(changed.footer_privacy_label !== undefined
                        ? { privacy_label: changed.footer_privacy_label }
                        : {}),
                      ...(changed.footer_beian_label !== undefined
                        ? { beian_label: changed.footer_beian_label }
                        : {}),
                    },
                  };
                }
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
                    extra="没配 logo 时用它，留空取品牌名首字"
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

              {/*
                接口基地址。

                校验规则与后端 brandBaseURLPattern 对齐：留空合法，非空必须是
                http/https 绝对地址。前端先拦一道，用户不用等提交才知道填错了。

                为什么非要 http(s)：这一格会直接拼进首页的 curl / Python 示例，
                用户照着复制。漏协议会拼出相对路径（看着对、复制出去是错的），
                伪协议（javascript: / data:）拼进代码块有注入风险。

                文案里「留空则用平台默认地址」是旧说法，已经不准了 —— 现在留空
                回落到访客当前访问的域名，不再指回主站。这一点必须说清楚，
                否则分销商会以为留空就等于走主站，反而去填一个错的地址。
              */}
              <Form.Item
                name="api_base_url"
                label="接口基地址"
                extra="首页代码示例与接入文档会展示这个地址；留空则使用当前站点自己的域名"
                rules={[
                  {
                    validator: async (_, value?: string) => {
                      const raw = (value ?? '').trim();
                      if (!raw) return; // 留空合法
                      if (!/^https?:\/\/[a-zA-Z0-9]/.test(raw)) {
                        throw new Error('请填写以 http:// 或 https:// 开头的完整地址');
                      }
                      if (/\s/.test(raw)) {
                        throw new Error('地址中间不能有空格');
                      }
                    },
                  },
                ]}
              >
                <Input placeholder="https://api.your-domain.com/v1" maxLength={253} />
              </Form.Item>

              <Divider style={{ margin: '4px 0 16px' }} />

              <div className="lynx-section-title">Logo 与站点图标</div>
              {/*
                上传是 multipart 提交给伙伴后端，由后端写入对象存储并把地址落库。
                不直传的原因：共用的那个 bucket 没开 CORS，浏览器跨域 PUT 会在
                预检阶段被拦（详见 backend/internal/partner/partner_brand_upload.go）。
              */}
              <Form.Item label="Logo" extra="建议正方形、透明底，小于 512KB。留空则用「品牌色方块 + 首字」">
                <BrandImagePicker
                  value={previewBrand?.logo_url}
                  target="logo_url"
                  uploading={uploading === 'logo_url'}
                  progress={uploadProgress}
                  onChange={(url) => {
                    form?.setFieldValue('logo_url', url);
                    setDraft((d) => ({ ...d, logo_url: url }));
                  }}
                  onUploaded={(next) => {
                    /*
                     * 上传接口返回的是完整品牌对象（它已经把地址写进库了），
                     * 所以这里直接把 brand 换成新值，不用再拉一次。
                     */
                    setBrand(next);
                    /*
                     * Form 里的值必须一起同步。
                     *
                     * antd 的 initialValues 只在挂载 / key 变化时读一次，
                     * setBrand 不会回流到 Form。不同步的话 Form 里仍是上传前的
                     * 空值，下次点保存时 buildPatch 会以为「用户想清空 logo」，
                     * 提交一个空串把刚传的图擦掉。
                     * （buildPatch 对图片字段已改用 draft 判断，这里是第二道防线，
                     *   保证 Form 状态本身也是对的，比如「移除」按钮的判断依赖它。）
                     */
                    form?.setFieldValue('logo_url', next.logo_url ?? '');
                    // 草稿里的 logo_url 要清掉：它已落库，不再算「未保存的改动」
                    setDraft((d) => {
                      const { logo_url: _ignored, ...rest } = d;
                      return rest;
                    });
                  }}
                  onUploadingChange={(active) => setUploading(active ? 'logo_url' : '')}
                  onProgress={setUploadProgress}
                />
              </Form.Item>

              <Form.Item label="浏览器标签图标" extra="浏览器标签页上的小图标。留空则由平台按品牌色生成">
                <BrandImagePicker
                  value={previewBrand?.favicon_url}
                  target="favicon_url"
                  uploading={uploading === 'favicon_url'}
                  progress={uploadProgress}
                  compact
                  onChange={(url) => {
                    form?.setFieldValue('favicon_url', url);
                    setDraft((d) => ({ ...d, favicon_url: url }));
                  }}
                  onUploaded={(next) => {
                    setBrand(next);
                    // 同 logo：Form 不会自动跟着 brand 变，得显式同步
                    form?.setFieldValue('favicon_url', next.favicon_url ?? '');
                    setDraft((d) => {
                      const { favicon_url: _ignored, ...rest } = d;
                      return rest;
                    });
                  }}
                  onUploadingChange={(active) => setUploading(active ? 'favicon_url' : '')}
                  onProgress={setUploadProgress}
                />
              </Form.Item>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <BrandLogo
                  name={previewBrand?.name || '品牌'}
                  shortName={previewBrand?.short_name}
                  logoUrl={previewBrand?.logo_url}
                  size={44}
                  radius={12}
                />
                <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                  左边是当前 logo 的实际效果。图片加载失败时会回退成
                  「品牌色方块 + 首字」，不会出现破图。
                </Text>
              </div>

              <Divider style={{ margin: '4px 0 16px' }} />

              <div className="lynx-section-title">品牌色</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
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
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 16 }}>
                品牌色会用在按钮、链接、选中态和侧栏高亮上。
              </div>

              <Divider style={{ margin: '4px 0 16px' }} />

              <div className="lynx-section-title">首页风格</div>
              {/*
                选择结果不放在 Form 里，而是走 draft：
                landing 是一个 jsonb 对象，塞进 antd Form 的字段会让
                「撤销改动」和 remountKey 的重置逻辑都要特殊处理一遍。
                走 draft 与 logo 上传同一套机制，行为更一致。
              */}
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 12 }}>
                你的客户站首页有两套版式可选。选定后保存，客户站刷新即生效；明暗模式跟随访客自己的系统设置，两套版式都支持。
              </div>
              <HomeStylePicker
                value={parseHomeStyle(draft.landing?.layout_style ?? brand?.landing?.layout_style)}
                previewColor={previewBrand?.primary_color ?? '#6d51fe'}
                disabled={saving || loading}
                onChange={(next: HomeStyle) =>
                  setDraft((d) => ({
                    ...d,
                    landing: { ...(d.landing ?? brand?.landing ?? {}), layout_style: next },
                  }))
                }
              />
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                缩略图用的是你当前设置的主色，所以看到的就是实际效果。
              </div>

              <Divider style={{ margin: '4px 0 16px' }} />

              <div className="lynx-section-title">页脚版权</div>
              {/*
                这一段对应客户站页面最底部的一行。原来那一行写死的是平台的
                公司名和备案号，分销商的客户站在自己域名下挂着平台的版权，
                等于在给别人打广告 —— 所以改成这里可配。
              */}
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 12 }}>
                这一行显示在每个页面最底部。留空则使用默认文案；把某一项删干净（输入框清空并保存）表示不显示那一项。
              </div>
              <Form.Item name="footer_enabled" label="显示页脚" valuePropName="checked">
                <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
              </Form.Item>
              <Form.Item
                name="footer_copyright_text"
                label="版权文字"
                rules={[{ max: 200, message: '不超过 200 个字' }]}
              >
                <Input placeholder="© 2026 你的公司 版权所有" />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="footer_terms_label" label="条款文字" rules={[{ max: 64, message: '不超过 64 个字' }]}>
                    <Input placeholder="网站条款" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="footer_privacy_label" label="隐私文字" rules={[{ max: 64, message: '不超过 64 个字' }]}>
                    <Input placeholder="隐私政策声明" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="footer_beian_label" label="备案号" rules={[{ max: 64, message: '不超过 64 个字' }]}>
                    <Input placeholder="浙ICP备xxxxxxxx号-1" />
                  </Form.Item>
                </Col>
              </Row>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: 16 }}>
                备案号只在中文界面显示，其它语种不展示（ICP 备案只对中国大陆站点有要求）。
              </div>

              <Divider style={{ margin: '4px 0 16px' }} />

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

              {/*
                客服二维码。
                ................
                放在 Form.Item 里是为了跟上面四格视觉对齐（同一套标签排版），
                但这一格**不是表单字段** —— 它没有 name、不走 initialValues，
                上传成功就由后端直接落库。理由和 logo 相同：图片传的是二进制，
                先传完再等用户点保存，中间那段「已经传上去了但还没生效」的状态很难解释。
              */}
              <Form.Item
                label="客服二维码"
                extra="客户站右下角客服浮窗里展示的二维码图。不上传则不显示二维码，只显示上面的文字联系方式"
              >
                <BrandImagePicker
                  value={previewBrand?.support?.qr_code_url}
                  target="support_qr"
                  uploading={uploading === 'support_qr'}
                  progress={uploadProgress}
                  compact
                  onChange={(url) => {
                    /*
                     * 「移除」走这里。
                     *
                     * 和 logo 不同，二维码不在 Form 里，所以没有 form.setFieldValue
                     * 要同步；它只能通过 support 这层走 patch。
                     *
                     * 直接写空串而不是 delete：buildPatch 用「draft.support 里有没有
                     * qr_code_url」判断用户是否真的清空过。写成 undefined 会被当成
                     * 「没碰过」，点了移除却不生效。
                     */
                    setDraft((d) => ({
                      ...d,
                      support: { ...(d.support ?? brand?.support ?? {}), qr_code_url: url },
                    }));
                  }}
                  onUploaded={(next) => {
                    setBrand(next);
                    /*
                     * 只清草稿里的 qr_code_url，不动 support 的其它键。
                     *
                     * 上传接口已经把地址写进库了，这个键不再算「未保存的改动」，
                     * 留着会一直显示「未保存」标签。但同一个 support 对象里可能
                     * 还有用户刚改、尚未保存的邮箱/电话 —— 把整个 support 删掉会
                     * 让预览瞬间回退成旧值，看起来像改动丢了。
                     */
                    setDraft((d) => {
                      if (!d.support) return d;
                      const { qr_code_url: _ignored, ...restSupport } = d.support;
                      return {
                        ...d,
                        support: Object.keys(restSupport).length > 0 ? restSupport : undefined,
                      };
                    });
                  }}
                  onUploadingChange={(active) => setUploading(active ? 'support_qr' : '')}
                  onProgress={setUploadProgress}
                />
              </Form.Item>

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

/**
 * 上传成功后的提示语，按落点区分。
 *
 * 三种落点写的位置不同（logo / favicon 各自一列，二维码写进 brand_support），
 * 但共同点是「上传即生效，不用点保存」—— 提示语要把这件事说出来，
 * 否则用户会习惯性地去找保存按钮。
 */
const UPLOAD_SUCCESS_TEXT: Record<BrandImageTarget, string> = {
  logo_url: 'logo 已上传并生效',
  favicon_url: '图标已上传并生效',
  support_qr: '二维码已上传并生效',
};

/**
 * 品牌图片选择器：缩略图 + 上传 / 移除。
 *
 * 上传成功后调用 onUploaded 把整个品牌对象交回父组件 —— 后端在确认上传时
 * 已经把地址写进库里了，所以父组件不用再拉一次、也不用等用户点保存。
 * 这和外观（品牌名、主色等）不同：那些必须点保存才生效。
 */
function BrandImagePicker({
  value,
  target,
  uploading,
  progress,
  compact,
  onChange,
  onUploaded,
  onUploadingChange,
  onProgress,
}: {
  value?: string;
  target: BrandImageTarget;
  uploading: boolean;
  progress: number;
  compact?: boolean;
  onChange: (url: string) => void;
  onUploaded: (brand: TenantBrand) => void;
  onUploadingChange: (active: boolean) => void;
  onProgress: (percent: number) => void;
}) {
  const handlePick = async (file: File) => {
    onUploadingChange(true);
    onProgress(0);
    try {
      const next = await dealerApi.uploadBrandImage(file, target, { onProgress });
      onUploaded(next);
      /*
       * 提示语按落点分开写。
       *
       * 原来是个三元表达式，只区分 logo / 其它。二维码进来后不能再靠「不是 logo
       * 就是图标」这个假设 —— 否则传完二维码会弹出「图标已上传并生效」。
       */
      notifyApiSuccess(UPLOAD_SUCCESS_TEXT[target]);
    } catch (err) {
      notifyApiError(err, '上传失败');
    } finally {
      onUploadingChange(false);
      onProgress(0);
    }
  };

  const size = compact ? 28 : 44;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: compact ? 6 : 10,
          border: '1px solid var(--border-default)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {value ? (
          <img
            src={value}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            /* 图挂了不留破图：直接藏掉，让外面的空态显示出来 */
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Text style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>无</Text>
        )}
      </div>

      <Space size={8} wrap>
        <Upload
          accept={dealerApi.BRAND_IMAGE_TYPES.join(',')}
          showUploadList={false}
          disabled={uploading}
          beforeUpload={(file) => {
            void handlePick(file as unknown as File);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading} size="small">
            {uploading ? `上传中 ${progress}%` : value ? '重新上传' : '上传图片'}
          </Button>
        </Upload>
        {value && !uploading ? (
          <Button size="small" type="text" danger onClick={() => onChange('')}>
            移除
          </Button>
        ) : null}
      </Space>

      {uploading ? (
        <div style={{ width: '100%', maxWidth: 220 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: 'var(--border-default)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--brand-primary, #6d51fe)',
                transition: 'width .2s',
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
