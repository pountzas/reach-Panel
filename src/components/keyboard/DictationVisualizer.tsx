import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";
import {
  prefersReducedMotion,
  subscribePrefersReducedMotion,
} from "../../lib/motion";

const BAR_COUNT = 28;
const GRAPH_WIDTH = 112;
const MIN_BAR = 3;
const MAX_BAR = 22;

type DictationVisualizerProps = {
  active: boolean;
  /** When false, animate idle bars only — do not open a second mic stream (needed for Groq/cpal). */
  captureAudio?: boolean;
};

function paintBars(bars: (HTMLSpanElement | null)[], levels: number[]): void {
  for (let i = 0; i < BAR_COUNT; i++) {
    const level = levels[i] ?? 0.08;
    const el = bars[i];
    if (!el) continue;
    const scale = (MIN_BAR + level * (MAX_BAR - MIN_BAR)) / MAX_BAR;
    el.style.transform = `scaleY(${scale})`;
    el.style.opacity = String(0.55 + level * 0.45);
  }
}

/** Cursor-chat-style mic waveform: centered vertical bars driven by live audio. */
export function DictationVisualizer({
  active,
  captureAudio = true,
}: DictationVisualizerProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<{
    context: AudioContext;
    stream: MediaStream;
    analyser: AnalyserNode;
  } | null>(null);
  const smoothRef = useRef<number[]>(
    Array.from({ length: BAR_COUNT }, () => 0.08),
  );
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => subscribePrefersReducedMotion(setReducedMotion), []);

  useLayoutEffect(() => {
    if (!active) {
      paintBars(
        barsRef.current,
        Array.from({ length: BAR_COUNT }, () => 0.08),
      );
      return;
    }
    if (reducedMotion) {
      paintBars(
        barsRef.current,
        Array.from({ length: BAR_COUNT }, () => 0.15),
      );
    }
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.stream.getTracks().forEach((track) => {
          track.stop();
        });
        void audioRef.current.context.close();
        audioRef.current = null;
      }
      smoothRef.current = Array.from({ length: BAR_COUNT }, () => 0.08);
      return;
    }

    if (reducedMotion) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.stream.getTracks().forEach((track) => {
          track.stop();
        });
        void audioRef.current.context.close();
        audioRef.current = null;
      }
      return;
    }

    // Groq/cpal owns the mic — a second getUserMedia stream can silence WASAPI capture.
    if (!captureAudio) {
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        const next = smoothRef.current.map((prev, i) => {
          const shimmer =
            0.08 + 0.06 * Math.sin(performance.now() / 220 + i * 0.55);
          return prev + (shimmer - prev) * 0.25;
        });
        smoothRef.current = next;
        paintBars(barsRef.current, next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }

        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);

        audioRef.current = { context, stream, analyser };
        const time = new Uint8Array(analyser.fftSize);
        const freq = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!audioRef.current) return;
          const { analyser: node } = audioRef.current;
          node.getByteTimeDomainData(time);
          node.getByteFrequencyData(freq);

          let sum = 0;
          for (const sample of time) {
            const v = (sample - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / time.length);
          const voice = Math.min(1, rms * 4.2);

          const next = smoothRef.current.map((prev, i) => {
            // Map bars from center outward across low→mid frequency energy.
            const dist =
              Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
            const bin = Math.min(
              freq.length - 1,
              Math.floor(2 + dist * (freq.length * 0.35)),
            );
            const band = (freq[bin] ?? 0) / 255;
            const target = Math.min(
              1,
              0.1 + voice * 0.35 + band * (0.55 + voice * 0.45),
            );
            // Idle shimmer so the waveform feels alive while listening.
            const shimmer =
              0.04 +
              0.03 * Math.sin(performance.now() / 220 + i * 0.55) * (1 - voice);
            const desired = Math.max(target, shimmer);
            return prev + (desired - prev) * 0.35;
          });
          smoothRef.current = next;
          paintBars(barsRef.current, next);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        paintBars(
          barsRef.current,
          Array.from({ length: BAR_COUNT }, () => 0.12),
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.stream.getTracks().forEach((track) => {
          track.stop();
        });
        void audioRef.current.context.close();
        audioRef.current = null;
      }
    };
  }, [active, captureAudio, reducedMotion]);

  if (!active) {
    return null;
  }

  return (
    <div
      className={`box-border ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-900/90 px-2`}
      style={{ width: GRAPH_WIDTH }}
      aria-hidden>
      <div
        className="flex h-full w-full items-center justify-center gap-0.5"
        style={{ willChange: "transform" }}>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            key={index}
            ref={(el) => {
              barsRef.current[index] = el;
            }}
            className="w-[2.5px] rounded-full bg-red-400"
            style={{
              height: MAX_BAR,
              transformOrigin: "center",
              transform: "scaleY(0.08)",
              opacity: 0.55,
            }}
          />
        ))}
      </div>
    </div>
  );
}
