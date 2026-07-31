import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAppStore } from "../../stores/appStore";
import { useContainerSize } from "../../hooks/useContainerSize";
import { getSynthBlackKeyColors } from "../../lib/colorProfiles";
import { findKeyIdAtPoint } from "../../lib/synthHitTest";
import { resolveSynthOctaveCount, resolveSynthStartOctave } from "../../lib/music/octaveCount";
import {
  buildPianoKeys,
  midiToFreq,
  noteIdToMidi,
  type PianoKey,
} from "../../lib/music/pianoKeys";
import { getSongById, songBeatSeconds } from "../../lib/music/songs";

/** Keep short allegro notes audible even when slot spacing is very tight. */
const MIN_PLAYBACK_SOUND_SEC = 0.1;
const PLAYBACK_LOOKAHEAD_SEC = 0.3;
const PLAYBACK_PUMP_MS = 40;

/** Brief linger so quick wrong taps are still visible. */
const WRONG_KEY_FLASH_MS = 280;
const WRONG_WHITE_COLOR = "#fecaca";
const WRONG_BLACK_COLOR = "#dc2626";

function computePianoMetrics(containerHeight: number) {
  if (containerHeight <= 0) {
    return { whiteKeyHeight: 80, blackKeyHeightRatio: 0.62 };
  }
  const padding = 16;
  const available = containerHeight - padding;
  const whiteKeyHeight = Math.max(28, Math.floor(available));
  return { whiteKeyHeight, blackKeyHeightRatio: 0.62 };
}

function frequencyForPitch(
  pitch: string,
  keys: Map<string, PianoKey>,
): number | null {
  const onKeyboard = keys.get(pitch);
  if (onKeyboard) return onKeyboard.freq;
  const midi = noteIdToMidi(pitch);
  return midi != null ? midiToFreq(midi) : null;
}

type ActiveVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

type ActivePointer = {
  keyId: string;
  voice: ActiveVoice;
};

function pressedKeysFromPointers(activePointers: Map<number, ActivePointer>): Set<string> {
  return new Set([...activePointers.values()].map((entry) => entry.keyId));
}

