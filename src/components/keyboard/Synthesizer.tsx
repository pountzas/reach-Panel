import { useCallback, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

const NOTES = [
  { label: "C", freq: 261.63 },
  { label: "D", freq: 293.66 },
  { label: "E", freq: 329.63 },
  { label: "F", freq: 349.23 },
  { label: "G", freq: 392.0 },
  { label: "A", freq: 440.0 },
  { label: "B", freq: 493.88 },
  { label: "C⁺", freq: 523.25 },
];

export function Synthesizer() {
  const { settings } = useAppStore();
  const { t } = useTranslation();
  const audioRef = useRef<AudioContext | null>(null);

  const playNote = useCallback((frequency: number) => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
    }
    const ctx = audioRef.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.65);
  }, []);

  const keySize = settings.keyboardKeySize;
  const spacing = settings.keyboardSpacing;

  return (
    <div
      className="flex flex-col rounded-xl p-2"
      style={{
        backgroundColor: settings.keyboardBgColor ?? "#e8edf2",
        opacity: settings.opacity,
      }}
    >
      <p className="mb-2 text-center text-sm font-medium text-slate-600">
        {t("synthesizerHint")}
      </p>
      <div className="flex justify-center">
        {NOTES.map((note) => (
          <button
            key={note.label}
            type="button"
            className="rounded-lg border border-slate-300 font-semibold shadow-sm transition active:scale-95"
            style={{
              width: keySize * 1.1,
              height: keySize * 2,
              marginRight: spacing,
              fontSize: settings.keyboardFontSize ?? 18,
              color: settings.keyTextColor ?? "#1e293b",
              backgroundColor: settings.keyboardKeyColor ?? "#ffffff",
            }}
            onPointerDown={() => playNote(note.freq)}
          >
            {note.label}
          </button>
        ))}
      </div>
    </div>
  );
}
