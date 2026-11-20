import React, { useCallback, useMemo } from 'react';
import { Checkbox, Popover, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { SearchOutlined } from '@ant-design/icons';
import { CheckMarkIcon, ModelEmptyCubeIcon } from '@/assets/icons';
import { ModelIcon } from './ModelIcon';

/** 高于 composer 模型选择 Popover（10051），避免省略号 tooltip 被面板挡住 */
const MODEL_PICKER_TOOLTIP_Z_INDEX = 11000;

/** 与 /api/pricing 及 ChatShell 中定义一致，供本组件与复用方对齐 */
export interface PricingModelRow {
  model_name: string;
  display_name?: string;
  modalities?: string;
  input_types?: string;
  model_img?: string;
  /** 供应商 key：未显式配 model_img 时，用该供应商的 logo 兜底显示 */
  provider_key?: string;
  /** 用途描述短标签（模型目录维护，选择器副标题） */
  usage_description?: string;
}

function ellipsisTooltip(title: string) {
  return {
    title,
    zIndex: MODEL_PICKER_TOOLTIP_Z_INDEX,
  };
}

type ModelPickerTabsAndListProps = {
  modelsInPickerTab: PricingModelRow[];
  selectedModelIds: string[];
  onToggleModel: (modelName: string) => void;
  resolveModelIconName: (m?: string) => string;
};

function ModelPickerTabsAndList({
  modelsInPickerTab,
  selectedModelIds,
  onToggleModel,
  resolveModelIconName,
}: ModelPickerTabsAndListProps) {
  const { t } = useTranslation();
  const selectedSet = useMemo(() => new Set(selectedModelIds), [selectedModelIds]);
  return (
    <div className="model-picker-list model-picker-list--in-composer">
      {modelsInPickerTab.length === 0 ? <div className="model-picker-empty">{t('chat.noModelsFound')}</div> : null}
      {modelsInPickerTab.map((p) => {
        const m = p.model_name;
        const label = p.display_name && p.display_name.trim() ? p.display_name.trim() : m;
        const sub = (p.usage_description || '').trim();
        const selected = selectedSet.has(m);
        return (
          <button
            key={m}
            type="button"
            className={`model-picker-item model-picker-item--stacked${selected ? ' model-picker-item--selected' : ''}`}
            onClick={() => onToggleModel(m)}
          >
            <ModelIcon label={label} iconName={resolveModelIconName(m)} className="model-picker-icon" />
            <div className="model-picker-item-col">
              <Typography.Text
                ellipsis={{ tooltip: ellipsisTooltip(label) }}
                className="model-picker-name-typography"
              >
                {label}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                ellipsis={sub ? { tooltip: ellipsisTooltip(sub) } : false}
                className="model-picker-sub-typography"
              >
                {sub || '\u00A0'}
              </Typography.Text>
            </div>
            {selected ? (
              <span className="model-picker-check" aria-hidden>
                <CheckMarkIcon />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type ComposerModelPickerPanelProps = {
  /** 移动端 sheet 内标题使用不同 class */
  sheetLayout?: boolean;
  /** 默认多选；img / video 入口用 single */
  selectionMode?: 'multi' | 'single';
  /** 为 false 时无全选勾选（单选 / 视频等） */
  showBulkActions?: boolean;
  selectedModelIds: string[];
  /** 当前模块下可选模型总数（与搜索无关） */
  totalSelectableModels: number;
  /** 已选模型展示名（单选模式标题用） */
  resolveModelLabel: (modelName: string) => string;
  modelSearch: string;
  onModelSearchChange: (value: string) => void;
  /** 流式发送中等：禁止变更选择 */
  selectionLocked?: boolean;
  onClearModels: () => void;
  /** 多选：一次性选中列表内全部模型（避免循环 toggle 只生效一条） */
  onSelectAllInTab?: (modelNames: string[]) => void;
  modelsInPickerTab: PricingModelRow[];
  onToggleModel: (modelName: string) => void;
  resolveModelIconName: (m?: string) => string;
};

/**
 * 模型选择面板（标题 + 搜索 + 全选勾选 + 列表），可被 Popover 或移动端 Drawer/Sheet 复用。
 */
export function ComposerModelPickerPanel({
  sheetLayout = false,
  selectionMode = 'multi',
  showBulkActions = true,
  selectedModelIds,
  totalSelectableModels,
  resolveModelLabel,
  modelSearch,
  onModelSearchChange,
  selectionLocked = false,
  onClearModels,
  onSelectAllInTab,
  modelsInPickerTab,
  onToggleModel,
  resolveModelIconName,
}: ComposerModelPickerPanelProps) {
  const { t } = useTranslation();

  const showBulkSelect = showBulkActions && selectionMode === 'multi';

  const selectedSet = useMemo(() => new Set(selectedModelIds), [selectedModelIds]);

  const allInTabSelected = useMemo(() => {
    if (modelsInPickerTab.length === 0) return false;
    return modelsInPickerTab.every((p) => selectedSet.has(p.model_name));
  }, [modelsInPickerTab, selectedSet]);

  const someInTabSelected = useMemo(
    () => modelsInPickerTab.some((p) => selectedSet.has(p.model_name)),
    [modelsInPickerTab, selectedSet],
  );

  const handleSelectAllInTab = useCallback(() => {
    const names = modelsInPickerTab.map((p) => p.model_name);
    if (names.length === 0) return;
    if (onSelectAllInTab) {
      onSelectAllInTab(names);
      return;
    }
    for (const name of names) {
      if (!selectedSet.has(name)) onToggleModel(name);
    }
  }, [modelsInPickerTab, onSelectAllInTab, onToggleModel, selectedSet]);

  const handleBulkCheckChange = useCallback(
    (checked: boolean) => {
      if (selectionLocked) return;
      if (checked) {
        handleSelectAllInTab();
        return;
      }
      if (selectedModelIds.length > 0) onClearModels();
    },
    [handleSelectAllInTab, onClearModels, selectedModelIds.length, selectionLocked],
  );

  const titleLine = useMemo(() => {
    if (showBulkSelect) {
      return t('chat.selectedModelsCountRatio', {
        selected: selectedModelIds.length,
        total: totalSelectableModels,
      });
    }
    if (selectedModelIds.length === 0) return t('chat.selectedModelsEmpty');
    return selectedModelIds.map((id) => resolveModelLabel(id)).join(', ');
  }, [resolveModelLabel, selectedModelIds, showBulkSelect, t, totalSelectableModels]);

  const bulkCheckDisabled = selectionLocked || modelsInPickerTab.length === 0;

  return (
    <>
      <div className={`model-picker-dropup-title${sheetLayout ? ' model-picker-dropup-title--sheet' : ''}`}>
        <Typography.Text
          ellipsis={{ tooltip: ellipsisTooltip(titleLine) }}
          className="model-picker-dropup-title__text"
        >
          {titleLine}
        </Typography.Text>
      </div>
      <div
        className={`model-picker-dropup-search-row${showBulkSelect ? '' : ' model-picker-dropup-search-row--no-bulk'}`}
      >
        <div className="model-picker-search model-picker-search--row">
          <SearchOutlined style={{ fontSize: 14 }} />
          <input
            autoFocus
            value={modelSearch}
            onChange={(e) => onModelSearchChange(e.target.value)}
            placeholder={t('chat.searchModelPlaceholder')}
            className="model-picker-input"
          />
        </div>
        {showBulkSelect ? (
          <label className="model-picker-select-all">
            <span className="model-picker-select-all__label">{t('chat.selectAllModels')}</span>
            <Checkbox
              checked={allInTabSelected}
              indeterminate={someInTabSelected && !allInTabSelected}
              disabled={bulkCheckDisabled}
              onChange={(e) => handleBulkCheckChange(e.target.checked)}
            />
          </label>
        ) : null}
      </div>
      <ModelPickerTabsAndList
        modelsInPickerTab={modelsInPickerTab}
        selectedModelIds={selectedModelIds}
        onToggleModel={onToggleModel}
        resolveModelIconName={resolveModelIconName}
      />
    </>
  );
}

export type ComposerModelPickerProps = Omit<ComposerModelPickerPanelProps, 'sheetLayout'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  pickModelHighlight?: boolean;
  pillLabel: string;
  /** 无已选模型：药丸居中轻字重 */
  pillEmpty?: boolean;
  selectModelAriaLabel: string;
};

/**
 * 桌面端：药丸触发器 + Ant Design Popover（受控 open / onOpenChange）。
 */
export function ComposerModelPicker({
  open,
  onOpenChange,
  disabled = false,
  pickModelHighlight = false,
  pillLabel,
  pillEmpty = false,
  selectModelAriaLabel,
  ...panelProps
}: ComposerModelPickerProps) {
  const firstSelectedId = panelProps.selectedModelIds[0];
  const firstSelectedLabel = firstSelectedId
    ? panelProps.resolveModelLabel(firstSelectedId)
    : '';
  const firstSelectedIconName = firstSelectedId
    ? panelProps.resolveModelIconName(firstSelectedId)
    : '';

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="topLeft"
      autoAdjustOverflow={false}
      getPopupContainer={() => document.body}
      destroyOnHidden={false}
      arrow={false}
      rootClassName="composer-model-picker-popover-root"
      overlayInnerStyle={{ padding: 0 }}
      overlayStyle={{ zIndex: 10051 }}
      content={
        <div
          className="model-picker-dropdown model-picker-dropdown--composer-portal"
          role="dialog"
          aria-label={selectModelAriaLabel}
        >
          <ComposerModelPickerPanel {...panelProps} sheetLayout={false} />
        </div>
      }
    >
      <button
        type="button"
        className={`composer-model-pill${pillEmpty ? ' composer-model-pill--empty' : ' composer-model-pill--has-models'}${pickModelHighlight ? ' composer-model-pill--pick-model' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        {pillEmpty ? (
          <span className="composer-model-pill-empty-row">
            <ModelEmptyCubeIcon className="composer-model-pill-cube-icon" aria-hidden />
            <span className="composer-model-pill-text">{pillLabel}</span>
          </span>
        ) : (
          <span className="composer-model-pill-selected-row">
            <ModelIcon
              label={firstSelectedLabel || pillLabel}
              iconName={firstSelectedIconName}
              className="composer-model-pill-model-icon"
            />
            <span className="composer-model-pill-text">{pillLabel}</span>
          </span>
        )}
      </button>
    </Popover>
  );
}
