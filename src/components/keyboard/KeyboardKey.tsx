import { memo, useCallback, useRef, type ReactNode } from "react";
import type { KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";
import { KeyButton } from "./KeyButton";

export type KeyboardKeyPressMeta = KeyRepeatFireMeta;

type KeyboardKeyProps = {
  /** Stable identity for the key within the current layout. */
  keyId: string;
  label: ReactNode;
  width?: number;
  size: number;
  spacing: number;
  fontSize: number;
  bgColor: string;
  textColor: string;
  active: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  stretch?: boolean;
  transparent: boolean;
  outlineColor?: string | null;
  repeatOnHold?: boolean;
  /** Stable callback; receives keyId so the parent can look up KeyDef. */
  onPressKey: (keyId: string, meta?: KeyboardKeyPressMeta) => void;
  onHoldEndKey?: (keyId: string) => void;
};

/**
 * Memoized key cell: keeps `onPress`/`onHoldEnd` referentially stable so
 * `KeyButton` memo skips keys whose visual props did not change.
 */
export const KeyboardKey = memo(function KeyboardKey({
  keyId,
  label,
  width,
  size,
  spacing,
  fontSize,
  bgColor,
  textColor,
  active,
  disabled,
  ariaLabel,
  stretch,
  transparent,
  outlineColor,
  repeatOnHold,
  onPressKey,
  onHoldEndKey,
}: KeyboardKeyProps) {
  const keyIdRef = useRef(keyId);
  keyIdRef.current = keyId;

  const onPress = useCallback(
    (meta?: KeyboardKeyPressMeta) => {
      onPressKey(keyIdRef.current, meta);
    },
    [onPressKey],
  );

  const onHoldEnd = useCallback(() => {
    onHoldEndKey?.(keyIdRef.current);
  }, [onHoldEndKey]);

  return (
    <KeyButton
      label={label}
      width={width}
      size={size}
      spacing={spacing}
      fontSize={fontSize}
      bgColor={bgColor}
      textColor={textColor}
      stretch={stretch}
      transparent={transparent}
      outlineColor={outlineColor}
      active={active}
      disabled={disabled}
      ariaLabel={ariaLabel}
      repeatOnHold={repeatOnHold}
      onHoldEnd={onHoldEndKey ? onHoldEnd : undefined}
      onPress={onPress}
    />
  );
});
