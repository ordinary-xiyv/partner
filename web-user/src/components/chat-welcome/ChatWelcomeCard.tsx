import type { ChatWelcomeCard, WelcomeApplyPayload } from './types';
import { ChatWelcomeVideoMedia } from './ChatWelcomeVideoMedia';

interface ChatWelcomeCardButtonProps {
  card: ChatWelcomeCard;
  disabled?: boolean;
  onApply: (payload: WelcomeApplyPayload) => void;
}

function buildTextPrompt(card: Extract<ChatWelcomeCard, { type: 'text' }>): string {
  const custom = card.prompt?.trim();
  if (custom) return custom;
  return `${card.title} — ${card.desc}`;
}

export function ChatWelcomeCardButton({ card, disabled, onApply }: ChatWelcomeCardButtonProps) {
  const handleClick = (): void => {
    if (disabled) return;
    if (card.type === 'text') {
      onApply({ kind: 'text', prompt: buildTextPrompt(card), cardId: card.id });
      return;
    }
    if (card.type === 'image') {
      onApply({
        kind: 'image',
        prompt: card.prompt,
        images: [
          {
            src: card.mediaSrc,
            name: card.mediaName?.trim() || `welcome-${card.id}.jpg`,
            kind: 'image',
          },
        ],
        cardId: card.id,
      });
      return;
    }
    onApply({
      kind: 'video',
      prompt: card.prompt,
      videos: [
        {
          src: card.mediaSrc,
          name: card.mediaName?.trim() || `welcome-${card.id}.mp4`,
          kind: 'video',
        },
      ],
      images: card.referenceImages?.map((img, i) => ({
        src: img.src,
        name: img.name?.trim() || `welcome-${card.id}-ref-${i + 1}.jpg`,
        kind: 'image' as const,
      })),
      cardId: card.id,
    });
  };

  if (card.type === 'text') {
    return (
      <button
        type="button"
        role="listitem"
        className="chat-text-welcome-card chat-text-welcome-card--text-preset"
        disabled={disabled}
        onClick={handleClick}
      >
        <div className="chat-text-welcome-card-icon" aria-hidden>
          {card.iconSrc ? (
            <img src={card.iconSrc} alt="" />
          ) : (
            <span className="chat-text-welcome-card-icon-fallback">·</span>
          )}
        </div>
        <div className="chat-text-welcome-card-title">{card.title}</div>
        <div className="chat-text-welcome-card-desc">{card.desc}</div>
      </button>
    );
  }

  if (card.type === 'image') {
    return (
      <button
        type="button"
        role="listitem"
        className="chat-text-welcome-card chat-text-welcome-card--media chat-text-welcome-card--image-preset"
        disabled={disabled}
        aria-label={card.caption?.trim() || card.prompt}
        onClick={handleClick}
      >
        <img src={card.coverSrc} alt="" className="chat-text-welcome-card-media__img" />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="listitem"
      className="chat-text-welcome-card chat-text-welcome-card--media chat-text-welcome-card--video-preset"
      disabled={disabled}
      aria-label={card.prompt}
      onClick={handleClick}
    >
      <ChatWelcomeVideoMedia
        mediaSrc={card.mediaSrc}
        coverSrc={card.coverSrc}
        className="chat-text-welcome-card-media__video"
      />
    </button>
  );
}
