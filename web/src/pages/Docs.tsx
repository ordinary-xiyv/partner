import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOutlined,
  ImportOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  AppPageHeader,
  PagePanel,
  PageStack,
  notifyApiError,
  notifyApiSuccess,
} from '@lynx/shared';
import {
  buildDocTreeNodes,
  createDocArticle,
  createDocCategory,
  deleteDocArticle,
  deleteDocCategory,
  fetchDocTree,
  importDocSeed,
  updateDocArticle,
  updateDocCategory,
  validateDocSlug,
} from '../shared/api/docs';
import type {
  DocArticlePayload,
  DocCategoryPayload,
  DocTreeNode,
  PartnerDocArticle,
  PartnerDocCategory,
} from '../shared/api/docs';

const { Text } = Typography;

/*
文档设置页。

照老项目 web-admin 的 SettingsDocs 搬的：左边分类树、右边编辑区。
交互和数据形状保持一致，方便两边对照。

但这版**不是全量照搬**，有意砍掉了这些：
  · 拖拽排序（dragSort）—— 老项目的实现依赖一棵专门的拖拽组件，
    搬过来要连带 200 行 DOM 操作代码。这版先用「上移/下移」按钮，
    功能等价、行为可预期，需要真拖拽再单独做。
  · OpenAPI 规范编辑 —— 那是独立的 spec 编辑器，和文章编辑是两件事。
    分类树里能识别 openapi 类型并显示出来，但不提供编辑入口。
  · 多语种完整表单 —— 老项目有 DocLocaleFields 组件管 5 种语言。
    这里保留 zh/en 两个主字段（后端也主要是这两列），
    多语种 map（title_labels 等）透传但不做专门 UI。
    理由是：分销商真实需求是「中英各写一份」，五种语言是平台级需求。

留下的都是文档管理每天要用到的：建分类、建文章、写 Markdown、发布、删除。
*/

interface ArticleFormValues {
  slug: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  category_id: number;
  content_zh: string;
  content_en: string;
  published: boolean;
}

interface CategoryFormValues {
  slug: string;
  title_zh: string;
  title_en: string;
  summary_zh: string;
  parent_id: number | null;
  visible: boolean;
}

