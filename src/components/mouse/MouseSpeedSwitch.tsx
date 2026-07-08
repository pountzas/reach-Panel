import type { ReactNode } from "react";
import {
  MOUSE_SPEED_LABEL_KEYS,
  MOUSE_SPEED_LEVELS,
  resolveMouseSpeed,
  type MouseSpeed,
} from "../../lib/mouseSpeed";
import { modeToggleSegmentPosition } from "../../lib/buttonClasses";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useTranslation } from "../../hooks/useTranslation";
import type { TranslationKey } from "../../i18n";
import {
  FastSpeedIcon,
  MediumSpeedIcon,
  SlowSpeedIcon,
  VeryFastSpeedIcon,
  VerySlowSpeedIcon,
} from "./MouseSpeedIcons";

interface MouseSpeedSwitchProps {
  value: string | undefined;
  onChange: (speed: MouseSpeed) => void;
}

const SPEED_ICONS: Record<MouseSpeed, ReactNode> = {
  verySlow: <VerySlowSpeedIcon className="h-4 w-4" />,
  slow: <SlowSpeedIcon className="h-4 w-4" />,
  medium: <MediumSpeedIcon className="h-4 w-4" />,
  fast: <FastSpeedIcon className="h-4 w-4" />,
  veryFast: <VeryFastSpeedIcon className="h-4 w-4" />,
};

export function MouseSpeedSwitch({ value, onChange }: MouseSpeedSwitchProps) {
  const { t } = useTranslation();
  const speed = resolveMouseSpeed(value);

  return (
    <ModeToggleGroup>
      {MOUSE_SPEED_LEVELS.map((level, index) => {
        const labelKey = MOUSE_SPEED_LABEL_KEYS[level] as TranslationKey;
        return (
          <ModeToggleButton
            key={level}
            active={speed === level}
            position={modeToggleSegmentPosition(index, MOUSE_SPEED_LEVELS.length)}
            label={t(labelKey)}
            onClick={() => onChange(level)}
          >
            {SPEED_ICONS[level]}
          </ModeToggleButton>
        );
      })}
    </ModeToggleGroup>
  );
}
