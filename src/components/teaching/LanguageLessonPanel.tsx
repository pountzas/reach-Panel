import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { PlayIcon, PlusIcon, RestartIcon, StopIcon, TrashIcon } from "../common/SectionIcons";
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
import {
  DEFAULT_TEACHING_LESSON_LEFT_RATIO,
  TeachingLessonPane,
  TeachingLessonPanel,
  TeachingLessonToolbarButton,
} from "./TeachingLessonPanel";

const TASK_SLOT_REM = 1.75;
const TASK_GAP_REM = 0.35;
const TOOLBAR_ICON_CLASS = "h-5 w-5";

function LessonSelectField({
  label,
  value,
  onChange,
  children,
  surface,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  surface: { panelBorder: string; panelBg: string; panelText: string; panelMutedText: string };
  disabled?: boolean;
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
        className="w-full min-w-0 rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
        style={selectStyle}
        value={value}
        disabled={disabled}
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
  const languageLessonPlaying = useAppStore((s) => s.languageLessonPlaying);
  const customLanguagePacks = useAppStore((s) => s.customLanguagePacks);
  const setLanguagePackId = useAppStore((s) => s.setLanguagePackId);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const restartLanguageLesson = useAppStore((s) => s.restartLanguageLesson);
  const startLanguageLessonPlayback = useAppStore((s) => s.startLanguageLessonPlayback);
  const stopLanguageLessonPlayback = useAppStore((s) => s.stopLanguageLessonPlayback);
  const checkLanguageAnswer = useAppStore((s) => s.checkLanguageAnswer);
  const createCustomLanguagePack = useAppStore((s) => s.createCustomLanguagePack);
  const deleteCustomLanguagePack = useAppStore((s) => s.deleteCustomLanguagePack);
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);
  const [creatingList, setCreatingList] = useState(false);

  const ageBand = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
  const lessonLanguage: LessonLanguage = settings.languageLessonLanguage ?? "el";
  const ignoreTones = settings.languageLessonIgnoreTones !== false;
  const leftRatio = settings.languageLessonLeftRatio ?? DEFAULT_TEACHING_LESSON_LEFT_RATIO;
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
    <TeachingLessonPane>
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
    </TeachingLessonPane>
  ) : (
    <TeachingLessonPane>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{t("languageLesson")}</span>
        <div className="flex shrink-0 items-center gap-1">
          <TeachingLessonToolbarButton
            label={t("languageNewList")}
            onClick={() => {
              stopLanguageLessonPlayback();
              setCreatingList(true);
            }}
            disabled={languageLessonPlaying}
            borderColor={surface.panelBorder}
            backgroundColor={surface.panelBg}
            color={surface.panelText}
          >
            <PlusIcon className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>
          <TeachingLessonToolbarButton
            label={languageLessonPlaying ? t("stopSong") : t("playSong")}
            onClick={() => {
              if (languageLessonPlaying) {
                stopLanguageLessonPlayback();
              } else {
                startLanguageLessonPlayback();
              }
            }}
            disabled={!pack || pack.tasks.length === 0}
            borderColor={surface.panelBorder}
            backgroundColor={languageLessonPlaying ? "#fde68a" : surface.panelBg}
            color={surface.panelText}
          >
            {languageLessonPlaying ? (
              <StopIcon className={TOOLBAR_ICON_CLASS} />
            ) : (
              <PlayIcon className={TOOLBAR_ICON_CLASS} />
            )}
          </TeachingLessonToolbarButton>
          {pack && isCaregiverLanguagePack(pack) ? (
            <TeachingLessonToolbarButton
              label={t("deleteLanguagePack")}
              onClick={() => {
                const ok = window.confirm(
                  t("confirmDeleteLanguagePack").replace("{title}", pack.title),
                );
                if (ok) {
                  void deleteCustomLanguagePack(pack.id);
                }
              }}
              disabled={languageLessonPlaying}
              borderColor={surface.panelBorder}
              backgroundColor={surface.panelBg}
              color={surface.panelText}
            >
              <TrashIcon className={TOOLBAR_ICON_CLASS} />
            </TeachingLessonToolbarButton>
          ) : null}
          <TeachingLessonToolbarButton
            label={t("restartLesson")}
            onClick={() => restartLanguageLesson()}
            disabled={languageLessonPlaying}
            borderColor={surface.panelBorder}
            backgroundColor={surface.panelBg}
            color={surface.panelText}
          >
            <RestartIcon className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>
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
          disabled={languageLessonPlaying}
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
          disabled={languageLessonPlaying}
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
          className="min-w-0 w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          value={pack?.id ?? ""}
          disabled={languageLessonPlaying}
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
          className="shrink-0 self-stretch rounded-md border px-3 py-2 text-left text-sm font-semibold disabled:opacity-50"
          style={{
            borderColor: ignoreTones ? surface.panelBorder : surface.panelText,
            backgroundColor: ignoreTones ? surface.panelBg : "#fde68a",
            color: surface.panelText,
          }}
          aria-pressed={!ignoreTones}
          disabled={languageLessonPlaying}
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
    </TeachingLessonPane>
  );

  const rightColumn = (
    <TeachingLessonPane scroll={false}>
      {creatingList ? (
        <p
          className="flex flex-1 items-center justify-center px-2 text-center text-sm"
          style={{ color: surface.panelMutedText }}
        >
          {t("languageNewListKeyboardHint")}
        </p>
      ) : !languageLessonPlaying ? (
        <p
          className="flex flex-1 items-center justify-center px-2 text-center text-sm"
          style={{ color: surface.panelMutedText }}
        >
          {t("languagePressPlayToSpell")}
        </p>
      ) : completed ? (
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
    </TeachingLessonPane>
  );

  return (
    <TeachingLessonPanel
      surface={surface}
      leftRatio={leftRatio}
      onLeftRatioChange={(languageLessonLeftRatio) =>
        void updateSettings({ languageLessonLeftRatio })
      }
      left={leftColumn}
      right={rightColumn}
    />
  );
}
