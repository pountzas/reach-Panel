export function computeKeySpacing(containerHeight: number): number {
  if (containerHeight <= 0) {
    return 4;
  }
  return Math.max(2, Math.floor(containerHeight * 0.01));
}

export function computeKeyMetrics(containerHeight: number, rowCount: number) {
  if (containerHeight <= 0 || rowCount <= 0) {
    return { keyHeight: 48, spacing: 4 };
  }
  const padding = 16;
  const spacing = computeKeySpacing(containerHeight);
  const available = containerHeight - padding - spacing * (rowCount - 1);
  const keyHeight = Math.max(28, Math.floor(available / rowCount));
  return { keyHeight, spacing };
}
