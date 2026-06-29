import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAppStore } from "../../stores/appStore";
import { useContainerSize } from "../../hooks/useContainerSize";
import { getSynthBlackKeyColors } from "../../lib/colorProfiles";
import { findKeyIdAtPoint } from "../../lib/synthHitTest";

const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"] as const;
const BLACK_AFTER_WHITE: Record<number, string> = {
  0: "C#",
  1: "D#",
  3: "F#",
  4: "G#",
  5: "A#",
};

const START_OCTAVE = 3;
const OCTAVE_COUNT = 2;

type PianoKey = {
  id: string;
  label: string;
  freq: number;
  isBlack: boolean;
  leftRatio?: number;
};

function noteToMidi(note: string, octave: number): number {
  const semitones: Record<string, number> = {
    C: 0,
    "C#": 1,
    D: 2,
    "D#": 3,
    E: 4,
    F: 5,
    "F#": 6,
    G: 7,
    "G#": 8,
    A: 9,
    "A#": 10,
    B: 11,
  };
  return (octave + 1) * 12 + semitones[note];
}

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function buildPianoKeys(): { whiteKeys: PianoKey[]; blackKeys: PianoKey[] } {
  const whiteKeys: PianoKey[] = [];
  const blackKeys: PianoKey[] = [];

  for (let octave = START_OCTAVE; octave < START_OCTAVE + OCTAVE_COUNT; octave++) {
    for (let i = 0; i < WHITE_NOTES.length; i++) {
      const note = WHITE_NOTES[i];
      const id = `${note}${octave}`;
      whiteKeys.push({
        id,
        label: note,
        freq: midiToFreq(noteToMidi(note, octave)),
        isBlack: false,
      });

      const blackNote = BLACK_AFTER_WHITE[i];
      if (blackNote) {
        const globalWhiteIndex = (octave - START_OCTAVE) * 7 + i;
        blackKeys.push({
          id: `${blackNote}${octave}`,
          label: blackNote,
          freq: midiToFreq(noteToMidi(blackNote, octave)),
          isBlack: true,
          leftRatio: (globalWhiteIndex + 1) / (OCTAVE_COUNT * 7 + 1),
        });
      }
    }
  }

  const topC = START_OCTAVE + OCTAVE_COUNT;
  whiteKeys.push({
    id: `C${topC}`,
    label: "C",
    freq: midiToFreq(noteToMidi("C", topC)),
    isBlack: false,
  });

  return { whiteKeys, blackKeys };
}

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
  const { settings } = useAppStore();
  const { ref, height } = useContainerSize<HTMLDivElement>();
  const pianoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activePointers = useRef<Map<number, ActivePointer>>(new Map());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());

  const volumeLevel = useMemo(() => {
    if (settings.synthesizerMuted) return 0;
    return (settings.synthesizerVolume ?? 70) / 100;
  }, [settings.synthesizerMuted, settings.synthesizerVolume]);

  const whiteKeyCount = OCTAVE_COUNT * 7 + 1;
  const { whiteKeyHeight, blackKeyHeightRatio } = computePianoMetrics(height);
  const blackKeyWidthRatio = (100 / whiteKeyCount) * 0.58;
  const blackKeyHeight = whiteKeyHeight * blackKeyHeightRatio;

  const { whiteKeys, blackKeys } = useMemo(() => buildPianoKeys(), []);
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
      }

      syncPressedKeys();
    },
    [keyById, startVoice, stopVoice, syncPressedKeys],
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
    };
  }, [stopVoice]);

  const whiteKeyColor = settings.keyboardKeyColor ?? "#fafafa";
  const pressedWhiteColor = "#e2e8f0";
  const { base: blackKeyColor, pressed: pressedBlackColor } = getSynthBlackKeyColors(
    settings.colorProfile,
    settings.keyTextColor,
  );

  const renderWhiteKey = (key: PianoKey) => {
    const isPressed = pressedKeys.has(key.id);
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        className={`relative min-w-0 flex-1 rounded-b-lg border border-slate-300 font-semibold shadow-sm transition-transform ${isPressed ? "key-pressed" : ""}`}
        style={{
          height: whiteKeyHeight,
          fontSize: settings.keyboardFontSize ?? 14,
          color: settings.keyTextColor ?? "#475569",
          backgroundColor: isPressed ? pressedWhiteColor : whiteKeyColor,
        }}
      >
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
          {key.label}
        </span>
      </button>
    );
  };

  const renderBlackKey = (key: PianoKey) => {
    const isPressed = pressedKeys.has(key.id);
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        data-piano-key-id={key.id}
        className={`absolute top-0 z-10 rounded-b-md border border-slate-900 font-semibold shadow-md transition-transform ${isPressed ? "key-pressed" : ""}`}
        style={{
          left: `${(key.leftRatio ?? 0) * 100}%`,
          transform: "translateX(-50%)",
          width: `${blackKeyWidthRatio}%`,
          height: blackKeyHeight,
          fontSize: Math.max(10, (settings.keyboardFontSize ?? 18) * 0.55),
          color: "#f8fafc",
          backgroundColor: isPressed ? pressedBlackColor : blackKeyColor,
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
