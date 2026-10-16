import { type JSX, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import type { TransparentKeyColor } from "../../lib/types";
import { TRANSPARENT_KEY_COLORS } from "../../lib/focusMode";
import {
  APP_MODE_OPTIONS,
  isTeachingSessionActive,
  resolveSelectedAppMode,
  type AppModeTablet,
} from "../../lib/appModeLayout";
import { useCompanionTabletEnabled } from "../../hooks/useCompanionTabletEnabled";
import { useTranslation } from "../../hooks/useTranslation";
import { defaultLanguagePackId } from "../../lib/language";
import type { LanguageAgeBand, LessonLanguage } from "../../lib/language/types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "../../lib/language/types";
import { useAppStore } from "../../stores/appStore";
import {
  FocusIcon,
  KeyboardIcon,
  LanguageLessonIcon,
  MicrophoneIcon,
  TabletIcon,
  TeachingLessonIcon,
} from "../common/SectionIcons";
import { SettingsSection } from "./SettingsSection";
import { ThemedSelect, ToggleRow } from "./settingsControls";

const TRANSPARENT_KEY_COLOR_LABEL_KEYS: Record<TransparentKeyColor, TranslationKey> = {
  white: "transparentKeyColorWhite",
  "dark-gray": "transparentKeyColorDarkGray",
  silver: "transparentKeyColorSilver",
};

type ModeTabletButtonProps = {
  id: AppModeTablet;
  label: string;
  icon: ReactNode;
  pressed: boolean;
  disabled: boolean;
  title?: string;
  surface: SurfaceColors;
  onSelect: (mode: AppModeTablet) => void;
};

const ModeTabletButton = ({
  id,
  label,
  icon,
  pressed,
  disabled,
  title,
  surface,
  onSelect,
}: ModeTabletButtonProps): JSX.Element => {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={pressed}
      title={title ?? label}
      className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        backgroundColor: pressed ? surface.insetBg : surface.panelButtonBg,
        borderColor: pressed ? surface.panelText : surface.panelBorder,
        color: surface.panelText,
        boxShadow: pressed ? `inset 0 0 0 1px ${surface.panelText}` : undefined,
      }}
      onClick={() => {
        if (disabled) return;
        onSelect(id);
      }}
    >
      <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
};

