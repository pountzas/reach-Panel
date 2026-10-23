import { useEffect } from "react";
import {
  CollapseIcon,
  HeightGripIcon,
  MouseIcon,
  TransparentKeyboardIcon,
} from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { PreviewSuggestionsRow } from "./PreviewSuggestionsRow";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { PianoRangeControl } from "./PianoRangeControl";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useWindowHeightDrag } from "../../hooks/useWindowHeightDrag";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";
import { getSongById, songPianoRangeFit } from "../../lib/music/songs";
import {
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
  isWidePianoOctaveCount,
} from "../../lib/music/octaveCount";
import {
  isTransparentUiActive,
  nextTransparentKeyColor,
  transparentKeyPalette,
  transparentOutlineStyle,
  focusModeToolbarClassName,
} from "../../lib/focusMode";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import {
  isSynthesizerUiActive,
  isTeachingSessionActive,
} from "../../lib/appModeLayout";
import { isLanguageLessonActive } from "../../lib/language";
import {
  computeTeachingChromeVisibility,
  shouldStopDictationForVisibility,
} from "../../lib/teachingInputHelpers";

const INPUT_PREVIEW_STRIP_HEIGHT_PX = 48;
const SUGGESTION_CHIP_HEIGHT_PX = 32;

export function KeyboardSection() {
  const settings = useAppStore((s) => s.settings);
  const focusModeActive = useAppStore((s) => s.focusModeActive);
  const focusModeKeyboardVisible = useAppStore(
    (s) => s.focusModeKeyboardVisible,
  );
  const collapseFocusModeKeyboard = useAppStore(
    (s) => s.collapseFocusModeKeyboard,
  );
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const importedSongs = useAppStore((s) => s.importedSongs);
  const companionSessionLive = useAppStore((s) => s.companionSessionLive);
  const languageSubjectTab = useAppStore((s) => s.languageSubjectTab);
  const dictationState = useAppStore((s) => s.dictationState);
  const stopDictation = useAppStore((s) => s.stopDictation);
  const { t } = useTranslation();
  const heightDrag = useWindowHeightDrag();
  const showSynth =
    isSynthesizerUiActive(
      musicTeachingEnabled,
      settings.keyboardSectionMode,
      teachingLesson,
    ) && !focusModeActive;
  const compact = settings.inputAreaCompact;
  const teachingSessionActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const languageLessonActive = isLanguageLessonActive({
    musicTeachingEnabled,
    teachingLesson,
    settings,
    languageSubjectTab,
  });
  const { showInputPreview, showSuggestions, dictationKeyVisible } =
    computeTeachingChromeVisibility({
      teachingSessionActive,
      settings,
      showSynth,
      compact,
      companionSessionLive,
      languageLessonActive,
      focusModeActive,
    });
  // KeyboardSection stays mounted when Music swaps <Keyboard /> for <Synthesizer />.
  useEffect((): void => {
    if (shouldStopDictationForVisibility(dictationKeyVisible, dictationState)) {
      void stopDictation();
    }
  }, [dictationKeyVisible, dictationState, stopDictation]);
  /** Suggestions strip stays mounted whenever suggestions are on, so chips never resize keys. */
  const showSuggestionsRow = showSuggestions;
  const transparentUi = isTransparentUiActive(settings, focusModeActive);
  const showTransparentToggle = focusModeActive && !showSynth && !compact;
  const showFocusModeCollapse =
    focusModeActive && focusModeKeyboardVisible && !showSynth && !compact;
  const transparentPalette = transparentKeyPalette(
    settings.transparentKeyColor,
  );
  const transparentToolbarStyle = transparentUi
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: settings.transparentKeyColor,
      })
    : undefined;
  const showFocusModeToolbar = focusModeActive && !showSynth && !compact;
  const showTransparentColorButton = transparentUi && showTransparentToggle;
  const showSynthToolbar = showSynth && !compact;
  const showToolbar =
    showSynthToolbar ||
    showInputPreview ||
    showSuggestionsRow ||
    showTransparentToggle ||
    showFocusModeCollapse;
  const song = musicTeachingEnabled
    ? getSongById(musicSongId, importedSongs)
    : null;
  const songFit = song ? songPianoRangeFit(song) : null;
  const songRangeLabel = songFit
    ? `${songFit.songMinId}–${songFit.songMaxId}`
    : null;
  const octaveCount = resolveSynthOctaveCount(settings.synthesizerOctaveCount);
  const startOctave = resolveSynthStartOctave(
    settings.synthesizerStartOctave,
    octaveCount,
  );

  const auxCenterMinHeightPx = showInputPreview
    ? INPUT_PREVIEW_STRIP_HEIGHT_PX
    : showSuggestionsRow
      ? SUGGESTION_CHIP_HEIGHT_PX
      : 0;

  const endControls =
    showSynthToolbar || showTransparentToggle || showFocusModeCollapse ? (
      <div
        className={`flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 items-center justify-end gap-2 pr-2`}>
        {showFocusModeCollapse && (
          <ModeToggleGroup
            transparentUi={transparentUi}
            transparentBorderColor={transparentPalette.border}>
            <ModeToggleButton
              active={false}
              position="only"
              label={t("focusModeCollapse")}
              tooltipPlacement="below"
              disabled={isAnimatingWindow}
              style={transparentToolbarStyle}
              activeClassName={transparentUi ? "bg-transparent" : undefined}
              onClick={() => void collapseFocusModeKeyboard()}>
              <CollapseIcon className="h-4 w-4" />
            </ModeToggleButton>
          </ModeToggleGroup>
        )}
        {showTransparentColorButton && (
          <ModeToggleGroup
            transparentUi={transparentUi}
            transparentBorderColor={transparentPalette.border}>
            <ModeToggleButton
              active={false}
              position="only"
              label={t("transparentKeyColor")}
              tooltipPlacement="below"
              style={transparentOutlineStyle({
                color: transparentPalette.text,
                outlineColor: settings.transparentKeyColor,
              })}
              activeClassName="bg-transparent"
              onClick={() =>
                void updateSettings({
                  transparentKeyColor: nextTransparentKeyColor(
                    settings.transparentKeyColor,
                  ),
                })
              }>
              <span
                className="block h-3.5 w-3.5 rounded-full border border-black/40"
                style={{ backgroundColor: transparentPalette.text }}
                aria-hidden
              />
            </ModeToggleButton>
          </ModeToggleGroup>
        )}
        {showTransparentToggle && (
          <ModeToggleGroup
            transparentUi={transparentUi}
            transparentBorderColor={transparentPalette.border}>
            <ModeToggleButton
              active={Boolean(settings.focusModeTransparent)}
              position="only"
              label={t("focusModeTransparent")}
              tooltipPlacement="below"
              tooltipAlign="end"
              style={
                transparentUi
                  ? transparentOutlineStyle({
                      active: Boolean(settings.focusModeTransparent),
                      color: transparentPalette.text,
                      outlineColor: settings.transparentKeyColor,
                    })
                  : undefined
              }
              activeClassName={transparentUi ? "bg-transparent" : undefined}
              onClick={() =>
                updateSettings({
                  focusModeTransparent: !settings.focusModeTransparent,
                })
              }>
              <TransparentKeyboardIcon className="h-4 w-4" />
            </ModeToggleButton>
          </ModeToggleGroup>
        )}
        {showSynthToolbar && (
          <>
            <PianoRangeControl
              octaveCount={settings.synthesizerOctaveCount}
              startOctave={settings.synthesizerStartOctave}
              songRangeLabel={songRangeLabel}
              onStartOctaveChange={(synthesizerStartOctave) =>
                updateSettings({ synthesizerStartOctave })
              }
              onOctaveCountChange={(synthesizerOctaveCount) => {
                const center = startOctave + octaveCount / 2;
                const synthesizerStartOctave = Math.round(
                  center - synthesizerOctaveCount / 2,
                );
                void updateSettings({
                  synthesizerOctaveCount,
                  synthesizerStartOctave,
                });
              }}
            />
            {!isV1FeatureHidden("mouse") && (
              <ModeToggleGroup>
                <ModeToggleButton
                  active={settings.mouseVisible}
                  position="only"
                  label={
                    isWidePianoOctaveCount(settings.synthesizerOctaveCount)
                      ? t("mouseHiddenForWidePiano")
                      : settings.mouseVisible
                        ? t("hideMouseSection")
                        : t("showMouseSection")
                  }
                  onClick={() =>
                    updateSettings({ mouseVisible: !settings.mouseVisible })
                  }
                  disabled={isWidePianoOctaveCount(
                    settings.synthesizerOctaveCount,
                  )}>
                  <MouseIcon className="h-4 w-4" />
                </ModeToggleButton>
              </ModeToggleGroup>
            )}
            <SynthVolumeControl
              volume={settings.synthesizerVolume ?? 70}
              muted={settings.synthesizerMuted ?? false}
              onVolumeChange={(synthesizerVolume) =>
                updateSettings({ synthesizerVolume })
              }
              onMutedChange={(synthesizerMuted) =>
                updateSettings({ synthesizerMuted })
              }
            />
          </>
        )}
      </div>
    ) : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToolbar &&
        (showFocusModeToolbar ? (
          <div className={focusModeToolbarClassName(false)}>
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                aria-label={t("resizeWindowHeight")}
                className={`flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} w-8 shrink-0 cursor-ns-resize items-center justify-center rounded ${
                  transparentUi
                    ? "bg-transparent"
                    : "bg-slate-200/80 text-slate-700 hover:bg-slate-300/80"
                }`}
                style={{
                  touchAction: "none",
                  ...(transparentToolbarStyle ?? {}),
                }}
                {...heightDrag}>
                <HeightGripIcon className="h-4 w-4" />
              </button>
              <div
                className={`flex min-w-0 flex-1 items-center justify-center px-1 ${
                  showInputPreview
                    ? "min-h-12"
                    : showSuggestionsRow
                      ? "min-h-7"
                      : ""
                }`}>
                <PreviewSuggestionsRow
                  showPreview={showInputPreview}
                  showSuggestions={showSuggestionsRow}
                />
              </div>
              {endControls}
            </div>
          </div>
        ) : (
          <div
            className={`relative z-20 grid w-full shrink-0 grid-cols-[1fr_auto_1fr] items-end gap-2 overflow-visible pr-1 ${compact ? "pt-2" : showInputPreview || showSuggestionsRow || showSynth ? "py-0" : "pt-6"}`}>
            <div aria-hidden className="min-w-0" />
            <div
              className="flex min-w-0 items-center justify-center overflow-hidden px-1"
              style={
                auxCenterMinHeightPx > 0
                  ? { minHeight: auxCenterMinHeightPx }
                  : undefined
              }>
              <PreviewSuggestionsRow
                showPreview={showInputPreview}
                showSuggestions={showSuggestionsRow}
              />
            </div>
            {endControls}
          </div>
        ))}
      {showSynth ? (
        <div className="min-h-0 flex-1">
          <Synthesizer />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Keyboard />
        </div>
      )}
    </div>
  );
}
