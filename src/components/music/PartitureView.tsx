import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import {
  ledgerLinePositions,
  layoutPartiture,
  STAFF_STEP_COUNT,
  type PartitureNoteLayout,
} from "../../lib/music/partiture";
import { songBeatSeconds, type MusicSong } from "../../lib/music/songs";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";

const STEP_PX = 6;
const STAFF_PAD_TOP = 28;
const STAFF_PAD_BOTTOM = 28;
const NOTE_START_X = 52;
const UNIT_ADVANCE_PX = 22;
const NOTE_HEAD_RX = 5;
const NOTE_HEAD_RY = 4;

/** Keep scroll animation inside a fraction of the sounding note. */
const SCROLL_NOTE_FRACTION = 0.72;
const SCROLL_MS_MIN = 140;
const SCROLL_MS_MAX = 720;
const SCROLL_MS_JUMP = 220;

type PartitureViewProps = {
  song: MusicSong | null;
  activeIndex: number;
  completed: boolean;
};

function staffY(staffPos: number): number {
  return STAFF_PAD_TOP + staffPos * STEP_PX;
}

function noteStemUp(staffPos: number): boolean {
  return staffPos >= STAFF_STEP_COUNT / 2;
}

function scrollDurationMs(song: MusicSong, activeIndex: number, indexDelta: number): number {
  if (indexDelta === 0) return SCROLL_MS_MIN;
  if (Math.abs(indexDelta) > 1) return SCROLL_MS_JUMP;

  const beats = song.notes[activeIndex]?.beats ?? 1;
  const ms = beats * songBeatSeconds(song) * 1000 * SCROLL_NOTE_FRACTION;
  return Math.round(Math.min(SCROLL_MS_MAX, Math.max(SCROLL_MS_MIN, ms)));
}

