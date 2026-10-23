// @vitest-environment jsdom
/**
 * React Profiler harness for issue #281 (sticky typing scenario).
 * Simulates Keyboard's ~80 KeyButtons with sticky Shift held while typing
 * 20 characters: only the pressed key's `active` flag changes per stroke.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  Profiler,
  memo,
  useCallback,
  useRef,
  useState,
  type ComponentType,
  type ProfilerOnRenderCallback,
} from "react";
import { act, render, fireEvent } from "@testing-library/react";
import { KeyButton } from "./KeyButton";
import type { KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";

const KEY_COUNT = 80;
const STROKES = 20;

let keyButtonRenderCount = 0;

type KeyButtonProps = React.ComponentProps<typeof KeyButton>;

function CountingKeyButton(props: KeyButtonProps) {
  // Profiler harness: count renders (intentional render side effect).
  // eslint-disable-next-line react-hooks/globals -- test render counter
  keyButtonRenderCount += 1;
  return <KeyButton {...props} />;
}

const MemoCountingKeyButton = memo(CountingKeyButton);

type Mode = "baseline" | "memo-stable";

function StickyTypingHarness({
  mode,
  onRender,
}: {
  mode: Mode;
  onRender: ProfilerOnRenderCallback;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const Button: ComponentType<KeyButtonProps> =
    mode === "memo-stable" ? MemoCountingKeyButton : CountingKeyButton;

  const pressRef = useRef<(index: number) => void>(() => undefined);
  // Keep latest setter for stable onPressKey without re-creating all keys.
  // eslint-disable-next-line react-hooks/refs -- sync callback ref for harness
  pressRef.current = (index: number) => {
    setActiveIndex(index);
  };

  const onPressKey = useCallback((index: number) => {
    pressRef.current(index);
  }, []);

  return (
    <Profiler id="sticky-typing-keys" onRender={onRender}>
      <div data-testid="keyboard">
        <button
          type="button"
          data-testid="type-next"
          onClick={() => {
            setActiveIndex((prev) => {
              const next = (prev + 1 + KEY_COUNT) % KEY_COUNT;
              return next;
            });
          }}>
          type
        </button>
        {Array.from({ length: KEY_COUNT }, (_, i) => {
          // Sticky-Shift harness: uppercase labels
          const label = String.fromCharCode(65 + (i % 26));
          if (mode === "memo-stable") {
            return (
              <StableKey
                key={i}
                index={i}
                label={label}
                active={activeIndex === i}
                onPressKey={onPressKey}
                Button={Button}
              />
            );
          }
          return (
            <Button
              key={i}
              label={label}
              size={40}
              spacing={4}
              fontSize={16}
              bgColor="#ffffff"
              textColor="#1e293b"
              active={activeIndex === i}
              onPress={() => {
                setActiveIndex(i);
              }}
            />
          );
        })}
      </div>
    </Profiler>
  );
}

function StableKey({
  index,
  label,
  active,
  onPressKey,
  Button,
}: {
  index: number;
  label: string;
  active: boolean;
  onPressKey: (index: number, meta?: KeyRepeatFireMeta) => void;
  Button: ComponentType<KeyButtonProps>;
}) {
  const indexRef = useRef(index);
  // Stable onPress must see the latest index without invalidating memo.
  // eslint-disable-next-line react-hooks/refs -- sync index into callback ref
  indexRef.current = index;
  const onPress = useCallback(
    (meta?: KeyRepeatFireMeta) => {
      onPressKey(indexRef.current, meta);
    },
    [onPressKey],
  );
  return (
    <Button
      label={label}
      size={40}
      spacing={4}
      fontSize={16}
      bgColor="#ffffff"
      textColor="#1e293b"
      active={active}
      onPress={onPress}
    />
  );
}

describe("KeyButton sticky-typing profiler (#281)", () => {
  beforeEach(() => {
    keyButtonRenderCount = 0;
  });

  it("baseline: every key re-renders on each of 20 sticky-Shift strokes", () => {
    let commits = 0;
    let totalActualMs = 0;
    const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase === "update") {
        commits += 1;
        totalActualMs += actualDuration;
      }
    };

    const { getByTestId } = render(
      <StickyTypingHarness mode="baseline" onRender={onRender} />,
    );

    keyButtonRenderCount = 0;
    commits = 0;
    totalActualMs = 0;

    for (let i = 0; i < STROKES; i++) {
      act(() => {
        fireEvent.click(getByTestId("type-next"));
      });
    }

    const renders = keyButtonRenderCount;

    console.log(
      JSON.stringify({
        scenario: "sticky-typing-20",
        mode: "baseline",
        keyCount: KEY_COUNT,
        strokes: STROKES,
        updateCommits: commits,
        keyButtonRenders: renders,
        totalActualMs: Number(totalActualMs.toFixed(3)),
        msPerStroke: Number((totalActualMs / STROKES).toFixed(3)),
      }),
    );

    // Without memo, each stroke re-renders all keys.
    expect(renders).toBe(KEY_COUNT * STROKES);
    expect(commits).toBe(STROKES);
  });

  it("memo-stable: only active-key transitions re-render on sticky-Shift strokes", () => {
    let commits = 0;
    let totalActualMs = 0;
    const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase === "update") {
        commits += 1;
        totalActualMs += actualDuration;
      }
    };

    const { getByTestId } = render(
      <StickyTypingHarness mode="memo-stable" onRender={onRender} />,
    );

    keyButtonRenderCount = 0;
    commits = 0;
    totalActualMs = 0;

    for (let i = 0; i < STROKES; i++) {
      act(() => {
        fireEvent.click(getByTestId("type-next"));
      });
    }

    const renders = keyButtonRenderCount;

    console.log(
      JSON.stringify({
        scenario: "sticky-typing-20",
        mode: "memo-stable",
        keyCount: KEY_COUNT,
        strokes: STROKES,
        updateCommits: commits,
        keyButtonRenders: renders,
        totalActualMs: Number(totalActualMs.toFixed(3)),
        msPerStroke: Number((totalActualMs / STROKES).toFixed(3)),
      }),
    );

    // Each stroke: previous active clears + new active sets ⇒ ≤2 KeyButton renders,
    // except the first stroke (only -1 → 0) ⇒ 1. Total ≤ STROKES * 2.
    expect(renders).toBeLessThanOrEqual(STROKES * 2);
    expect(renders).toBeLessThan(KEY_COUNT * STROKES);
    expect(commits).toBe(STROKES);
  });
});
