import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { BUILT_IN_SONGS, getSongById, songRequiredOctaveCount } from "../../lib/music/songs";
import { resolveSynthOctaveCount } from "../../lib/music/octaveCount";

export function MusicLessonPanel() {
  const settings = useAppStore((s) => s.settings);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const musicNoteIndex = useAppStore((s) => s.musicNoteIndex);
  const setMusicSongId = useAppStore((s) => s.setMusicSongId);
  const restartMusicLesson = useAppStore((s) => s.restartMusicLesson);
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);

  const song = getSongById(musicSongId);
  const total = song?.notes.length ?? 0;
  const completed = total > 0 && musicNoteIndex >= total;
  const currentNote = song && !completed ? song.notes[musicNoteIndex] : null;
  const progressLabel =
    total === 0
      ? "0 / 0"
      : completed
        ? `${total} / ${total}`
        : `${musicNoteIndex + 1} / ${total}`;
  const octaveCount = resolveSynthOctaveCount(settings.synthesizerOctaveCount);
  const neededOctaves = song ? songRequiredOctaveCount(song) : 2;

  return (
    <div
      className="flex h-full flex-col gap-2 overflow-auto rounded-xl border p-2"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
        color: surface.panelText,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t("musicLesson")}</span>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs font-medium"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          onClick={() => restartMusicLesson()}
        >
          {t("restartLesson")}
        </button>
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
          onChange={(event) => {
            void setMusicSongId(event.target.value);
          }}
        >
          {BUILT_IN_SONGS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
              {entry.composer ? ` — ${entry.composer}` : ""}
            </option>
          ))}
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
          {completed ? (
            <p className="mt-1 text-sm font-semibold text-emerald-600">{t("lessonComplete")}</p>
          ) : (
            <p className="mt-1 text-sm">
              {t("waitingForNote")}:{" "}
              <span className="font-semibold tabular-nums">{currentNote}</span>
            </p>
          )}
          {neededOctaves > octaveCount && (
            <p className="text-xs text-amber-700">
              {t("songNeedsOctaves").replace("{count}", String(neededOctaves))}
            </p>
          )}
        </div>
      )}

      {!completed && song && (
        <div
          className="mt-auto flex flex-wrap gap-1 rounded-md border p-2 text-xs"
          style={{ borderColor: surface.panelBorder }}
          aria-label={t("upcomingNotes")}
        >
          {song.notes.slice(musicNoteIndex, musicNoteIndex + 12).map((note, index) => (
            <span
              key={`${note}-${musicNoteIndex + index}`}
              className={`rounded px-1.5 py-0.5 tabular-nums ${index === 0 ? "font-bold ring-1 ring-amber-400" : ""}`}
              style={{
                backgroundColor: index === 0 ? "#fde68a" : "transparent",
                color: surface.panelText,
              }}
            >
              {note}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