function modeTabletIcon(id: AppModeTablet): ReactNode {
  switch (id) {
    case "normal":
      return <KeyboardIcon />;
    case "focus":
      return <FocusIcon />;
    case "mic":
      return <MicrophoneIcon />;
    case "teaching":
      return <LanguageLessonIcon />;
    case "companion":
      return <TabletIcon />;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function ModesSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const companionTabletEnabled = useCompanionTabletEnabled();
  const {
    settings,
    updateSettings,
    focusModeActive,
    companionModeActive,
    musicTeachingEnabled,
    teachingLesson,
    setAppMode,
    setTeachingLesson,
    setLanguagePackId,
  } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      focusModeActive: s.focusModeActive,
      companionModeActive: s.companionModeActive,
      musicTeachingEnabled: s.musicTeachingEnabled,
      teachingLesson: s.teachingLesson,
      setAppMode: s.setAppMode,
      setTeachingLesson: s.setTeachingLesson,
      setLanguagePackId: s.setLanguagePackId,
    })),
  );

  if (!settings) return null;

  const teachingActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const selectedMode = resolveSelectedAppMode({
    companionModeActive,
    teachingActive,
    focusModeOverride: settings.focusModeOverride === true ? true : undefined,
    micMode: settings.micMode === true,
  });
  const showFocusTransparentControls =
    selectedMode === "focus" || selectedMode === "mic";

  return (
    <SettingsSection title={t("modesSection")} surface={surface}>
      <p className="mb-3 px-1 text-xs" style={{ color: surface.panelMutedText }}>
        {t("modeTabletsHint")}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {APP_MODE_OPTIONS.map((m) => {
          const mode = { id: m.id, label: t(m.labelKey) };
          const companionDisabled = mode.id === "companion" && !companionTabletEnabled;
          const pressed =
            selectedMode === mode.id &&
            (mode.id !== "companion" || companionTabletEnabled);
          return (
            <ModeTabletButton
              key={mode.id}
              id={mode.id}
              label={mode.label}
              icon={modeTabletIcon(mode.id)}
              pressed={pressed}
              disabled={companionDisabled}
              title={companionDisabled ? t("modeCompanionUnavailable") : undefined}
              surface={surface}
              onSelect={(id) => void setAppMode(id)}
            />
          );
        })}
      </div>
      {selectedMode === "teaching" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              {
                id: "language" as const,
                label: t("teachingLessonLanguage"),
              },
              { id: "music" as const, label: t("teachingLessonMusic") },
              { id: "math" as const, label: t("teachingLessonMath") },
            ] as const
          ).map((lesson) => {
            const pressed = teachingLesson === lesson.id;
            return (
              <button
                key={lesson.id}
                type="button"
                aria-pressed={pressed}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: pressed ? surface.insetBg : surface.panelButtonBg,
                  borderColor: pressed ? surface.panelText : surface.panelBorder,
                  color: surface.panelText,
                }}
                onClick={() => setTeachingLesson(lesson.id)}
              >
                <TeachingLessonIcon lesson={lesson.id} className="h-4 w-4" />
                {lesson.label}
              </button>
            );
          })}
        </div>
      )}
      {selectedMode === "teaching" && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0 text-sm" style={{ color: surface.panelText }}>
              {t("languageLessonLanguage")}
              <ThemedSelect
                value={settings.languageLessonLanguage ?? "el"}
                onChange={(v) => {
                  const language = v as LessonLanguage;
                  const band = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
                  void updateSettings({ languageLessonLanguage: language });
                  if (teachingLesson === "language") {
                    setLanguagePackId(defaultLanguagePackId(band, language));
                  }
                }}
                surface={surface}
              >
                <option value="el">{t("languageLessonLangEl")}</option>
                <option value="en">{t("languageLessonLangEn")}</option>
              </ThemedSelect>
            </label>
            <label className="block min-w-0 text-sm" style={{ color: surface.panelText }}>
              {t("languageAgeBand")}
              <ThemedSelect
                value={settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND}
                onChange={(v) => {
                  const band = v as LanguageAgeBand;
                  const language = settings.languageLessonLanguage ?? "el";
                  void updateSettings({ languageLessonAgeBand: band });
                  if (teachingLesson === "language") {
                    setLanguagePackId(defaultLanguagePackId(band, language));
                  }
                }}
                surface={surface}
              >
                <option value="early">{t("languageAgeBandEarly")}</option>
                <option value="primary">{t("languageAgeBandPrimary")}</option>
                <option value="lower_secondary">{t("languageAgeBandLowerSecondary")}</option>
                <option value="upper_secondary">{t("languageAgeBandUpperSecondary")}</option>
              </ThemedSelect>
            </label>
          </div>
          <ToggleRow
            label={t("languageLessonIgnoreCase")}
            checked={settings.languageLessonIgnoreCase !== false}
            onChange={(checked) => updateSettings({ languageLessonIgnoreCase: checked })}
            surface={surface}
          />
          <ToggleRow
            label={t("languageLessonIgnoreTones")}
            checked={settings.languageLessonIgnoreTones !== false}
            onChange={(checked) => updateSettings({ languageLessonIgnoreTones: checked })}
            surface={surface}
          />
        </div>
      )}
      {showFocusTransparentControls && (
        <div className="mt-3">
          <ToggleRow
            label={t("focusModeTransparent")}
            checked={Boolean(settings.focusModeTransparent)}
            disabled={!focusModeActive}
            onChange={(checked) => updateSettings({ focusModeTransparent: checked })}
            surface={surface}
          />
          <p className="mt-1 px-1 text-xs" style={{ color: surface.panelMutedText }}>
            {t("focusModeTransparentDescription")}
          </p>
          {Boolean(settings.focusModeTransparent) && (
            <label
              className="mt-2 block text-sm"
              style={{
                color: surface.panelText,
                opacity: focusModeActive ? 1 : 0.5,
              }}
            >
              {t("transparentKeyColor")}
              <ThemedSelect
                value={settings.transparentKeyColor ?? "white"}
                disabled={!focusModeActive}
                onChange={(value) =>
                  updateSettings({
                    transparentKeyColor: value as TransparentKeyColor,
                  })
                }
                surface={surface}
                className="mt-1 w-full rounded border px-2 py-2 text-sm"
              >
                {TRANSPARENT_KEY_COLORS.map((id) => (
                  <option key={id} value={id}>
                    {t(TRANSPARENT_KEY_COLOR_LABEL_KEYS[id])}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