export function Synthesizer() {
  const settings = useAppStore((s) => s.settings);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const musicPlaybackActive = useAppStore((s) => s.musicPlaybackActive);
  const musicSongId = useAppStore((s) => s.musicSongId);
  const musicNoteIndex = useAppStore((s) => s.musicNoteIndex);
  const importedSongs = useAppStore((s) => s.importedSongs);
  const reportMusicKeyPlayed = useAppStore((s) => s.reportMusicKeyPlayed);
  const setMusicPlaybackNoteIndex = useAppStore((s) => s.setMusicPlaybackNoteIndex);
  const finishMusicPlayback = useAppStore((s) => s.finishMusicPlayback);
  const { ref, height } = useContainerSize<HTMLDivElement>();
  const pianoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activePointers = useRef<Map<number, ActivePointer>>(new Map());
  const playbackTimersRef = useRef<number[]>([]);
  const playbackIntervalRef = useRef<number | null>(null);
  const playbackOscillatorsRef = useRef<OscillatorNode[]>([]);
  const wrongKeyTimersRef = useRef<Map<string, number>>(new Map());
  const wrongKeysRef = useRef<Set<string>>(new Set());
  const targetKeyIdRef = useRef<string | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());
  const [playbackKeyId, setPlaybackKeyId] = useState<string | null>(null);
  const [wrongKeys, setWrongKeys] = useState<Set<string>>(() => new Set());

  const octaveCount = resolveSynthOctaveCount(settings.synthesizerOctaveCount);
  const startOctave = resolveSynthStartOctave(
    settings.synthesizerStartOctave,
    octaveCount,
  );

  const targetKeyId = useMemo(() => {
    if (!musicTeachingEnabled) return null;
    const song = getSongById(musicSongId, importedSongs);
    if (!song) return null;
    if (musicNoteIndex >= song.notes.length) return null;
    return song.notes[musicNoteIndex]?.pitch ?? null;
  }, [importedSongs, musicTeachingEnabled, musicSongId, musicNoteIndex]);
  targetKeyIdRef.current = targetKeyId;

  const syncWrongKeys = useCallback((next: Set<string>) => {
    wrongKeysRef.current = next;
    setWrongKeys(next);
  }, []);

  const clearWrongKeyFlash = useCallback(
    (keyId: string) => {
      const existing = wrongKeyTimersRef.current.get(keyId);
      if (existing != null) {
        window.clearTimeout(existing);
        wrongKeyTimersRef.current.delete(keyId);
      }
      if (!wrongKeysRef.current.has(keyId)) return;
      const next = new Set(wrongKeysRef.current);
      next.delete(keyId);
      syncWrongKeys(next);
    },
    [syncWrongKeys],
  );

  const markWrongKey = useCallback(
    (keyId: string) => {
      const existing = wrongKeyTimersRef.current.get(keyId);
      if (existing != null) {
        window.clearTimeout(existing);
        wrongKeyTimersRef.current.delete(keyId);
      }
      if (wrongKeysRef.current.has(keyId)) return;
      const next = new Set(wrongKeysRef.current);
      next.add(keyId);
      syncWrongKeys(next);
    },
    [syncWrongKeys],
  );

  const flashWrongKeyOnRelease = useCallback(
    (keyId: string) => {
      if (!wrongKeysRef.current.has(keyId)) return;
      const existing = wrongKeyTimersRef.current.get(keyId);
      if (existing != null) {
        window.clearTimeout(existing);
      }
      const timer = window.setTimeout(() => {
        wrongKeyTimersRef.current.delete(keyId);
        if (!wrongKeysRef.current.has(keyId)) return;
        const next = new Set(wrongKeysRef.current);
        next.delete(keyId);
        syncWrongKeys(next);
      }, WRONG_KEY_FLASH_MS);
      wrongKeyTimersRef.current.set(keyId, timer);
    },
    [syncWrongKeys],
  );

  useEffect(() => {
    if (musicTeachingEnabled) return;
    for (const timer of wrongKeyTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    wrongKeyTimersRef.current.clear();
    syncWrongKeys(new Set());
  }, [musicTeachingEnabled, syncWrongKeys]);

  const volumeLevel = useMemo(() => {
    if (settings.synthesizerMuted) return 0;
    return (settings.synthesizerVolume ?? 70) / 100;
  }, [settings.synthesizerMuted, settings.synthesizerVolume]);
  const volumeLevelRef = useRef(volumeLevel);
  volumeLevelRef.current = volumeLevel;

  const whiteKeyCount = octaveCount * 7 + 1;
  const { whiteKeyHeight, blackKeyHeightRatio } = computePianoMetrics(height);
  const blackKeyWidthRatio = (100 / whiteKeyCount) * 0.58;
  const blackKeyHeight = whiteKeyHeight * blackKeyHeightRatio;

  const { whiteKeys, blackKeys } = useMemo(
    () => buildPianoKeys(octaveCount, startOctave),
    [octaveCount, startOctave],
  );
  const keyById = useMemo(() => {
    const map = new Map<string, PianoKey>();
    for (const key of [...whiteKeys, ...blackKeys]) {
      map.set(key.id, key);
    }
    return map;
  }, [whiteKeys, blackKeys]);
  const keyByIdRef = useRef(keyById);
  keyByIdRef.current = keyById;

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
      masterGainRef.current = audioRef.current.createGain();
      masterGainRef.current.connect(audioRef.current.destination);
    }
    if (audioRef.current.state === "suspended") {
      await audioRef.current.resume();
    }
    if (masterGainRef.current) {
      masterGainRef.current.gain.setValueAtTime(
        volumeLevelRef.current,
        audioRef.current.currentTime,
      );
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const ctx = audioRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    master.gain.setValueAtTime(volumeLevel, ctx.currentTime);
  }, [volumeLevel]);

  const stopVoice = useCallback((voice: ActiveVoice) => {
    const ctx = audioRef.current;
    if (!ctx) return;

    voice.gain.gain.cancelScheduledValues(ctx.currentTime);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    voice.oscillator.stop(ctx.currentTime + 0.1);
  }, []);

  const clearPlaybackSchedule = useCallback(() => {
    if (playbackIntervalRef.current != null) {
      window.clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    for (const timer of playbackTimersRef.current) {
      window.clearTimeout(timer);
    }
    playbackTimersRef.current = [];
    const ctx = audioRef.current;
    for (const oscillator of playbackOscillatorsRef.current) {
      try {
        if (ctx) {
          oscillator.stop(ctx.currentTime);
        } else {
          oscillator.stop();
        }
      } catch {
        // Already stopped.
      }
    }
    playbackOscillatorsRef.current = [];
    setPlaybackKeyId(null);
  }, []);

  const startVoice = useCallback(
    async (frequency: number): Promise<ActiveVoice> => {
      const ctx = await ensureAudio();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      oscillator.connect(gain);
      const master = masterGainRef.current ?? ctx.destination;
      gain.connect(master);
      oscillator.start();
      return { oscillator, gain };
    },
    [ensureAudio],
  );

  const syncPressedKeys = useCallback(() => {
    setPressedKeys(pressedKeysFromPointers(activePointers.current));
  }, []);

  const releasePointer = useCallback(
    (pointerId: number) => {
      const active = activePointers.current.get(pointerId);
      if (!active) return;

      stopVoice(active.voice);
      activePointers.current.delete(pointerId);
      flashWrongKeyOnRelease(active.keyId);
      syncPressedKeys();
    },
    [flashWrongKeyOnRelease, stopVoice, syncPressedKeys],
  );

  const setPointerKey = useCallback(
    async (pointerId: number, keyId: string | null) => {
      if (useAppStore.getState().musicPlaybackActive) return;

      const current = activePointers.current.get(pointerId);
      if (current?.keyId === keyId) return;

      if (current) {
        stopVoice(current.voice);
        activePointers.current.delete(pointerId);
        flashWrongKeyOnRelease(current.keyId);
      }

      if (keyId) {
        const key = keyById.get(keyId);
        if (!key) return;
        const voice = await startVoice(key.freq);
        activePointers.current.set(pointerId, { keyId, voice });
        const teaching = useAppStore.getState().musicTeachingEnabled;
        const target = targetKeyIdRef.current;
        if (teaching && target && keyId !== target) {
          markWrongKey(keyId);
        } else {
          clearWrongKeyFlash(keyId);
        }
        reportMusicKeyPlayed(keyId);
      }

      syncPressedKeys();
    },
    [
      clearWrongKeyFlash,
      flashWrongKeyOnRelease,
      keyById,
      markWrongKey,
      reportMusicKeyPlayed,
      startVoice,
      stopVoice,
      syncPressedKeys,
    ],
  );

  const updatePointerFromEvent = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const container = pianoRef.current;
      if (!container) return;

      const keyId = findKeyIdAtPoint(container, event.clientX, event.clientY);
      void setPointerKey(event.pointerId, keyId);
    },
    [setPointerKey],
  );

  const onPianoPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updatePointerFromEvent(event);
    },
    [updatePointerFromEvent],
  );

  const onPianoPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updatePointerFromEvent(event);
    },
    [updatePointerFromEvent],
  );

  const onPianoPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      releasePointer(event.pointerId);
    },
    [releasePointer],
  );

  const onPianoLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      releasePointer(event.pointerId);
    },
    [releasePointer],
  );

  useEffect(() => {
    const pointers = activePointers.current;
    const wrongTimers = wrongKeyTimersRef.current;
    return () => {
      for (const entry of pointers.values()) {
        stopVoice(entry.voice);
      }
      pointers.clear();
      clearPlaybackSchedule();
      for (const timer of wrongTimers.values()) {
        window.clearTimeout(timer);
      }
      wrongTimers.clear();
    };
  }, [clearPlaybackSchedule, stopVoice]);

  useEffect(() => {
    if (!musicPlaybackActive || !musicTeachingEnabled) {
      clearPlaybackSchedule();
      return;
    }

    const song = getSongById(musicSongId, importedSongs);
    if (!song || song.notes.length === 0) {
      finishMusicPlayback();
      return;
    }

    let cancelled = false;
    let noteIndex = 0;
    let nextNoteCtxTime = 0;
    let playbackEndCtxTime = 0;

    const scheduleNote = (
      ctx: AudioContext,
      pitch: string,
      index: number,
      startAt: number,
      slotSec: number,
    ) => {
      // Fast passages (allegro 16ths ~150ms) need a floor or the triangle
      // attack/release never becomes audible.
      const soundSec = Math.max(MIN_PLAYBACK_SOUND_SEC, slotSec * 0.88);
      const attackSec = Math.min(0.012, soundSec * 0.2);
      const releaseSec = Math.min(0.07, soundSec * 0.35);
      const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
      playbackEndCtxTime = Math.max(playbackEndCtxTime, startAt + soundSec);

      playbackTimersRef.current.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setMusicPlaybackNoteIndex(index);
          setPlaybackKeyId(pitch);
        }, delayMs),
      );
      playbackTimersRef.current.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setPlaybackKeyId((current) => (current === pitch ? null : current));
        }, delayMs + soundSec * 1000),
      );

      const freq = frequencyForPitch(pitch, keyByIdRef.current);
      if (freq == null) return;

      const master = masterGainRef.current ?? ctx.destination;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + attackSec);
      gain.gain.setValueAtTime(
        0.28,
        startAt + Math.max(attackSec, soundSec - releaseSec),
      );
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + soundSec);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(startAt);
      oscillator.stop(startAt + soundSec + 0.04);
      oscillator.onended = () => {
        playbackOscillatorsRef.current = playbackOscillatorsRef.current.filter(
          (node) => node !== oscillator,
        );
      };
      playbackOscillatorsRef.current.push(oscillator);
    };

    const run = async () => {
      const ctx = await ensureAudio();
      if (cancelled) return;

      clearPlaybackSchedule();
      const beatSec = songBeatSeconds(song);
      nextNoteCtxTime = ctx.currentTime + 0.05;
      playbackEndCtxTime = nextNoteCtxTime;

      const pump = () => {
        if (cancelled) return;
        const horizon = ctx.currentTime + PLAYBACK_LOOKAHEAD_SEC;
        while (noteIndex < song.notes.length && nextNoteCtxTime <= horizon) {
          const note = song.notes[noteIndex]!;
          const slotSec = Math.max(0.05, note.beats * beatSec);
          scheduleNote(ctx, note.pitch, noteIndex, nextNoteCtxTime, slotSec);
          nextNoteCtxTime += slotSec;
          noteIndex += 1;
        }

        if (
          noteIndex >= song.notes.length &&
          ctx.currentTime >= playbackEndCtxTime
        ) {
          if (playbackIntervalRef.current != null) {
            window.clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
          setPlaybackKeyId(null);
          finishMusicPlayback();
        }
      };

      pump();
      playbackIntervalRef.current = window.setInterval(pump, PLAYBACK_PUMP_MS);
    };

    void run();

    return () => {
      cancelled = true;
      clearPlaybackSchedule();
    };
    // Only restart when playback session identity changes — not on volume/layout/key map churn.
  }, [
    clearPlaybackSchedule,
    ensureAudio,
    finishMusicPlayback,
    importedSongs,
    musicPlaybackActive,
    musicSongId,
    musicTeachingEnabled,
    setMusicPlaybackNoteIndex,
  ]);

  const whiteKeyColor = settings.keyboardKeyColor ?? "#fafafa";
  const pressedWhiteColor = "#e2e8f0";
  const highlightWhiteColor = "#fde68a";
  const { base: blackKeyColor, pressed: pressedBlackColor } = getSynthBlackKeyColors(
    settings.colorProfile,
    settings.keyTextColor,
  );
  const highlightBlackColor = "#d97706";

  const renderWhiteKey = (key: PianoKey) => {
    const isPressed = pressedKeys.has(key.id) || playbackKeyId === key.id;
    const isTarget = targetKeyId === key.id;
    const isWrong = wrongKeys.has(key.id);
    let backgroundColor = whiteKeyColor;
    if (isWrong) backgroundColor = WRONG_WHITE_COLOR;
    else if (isPressed) backgroundColor = pressedWhiteColor;
    else if (isTarget) backgroundColor = highlightWhiteColor;
    const ringClass = isWrong
      ? "border-red-500 ring-2 ring-red-400 ring-inset"
      : isTarget
        ? "border-amber-500 ring-2 ring-amber-400 ring-inset"
        : "border-slate-300";
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        data-piano-target={isTarget ? "true" : undefined}
        data-piano-wrong={isWrong ? "true" : undefined}
        className={`relative min-w-0 flex-1 rounded-b-lg border font-semibold shadow-sm transition-transform ${isPressed || isWrong ? "key-pressed" : ""} ${ringClass}`}
        style={{
          height: whiteKeyHeight,
          fontSize: settings.keyboardFontSize ?? 14,
          color: settings.keyTextColor ?? "#475569",
          backgroundColor,
        }}
      >
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
          {key.label}
        </span>
      </button>
    );
  };

  const renderBlackKey = (key: PianoKey) => {
    const isPressed = pressedKeys.has(key.id) || playbackKeyId === key.id;
    const isTarget = targetKeyId === key.id;
    const isWrong = wrongKeys.has(key.id);
    let backgroundColor = blackKeyColor;
    if (isWrong) backgroundColor = WRONG_BLACK_COLOR;
    else if (isPressed) backgroundColor = pressedBlackColor;
    else if (isTarget) backgroundColor = highlightBlackColor;
    const ringClass = isWrong
      ? "border-red-300 ring-2 ring-red-300"
      : isTarget
        ? "border-amber-300 ring-2 ring-amber-300"
        : "border-slate-900";
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        data-piano-target={isTarget ? "true" : undefined}
        data-piano-wrong={isWrong ? "true" : undefined}
        className={`absolute top-0 z-10 rounded-b-md border font-semibold shadow-md transition-transform ${isPressed || isWrong ? "key-pressed" : ""} ${ringClass}`}
        style={{
          left: `${(key.leftRatio ?? 0) * 100}%`,
          transform: "translateX(-50%)",
          width: `${blackKeyWidthRatio}%`,
          height: blackKeyHeight,
          fontSize: Math.max(10, (settings.keyboardFontSize ?? 18) * 0.55),
          color: "#f8fafc",
          backgroundColor,
        }}
      />
    );
  };

  return (
    <div
      ref={ref}
      className="flex h-full w-full flex-col rounded-xl p-2"
      style={{
        backgroundColor: settings.keyboardBgColor ?? "#e8edf2",
        opacity: settings.opacity,
      }}
    >
      <div className="relative flex min-h-0 w-full flex-1">
        <div
          ref={pianoRef}
          className="relative flex h-full w-full touch-none"
          onPointerDown={onPianoPointerDown}
          onPointerMove={onPianoPointerMove}
          onPointerUp={onPianoPointerUp}
          onPointerCancel={onPianoPointerUp}
          onLostPointerCapture={onPianoLostPointerCapture}
        >
          {whiteKeys.map(renderWhiteKey)}
          {blackKeys.map(renderBlackKey)}
        </div>
      </div>
    </div>
  );
}
