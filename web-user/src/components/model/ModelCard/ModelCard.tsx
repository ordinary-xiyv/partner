import type { CSSProperties, KeyboardEvent } from 'react';
import { Card, Flex, Space, Tag, Typography, theme } from 'antd';
import type { CatalogCardDTO } from '../../../types/catalog';
import './model-card.css';

const { Text } = Typography;

export interface ModelCardProps {
  card: CatalogCardDTO;
  providerIconUri?: string;
  onViewDetail?: (catalogId: number) => void;
  className?: string;
}

function ModelCardLogo({ providerIconUri }: { providerIconUri?: string }) {
  if (!providerIconUri) return null;

  return (
    <span className="model-plaza-card__logo" aria-hidden>
      <img src={providerIconUri} alt="" className="model-plaza-card__logo-img" />
    </span>
  );
}

export function ModelCard({ card, providerIconUri, onViewDetail, className }: ModelCardProps) {
  const { token } = theme.useToken();
  const disabled = !card.available;

  const handleOpen = () => {
    if (disabled) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onViewDetail?.(card.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  const cornerBadgeText = card.marketing_badge?.trim() ?? '';
  const hasBadge = cornerBadgeText.length > 0;
  const hasTags = card.tags.length > 0;
  const cardRadius = token.borderRadiusLG;

  return (
    <div
      className={[
        'model-plaza-card-wrap',
        'lynx-interactive-card',
        hasBadge ? 'model-plaza-card-wrap--has-badge' : '',
        disabled ? 'lynx-interactive-card--disabled' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--model-plaza-card-radius': `${cardRadius}px` } as CSSProperties}
    >
      {hasBadge ? (
        <span className="model-plaza-card__corner-badge">{cornerBadgeText}</span>
      ) : null}

      <Card
        className={[
          'model-plaza-card',
          hasBadge ? 'model-plaza-card--has-badge' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        variant="outlined"
        tabIndex={disabled ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          borderRadius: cardRadius,
        }}
        styles={{
          body: {
            padding: 0,
            height: '100%',
          },
        }}
      >
        <div
          className={[
            'model-plaza-card__layout',
            hasTags ? 'model-plaza-card__layout--has-tags' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Flex align="flex-start" gap={16} className="model-plaza-card__head">
            <ModelCardLogo providerIconUri={providerIconUri} />
            <Flex vertical gap={4} className="model-plaza-card__titles">
              <Text strong ellipsis className="model-plaza-card__name">
                {card.name}
              </Text>
              <Text type="secondary" ellipsis className="model-plaza-card__provider">
                {card.provider}
              </Text>
            </Flex>
          </Flex>

          <p
            className="model-plaza-card__desc"
            title={card.description?.trim() || undefined}
          >
            {card.description?.trim() || '\u00A0'}
          </p>

          {hasTags ? (
            <div className="model-plaza-card__tags-footer">
              <Space size={[6, 6]} wrap className="model-plaza-card__tags">
                {card.tags.slice(0, 5).map((tag) => (
                  <Tag key={tag} bordered={false} className="model-plaza-card__tag">
                    {tag}
                  </Tag>
                ))}
              </Space>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
