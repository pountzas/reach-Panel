import {
  MOUSE_SPEED_LABEL_KEYS,
  MOUSE_SPEED_LEVELS,
  mouseSpeedFromIndex,
  mouseSpeedIndex,
  resolveMouseSpeed,
  type MouseSpeed,
} from "../../lib/mouseSpeed";
import { useTranslation } from "../../hooks/useTranslation";
import type { TranslationKey } from "../../i18n";

interface MouseSpeedSliderProps {
  value: string | undefined;
  onChange: (speed: MouseSpeed) => void;
}

export function MouseSpeedSlider({ value, onChange }: MouseSpeedSliderProps) {
  const { t } = useTranslation();
  const speed = resolveMouseSpeed(value);
  const index = mouseSpeedIndex(speed);
  const labelKey = MOUSE_SPEED_LABEL_KEYS[speed] as TranslationKey;

  return (
    <div className="flex shrink-0 items-center px-4">
      <label className="sr-only" htmlFor="mouse-speed-slider">
        {t("speed")}
      </label>
      <input
        id="mouse-speed-slider"
        type="range"
        className="mouse-speed-slider min-w-0 w-full max-w-[100px]"
        min={0}
        max={MOUSE_SPEED_LEVELS.length - 1}
        step={1}
        value={index}
        onChange={(event) => onChange(mouseSpeedFromIndex(Number(event.target.value)))}
        aria-valuemin={0}
        aria-valuemax={MOUSE_SPEED_LEVELS.length - 1}
        aria-valuenow={index}
        aria-valuetext={t(labelKey)}
        title={t(labelKey)}
      />
    </div>
  );
}