export default function Docs() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<PartnerDocCategory[]>([]);
  const [articles, setArticles] = useState<PartnerDocArticle[]>([]);
  const [siteId, setSiteId] = useState('');

  /** 当前选中的节点 key（c-1 / a-2 这种形式） */
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [articleModal, setArticleModal] = useState<{ open: boolean; editing?: PartnerDocArticle }>({
    open: false,
  });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: PartnerDocCategory }>({
    open: false,
  });
  const [articleForm] = Form.useForm<ArticleFormValues>();
  const [categoryForm] = Form.useForm<CategoryFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDocTree();
      setCategories(data.categories ?? []);
      setArticles(data.articles ?? []);
      setSiteId(data.site_id ?? '');
    } catch (err) {
      /*
       * 409 是「当前商户没绑定站点」——那不是错误，是还没到能用文档的阶段。
       * 单独识别出来给指引，比弹一句「加载失败」有用得多。
       */
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setSiteId('');
        setCategories([]);
        setArticles([]);
      } else {
        notifyApiError(err, '读取文档失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const treeNodes = useMemo(() => buildDocTreeNodes(categories, articles), [categories, articles]);

  /** 把内部节点转成 antd Tree 的 DataNode，顺手给图标 */
  const toDataNodes = useCallback(
    (nodes: DocTreeNode[]): DataNode[] =>
      nodes.map((node) => ({
        key: node.key,
        title: (
          <Space size={6}>
            <span style={{ opacity: node.active ? 1 : 0.45 }}>{node.title}</span>
            {!node.active && (
              <Tag style={{ marginInlineStart: 0, fontSize: 11, lineHeight: '16px' }}>
                {node.type === 'article' ? '未发布' : '隐藏'}
              </Tag>
            )}
            {node.type === 'category' && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {node.count}
              </Text>
            )}
          </Space>
        ),
        icon: node.type === 'article' ? <FileTextOutlined /> : <FolderOutlined />,
        isLeaf: node.type === 'article',
        children: node.children?.length ? toDataNodes(node.children) : undefined,
      })),
    [],
  );

  const findArticle = (key: string): PartnerDocArticle | undefined => {
    if (!key.startsWith('a-')) return undefined;
    const id = Number(key.slice(2));
    return articles.find((a) => a.id === id);
  };

  const findCategory = (key: string): PartnerDocCategory | undefined => {
    if (!key.startsWith('c-')) return undefined;
    const id = Number(key.slice(2));
    return categories.find((c) => c.id === id);
  };

  /* ---------- 文章增删改 ---------- */

  const openNewArticle = (categoryId?: number) => {
    const targetCategory =
      categoryId ??
      (selectedKey.startsWith('c-') ? findCategory(selectedKey)?.id : undefined) ??
      categories[0]?.id;
    if (!targetCategory) {
      notifyApiError(null, '请先创建一个分类');
      return;
    }
    articleForm.resetFields();
    articleForm.setFieldsValue({
      category_id: targetCategory,
      published: false,
      slug: '',
      title_zh: '',
      title_en: '',
      summary_zh: '',
      content_zh: '',
      content_en: '',
    });
    setArticleModal({ open: true });
  };

  const openEditArticle = (article: PartnerDocArticle) => {
    articleForm.setFieldsValue({
      slug: article.slug,
      title_zh: article.title_zh,
      title_en: article.title_en,
      summary_zh: article.summary_zh,
      category_id: article.category_id,
      content_zh: article.content_zh,
      content_en: article.content_en,
      published: article.published,
    });
    setArticleModal({ open: true, editing: article });
  };

  const submitArticle = async () => {
    const values = await articleForm.validateFields();
    const payload: DocArticlePayload = {
      category_id: values.category_id,
      slug: values.slug.trim().toLowerCase(),
      title_zh: values.title_zh.trim(),
      title_en: (values.title_en || '').trim(),
      summary_zh: values.summary_zh || '',
      content_zh: values.content_zh || '',
      content_en: values.content_en || '',
      published: values.published,
    };
    setSaving(true);
    try {
      if (articleModal.editing) {
        // 更新要带 sort，否则后端会把 sort 归零 —— 文章会跳到分类最前面
        await updateDocArticle(articleModal.editing.id, {
          ...payload,
          sort: articleModal.editing.sort,
        });
        notifyApiSuccess('文章已更新');
      } else {
        // 新建排在同类末尾：取同类最大 sort + 10
        const siblings = articles.filter((a) => a.category_id === values.category_id);
        const maxSort = siblings.reduce((m, a) => Math.max(m, a.sort), 0);
        await createDocArticle({ ...payload, sort: maxSort + 10 });
        notifyApiSuccess('文章已创建');
      }
      setArticleModal({ open: false });
      await load();
    } catch (err) {
      notifyApiError(err, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeArticle = async (article: PartnerDocArticle) => {
    try {
      await deleteDocArticle(article.id);
      notifyApiSuccess('文章已删除');
      if (selectedKey === `a-${article.id}`) setSelectedKey('');
      await load();
    } catch (err) {
      notifyApiError(err, '删除失败');
    }
  };

  /* ---------- 分类增删改 ---------- */

  const openNewCategory = () => {
    categoryForm.resetFields();
    categoryForm.setFieldsValue({
      parent_id: selectedKey.startsWith('c-') ? findCategory(selectedKey)?.id ?? null : null,
      visible: true,
      slug: '',
      title_zh: '',
      title_en: '',
      summary_zh: '',
    });
    setCategoryModal({ open: true });
  };

  const openEditCategory = (category: PartnerDocCategory) => {
    categoryForm.setFieldsValue({
      slug: category.slug,
      title_zh: category.title_zh,
      title_en: category.title_en,
      summary_zh: category.summary_zh,
      parent_id: category.parent_id,
      visible: category.visible,
    });
    setCategoryModal({ open: true, editing: category });
  };

  const submitCategory = async () => {
    const values = await categoryForm.validateFields();
    const payload: DocCategoryPayload = {
      slug: values.slug.trim().toLowerCase(),
      title_zh: values.title_zh.trim(),
      title_en: (values.title_en || '').trim(),
      summary_zh: values.summary_zh || '',
      parent_id: values.parent_id ?? null,
      visible: values.visible,
    };
    setSaving(true);
    try {
      if (categoryModal.editing) {
        await updateDocCategory(categoryModal.editing.id, {
          ...payload,
          sort: categoryModal.editing.sort,
          kind: categoryModal.editing.kind,
        });
        notifyApiSuccess('分类已更新');
      } else {
        const siblings = categories.filter((c) => (c.parent_id ?? null) === (values.parent_id ?? null));
        const maxSort = siblings.reduce((m, c) => Math.max(m, c.sort), 0);
        await createDocCategory({ ...payload, kind: 'articles', sort: maxSort + 10 });
        notifyApiSuccess('分类已创建');
      }
      setCategoryModal({ open: false });
      await load();
    } catch (err) {
      notifyApiError(err, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 删分类时把连带影响说清楚。
   *
   * 后端是级联删（子分类 + 文章一起删），如果只问「确定删除吗」，
   * 用户点完才发现连带删了十几篇文章，没有挽回余地。
   */
  /*
   * 导入内置默认文档。
   *
   * 为什么要有这个入口：新站点的文档表是空的，后台打开就是一片空白，
   * 只能从零手写分类和文章。而这套模板（入门 / 模型指南 / API 参考，45 篇）
   * 本来就是为这个产品写的，每个商户重复劳动没有意义。
   *
   * 默认走 skip（只补缺、不动已有内容）。已有内容时再问一次要不要覆盖 ——
   * 「恢复默认」不能顺手把用户改过的正文冲掉，那是数据丢失。
   */
  const [seedImporting, setSeedImporting] = useState(false);

  const runSeedImport = async (mode: 'skip' | 'overwrite') => {
    setSeedImporting(true);
    try {
      const res = await importDocSeed(mode);
      const s = res.summary;
      const created = s.categories_created + s.articles_created;
      const updated = s.categories_updated + s.articles_updated;
      if (created === 0 && updated === 0) {
        notifyApiSuccess('文档已是最新，没有需要导入的内容');
      } else {
        notifyApiSuccess(
          `导入完成：新增 ${s.categories_created} 个分类、${s.articles_created} 篇文章` +
            (updated > 0 ? `，更新 ${updated} 项` : ''),
        );
      }
      await load();
    } catch (err) {
      notifyApiError(err, '导入默认文档失败');
    } finally {
      setSeedImporting(false);
    }
  };

  const confirmSeedImport = () => {
    /*
     * 已有内容时必须让用户明确选模式。
     * 直接调 skip 会让人以为「恢复了默认」其实什么都没变；
     * 直接调 overwrite 则可能覆盖掉刚改好的正文。
     */
    if (categories.length === 0 && articles.length === 0) {
      void runSeedImport('skip');
      return;
    }
    Modal.confirm({
      title: '导入默认文档',
      content:
        '当前站点已有文档。选择「只补缺失」不会动现有内容；' +
        '选择「覆盖同标识内容」会用模板重置入门、模型指南、API 参考里已有的文章。' +
        '两种方式都不会删除你自己新建的分类和文章。',
      okText: '只补缺失',
      cancelText: '覆盖同标识内容',
      onOk: () => void runSeedImport('skip'),
      onCancel: () => void runSeedImport('overwrite'),
    });
  };

  const removeCategory = async (category: PartnerDocCategory) => {
    const childCats = categories.filter((c) => c.parent_id === category.id).length;
    const childArts = articles.filter((a) => a.category_id === category.id).length;
    try {
      const res = await deleteDocCategory(category.id);
      notifyApiSuccess(
        `已删除 ${res.deleted_categories} 个分类、${res.deleted_articles} 篇文章` +
          (childCats || childArts ? '' : ''),
      );
      if (selectedKey === `c-${category.id}`) setSelectedKey('');
      await load();
    } catch (err) {
      notifyApiError(err, '删除失败');
    }
  };

  const currentArticle = findArticle(selectedKey);
  const currentCategory = findCategory(selectedKey);

  if (loading) {
    return (
      <PageStack gap={20}>
        <AppPageHeader title="文档设置" subtitle="管理客户在你专属域名下看到的接入文档" />
        <PagePanel padded>
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <LoadingOutlined style={{ fontSize: 20, marginBottom: 10, display: 'block' }} />
            正在加载文档…
          </div>
        </PagePanel>
      </PageStack>
    );
  }

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="文档设置"
        subtitle="管理客户在你专属域名下看到的接入文档"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            {/*
             * 已有文档时是次要按钮（常态），一个都没有时提到主按钮位置 ——
             * 空站点的第一诉求就是「有点内容可编辑」，不该藏在角落。
             */}
            <Button
              icon={<ImportOutlined />}
              loading={seedImporting}
              type={categories.length === 0 && articles.length === 0 ? 'primary' : 'default'}
              onClick={confirmSeedImport}
            >
              导入默认文档
            </Button>
            <Button icon={<FolderOutlined />} onClick={openNewCategory}>
              新建分类
            </Button>
            <Button
              type={categories.length === 0 && articles.length === 0 ? 'default' : 'primary'}
              icon={<PlusOutlined />}
              onClick={() => openNewArticle()}
            >
              新建文章
            </Button>
          </Space>
        }
      />

      {!siteId && (
        <Alert
          type="warning"
          showIcon
          message="当前账号还没有绑定站点"
          description="文档是挂在你的专属域名上给客户看的，需要先完成站点绑定才能管理。绑定入口在「品牌设置」页。"
        />
      )}

      {siteId && (
        <Alert
          type="info"
          showIcon
          message={`文档按站点隔离，当前站点：${siteId}`}
          description="这里的改动只会影响你自己的域名，其他分销商的站点不受影响；同样，他们的文档你也看不到。"
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* 左：分类树 */}
        <PagePanel padded>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>目录结构</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {categories.length} 分类 · {articles.length} 文章
            </Text>
          </div>
          {treeNodes.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有任何文档"
              style={{ margin: '24px 0' }}
            >
              <Button
                type="primary"
                size="small"
                icon={<ImportOutlined />}
                loading={seedImporting}
                onClick={confirmSeedImport}
              >
                导入默认文档（45 篇）
              </Button>
              <Button size="small" style={{ marginTop: 8 }} onClick={openNewCategory}>
                新建第一个分类
              </Button>
            </Empty>
          ) : (
            <Tree
              showIcon
              blockNode
              defaultExpandAll
              selectedKeys={selectedKey ? [selectedKey] : []}
              onSelect={(keys) => setSelectedKey(String(keys[0] ?? ''))}
              treeData={toDataNodes(treeNodes)}
              style={{ background: 'transparent' }}
            />
          )}
        </PagePanel>

        {/* 右：选中项详情 */}
        <PagePanel padded>
          {!selectedKey && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="从左边选一个分类或文章进行编辑"
              style={{ margin: '60px 0' }}
            />
          )}

          {currentArticle && (
            <ArticleDetail
              article={currentArticle}
              categoryTitle={
                categories.find((c) => c.id === currentArticle.category_id)?.title_zh ?? ''
              }
              onEdit={() => openEditArticle(currentArticle)}
              onDelete={() => void removeArticle(currentArticle)}
            />
          )}

          {currentCategory && !currentArticle && (
            <CategoryDetail
              category={currentCategory}
              childCount={
                categories.filter((c) => c.parent_id === currentCategory.id).length +
                articles.filter((a) => a.category_id === currentCategory.id).length
              }
              onEdit={() => openEditCategory(currentCategory)}
              onDelete={() => void removeCategory(currentCategory)}
              onNewArticle={() => openNewArticle(currentCategory.id)}
            />
          )}
        </PagePanel>
      </div>

      {/* 文章编辑弹窗 */}
      <Modal
        title={articleModal.editing ? '编辑文章' : '新建文章'}
        open={articleModal.open}
        width={860}
        onCancel={() => setArticleModal({ open: false })}
        onOk={() => void submitArticle()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ icon: <SaveOutlined /> }}
        destroyOnClose
      >
        <Form form={articleForm} layout="vertical" preserve={false}>
          <Form.Item
            name="category_id"
            label="所属分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select
              placeholder="选择分类"
              options={categories.map((c) => ({
                value: c.id,
                label: c.title_zh || c.title_en || c.slug,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="slug"
            label="标识"
            extra="会出现在网址里：/docs/你的标识。只能用小写字母、数字、连字符"
            rules={[
              { required: true, message: '请填写标识' },
              {
                validator: async (_, value?: string) => {
                  const msg = validateDocSlug(value ?? '');
                  if (msg) throw new Error(msg);
                },
              },
            ]}
          >
            <Input placeholder="quickstart" />
          </Form.Item>

          <Form.Item
            name="title_zh"
            label="标题（中文）"
            rules={[{ required: true, message: '请填写中文标题' }]}
          >
            <Input placeholder="快速开始" />
          </Form.Item>

          <Form.Item name="title_en" label="标题（英文）">
            <Input placeholder="Quick Start" />
          </Form.Item>

          <Form.Item name="summary_zh" label="摘要">
            <Input placeholder="一句话说明这篇文档讲什么（可留空）" />
          </Form.Item>

          <Tabs
            items={[
              {
                key: 'zh',
                label: '正文 · 中文',
                children: (
                  <Form.Item name="content_zh" noStyle>
                    <Input.TextArea
                      rows={14}
                      placeholder={'用 Markdown 书写。\n\n# 标题\n\n正文…'}
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'en',
                label: '正文 · 英文',
                children: (
                  <Form.Item name="content_en" noStyle>
                    <Input.TextArea
                      rows={14}
                      placeholder={'Write in Markdown.\n\n# Title\n\nBody…'}
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    />
                  </Form.Item>
                ),
              },
            ]}
          />

          <Form.Item
            name="published"
            label="发布状态"
            valuePropName="checked"
            extra="未发布的文章只在后台可见，客户站看不到"
            style={{ marginTop: 16 }}
          >
            <Switch checkedChildren="已发布" unCheckedChildren="草稿" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分类编辑弹窗 */}
      <Modal
        title={categoryModal.editing ? '编辑分类' : '新建分类'}
        open={categoryModal.open}
        onCancel={() => setCategoryModal({ open: false })}
        onOk={() => void submitCategory()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ icon: <SaveOutlined /> }}
        destroyOnClose
      >
        <Form form={categoryForm} layout="vertical" preserve={false}>
          <Form.Item name="parent_id" label="上级分类">
            <Select
              allowClear
              placeholder="不选则为顶级分类"
              options={categories
                // 不能选自己当自己的父级；更深层的环由后端拦
                .filter((c) => c.id !== categoryModal.editing?.id)
                .map((c) => ({ value: c.id, label: c.title_zh || c.title_en || c.slug }))}
            />
          </Form.Item>

          <Form.Item
            name="slug"
            label="标识"
            extra="分类的网址标识，只能用小写字母、数字、连字符"
            rules={[
              { required: true, message: '请填写标识' },
              {
                validator: async (_, value?: string) => {
                  const msg = validateDocSlug(value ?? '');
                  if (msg) throw new Error(msg);
                },
              },
            ]}
          >
            <Input placeholder="getting-started" />
          </Form.Item>

          <Form.Item
            name="title_zh"
            label="标题（中文）"
            rules={[{ required: true, message: '请填写中文标题' }]}
          >
            <Input placeholder="入门" />
          </Form.Item>

          <Form.Item name="title_en" label="标题（英文）">
            <Input placeholder="Getting Started" />
          </Form.Item>

          <Form.Item name="summary_zh" label="摘要">
            <Input placeholder="一句话说明这个分类（可留空）" />
          </Form.Item>

          <Form.Item
            name="visible"
            label="在客户站显示"
            valuePropName="checked"
            extra="关掉后这个分类和它下面的文章都不会出现在客户站"
          >
            <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
          </Form.Item>
        </Form>
      </Modal>
    </PageStack>
  );
}

/* ------------------------------------------------------------------ */
/* 右侧详情                                                            */
/* ------------------------------------------------------------------ */

function ArticleDetail({
  article,
  categoryTitle,
  onEdit,
  onDelete,
}: {
  article: PartnerDocArticle;
  categoryTitle: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {categoryTitle} · /docs/{article.slug}
          </Text>
          <h2 style={{ margin: '4px 0 0' }}>{article.title_zh || article.title_en}</h2>
        </div>
        <Space>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <Popconfirm
            title="删除这篇文章？"
            description="删除后不可恢复，客户站会立即看不到这篇。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Space size={8} wrap>
        <Tag color={article.published ? 'green' : 'default'}>
          {article.published ? '已发布' : '草稿'}
        </Tag>
        {article.title_en && <Tag>英文标题：{article.title_en}</Tag>}
      </Space>

      {article.summary_zh && (
        <Alert type="info" showIcon message={article.summary_zh} style={{ marginBottom: 0 }} />
      )}

      <div>
        <Text strong>正文预览</Text>
        <pre
          style={{
            marginTop: 8,
            padding: 16,
            background: 'var(--surface-sunken, #f6f7f9)',
            borderRadius: 8,
            maxHeight: 420,
            overflow: 'auto',
            fontSize: 12,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {article.content_zh || '（正文为空）'}
        </pre>
      </div>
    </Space>
  );
}

function CategoryDetail({
  category,
  childCount,
  onEdit,
  onDelete,
  onNewArticle,
}: {
  category: PartnerDocCategory;
  childCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onNewArticle: () => void;
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            分类 · {category.slug}
          </Text>
          <h2 style={{ margin: '4px 0 0' }}>{category.title_zh || category.title_en}</h2>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={onNewArticle}>
            在此新建文章
          </Button>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <Popconfirm
            title="删除这个分类？"
            description={`会同时删掉它下面的 ${childCount} 个条目（子分类和文章），不可恢复。`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Space size={8} wrap>
        <Tag color={category.visible ? 'blue' : 'default'}>
          {category.visible ? '客户站可见' : '已隐藏'}
        </Tag>
        <Tag>{category.kind === 'openapi' ? 'OpenAPI 规范' : '文章列表'}</Tag>
        <Tag>{childCount} 个条目</Tag>
      </Space>

      {category.summary_zh && <Alert type="info" showIcon message={category.summary_zh} />}

      <Text type="secondary">
        这个分类下的文章会按排序出现在客户站的文档侧栏里。要改顺序，编辑文章时调整即可；
        拖拽排序暂未提供。
      </Text>
    </Space>
  );
}
