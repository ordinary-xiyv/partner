import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Typography } from 'antd';
import {
  QWEN_TTS_VOICES,
  filterTtsVoices,
  findTtsVoice,
  pickVoiceText,
  type QwenTtsVoice,
  type SpeechVoiceAge,
  type SpeechVoiceGender,
  type VoiceFilterState,
} from '../../features/speechGen/qwenTtsVoices';
import { SpeechVoiceAvatar } from './SpeechVoiceAvatar';

export interface SpeechVoicePickerModalProps {
  open: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (voice: string) => void;
}

type FilterChip<T extends string> = { id: T; labelKey: string };

const AGE_FILTERS: FilterChip<'all' | SpeechVoiceAge>[] = [
  { id: 'all', labelKey: 'speechGen.voiceFilterAgeAll' },
  { id: 'child', labelKey: 'speechGen.voiceFilterAgeChild' },
  { id: 'youth', labelKey: 'speechGen.voiceFilterAgeYouth' },
  { id: 'middle', labelKey: 'speechGen.voiceFilterAgeMiddle' },
  { id: 'elderly', labelKey: 'speechGen.voiceFilterAgeElderly' },
];

const GENDER_FILTERS: FilterChip<'all' | SpeechVoiceGender>[] = [
  { id: 'all', labelKey: 'speechGen.voiceFilterGenderAll' },
  { id: 'male', labelKey: 'speechGen.voiceGenderMale' },
  { id: 'female', labelKey: 'speechGen.voiceGenderFemale' },
];

function VoiceCard({
  voice,
  selected,
  onSelect,
}: {
  voice: QwenTtsVoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const label = pickVoiceText(voice.label, i18n.language);
  const description = pickVoiceText(voice.description, i18n.language);
  const subtitle = pickVoiceText(voice.subtitle, i18n.language);
  const genderLabel = voice.gender === 'female'
    ? t('speechGen.voiceGenderFemale')
    : t('speechGen.voiceGenderMale');

  return (
    <button
      type="button"
      className={`speech-voice-card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      <SpeechVoiceAvatar voice={voice.voice} className="speech-voice-card__avatar" />
      <span className="speech-voice-card__main">
        <span className="speech-voice-card__title-row">
          <span className="speech-voice-card__name">{label}</span>
          <span className="speech-voice-card__tag">{genderLabel}</span>
        </span>
        <Typography.Text
          className="speech-voice-card__desc"
          ellipsis={{ tooltip: description }}
        >
          {description}
        </Typography.Text>
        <Typography.Text
          className="speech-voice-card__subtitle"
          ellipsis={{ tooltip: subtitle }}
        >
          {subtitle}
        </Typography.Text>
      </span>
    </button>
  );
}

function FilterRow<T extends string>({
  label,
  chips,
  active,
  onChange,
}: {
  label: string;
  chips: FilterChip<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="speech-voice-modal__filter-row">
      <span className="speech-voice-modal__filter-label">{label}</span>
      <div className="speech-voice-modal__filter-chips">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`speech-voice-modal__chip${active === chip.id ? ' is-active' : ''}`}
            onClick={() => onChange(chip.id)}
          >
            {t(chip.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SpeechVoicePickerModal({
  open,
  value,
  onClose,
  onConfirm,
}: SpeechVoicePickerModalProps) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [filters, setFilters] = useState<VoiceFilterState>({
    age: 'all',
    gender: 'all',
  });

  useEffect(() => {
    if (open) {
      const matched = findTtsVoice(value);
      setDraft(matched?.voice ?? '');
    }
  }, [open, value]);

  const filteredVoices = useMemo(
    () => filterTtsVoices(QWEN_TTS_VOICES, filters),
    [filters],
  );

  const normalizedValue = value ? (findTtsVoice(value)?.voice ?? '') : '';
  const selectedMeta = draft ? findTtsVoice(draft) : undefined;
  const selectedLabel = selectedMeta
    ? pickVoiceText(selectedMeta.label, i18n.language)
    : '';
  const canConfirm = draft !== normalizedValue && (draft === '' || Boolean(selectedMeta));

  return (
    <Modal
      open={open}
      title={t('speechGen.selectVoice')}
      onCancel={onClose}
      width={920}
      className="speech-voice-modal"
      centered
      footer={(
        <div className="speech-voice-modal__footer">
          <span className="speech-voice-modal__picked">
            {selectedMeta
              ? t('speechGen.voiceSelected', { name: selectedLabel })
              : t('speechGen.voiceNotSelected')}
          </span>
          <div className="speech-voice-modal__footer-actions">
            <ButtonGhost onClick={onClose}>{t('cancel')}</ButtonGhost>
            <button
              type="button"
              className="speech-voice-modal__confirm"
              disabled={!canConfirm}
              onClick={() => onConfirm(draft)}
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}
      destroyOnClose
    >
      <FilterRow
        label={t('speechGen.voiceFilterAge')}
        chips={AGE_FILTERS}
        active={filters.age}
        onChange={(age) => setFilters((f) => ({ ...f, age }))}
      />
      <FilterRow
        label={t('speechGen.voiceFilterGender')}
        chips={GENDER_FILTERS}
        active={filters.gender}
        onChange={(gender) => setFilters((f) => ({ ...f, gender }))}
      />
      <div className="speech-voice-modal__grid">
        {filteredVoices.map((v) => (
          <VoiceCard
            key={v.voice}
            voice={v}
            selected={Boolean(draft) && draft === v.voice}
            onSelect={() => setDraft((prev) => (prev === v.voice ? '' : v.voice))}
          />
        ))}
        {filteredVoices.length === 0 && (
          <div className="speech-voice-modal__empty">{t('speechGen.noVoicesMatch')}</div>
        )}
      </div>
    </Modal>
  );
}

function ButtonGhost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="speech-voice-modal__cancel" onClick={onClick}>
      {children}
    </button>
  );
}
