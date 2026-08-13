import {
  CollapseIcon,
  MouseIcon,
  TransparentKeyboardIcon,
} from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { PianoRangeControl } from "./PianoRangeControl";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";
import { useAppStore, type TeachingLesson } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";
import { getSongById, songPianoRangeFit } from "../../lib/music/songs";
import { resolveSynthOctaveCount, resolveSynthStartOctave, isWidePianoOctaveCount } from "../../lib/music/octaveCount";
import { isTransparentUiActive, nextTransparentKeyColor, transparentKeyPalette, transparentOutlineStyle } from "../../lib/miniMode";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import { isSynthesizerUiActive } from "../../lib/appModeLayout";

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
  const { t } = useTranslation();
  const showSynth = isSynthesizerUiActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const compact = settings.inputAreaCompact;
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
  const showTransparentColorButton = transparentUi && showTransparentToggle;
  const showSynthToolbar = showSynth && !compact;
  const showToolbar =
    showSynthToolbar ||
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

  const lessonButtons: { id: TeachingLesson; labelKey: "teachingLessonMusic" | "teachingLessonMath" | "teachingLessonLanguage" }[] = [
    { id: "music", labelKey: "teachingLessonMusic" },
    { id: "math", labelKey: "teachingLessonMath" },
    { id: "language", labelKey: "teachingLessonLanguage" },
  ];

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToolbar && (
        <div
          className={`relative z-20 flex items-center justify-between gap-2 overflow-visible pr-1 ${compact ? "pt-2" : "pt-6"}`}
        >
          <div className="min-w-0 flex-1 pl-1.5">
            {showSuggestions && <SuggestionsBar />}
          </div>
              {(showSynthToolbar || showTransparentToggle || showMiniModeCollapse) && (
            <div
              className={`flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 items-center gap-2 pr-2`}
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
              {showTransparentToggle && (
                <ModeToggleGroup
                  transparentUi={transparentUi}
                  transparentBorderColor={transparentPalette.border}
                >
                  <ModeToggleButton
                    active={Boolean(settings.miniModeTransparent)}
                    position="only"
                    label={t("miniModeTransparent")}
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
              {showTransparentColorButton && (
                <ModeToggleGroup
                  transparentUi
                  transparentBorderColor={transparentPalette.border}
                >
                  <ModeToggleButton
                    active={false}
                    position="only"
                    label={t("transparentKeyColor")}
                    style={transparentOutlineStyle({
                      color: transparentPalette.text,
                      outlineColor: settings.transparentKeyColor,
                    })}
                    activeClassName="bg-transparent"
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
              {showSynthToolbar && (
                <>
                  <ModeToggleGroup>
                    {lessonButtons.map((lesson, index) => {
                      const position =
                        index === 0
                          ? "first"
                          : index === lessonButtons.length - 1
                            ? "last"
                            : "middle";
                      return (
                        <ModeToggleButton
                          key={lesson.id}
                          active={
                            musicTeachingEnabled && teachingLesson === lesson.id
                          }
                          position={position}
                          label={t(lesson.labelKey)}
                          onClick={() => setTeachingLesson(lesson.id)}
                        >
                          <span className="px-1 text-xs font-semibold">
                            {t(lesson.labelKey)}
                          </span>
                        </ModeToggleButton>
                      );
                    })}
                  </ModeToggleGroup>
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
          )}
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
