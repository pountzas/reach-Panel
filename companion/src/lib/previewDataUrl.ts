/** Max accepted length for a preview data URL (chars). */
export const MAX_PREVIEW_DATA_URL_LENGTH = 1_500_000;

const RASTER_DATA_URL =
  /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,.+/i;

export function previewDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (value.length === 0 || value.length > MAX_PREVIEW_DATA_URL_LENGTH) {
    return null;
  }
  if (!RASTER_DATA_URL.test(value)) {
    return null;
  }
  return value;
}
