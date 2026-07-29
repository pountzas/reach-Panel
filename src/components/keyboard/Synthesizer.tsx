import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAppStore } from "../../stores/appStore";
import { useContainerSize } from "../../hooks/useContainerSize";
import { getSynthBlackKeyColors } from "../../lib/colorProfiles";
import { findKeyIdAtPoint } from "../../lib/synthHitTest";
import { resolveSynthOctaveCount } from "../../lib/music/octaveCount";
import { buildPianoKeys, type PianoKey } from "../../lib/music/pianoKeys";
import { getSongById, songBeatSeconds } from "../../lib/music/songs";

function computePianoMetrics(containerHeight: number) {
  if (containerHeight <= 0) {
    return { whiteKeyHeight: 80, blackKeyHeightRatio: 0.62 };
  }
  const padding = 16;
  const available = containerHeight - padding;
  const whiteKeyHeight = Math.max(28, Math.floor(available));
  return { whiteKeyHeight, blackKeyHeightRatio: 0.62 };
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
  const reportMusicKeyPlayed = useAppStore((s) => s.reportMusicKeyPlayed);
  const setMusicPlaybackNoteIndex = useAppStore((s) => s.setMusicPlaybackNoteIndex);
  const finishMusicPlayback = useAppStore((s) => s.finishMusicPlayback);
  const { ref, height } = useContainerSize<HTMLDivElement>();
  const pianoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activePointers = useRef<Map<number, ActivePointer>>(new Map());
  const playbackTimersRef = useRef<number[]>([]);
  const playbackOscillatorsRef = useRef<OscillatorNode[]>([]);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());
  const [playbackKeyId, setPlaybackKeyId] = useState<string | null>(null);

  const octaveCount = resolveSynthOctaveCount(settings.synthesizerOctaveCount);

  const targetKeyId = useMemo(() => {
    if (!musicTeachingEnabled) return null;
    const song = getSongById(musicSongId);
    if (!song) return null;
    if (musicNoteIndex >= song.notes.length) return null;
    return song.notes[musicNoteIndex]?.pitch ?? null;
  }, [musicTeachingEnabled, musicSongId, musicNoteIndex]);

  const volumeLevel = useMemo(() => {
    if (settings.synthesizerMuted) return 0;
    return (settings.synthesizerVolume ?? 70) / 100;
  }, [settings.synthesizerMuted, settings.synthesizerVolume]);

  const whiteKeyCount = octaveCount * 7 + 1;
  const { whiteKeyHeight, blackKeyHeightRatio } = computePianoMetrics(height);
  const blackKeyWidthRatio = (100 / whiteKeyCount) * 0.58;
  const blackKeyHeight = whiteKeyHeight * blackKeyHeightRatio;

  const { whiteKeys, blackKeys } = useMemo(
    () => buildPianoKeys(octaveCount),
    [octaveCount],
  );
  const keyById = useMemo(() => {
    const map = new Map<string, PianoKey>();
    for (const key of [...whiteKeys, ...blackKeys]) {
      map.set(key.id, key);
    }
    return map;
  }, [whiteKeys, blackKeys]);

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
      masterGainRef.current.gain.setValueAtTime(volumeLevel, audioRef.current.currentTime);
    }
    return audioRef.current;
  }, [volumeLevel]);

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
      syncPressedKeys();
    },
    [stopVoice, syncPressedKeys],
  );

  const setPointerKey = useCallback(
    async (pointerId: number, keyId: string | null) => {
      if (useAppStore.getState().musicPlaybackActive) return;

      const current = activePointers.current.get(pointerId);
      if (current?.keyId === keyId) return;

      if (current) {
        stopVoice(current.voice);
        activePointers.current.delete(pointerId);
      }

      if (keyId) {
        const key = keyById.get(keyId);
        if (!key) return;
        const voice = await startVoice(key.freq);
        activePointers.current.set(pointerId, { keyId, voice });
        reportMusicKeyPlayed(keyId);
      }

      syncPressedKeys();
    },
    [keyById, reportMusicKeyPlayed, startVoice, stopVoice, syncPressedKeys],
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
    return () => {
      for (const entry of pointers.values()) {
        stopVoice(entry.voice);
      }
      pointers.clear();
      clearPlaybackSchedule();
    };
  }, [clearPlaybackSchedule, stopVoice]);

  useEffect(() => {
    if (!musicPlaybackActive || !musicTeachingEnabled) {
      clearPlaybackSchedule();
      return;
    }

    const song = getSongById(musicSongId);
    if (!song || song.notes.length === 0) {
      finishMusicPlayback();
      return;
    }

    let cancelled = false;

    const run = async () => {
      const ctx = await ensureAudio();
      if (cancelled) return;

      clearPlaybackSchedule();
      const beatSec = songBeatSeconds(song);
      let t = ctx.currentTime + 0.05;
      const timers: number[] = [];
      const oscillators: OscillatorNode[] = [];
      const master = masterGainRef.current ?? ctx.destination;

      song.notes.forEach((note, index) => {
        const slotSec = Math.max(0.05, note.beats * beatSec);
        const soundSec = Math.max(0.04, slotSec * 0.82);
        const startAt = t;
        const key = keyById.get(note.pitch);
        const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);

        timers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            setMusicPlaybackNoteIndex(index);
            setPlaybackKeyId(note.pitch);
          }, delayMs),
        );

        timers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            setPlaybackKeyId((current) => (current === note.pitch ? null : current));
          }, delayMs + soundSec * 1000),
        );

        if (key) {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "triangle";
          oscillator.frequency.value = key.freq;
          gain.gain.setValueAtTime(0.001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.015);
          gain.gain.setValueAtTime(0.22, startAt + Math.max(0.02, soundSec - 0.06));
          gain.gain.exponentialRampToValueAtTime(0.001, startAt + soundSec);
          oscillator.connect(gain);
          gain.connect(master);
          oscillator.start(startAt);
          oscillator.stop(startAt + soundSec + 0.05);
          oscillators.push(oscillator);
        }

        t += slotSec;
      });

      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setPlaybackKeyId(null);
          finishMusicPlayback();
        }, Math.max(0, (t - ctx.currentTime) * 1000)),
      );

      playbackTimersRef.current = timers;
      playbackOscillatorsRef.current = oscillators;
    };

    void run();

    return () => {
      cancelled = true;
      clearPlaybackSchedule();
    };
  }, [
    clearPlaybackSchedule,
    ensureAudio,
    finishMusicPlayback,
    keyById,
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
    let backgroundColor = whiteKeyColor;
    if (isPressed) backgroundColor = pressedWhiteColor;
    else if (isTarget) backgroundColor = highlightWhiteColor;
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        data-piano-target={isTarget ? "true" : undefined}
        className={`relative min-w-0 flex-1 rounded-b-lg border font-semibold shadow-sm transition-transform ${isPressed ? "key-pressed" : ""} ${isTarget ? "border-amber-500 ring-2 ring-amber-400 ring-inset" : "border-slate-300"}`}
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
    let backgroundColor = blackKeyColor;
    if (isPressed) backgroundColor = pressedBlackColor;
    else if (isTarget) backgroundColor = highlightBlackColor;
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        data-piano-target={isTarget ? "true" : undefined}
        className={`absolute top-0 z-10 rounded-b-md border font-semibold shadow-md transition-transform ${isPressed ? "key-pressed" : ""} ${isTarget ? "border-amber-300 ring-2 ring-amber-300" : "border-slate-900"}`}
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
