import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import {
  BUILT_IN_SONGS,
  getSongById,
  songPianoRangeFit,
} from "../../lib/music/songs";
import {
  pianoRangeLabel,
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
} from "../../lib/music/octaveCount";
import { isImportedMusicSong } from "../../lib/music/parseJsonSong";

/** Fixed slot width so the strip can keep the active note centered. */
const NOTE_SLOT_REM = 2.75;
const NOTE_GAP_REM = 0.75;

export function MusicLessonPanel() {
  const settings = useAppStore((s) => s.settings);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const musicNoteIndex = useAppStore((s) => s.musicNoteIndex);
  const musicPlaybackActive = useAppStore((s) => s.musicPlaybackActive);
  const importedSongs = useAppStore((s) => s.importedSongs);
  const setMusicSongId = useAppStore((s) => s.setMusicSongId);
  const restartMusicLesson = useAppStore((s) => s.restartMusicLesson);
  const startMusicPlayback = useAppStore((s) => s.startMusicPlayback);
  const stopMusicPlayback = useAppStore((s) => s.stopMusicPlayback);
  const importMusicSongsFromFile = useAppStore((s) => s.importMusicSongsFromFile);
  const deleteImportedSong = useAppStore((s) => s.deleteImportedSong);
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);

  const song = getSongById(musicSongId, importedSongs);
  const selectedIsImported = song ? isImportedMusicSong(song) : false;
  const total = song?.notes.length ?? 0;
  const completed = total > 0 && musicNoteIndex >= total;
  const focusIndex = completed
    ? Math.max(0, total - 1)
    : Math.min(musicNoteIndex, Math.max(0, total - 1));
  const progressLabel =
    total === 0
      ? "0 / 0"
      : completed
        ? `${total} / ${total}`
        : `${musicNoteIndex + 1} / ${total}`;
  const octaveCount = resolveSynthOctaveCount(settings.synthesizerOctaveCount);
  const startOctave = resolveSynthStartOctave(
    settings.synthesizerStartOctave,
    octaveCount,
  );
  const songFit = song ? songPianoRangeFit(song) : null;
  const keyboardRange = pianoRangeLabel(startOctave, octaveCount);
  const songRangeLabel = songFit
    ? `${songFit.songMinId}–${songFit.songMaxId}`
    : null;
  const stripOffsetRem =
    focusIndex * (NOTE_SLOT_REM + NOTE_GAP_REM) + NOTE_SLOT_REM / 2;

  return (
    <div
      className="flex h-full flex-col gap-2 overflow-hidden rounded-xl border p-2"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
        color: surface.panelText,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t("musicLesson")}</span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs font-medium"
            style={{
              borderColor: surface.panelBorder,
              backgroundColor: surface.panelBg,
              color: surface.panelText,
            }}
            onClick={() => void importMusicSongsFromFile()}
            disabled={musicPlaybackActive}
          >
            {t("loadSong")}
          </button>
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs font-medium"
            style={{
              borderColor: surface.panelBorder,
              backgroundColor: musicPlaybackActive ? "#fde68a" : surface.panelBg,
              color: surface.panelText,
            }}
            onClick={() => {
              if (musicPlaybackActive) {
                stopMusicPlayback();
              } else {
                startMusicPlayback();
              }
            }}
            disabled={!song || song.notes.length === 0}
          >
            {musicPlaybackActive ? t("stopSong") : t("playSong")}
          </button>
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs font-medium"
            style={{
              borderColor: surface.panelBorder,
              backgroundColor: surface.panelBg,
              color: surface.panelText,
            }}
            onClick={() => restartMusicLesson()}
            disabled={musicPlaybackActive}
          >
            {t("restartLesson")}
          </button>
          {selectedIsImported && (
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{
                borderColor: surface.panelBorder,
                backgroundColor: surface.panelBg,
                color: surface.panelText,
              }}
              onClick={() => {
                if (!song) return;
                const ok = window.confirm(
                  t("confirmDeleteSong").replace("{title}", song.title),
                );
                if (ok) {
                  void deleteImportedSong(song.id);
                }
              }}
              disabled={musicPlaybackActive}
            >
              {t("deleteSong")}
            </button>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs" style={{ color: surface.panelMutedText }}>
        <span>{t("selectSong")}</span>
        <select
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          value={musicSongId ?? ""}
          disabled={musicPlaybackActive}
          onChange={(event) => {
            void setMusicSongId(event.target.value);
          }}
        >
          <optgroup label={t("builtInSongs")}>
            {BUILT_IN_SONGS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
                {entry.composer ? ` — ${entry.composer}` : ""}
              </option>
            ))}
          </optgroup>
          {importedSongs.length > 0 && (
            <optgroup label={t("importedSongs")}>
              {importedSongs.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                  {entry.composer ? ` — ${entry.composer}` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {song && (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{song.title}</span>
            <span style={{ color: surface.panelMutedText }}>{progressLabel}</span>
          </div>
          {song.composer && (
            <span className="text-xs" style={{ color: surface.panelMutedText }}>
              {song.composer}
            </span>
          )}
          {completed && (
            <p className="mt-1 text-sm font-semibold text-emerald-600">{t("lessonComplete")}</p>
          )}
          {songRangeLabel && (
            <p className="text-xs" style={{ color: surface.panelMutedText }}>
              {t("songRange")}: {songRangeLabel} · {t("pianoRange")}: {keyboardRange}
            </p>
          )}
          {songFit && !songFit.fitsCompletely && (
            <p className="text-xs text-amber-700">{t("songWiderThanPiano")}</p>
          )}
          {songFit?.fitsCompletely &&
            (startOctave !== songFit.startOctave ||
              octaveCount !== songFit.octaveCount) && (
              <p className="text-xs text-amber-700">
                {t("songNeedsOctaves").replace(
                  "{range}",
                  pianoRangeLabel(songFit.startOctave, songFit.octaveCount),
                )}
              </p>
            )}
        </div>
      )}

      {song && song.notes.length > 0 && (
        <div
          className="music-note-strip relative mt-auto h-16 overflow-hidden rounded-md border"
          style={{ borderColor: surface.panelBorder }}
          aria-label={t("upcomingNotes")}
        >
          <div
            className="music-note-strip-track absolute inset-y-0 flex items-center"
            style={{
              left: "50%",
              gap: `${NOTE_GAP_REM}rem`,
              transform: `translateX(-${stripOffsetRem}rem)`,
            }}
          >
            {song.notes.map((note, index) => {
              const isActive = !completed && index === musicNoteIndex;
              const isPast = completed || index < musicNoteIndex;
              return (
                <span
                  key={`${note.pitch}-${index}`}
                  className={`music-note-chip flex shrink-0 items-center justify-center rounded-md tabular-nums ${
                    isActive ? "music-note-chip-active font-bold" : "text-sm"
                  }`}
                  style={{
                    width: `${NOTE_SLOT_REM}rem`,
                    color: surface.panelText,
                    opacity: isActive ? 1 : isPast ? 0.35 : 0.55,
                    backgroundColor: isActive ? "#fde68a" : "transparent",
                  }}
                >
                  {note.pitch}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
