import { useMemo, type CSSProperties } from 'react';
import { ChatWelcomeCardButton } from './ChatWelcomeCard';
import type { ChatWelcomePaneProps } from './types';

function defaultColumns(cards: ChatWelcomePaneProps['cards']): number {
  const hasMedia = cards.some((c) => c.type === 'image' || c.type === 'video');
  return hasMedia ? 3 : 5;
}

export function ChatWelcomePane({
  title,
  ariaLabel,
  modifierClass,
  columns,
  cards,
  disabled,
  onApply,
}: ChatWelcomePaneProps) {
  void ariaLabel;
  const gridColumns = columns ?? defaultColumns(cards);
  /** 文本 / 图像 / 语音预设：固定列宽；列数按实际卡片数，保证居中 */
  const isFixedColumnRow =
    modifierClass?.includes('chat-text-welcome--preset-row') === true
    || modifierClass?.includes('chat-text-welcome--image-row') === true
    || gridColumns === 5;
  const heading = title?.trim() ?? '';
  const stackClass = [
    'chat-text-welcome',
    modifierClass,
    cards.length === 0 && heading ? 'chat-text-welcome--heading-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const gridClassName = [
    'chat-text-welcome-grid',
    isFixedColumnRow ? 'chat-text-welcome-grid--fixed-cols' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** 按实际卡片数定列，避免 3 张卡占用 5 列宽导致偏左 */
  const fixedColCount = Math.max(1, Math.min(gridColumns, cards.length || gridColumns));

  const gridStyle = useMemo((): CSSProperties | undefined => {
    if (isFixedColumnRow) {
      return { ['--chat-welcome-fixed-cols' as string]: String(fixedColCount) } as CSSProperties;
    }
    return { gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` };
  }, [fixedColCount, gridColumns, isFixedColumnRow]);

  if (!heading && cards.length === 0) {
    return null;
  }

  return (
    <div className={stackClass}>
      <div className="chat-text-welcome-stack">
        {heading ? <h2 className="chat-text-welcome-heading">{heading}</h2> : null}
        {cards.length > 0 ? (
          <div className={gridClassName} role="list" style={gridStyle}>
            {cards.map((card) => (
              <ChatWelcomeCardButton
                key={card.id}
                card={card}
                disabled={disabled}
                onApply={onApply}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function chatWelcomePaneAriaLabel(title: string | undefined, fallback: string): string {
  const t = title?.trim();
  return t && t.length > 0 ? t : fallback;
}
