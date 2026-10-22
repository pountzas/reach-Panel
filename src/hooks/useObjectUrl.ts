import { useLayoutEffect, useState } from "react";

/**
 * Create a blob object URL from binary image bytes and revoke it on the next
 * payload, clear, or unmount. Create/revoke live in the same layout effect so
 * React StrictMode double-invoke cannot orphan a URL.
 */
export function useObjectUrl(
  bytes: Uint8Array | null,
  mimeType = "image/jpeg",
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!bytes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL cleared with payload
      setUrl(null);
      return;
    }

    // Fresh ArrayBuffer so BlobPart typing accepts the payload (no SharedArrayBuffer).
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const next = URL.createObjectURL(new Blob([ab], { type: mimeType }));
    setUrl(next);

    return () => {
      URL.revokeObjectURL(next);
    };
  }, [bytes, mimeType]);

  return url;
}
