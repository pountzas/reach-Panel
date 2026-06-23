import { useCallback, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useContainerSize } from "../../hooks/useContainerSize";

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
  left?: number;
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

function buildPianoKeys(
  whiteKeyWidth: number,
  blackKeyWidth: number,
): { whiteKeys: PianoKey[]; blackKeys: PianoKey[] } {
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
          left:
            (globalWhiteIndex + 1) * whiteKeyWidth -
            blackKeyWidth / 2 -
            whiteKeyWidth * 0.12,
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

type ActiveVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

export function Synthesizer() {
  const { settings } = useAppStore();
  const { t } = useTranslation();
  const { ref, width, height } = useContainerSize<HTMLDivElement>();
  const audioRef = useRef<AudioContext | null>(null);
  const activeVoices = useRef<Map<string, ActiveVoice>>(new Map());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());

  const whiteKeyCount = OCTAVE_COUNT * 7 + 1;
  const hintHeight = 28;
  const padding = 16;
  const availableHeight = Math.max(80, height - hintHeight - padding);
  const availableWidth = Math.max(200, width - padding);
  const whiteKeyWidth = Math.max(20, Math.min(availableWidth / whiteKeyCount, 56));
  const whiteKeyHeight = Math.max(80, Math.min(availableHeight, whiteKeyWidth * 4.4));
  const blackKeyWidth = whiteKeyWidth * 0.58;
  const blackKeyHeight = whiteKeyHeight * 0.62;

  const { whiteKeys, blackKeys } = useMemo(
    () => buildPianoKeys(whiteKeyWidth, blackKeyWidth),
    [whiteKeyWidth, blackKeyWidth],
  );

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
    }
    if (audioRef.current.state === "suspended") {
      await audioRef.current.resume();
    }
    return audioRef.current;
  }, []);

  const startNote = useCallback(
    async (keyId: string, frequency: number) => {
      const ctx = await ensureAudio();
      if (activeVoices.current.has(keyId)) return;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      activeVoices.current.set(keyId, { oscillator, gain });
    },
    [ensureAudio],
  );

  const stopNote = useCallback(
    async (keyId: string) => {
      const voice = activeVoices.current.get(keyId);
      if (!voice) return;

      const ctx = audioRef.current;
      if (!ctx) return;

      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      voice.oscillator.stop(ctx.currentTime + 0.1);
      activeVoices.current.delete(keyId);
    },
    [],
  );

  const pressKey = useCallback(
    (key: PianoKey) => {
      setPressedKeys((prev) => new Set(prev).add(key.id));
      void startNote(key.id, key.freq);
    },
    [startNote],
  );

  const releaseKey = useCallback(
    (keyId: string) => {
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
      void stopNote(keyId);
    },
    [stopNote],
  );

  const whiteKeyColor = settings.keyboardKeyColor ?? "#fafafa";
  const pressedWhiteColor = "#e2e8f0";
  const blackKeyColor = "#1e293b";
  const pressedBlackColor = "#0f172a";

  const keyHandlers = (key: PianoKey) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pressKey(key);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      releaseKey(key.id);
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      releaseKey(key.id);
    },
    onLostPointerCapture: () => releaseKey(key.id),
  });

  const renderWhiteKey = (key: PianoKey) => {
    const isPressed = pressedKeys.has(key.id);
    return (
      <button
        key={key.id}
        type="button"
        aria-label={key.id}
        className={`relative shrink-0 rounded-b-lg border border-slate-300 font-semibold shadow-sm transition-transform ${isPressed ? "key-pressed" : ""}`}
        style={{
          width: whiteKeyWidth,
          height: whiteKeyHeight,
          fontSize: settings.keyboardFontSize ?? 14,
          color: settings.keyTextColor ?? "#475569",
          backgroundColor: isPressed ? pressedWhiteColor : whiteKeyColor,
        }}
        {...keyHandlers(key)}
      >
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2">{key.label}</span>
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
        className={`absolute top-0 z-10 rounded-b-md border border-slate-900 font-semibold shadow-md transition-transform ${isPressed ? "key-pressed" : ""}`}
        style={{
          left: key.left,
          width: blackKeyWidth,
          height: blackKeyHeight,
          fontSize: Math.max(10, (settings.keyboardFontSize ?? 18) * 0.55),
          color: "#f8fafc",
          backgroundColor: isPressed ? pressedBlackColor : blackKeyColor,
        }}
        {...keyHandlers(key)}
      >
      </button>
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
      <p className="mb-2 shrink-0 text-center text-sm font-medium text-slate-600">
        {t("synthesizerHint")}
      </p>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto pb-1">
        <div
          className="relative mx-auto"
          style={{
            width: whiteKeys.length * whiteKeyWidth,
            height: whiteKeyHeight,
          }}
        >
          <div className="relative flex h-full">
            {whiteKeys.map(renderWhiteKey)}
          </div>
          {blackKeys.map(renderBlackKey)}
        </div>
      </div>
    </div>
  );
}
