import {
  CollapseIcon,
  MouseIcon,
  TeachingLessonIcon,
  TransparentKeyboardIcon,
} from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { InputPreview } from "./InputPreview";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { PianoRangeControl } from "./PianoRangeControl";
import {
  KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS,
  modeToggleSegmentPosition,
} from "../../lib/buttonClasses";
import { useAppStore, type TeachingLesson } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";
import { getSongById, songPianoRangeFit } from "../../lib/music/songs";
import { resolveSynthOctaveCount, resolveSynthStartOctave, isWidePianoOctaveCount } from "../../lib/music/octaveCount";
import { isTransparentUiActive, nextTransparentKeyColor, transparentKeyPalette, transparentOutlineStyle, isInputPreviewActiveForMode } from "../../lib/miniMode";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import {
  isSynthesizerUiActive,
  isTeachingSessionActive,
} from "../../lib/appModeLayout";

/** Reserved height for suggestion chips so appearing tags do not shrink keys. */
const SUGGESTION_ROW_MIN_CLASS = "min-h-8";
const INPUT_PREVIEW_STRIP_HEIGHT_PX = 48;

export function KeyboardSection() {
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const miniModeKeyboardVisible = useAppStore((s) => s.miniModeKeyboardVisible);
  const collapseMiniModeKeyboard = useAppStore((s) => s.collapseMiniModeKeyboard);
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const setTeachingLesson = useAppStore((s) => s.setTeachingLesson);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const importedSongs = useAppStore((s) => s.importedSongs);
  const hasInputTarget = useAppStore((s) => s.physicalKeyState.hasInputTarget);
  const companionSessionLive = useAppStore((s) => s.companionSessionLive);
  const { t } = useTranslation();
  const teachingActive =
    isTeachingSessionActive(
      musicTeachingEnabled,
      settings.keyboardSectionMode,
    ) && !miniModeActive;
  const showSynth =
    isSynthesizerUiActive(
      musicTeachingEnabled,
      settings.keyboardSectionMode,
      teachingLesson,
    ) && !miniModeActive;
  const compact = settings.inputAreaCompact;
  const showInputPreview =
    !showSynth &&
    !compact &&
    !companionSessionLive &&
    hasInputTarget &&
    isInputPreviewActiveForMode(settings, miniModeActive);
  const showSuggestions = !showSynth && settings.suggestionsVisible && !compact;
  const transparentUi = isTransparentUiActive(settings, miniModeActive);
  const showTransparentToggle = miniModeActive && !showSynth && !compact;
  const showMiniModeCollapse =
    miniModeActive && miniModeKeyboardVisible && !showSynth && !compact;
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const transparentToolbarStyle = transparentUi
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: settings.transparentKeyColor,
      })
    : undefined;
  const showMiniModeToolbar = miniModeActive && !showSynth && !compact;
  const showTransparentColorButton = transparentUi && showTransparentToggle;
  const showLessonToggle = teachingActive && !compact;
  const showSynthToolbar = showSynth && !compact;
  const showToolbar =
    showLessonToggle ||
    showSynthToolbar ||
    showInputPreview ||
    showSuggestions ||
    showTransparentToggle ||
    showMiniModeCollapse;
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

  const lessonButtons: { id: TeachingLesson; labelKey: "teachingLessonLanguage" | "teachingLessonMusic" | "teachingLessonMath" }[] = [
    { id: "language", labelKey: "teachingLessonLanguage" },
    { id: "music", labelKey: "teachingLessonMusic" },
    { id: "math", labelKey: "teachingLessonMath" },
  ];

  const auxCenterMinHeightPx =
    (showInputPreview ? INPUT_PREVIEW_STRIP_HEIGHT_PX : 0) +
    (showSuggestions ? 32 : 0) +
    (showInputPreview && showSuggestions ? 8 : 0);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToolbar && (
        <div
          className={`relative z-20 shrink-0 grid w-full grid-cols-[1fr_auto_1fr] items-end gap-2 overflow-visible pr-1 ${showMiniModeToolbar ? "pt-3 pb-1" : compact ? "pt-2" : showSuggestions || showInputPreview ? "pt-2 pb-0" : "pt-6"}`}
        >
          <div aria-hidden className="min-w-0" />
          <div
            className="flex min-w-0 flex-col items-center justify-end gap-2 overflow-hidden px-1"
            style={
              auxCenterMinHeightPx > 0
                ? { minHeight: auxCenterMinHeightPx }
                : undefined
            }
          >
            {showInputPreview && <InputPreview />}
            {showSuggestions && (
              <div
                className={`flex w-full items-center justify-center ${SUGGESTION_ROW_MIN_CLASS}`}
              >
                <SuggestionsBar />
              </div>
            )}
          </div>
          {(showLessonToggle ||
            showSynthToolbar ||
            showTransparentToggle ||
            showMiniModeCollapse) ? (
            <div
              className={`flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 items-center justify-end gap-2 pr-2`}
            >
              {showMiniModeCollapse && (
                <ModeToggleGroup
                  transparentUi={transparentUi}
                  transparentBorderColor={transparentPalette.border}
                >
                  <ModeToggleButton
                    active={false}
                    position="only"
                    label={t("miniModeCollapse")}
                    tooltipPlacement="below"
                    disabled={isAnimatingWindow}
                    style={transparentToolbarStyle}
                    activeClassName={
                      transparentUi ? "bg-transparent" : undefined
                    }
                    onClick={() => void collapseMiniModeKeyboard()}
                  >
                    <CollapseIcon className="h-4 w-4" />
                  </ModeToggleButton>
                </ModeToggleGroup>
              )}
              {showTransparentColorButton && (
                <ModeToggleGroup
                  transparentUi={transparentUi}
                  transparentBorderColor={transparentPalette.border}
                >
                  <ModeToggleButton
                    active={false}
                    position="only"
                    label={t("transparentKeyColor")}
                    tooltipPlacement="below"
                    style={
                      transparentUi
                        ? transparentOutlineStyle({
                            color: transparentPalette.text,
                            outlineColor: settings.transparentKeyColor,
                          })
                        : undefined
                    }
                    activeClassName={
                      transparentUi ? "bg-transparent" : undefined
                    }
                    onClick={() =>
                      updateSettings({
                        transparentKeyColor: nextTransparentKeyColor(
                          settings.transparentKeyColor,
                        ),
                      })
                    }
                  >
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
                  transparentBorderColor={transparentPalette.border}
                >
                  <ModeToggleButton
                    active={Boolean(settings.miniModeTransparent)}
                    position="only"
                    label={t("miniModeTransparent")}
                    tooltipPlacement="below"
                    tooltipAlign="end"
                    style={
                      transparentUi
                        ? transparentOutlineStyle({
                            active: Boolean(settings.miniModeTransparent),
                            color: transparentPalette.text,
                            outlineColor: settings.transparentKeyColor,
                          })
                        : undefined
                    }
                    activeClassName={
                      transparentUi ? "bg-transparent" : undefined
                    }
                    onClick={() =>
                      updateSettings({
                        miniModeTransparent: !settings.miniModeTransparent,
                      })
                    }
                  >
                    <TransparentKeyboardIcon className="h-4 w-4" />
                  </ModeToggleButton>
                </ModeToggleGroup>
              )}
              {showLessonToggle && (
                <ModeToggleGroup>
                  {lessonButtons.map((lesson, index) => (
                    <ModeToggleButton
                      key={lesson.id}
                      active={
                        musicTeachingEnabled && teachingLesson === lesson.id
                      }
                      position={modeToggleSegmentPosition(
                        index,
                        lessonButtons.length,
                      )}
                      label={t(lesson.labelKey)}
                      onClick={() => setTeachingLesson(lesson.id)}
                    >
                      <TeachingLessonIcon
                        lesson={lesson.id}
                        className="h-4 w-4"
                      />
                    </ModeToggleButton>
                  ))}
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
                      updateSettings({
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
                        disabled={isWidePianoOctaveCount(settings.synthesizerOctaveCount)}
                      >
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
          ) : null}
        </div>
      )}
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
