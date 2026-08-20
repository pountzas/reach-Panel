import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { HoverTooltip } from "../common/HoverTooltip";
import { PlusIcon, RestartIcon, TrashIcon } from "../common/SectionIcons";
import { ResizableSplitPane } from "../layout/ResizableSplitPane";
import {
  DEFAULT_LANGUAGE_AGE_BAND,
  defaultLanguagePackId,
  getLanguagePackById,
  isCaregiverLanguagePack,
  listBuiltInPacksForBandAndLanguage,
  listCustomPacksForLanguage,
} from "../../lib/language";
import type { LanguageAgeBand, LessonLanguage } from "../../lib/language/types";
import { NewLanguageListForm } from "./NewLanguageListForm";

const TASK_SLOT_REM = 1.75;
const TASK_GAP_REM = 0.35;
const TOOLBAR_ICON_CLASS = "h-5 w-5";
const DEFAULT_LEFT_RATIO = 0.4;

function LanguageToolbarButton({
  label,
  onClick,
  disabled,
  backgroundColor,
  borderColor,
  color,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border disabled:opacity-50"
      style={{
        borderColor,
        backgroundColor,
        color,
      }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
      <HoverTooltip label={label} />
    </button>
  );
}

function LessonSelectField({
  label,
  value,
  onChange,
  children,
  surface,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  surface: { panelBorder: string; panelBg: string; panelText: string; panelMutedText: string };
}) {
  const selectStyle: CSSProperties = {
    borderColor: surface.panelBorder,
    backgroundColor: surface.panelBg,
    color: surface.panelText,
  };

  return (
    <label
      className="flex min-w-0 flex-1 flex-col gap-1 text-xs"
      style={{ color: surface.panelMutedText }}
    >
      <span>{label}</span>
      <select
        className="w-full min-w-0 rounded-md border px-2 py-1.5 text-sm"
        style={selectStyle}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function ageBandLabelKey(band: LanguageAgeBand): TranslationKey {
  switch (band) {
    case "early":
      return "languageAgeBandEarly";
    case "primary":
      return "languageAgeBandPrimary";
    case "lower_secondary":
      return "languageAgeBandLowerSecondary";
    case "upper_secondary":
      return "languageAgeBandUpperSecondary";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

function truncateWord(word: string, max = 7): string {
  if (word.length <= max) return word;
  return `${word.slice(0, max - 1)}…`;
}

export function LanguageLessonPanel() {
  const settings = useAppStore((s) => s.settings);
  const languagePackId = useAppStore((s) => s.languagePackId);
  const languageTaskIndex = useAppStore((s) => s.languageTaskIndex);
  const languageInputBuffer = useAppStore((s) => s.languageInputBuffer);
  const languageAnswerIncorrect = useAppStore((s) => s.languageAnswerIncorrect);
  const customLanguagePacks = useAppStore((s) => s.customLanguagePacks);
  const setLanguagePackId = useAppStore((s) => s.setLanguagePackId);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const restartLanguageLesson = useAppStore((s) => s.restartLanguageLesson);
  const checkLanguageAnswer = useAppStore((s) => s.checkLanguageAnswer);
  const createCustomLanguagePack = useAppStore((s) => s.createCustomLanguagePack);
  const deleteCustomLanguagePack = useAppStore((s) => s.deleteCustomLanguagePack);
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);
  const [creatingList, setCreatingList] = useState(false);

  const ageBand = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
  const lessonLanguage: LessonLanguage = settings.languageLessonLanguage ?? "el";
  const ignoreTones = settings.languageLessonIgnoreTones !== false;
  const leftRatio = settings.languageLessonLeftRatio ?? DEFAULT_LEFT_RATIO;
  const availablePacks = listBuiltInPacksForBandAndLanguage(ageBand, lessonLanguage);
  const myLists = listCustomPacksForLanguage(customLanguagePacks, lessonLanguage);
  const selectedPack = getLanguagePackById(languagePackId, customLanguagePacks);
  const pack =
    selectedPack &&
    (availablePacks.some((entry) => entry.id === selectedPack.id) ||
      myLists.some((entry) => entry.id === selectedPack.id))
      ? selectedPack
      : getLanguagePackById(availablePacks[0]?.id ?? null);
  const total = pack?.tasks.length ?? 0;
  const completed = total > 0 && languageTaskIndex >= total;
  const focusIndex = completed
    ? Math.max(0, total - 1)
    : Math.min(languageTaskIndex, Math.max(0, total - 1));
  const progressLabel =
    total === 0
      ? "0 / 0"
      : completed
        ? `${total} / ${total}`
        : `${languageTaskIndex + 1} / ${total}`;
  const currentTask = pack?.tasks[focusIndex];
  const hintText =
    currentTask?.type === "spell" ? currentTask.hint : undefined;
  const stripOffsetRem =
    focusIndex * (TASK_SLOT_REM + TASK_GAP_REM) + TASK_SLOT_REM / 2;

  const selectPackForFilters = (band: LanguageAgeBand, language: LessonLanguage) => {
    setLanguagePackId(defaultLanguagePackId(band, language));
  };

  const leftColumn = creatingList ? (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2">
      <span className="min-w-0 truncate text-sm font-semibold">{t("languageNewList")}</span>
      <NewLanguageListForm
        lessonLanguage={lessonLanguage}
        ageBand={ageBand}
        surface={surface}
        onSave={(nextPack) => {
          void createCustomLanguagePack(nextPack);
          setCreatingList(false);
        }}
        onCancel={() => setCreatingList(false)}
      />
    </div>
  ) : (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{t("languageLesson")}</span>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageToolbarButton
            label={t("languageNewList")}
            onClick={() => setCreatingList(true)}
            borderColor={surface.panelBorder}
            backgroundColor={surface.panelBg}
            color={surface.panelText}
          >
            <PlusIcon className={TOOLBAR_ICON_CLASS} />
          </LanguageToolbarButton>
          {pack && isCaregiverLanguagePack(pack) ? (
            <LanguageToolbarButton
              label={t("deleteLanguagePack")}
              onClick={() => {
                const ok = window.confirm(
                  t("confirmDeleteLanguagePack").replace("{title}", pack.title),
                );
                if (ok) {
                  void deleteCustomLanguagePack(pack.id);
                }
              }}
              borderColor={surface.panelBorder}
              backgroundColor={surface.panelBg}
              color={surface.panelText}
            >
              <TrashIcon className={TOOLBAR_ICON_CLASS} />
            </LanguageToolbarButton>
          ) : null}
          <LanguageToolbarButton
            label={t("restartLesson")}
            onClick={() => restartLanguageLesson()}
            borderColor={surface.panelBorder}
            backgroundColor={surface.panelBg}
            color={surface.panelText}
          >
            <RestartIcon className={TOOLBAR_ICON_CLASS} />
          </LanguageToolbarButton>
        </div>
      </div>

      <div className="flex min-w-0 gap-2">
        <LessonSelectField
          label={t("languageLessonLanguage")}
          value={lessonLanguage}
          onChange={(value) => {
            const language = value as LessonLanguage;
            void updateSettings({ languageLessonLanguage: language });
            selectPackForFilters(ageBand, language);
          }}
          surface={surface}
        >
          <option value="el">{t("languageLessonLangEl")}</option>
          <option value="en">{t("languageLessonLangEn")}</option>
        </LessonSelectField>
        <LessonSelectField
          label={t("languageAgeBand")}
          value={ageBand}
          onChange={(value) => {
            const band = value as LanguageAgeBand;
            void updateSettings({ languageLessonAgeBand: band });
            selectPackForFilters(band, lessonLanguage);
          }}
          surface={surface}
        >
          <option value="early">{t("languageAgeBandEarly")}</option>
          <option value="primary">{t("languageAgeBandPrimary")}</option>
          <option value="lower_secondary">{t("languageAgeBandLowerSecondary")}</option>
          <option value="upper_secondary">{t("languageAgeBandUpperSecondary")}</option>
        </LessonSelectField>
      </div>

      <label
        className="flex min-w-0 flex-col gap-1 text-xs"
        style={{ color: surface.panelMutedText }}
      >
        <span>{t("selectLanguagePack")}</span>
        <select
          className="min-w-0 w-full rounded-md border px-2 py-1.5 text-sm"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          value={pack?.id ?? ""}
          onChange={(event) => setLanguagePackId(event.target.value)}
        >
          <optgroup label={t("languagePackBuiltIn")}>
            {availablePacks.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </optgroup>
          {myLists.length > 0 ? (
            <optgroup label={t("languagePackMyLists")}>
              {myLists.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      {lessonLanguage === "el" ? (
        <button
          type="button"
          className="shrink-0 self-stretch rounded-md border px-3 py-2 text-left text-sm font-semibold"
          style={{
            borderColor: ignoreTones ? surface.panelBorder : surface.panelText,
            backgroundColor: ignoreTones ? surface.panelBg : "#fde68a",
            color: surface.panelText,
          }}
          aria-pressed={!ignoreTones}
          onClick={() =>
            void updateSettings({ languageLessonIgnoreTones: !ignoreTones })
          }
        >
          {ignoreTones ? t("languageLessonTonesOff") : t("languageLessonTonesOn")}
        </button>
      ) : null}

      {pack && (
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{pack.title}</span>
            <span style={{ color: surface.panelMutedText }}>{progressLabel}</span>
          </div>
          <span className="text-xs" style={{ color: surface.panelMutedText }}>
            {t(ageBandLabelKey(pack.ageBand))} ·{" "}
            {pack.lessonLanguage === "el" ? "ΕΛ" : "EN"}
          </span>
        </div>
      )}
    </div>
  );

  const rightColumn = (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-2">
      {completed ? (
        <p className="flex flex-1 items-center justify-center text-lg font-semibold text-emerald-600">
          {t("lessonComplete")}
        </p>
      ) : pack && pack.tasks.length > 0 ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div
              className="text-xs font-medium"
              style={{ color: surface.panelMutedText }}
            >
              {t("languagePrompt")}
            </div>
            <div
              className="music-note-strip relative min-h-[4.5rem] flex-1 overflow-hidden rounded-md border"
              style={{ borderColor: surface.panelBorder }}
              aria-label={t("languageUpcomingTasks")}
            >
              <div
                className="music-note-strip-track absolute inset-y-0 flex items-center"
                style={{
                  left: "50%",
                  gap: `${TASK_GAP_REM}rem`,
                  transform: `translateX(-${stripOffsetRem}rem)`,
                }}
              >
                {pack.tasks.map((task, index) => {
                  const isActive = index === languageTaskIndex;
                  const isPast = index < languageTaskIndex;
                  const label = task.type === "spell" ? task.answer : "…";
                  return (
                    <span
                      key={`${task.type}-${index}`}
                      className={`music-note-chip flex shrink-0 items-center justify-center rounded-md px-1 ${
                        isActive ? "music-note-chip-active text-sm font-bold" : "text-xs"
                      }`}
                      style={{
                        minWidth: isActive ? "auto" : `${TASK_SLOT_REM}rem`,
                        maxWidth: isActive ? "10rem" : `${TASK_SLOT_REM + 0.5}rem`,
                        color: surface.panelText,
                        opacity: isActive ? 1 : isPast ? 0.35 : 0.55,
                        backgroundColor: isActive ? "#fde68a" : "transparent",
                      }}
                      title={label}
                    >
                      <span className={isActive ? "whitespace-nowrap px-1" : "truncate"}>
                        {isActive ? label : truncateWord(label)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            {hintText ? (
              <p className="text-xs leading-snug" style={{ color: surface.panelMutedText }}>
                {hintText}
              </p>
            ) : null}
          </div>

          <div className="shrink-0">
            <div
              className="text-xs font-medium"
              style={{ color: surface.panelMutedText }}
            >
              {t("languageYourAnswer")}
            </div>
            <p
              className="mt-1 min-h-[2.25rem] rounded-md border px-2 py-1 font-mono text-lg"
              style={{
                borderColor: languageAnswerIncorrect ? "#dc2626" : surface.panelBorder,
                backgroundColor: surface.panelBg,
              }}
              aria-live="polite"
            >
              {languageInputBuffer || " "}
            </p>
            {languageAnswerIncorrect ? (
              <p className="mt-1 text-sm text-red-600">{t("languageIncorrect")}</p>
            ) : null}
          </div>

          <button
            type="button"
            className="shrink-0 self-start rounded-md border px-4 py-2 text-sm font-semibold"
            style={{
              borderColor: surface.panelBorder,
              backgroundColor: surface.panelBg,
              color: surface.panelText,
            }}
            onClick={() => checkLanguageAnswer()}
          >
            {t("languageCheck")}
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
        color: surface.panelText,
      }}
    >
      <ResizableSplitPane
        ratioSide="left"
        rightRatio={leftRatio}
        onRightRatioChange={(languageLessonLeftRatio) =>
          void updateSettings({ languageLessonLeftRatio })
        }
        minLeftWidth={120}
        minRightWidth={140}
        maxRightRatio={0.72}
        minSizedWindowRatio={0.2}
        splitterColor={surface.panelBorder}
        splitterLineWidth={2}
        left={leftColumn}
        right={rightColumn}
      />
    </div>
  );
}
