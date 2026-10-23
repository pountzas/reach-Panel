/** CSS and backing-store sizes for a Free Write PDF page canvas. */
export type FreeWritePdfCanvasSize = {
  /** Canvas bitmap width in device pixels. */
  bufferWidth: number;
  /** Canvas bitmap height in device pixels. */
  bufferHeight: number;
  /** CSS width matching the pdf.js viewport (logical CSS px). */
  cssWidth: number;
  /** CSS height matching the pdf.js viewport (logical CSS px). */
  cssHeight: number;
  /** Scale applied to the 2d context / pdf.js transform. */
  outputScale: number;
};

/**
 * Size the page canvas for the current display scale.
 * Buffer = viewport × devicePixelRatio; CSS size stays at the viewport so the
 * annotation overlay can share the same logical box (and stay aligned when
 * `max-w-full` shrinks the displayed canvas).
 */
export function computeFreeWritePdfCanvasSize(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): FreeWritePdfCanvasSize {
  const outputScale =
    Number.isFinite(devicePixelRatio) && devicePixelRatio >= 1
      ? devicePixelRatio
      : 1;
  return {
    bufferWidth: Math.floor(viewportWidth * outputScale),
    bufferHeight: Math.floor(viewportHeight * outputScale),
    cssWidth: viewportWidth,
    cssHeight: viewportHeight,
    outputScale,
  };
}
