import { useEffect, useRef, useState } from "react";
import {
  FrequencyResponseCurve,
  FrequencyResponseGraph,
  type Magnitude,
} from "dsssp";
import "dsssp/font";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";

const GRAPH_WIDTH = 120;
/** Inner SVG height: h-8 (32px) minus 2px border. */
const GRAPH_HEIGHT = 30;
const POINT_COUNT = 48;

function byteToMagnitude(value: number): number {
  return (value / 255) * 18 - 4;
}

function buildMagnitudes(
  data: Uint8Array,
  sampleRate: number,
): Magnitude[] {
  const nyquist = sampleRate / 2;
  const binCount = data.length;
  const result: Magnitude[] = [];

  for (let i = 0; i < POINT_COUNT; i++) {
    const t = i / (POINT_COUNT - 1);
    const freq = 40 * Math.pow(nyquist / 40, t);
    if (freq > nyquist) break;
    const bin = Math.min(
      binCount - 1,
      Math.max(0, Math.round((freq / nyquist) * (binCount - 1))),
    );
    result.push({
      frequency: freq,
      magnitude: byteToMagnitude(data[bin] ?? 0),
    });
  }

  return result;
}

interface DictationVisualizerProps {
  active: boolean;
}

export function DictationVisualizer({ active }: DictationVisualizerProps) {
  const [magnitudes, setMagnitudes] = useState<Magnitude[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<{
    context: AudioContext;
    stream: MediaStream;
    analyser: AnalyserNode;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.stream.getTracks().forEach((track) => track.stop());
        void audioRef.current.context.close();
        audioRef.current = null;
      }
      setMagnitudes([]);
      return;
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
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);

        audioRef.current = { context, stream, analyser };
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!audioRef.current) return;
          audioRef.current.analyser.getByteFrequencyData(data);
          setMagnitudes(
            buildMagnitudes(data, audioRef.current.context.sampleRate),
          );
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setMagnitudes([]);
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
        audioRef.current.stream.getTracks().forEach((track) => track.stop());
        void audioRef.current.context.close();
        audioRef.current = null;
      }
    };
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <div
      className={`box-border ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 overflow-hidden rounded border border-red-300/60 bg-red-50/80`}
      style={{ width: GRAPH_WIDTH }}
      aria-hidden
    >
      {magnitudes.length > 0 ? (
        <FrequencyResponseGraph
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          ariaLabel="Live dictation spectrum"
          scale={{
            minFreq: 40,
            maxFreq: 8000,
            minGain: -8,
            maxGain: 16,
            dbLabels: false,
            octaveTicks: 0,
            octaveLabels: [],
            majorTicks: [],
          }}
          theme={{
            background: {
              grid: {
                dotted: false,
                lineColor: "transparent",
                lineWidth: { minor: 0, major: 0, center: 0, border: 0 },
              },
              gradient: {
                start: "transparent",
                stop: "transparent",
                direction: "VERTICAL",
              },
              label: {
                color: "transparent",
                fontSize: 0,
              },
            },
            curve: {
              color: "#dc2626",
              width: 1.5,
              opacity: 0.95,
            },
          }}
          style={{ display: "block" }}
        >
          <FrequencyResponseCurve
            magnitudes={magnitudes}
            color="#dc2626"
            lineWidth={1.75}
            opacity={0.95}
            animate
            easing="easeOut"
            duration={80}
          />
        </FrequencyResponseGraph>
      ) : null}
    </div>
  );
}
