export const MOUSE_SPEED_LEVELS = [
  "verySlow",
  "slow",
  "medium",
  "fast",
  "veryFast",
] as const;

export type MouseSpeed = (typeof MOUSE_SPEED_LEVELS)[number];

export const MOUSE_SPEED_MULTIPLIERS: Record<MouseSpeed, number> = {
  verySlow: 0.35,
  slow: 0.6,
  medium: 1,
  fast: 1.6,
  veryFast: 2.5,
};

const LEGACY_MOUSE_SPEED: Record<string, MouseSpeed> = {
  verySlow: "verySlow",
  slow: "slow",
  medium: "medium",
  fast: "fast",
  veryFast: "veryFast",
  custom: "fast",
};

export function resolveMouseSpeed(value: string | undefined): MouseSpeed {
  if (value && LEGACY_MOUSE_SPEED[value]) {
    return LEGACY_MOUSE_SPEED[value];
  }
  return "medium";
}

export function mouseSpeedIndex(speed: MouseSpeed): number {
  return MOUSE_SPEED_LEVELS.indexOf(speed);
}

export function mouseSpeedFromIndex(index: number): MouseSpeed {
  return MOUSE_SPEED_LEVELS[Math.min(MOUSE_SPEED_LEVELS.length - 1, Math.max(0, index))]!;
}

export const MOUSE_SPEED_LABEL_KEYS = {
  verySlow: "speedVerySlow",
  slow: "speedSlow",
  medium: "speedMedium",
  fast: "speedFast",
  veryFast: "speedVeryFast",
} as const;
