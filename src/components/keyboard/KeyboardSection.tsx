import {
  KeyboardIcon,
  MouseIcon,
  SynthesizerIcon,
  TeachIcon,
} from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { PianoRangeControl } from "./PianoRangeControl";
import { DictationButton } from "./DictationButton";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";
import { getSongById, songPianoRangeFit } from "../../lib/music/songs";
import { resolveSynthOctaveCount, resolveSynthStartOctave, isWidePianoOctaveCount } from "../../lib/music/octaveCount";

export function KeyboardSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const importedSongs = useAppStore((s) => s.importedSongs);
  const enableMusicTeaching = useAppStore((s) => s.enableMusicTeaching);
  const disableMusicTeaching = useAppStore((s) => s.disableMusicTeaching);
  const { t } = useTranslation();
  const showSynth = settings.keyboardSectionMode === "synthesizer";
  const compact = settings.inputAreaCompact;
  const showToggle = settings.keyboardModeToggleVisible && !compact;
  const showDictation =
    !showSynth && settings.dictationVisible !== false && !compact;
  const showSuggestions = !showSynth && settings.suggestionsVisible && !compact;
  const showToolbar = showDictation || showToggle || showSuggestions;
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

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToolbar && (
        <div
          className={`relative z-20 flex items-center overflow-visible pr-1 ${compact ? "pt-2" : "pt-6"} ${showDictation || showToggle ? "justify-end gap-2" : "justify-center"}`}
        >
          {showSuggestions && (
            <div
              className={
                showDictation || showToggle
                  ? "pointer-events-none absolute inset-x-0 flex justify-center"
                  : "min-w-0 max-w-full"
              }
            >
              <div
                className={
                  showDictation || showToggle
                    ? "pointer-events-auto min-w-0 max-w-[min(100%,calc(100%-11rem))] px-1"
                    : "min-w-0 max-w-full"
                }
              >
                <SuggestionsBar />
              </div>
            </div>
          )}
          {(showDictation || showToggle) && (
            <div
              className={`relative z-10 flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 items-center gap-2 pr-2`}
            >
              {showDictation && <DictationButton />}
              {showSynth && showToggle && (
                <>
                  <ModeToggleGroup>
                    <ModeToggleButton
                      active={musicTeachingEnabled}
                      position="only"
                      label={musicTeachingEnabled ? t("stopTeaching") : t("teachMusic")}
                      onClick={() => {
                        if (musicTeachingEnabled) {
                          void disableMusicTeaching();
                        } else {
                          void enableMusicTeaching();
                        }
                      }}
                    >
                      <TeachIcon className="h-4 w-4" />
                    </ModeToggleButton>
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
              {showToggle && (
                <ModeToggleGroup>
                  <ModeToggleButton
                    active={!showSynth}
                    position="first"
                    label={t("keyboard")}
                    onClick={() => updateSettings({ keyboardSectionMode: "keyboard" })}
                  >
                    <KeyboardIcon className="h-4 w-4" />
                  </ModeToggleButton>
                  <ModeToggleButton
                    active={showSynth}
                    position="last"
                    label={t("synthesizer")}
                    onClick={() => updateSettings({ keyboardSectionMode: "synthesizer" })}
                  >
                    <SynthesizerIcon className="h-4 w-4" />
                  </ModeToggleButton>
                </ModeToggleGroup>
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
