// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useObjectUrl } from "./useObjectUrl";

describe("useObjectUrl", () => {
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let nextId: number;

  beforeEach(() => {
    nextId = 0;
    createObjectURL = vi.fn(() => `blob:mock-${++nextId}`);
    revokeObjectURL = vi.fn();
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL =
      revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("returns null when bytes are null", () => {
    const { result } = renderHook(() => useObjectUrl(null));
    expect(result.current).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("creates one object URL from JPEG bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const { result } = renderHook(() => useObjectUrl(bytes));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
    expect(result.current).toBe("blob:mock-1");
  });

  it("revokes the previous URL when bytes change", () => {
    const first = new Uint8Array([1]);
    const second = new Uint8Array([2]);
    const { result, rerender } = renderHook(
      ({ bytes }: { bytes: Uint8Array | null }) => useObjectUrl(bytes),
      { initialProps: { bytes: first } },
    );

    expect(result.current).toBe("blob:mock-1");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    rerender({ bytes: second });

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(result.current).toBe("blob:mock-2");
  });

  it("revokes on clear (bytes become null)", () => {
    const initialProps: { bytes: Uint8Array | null } = {
      bytes: new Uint8Array([1]),
    };
    const { result, rerender } = renderHook(
      ({ bytes: b }: { bytes: Uint8Array | null }) => useObjectUrl(b),
      { initialProps },
    );

    expect(result.current).toBe("blob:mock-1");

    rerender({ bytes: null });

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(result.current).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes on unmount", () => {
    const bytes = new Uint8Array([1]);
    const { unmount } = renderHook(() => useObjectUrl(bytes));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("does not leak URLs under StrictMode double-invoke", () => {
    const bytes = new Uint8Array([1]);
    const { result, unmount } = renderHook(() => useObjectUrl(bytes), {
      wrapper: StrictMode,
    });

    // StrictMode mounts, cleans up, remounts — every URL except the live one must be revoked.
    const created = createObjectURL.mock.results.map((r) => r.value as string);
    expect(created.length).toBeGreaterThanOrEqual(2);
    const liveUrl = result.current;
    expect(liveUrl).toBe(created[created.length - 1]);
    for (const url of created.slice(0, -1)) {
      expect(revokeObjectURL).toHaveBeenCalledWith(url);
    }
    expect(revokeObjectURL).not.toHaveBeenCalledWith(liveUrl);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith(liveUrl);
  });

  it("accepts a custom mime type", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    renderHook(() => useObjectUrl(bytes, "image/png"));

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/png");
  });
});