function NoteGlyph({
  note,
  x,
  color,
  opacity,
  active,
}: {
  note: PartitureNoteLayout;
  x: number;
  color: string;
  opacity: number;
  active: boolean;
}) {
  const cy = staffY(note.staffPos);
  const filled = note.duration !== "whole" && note.duration !== "half";
  const hasStem = note.duration !== "whole";
  const stemUp = noteStemUp(note.staffPos);
  const stemLen = STEP_PX * 3.2;
  const stemX = stemUp ? x + NOTE_HEAD_RX - 1 : x - NOTE_HEAD_RX + 1;
  const stemY1 = cy;
  const stemY2 = stemUp ? cy - stemLen : cy + stemLen;
  const flagCount =
    note.duration === "eighth" ? 1 : note.duration === "sixteenth" ? 2 : 0;
  const ledgers = ledgerLinePositions(note.staffPos);

  return (
    <g
      className={`partiture-note${active ? " partiture-note-active" : ""}`}
      style={{ opacity, color }}
      data-active={active ? "true" : undefined}
    >
      {ledgers.map((pos) => (
        <line
          key={`ledger-${pos}`}
          x1={x - 9}
          x2={x + 9}
          y1={staffY(pos)}
          y2={staffY(pos)}
          stroke="currentColor"
          strokeWidth={1.25}
        />
      ))}
      {note.accidental === "#" && (
        <text
          x={x - 14}
          y={cy + 4}
          fill="currentColor"
          fontSize={14}
          fontFamily="serif"
          textAnchor="middle"
        >
          ♯
        </text>
      )}
      <ellipse
        className="partiture-note-head"
        cx={x}
        cy={cy}
        rx={NOTE_HEAD_RX}
        ry={NOTE_HEAD_RY}
        transform={`rotate(-20 ${x} ${cy})`}
        fill={filled ? "currentColor" : "transparent"}
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.4}
      />
      {hasStem && (
        <line
          x1={stemX}
          y1={stemY1}
          x2={stemX}
          y2={stemY2}
          stroke="currentColor"
          strokeWidth={1.4}
        />
      )}
      {flagCount > 0 &&
        Array.from({ length: flagCount }, (_, i) => {
          const fy = stemUp ? stemY2 + i * 5 : stemY2 - i * 5;
          const dir = stemUp ? 1 : -1;
          return (
            <path
              key={`flag-${i}`}
              d={`M ${stemX} ${fy} q 8 ${4 * dir} 6 ${10 * dir}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
            />
          );
        })}
      <circle
        className="partiture-note-ring"
        cx={x}
        cy={cy}
        r={11}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={2}
      />
    </g>
  );
}

export function PartitureView({ song, activeIndex, completed }: PartitureViewProps) {
  const settings = useAppStore((s) => s.settings);
  const surface = getSurfaceColors(settings.appBgColor);
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(activeIndex);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [transitionMs, setTransitionMs] = useState(320);

  const layout = useMemo(
    () => (song ? layoutPartiture(song.notes) : null),
    [song],
  );

  const positions = useMemo(() => {
    if (!layout) return [] as number[];
    const xs: number[] = [];
    let x = NOTE_START_X;
    for (const note of layout.notes) {
      xs.push(x);
      x += note.advance * UNIT_ADVANCE_PX;
    }
    return xs;
  }, [layout]);

  const svgWidth = Math.max(
    200,
    (positions[positions.length - 1] ?? NOTE_START_X) + 40,
  );
  const svgHeight = STAFF_PAD_TOP + STAFF_STEP_COUNT * STEP_PX + STAFF_PAD_BOTTOM;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportWidth(viewport.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [song?.id]);

  useLayoutEffect(() => {
    if (!song) return;
    const delta = activeIndex - prevIndexRef.current;
    setTransitionMs(scrollDurationMs(song, activeIndex, delta));
    prevIndexRef.current = activeIndex;
  }, [activeIndex, song]);

  const focusX =
    positions[Math.min(activeIndex, Math.max(0, positions.length - 1))] ??
    NOTE_START_X;
  // Center active note in the viewport (same idea as the pitch strip).
  const trackOffsetPx = viewportWidth > 0 ? viewportWidth / 2 - focusX : 0;

  const octaveMark =
    layout?.displayOctaveShift === 1
      ? "8vb"
      : layout?.displayOctaveShift === -1
        ? "8va"
        : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-1 overflow-hidden rounded-xl border p-2"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
        color: surface.panelText,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{t("partiture")}</span>
        {octaveMark && (
          <span className="text-xs" style={{ color: surface.panelMutedText }}>
            {octaveMark}
          </span>
        )}
      </div>
      {!song || !layout || layout.notes.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center text-xs"
          style={{ color: surface.panelMutedText }}
        >
          —
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="partiture-viewport relative min-h-0 flex-1 overflow-hidden"
        >
          <div
            className="partiture-track absolute inset-y-0 left-0"
            style={{
              width: svgWidth,
              transform: `translate3d(${trackOffsetPx}px, 0, 0)`,
              transitionDuration: `${transitionMs}ms`,
            }}
          >
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              role="img"
              aria-label={t("partiture")}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = staffY(i * 2);
                return (
                  <line
                    key={`staff-${i}`}
                    x1={8}
                    x2={svgWidth - 8}
                    y1={y}
                    y2={y}
                    stroke={surface.panelText}
                    strokeWidth={1.1}
                    opacity={0.75}
                  />
                );
              })}
              <text
                x={14}
                y={staffY(6) + 2}
                fill={surface.panelText}
                fontSize={36}
                fontFamily="serif"
              >
                𝄞
              </text>
              {layout.notes.map((note, index) => {
                const isActive = !completed && index === activeIndex;
                const isPast = completed || index < activeIndex;
                const x = positions[index] ?? NOTE_START_X;
                return (
                  <NoteGlyph
                    key={`${note.pitch}-${index}`}
                    note={note}
                    x={x}
                    color={isActive ? "#92400e" : surface.panelText}
                    opacity={isActive ? 1 : isPast ? 0.35 : 0.85}
                    active={isActive}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
