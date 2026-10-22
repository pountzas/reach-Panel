import { Channel, invoke } from "@tauri-apps/api/core";

export type InputPreviewFrame = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

/** Parse a binary preview frame: u32 width LE + u32 height LE + JPEG. */
export function parseInputPreviewFrame(
  buffer: ArrayBuffer,
): InputPreviewFrame | null {
  if (buffer.byteLength === 0) {
    return null;
  }
  if (buffer.byteLength < 8) {
    return null;
  }
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const bytes = new Uint8Array(buffer, 8);
  return { bytes, width, height };
}

/**
 * Subscribe to desktop input-preview frames over a Tauri Channel of raw bytes.
 * Replaces any previous subscription. Zero-length messages clear the frame.
 */
export async function subscribeInputPreview(
  onFrame: (frame: InputPreviewFrame | null) => void,
): Promise<void> {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = (message) => {
    onFrame(parseInputPreviewFrame(message));
  };
  await invoke("cmd_subscribe_input_preview", { channel });
}
